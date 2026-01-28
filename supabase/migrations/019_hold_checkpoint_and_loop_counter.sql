-- ============================================================================
-- HOLD Checkpoint and Loop Counter Migration (Chunk 2: Tasks 5-6)
-- Source: CMS 22, CMS 23
-- ============================================================================

-- ============================================================================
-- TASK 5: HOLD CHECKPOINT COLUMNS
-- Adds columns for HOLD checkpoint (Protocol 8)
-- ============================================================================

-- Add HOLD-specific columns to order_workflows table
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_response VARCHAR(50);
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_response_at TIMESTAMPTZ;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_acknowledgment_text TEXT;

-- Index for finding workflows on HOLD
CREATE INDEX IF NOT EXISTS idx_workflows_hold ON order_workflows(hold_triggered_at)
  WHERE hold_triggered_at IS NOT NULL;

-- Index for HOLD responses
CREATE INDEX IF NOT EXISTS idx_workflows_hold_response ON order_workflows(hold_response)
  WHERE hold_response IS NOT NULL;

COMMENT ON COLUMN order_workflows.hold_triggered_at IS 'Timestamp when HOLD checkpoint was triggered (Protocol 8)';
COMMENT ON COLUMN order_workflows.hold_reason IS 'Reason for HOLD - typically missing critical evidence';
COMMENT ON COLUMN order_workflows.hold_response IS 'Customer response: PROVIDE_ADDITIONAL_EVIDENCE, PROCEED_WITH_ACKNOWLEDGMENT, CANCEL_ORDER';
COMMENT ON COLUMN order_workflows.hold_response_at IS 'Timestamp when customer responded to HOLD';
COMMENT ON COLUMN order_workflows.hold_acknowledgment_text IS 'Customer acknowledgment text if they chose to proceed with risk';


-- ============================================================================
-- TASK 6: LOOP COUNTER COLUMNS
-- Adds columns for revision loop tracking (Protocol 10)
-- Note: revision_loop_count may already exist, using IF NOT EXISTS
-- ============================================================================

-- Loop counter columns (some may already exist)
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS current_loop_count INTEGER DEFAULT 0;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS max_loops_reached BOOLEAN DEFAULT false;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS loop_exit_triggered_at TIMESTAMPTZ;

-- Rename revision_loop_count to current_loop_count if it exists and current_loop_count doesn't
-- This handles the case where the column exists with a different name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflows'
    AND column_name = 'revision_loop_count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflows'
    AND column_name = 'current_loop_count'
  ) THEN
    ALTER TABLE order_workflows RENAME COLUMN revision_loop_count TO current_loop_count;
  END IF;
END $$;

-- Create alias view for backwards compatibility if needed
-- revision_loop and revision_loop_count refer to the same thing as current_loop_count

-- Index for loop counter queries
CREATE INDEX IF NOT EXISTS idx_workflows_loop_count ON order_workflows(current_loop_count)
  WHERE current_loop_count > 0;

CREATE INDEX IF NOT EXISTS idx_workflows_max_loops ON order_workflows(max_loops_reached)
  WHERE max_loops_reached = true;

COMMENT ON COLUMN order_workflows.current_loop_count IS 'Current revision loop count (Phase VII → VIII → VII)';
COMMENT ON COLUMN order_workflows.max_loops_reached IS 'True if loop count reached 3, triggering Protocol 10';
COMMENT ON COLUMN order_workflows.loop_exit_triggered_at IS 'Timestamp when Protocol 10 (Loop 3 Exit) was triggered';


-- ============================================================================
-- WORKFLOW STATUS VALUES UPDATE
-- Add new status values for HOLD and Loop 3 Exit
-- ============================================================================

-- Update any constraints on status field to include new values
-- Note: If using enum, you'd need to add values. If using varchar, this is informational.

