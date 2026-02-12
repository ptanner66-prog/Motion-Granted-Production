-- ============================================================================
-- Migration: Protocol 10 disclosure and workflow_events audit trail
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Add Protocol 10 disclosure column to order_workflows
-- ============================================================================

-- Add protocol_10_disclosure column for storing the disclosure text
ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

COMMENT ON COLUMN order_workflows.protocol_10_disclosure IS 'Protocol 10 disclosure text included in Attorney Instruction Sheet when max loops reached';

-- Also add to orders table for quick access
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS hold_reason TEXT DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN DEFAULT FALSE;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(10) DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS judge_ordered_separate_statement BOOLEAN DEFAULT FALSE;

-- Create index for orders on hold
CREATE INDEX IF NOT EXISTS idx_orders_hold_triggered
ON orders(hold_triggered_at)
WHERE hold_triggered_at IS NOT NULL;

-- Create index for Protocol 10 orders
CREATE INDEX IF NOT EXISTS idx_orders_protocol_10
ON orders(protocol_10_triggered)
WHERE protocol_10_triggered = true;

COMMENT ON COLUMN orders.hold_triggered_at IS 'Timestamp when HOLD was triggered. Used for timeout calculations.';
COMMENT ON COLUMN orders.hold_reason IS 'Reason for HOLD status (critical gaps, missing declarations, etc.)';
COMMENT ON COLUMN orders.protocol_10_triggered IS 'Whether Protocol 10 disclosure was added to deliverables.';
COMMENT ON COLUMN orders.protocol_10_disclosure IS 'Protocol 10 disclosure text included in Attorney Instruction Sheet.';
COMMENT ON COLUMN orders.current_phase IS 'Current workflow phase (I, II, III, IV, V, V.1, VI, VII, VII.1, VIII, VIII.5, IX, IX.1, X)';
COMMENT ON COLUMN orders.judge_ordered_separate_statement IS 'For federal MSJ: true if judge ordered separate statement despite federal rules';


-- ============================================================================
-- PART 2: Create workflow_events table for audit trail
-- ============================================================================

-- Create workflow_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES order_workflows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_events_order_id ON workflow_events(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id ON workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at DESC);

-- Create composite index for order + type queries
CREATE INDEX IF NOT EXISTS idx_workflow_events_order_type
ON workflow_events(order_id, event_type);

-- Add RLS policies
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events for their own orders
DROP POLICY IF EXISTS "Users can view own order events" ON workflow_events;
CREATE POLICY "Users can view own order events" ON workflow_events
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Policy: Service role can do anything
DROP POLICY IF EXISTS "Service role full access" ON workflow_events;
CREATE POLICY "Service role full access" ON workflow_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE workflow_events IS 'Audit trail for all workflow state changes';
COMMENT ON COLUMN workflow_events.event_type IS 'Type of event: PHASE_STARTED, PHASE_COMPLETED, HOLD_TRIGGERED, HOLD_RESUMED, PROTOCOL_10_TRIGGERED, etc.';
COMMENT ON COLUMN workflow_events.phase IS 'Phase where event occurred (I, II, III, etc.)';
COMMENT ON COLUMN workflow_events.data IS 'JSON payload with event-specific details';


-- ============================================================================
-- PART 3: Add tier column to orders if not exists (ensure A/B/C format)
-- ============================================================================

-- Add tier column if it doesn't exist (some systems use motion_tier as number)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS tier VARCHAR(1) DEFAULT 'B';

-- Create function to sync tier from motion_tier
CREATE OR REPLACE FUNCTION sync_order_tier()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync tier from motion_tier if tier is not set
  IF NEW.tier IS NULL OR NEW.tier = '' THEN
    CASE NEW.motion_tier
      WHEN 1 THEN NEW.tier := 'A';
      WHEN 2 THEN NEW.tier := 'B';
      WHEN 3 THEN NEW.tier := 'C';
      ELSE NEW.tier := 'B';
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tier sync
DROP TRIGGER IF EXISTS sync_tier_trigger ON orders;
CREATE TRIGGER sync_tier_trigger
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_tier();

COMMENT ON COLUMN orders.tier IS 'Motion tier: A (procedural), B (intermediate), C (complex/dispositive)';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Added protocol_10_disclosure to order_workflows
-- - Added HOLD and Protocol 10 columns to orders table
-- - Added current_phase and judge_ordered_separate_statement to orders
-- - Created workflow_events table for audit trail
-- - Added tier column with sync from motion_tier
