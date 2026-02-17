-- ============================================================================
-- Migration: Workflow Configuration Tables
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Ensure workflow columns exist on orders table
-- ============================================================================

-- Add workflow tracking columns (IF NOT EXISTS for idempotency)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_phase VARCHAR(10) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_phase VARCHAR(10) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_resolved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reason TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier VARCHAR(1) DEFAULT 'B';

-- Add comments
COMMENT ON COLUMN orders.current_phase IS 'Current workflow phase: I, II, III, IV, V, V.1, VI, VII, VII.1, VIII, VIII.5, IX, IX.1, X';
COMMENT ON COLUMN orders.hold_phase IS 'Phase where HOLD was triggered';
COMMENT ON COLUMN orders.hold_triggered_at IS 'Timestamp when HOLD was triggered';
COMMENT ON COLUMN orders.hold_resolved_at IS 'Timestamp when HOLD was resolved';
COMMENT ON COLUMN orders.hold_reason IS 'Reason for HOLD (critical gaps, missing declarations, etc.)';
COMMENT ON COLUMN orders.hold_reminder_sent IS 'Whether 24hr reminder email was sent';
COMMENT ON COLUMN orders.hold_escalated IS 'Whether 72hr escalation was triggered';
COMMENT ON COLUMN orders.protocol_10_triggered IS 'Whether Protocol 10 disclosure was added';
COMMENT ON COLUMN orders.protocol_10_disclosure IS 'Protocol 10 disclosure text';
COMMENT ON COLUMN orders.tier IS 'Motion tier: A (procedural), B (intermediate), C (complex/dispositive)';

-- ============================================================================
-- PART 2: Create checkpoint_events table if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS checkpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  phase VARCHAR(10),
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_events_order ON checkpoint_events(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_type ON checkpoint_events(event_type);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_created ON checkpoint_events(created_at DESC);

-- Add RLS
ALTER TABLE checkpoint_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to checkpoint_events" ON checkpoint_events;
CREATE POLICY "Service role full access to checkpoint_events" ON checkpoint_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own checkpoint_events" ON checkpoint_events;
CREATE POLICY "Users view own checkpoint_events" ON checkpoint_events
  FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

COMMENT ON TABLE checkpoint_events IS 'Audit log for HOLD triggers, resumes, and auto-refunds';

-- ============================================================================
-- PART 3: Create email_queue table if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_order ON email_queue(order_id);

COMMENT ON TABLE email_queue IS 'Queue for outgoing emails (HOLD notifications, reminders, etc.)';

-- ============================================================================
-- PART 4: Add revision loop columns to order_workflows
-- ============================================================================

ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS max_loops_reached BOOLEAN DEFAULT FALSE;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

COMMENT ON COLUMN order_workflows.revision_loop_count IS 'Count of VII→VIII→VII revision loops';
COMMENT ON COLUMN order_workflows.max_loops_reached IS 'True if 3 loops reached (Protocol 10)';
COMMENT ON COLUMN order_workflows.protocol_10_disclosure IS 'Protocol 10 disclosure text for deliverables';

-- ============================================================================
-- PART 5: Create indexes for common queries
-- ============================================================================

-- Index for orders on HOLD
CREATE INDEX IF NOT EXISTS idx_orders_hold_status ON orders(status, hold_triggered_at)
  WHERE status = 'hold_pending';

-- Index for finding Protocol 10 orders
CREATE INDEX IF NOT EXISTS idx_orders_protocol_10 ON orders(protocol_10_triggered)
  WHERE protocol_10_triggered = true;

-- Index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_orders_current_phase ON orders(current_phase)
  WHERE current_phase IS NOT NULL;

-- ============================================================================
-- PART 6: Helper function to get next HOLD action
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hold_next_action(hold_triggered_at TIMESTAMPTZ)
RETURNS TABLE (
  current_stage TEXT,
  hours_elapsed NUMERIC,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  should_auto_refund BOOLEAN
) AS $$
DECLARE
  hours_since_hold NUMERIC;
BEGIN
  hours_since_hold := EXTRACT(EPOCH FROM (NOW() - hold_triggered_at)) / 3600;

  IF hours_since_hold >= 168 THEN -- 7 days
    RETURN QUERY SELECT
      'auto_refunded'::TEXT,
      hours_since_hold,
      'Process auto-refund'::TEXT,
      NOW(),
      TRUE;
  ELSIF hours_since_hold >= 72 THEN
    RETURN QUERY SELECT
      'escalated'::TEXT,
      hours_since_hold,
      'Auto-refund if unresolved'::TEXT,
      hold_triggered_at + INTERVAL '7 days',
      FALSE;
  ELSIF hours_since_hold >= 24 THEN
    RETURN QUERY SELECT
      'reminder_sent'::TEXT,
      hours_since_hold,
      'Escalate to admin'::TEXT,
      hold_triggered_at + INTERVAL '72 hours',
      FALSE;
  ELSE
    RETURN QUERY SELECT
      'initial'::TEXT,
      hours_since_hold,
      'Send 24h reminder'::TEXT,
      hold_triggered_at + INTERVAL '24 hours',
      FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_hold_next_action IS 'Calculate current HOLD stage and next action based on time elapsed';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
