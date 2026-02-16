-- ============================================================================
-- SP-2 Task 8 (D3 Task 14): cost_tracking tier CHECK Constraint
-- Date: 2026-02-16
--
-- Expands CHECK to include 'UNKNOWN'. Rejecting INSERT for unknown tier
-- loses cost data permanently. Better to accept with 'UNKNOWN' and alert.
-- Creates the table if it doesn't exist yet.
-- ============================================================================

-- Ensure cost_tracking table exists
CREATE TABLE IF NOT EXISTS cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'UNKNOWN',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_order ON cost_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_tier ON cost_tracking(tier);

-- Expand CHECK to include UNKNOWN
ALTER TABLE cost_tracking DROP CONSTRAINT IF EXISTS cost_tracking_tier_check;
ALTER TABLE cost_tracking ADD CONSTRAINT cost_tracking_tier_check
  CHECK (tier IN ('A', 'B', 'C', 'D', 'UNKNOWN'));