-- Add valid status values to any check constraint (if exists)
-- Common statuses: pending, in_progress, on_hold, blocked, revision_in_progress,
--                  revision_requested, awaiting_cp1, awaiting_cp2, awaiting_cp3,
--                  loop_3_exit, completed, cancelled, failed


-- ============================================================================
-- HELPER FUNCTION: Check if workflow is at max loops
-- ============================================================================

CREATE OR REPLACE FUNCTION check_workflow_loop_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if loop count has reached 3
  IF NEW.current_loop_count >= 3 AND NOT COALESCE(OLD.max_loops_reached, false) THEN
    NEW.max_loops_reached := true;
    NEW.loop_exit_triggered_at := NOW();
    NEW.status := 'blocked';
    NEW.last_error := 'Protocol 10: Maximum revision loops (3) reached. Requires customer decision.';

    -- Log the event
    INSERT INTO automation_logs (order_id, action_type, action_details)
    SELECT
      NEW.order_id,
      'protocol_10_triggered',
      jsonb_build_object(
        'workflowId', NEW.id,
        'loopCount', NEW.current_loop_count,
        'triggeredAt', NOW()
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for loop limit check
DROP TRIGGER IF EXISTS check_loop_limit_trigger ON order_workflows;
CREATE TRIGGER check_loop_limit_trigger
  BEFORE UPDATE ON order_workflows
  FOR EACH ROW
  WHEN (NEW.current_loop_count IS DISTINCT FROM OLD.current_loop_count)
  EXECUTE FUNCTION check_workflow_loop_limit();


-- ============================================================================
-- HELPER FUNCTION: Auto-cancel HOLD after 14 days
-- This is called by an Inngest cron job, but having it as a DB function
-- provides a fallback mechanism
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  cancelled_count INTEGER := 0;
  workflow_record RECORD;
BEGIN
  -- Find workflows that have been on HOLD for more than 14 days without response
  FOR workflow_record IN
    SELECT
      ow.id AS workflow_id,
      ow.order_id,
      o.total_price,
      o.order_number
    FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.checkpoint_pending = 'HOLD'
      AND ow.hold_triggered_at IS NOT NULL
      AND ow.hold_response IS NULL
      AND ow.hold_triggered_at < NOW() - INTERVAL '14 days'
  LOOP
    -- Update workflow to cancelled
    UPDATE order_workflows
    SET
      status = 'cancelled',
      checkpoint_pending = NULL,
      hold_response = 'AUTO_CANCEL_TIMEOUT',
      hold_response_at = NOW(),
      completed_at = NOW()
    WHERE id = workflow_record.workflow_id;

    -- Update order status
    UPDATE orders
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE id = workflow_record.order_id;

    -- Create refund record (to be processed by refund service)
    INSERT INTO refunds (
      order_id,
      amount_cents,
      reason,
      refund_type,
      status
    ) VALUES (
      workflow_record.order_id,
      ROUND(workflow_record.total_price * 100),
      'HOLD_TIMEOUT',
      'FULL',
      'pending'
    );

    -- Log the auto-cancellation
    INSERT INTO automation_logs (order_id, action_type, action_details)
    VALUES (
      workflow_record.order_id,
      'hold_auto_cancelled',
      jsonb_build_object(
        'workflowId', workflow_record.workflow_id,
        'orderNumber', workflow_record.order_number,
        'reason', '14-day HOLD timeout',
        'refundAmount', workflow_record.total_price
      )
    );

    cancelled_count := cancelled_count + 1;
  END LOOP;

  RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_cancel_expired_holds IS 'Auto-cancels workflows on HOLD for more than 14 days. Called by Inngest cron or can be run manually.';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Added HOLD checkpoint columns: hold_triggered_at, hold_reason, hold_response,
--   hold_response_at, hold_acknowledgment_text
-- - Added/verified loop counter columns: current_loop_count, max_loops_reached,
--   loop_exit_triggered_at
-- - Created trigger for automatic Protocol 10 enforcement
-- - Created helper function for auto-cancelling expired HOLDs
