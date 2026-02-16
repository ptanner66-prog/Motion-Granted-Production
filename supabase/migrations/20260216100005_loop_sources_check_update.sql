-- ============================================================================
-- SP-2 Task 6 (D3 Task 5): loop_sources CHECK Constraint Update
-- Date: 2026-02-16
--
-- Adds ATTORNEY_REWORK_RESET as 5th trigger value.
-- Without this, the cost tracking reset audit trail INSERT fails the CHECK.
-- Creates the table if it doesn't exist yet.
-- ============================================================================

-- Ensure loop_sources table exists
CREATE TABLE IF NOT EXISTS loop_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  phase TEXT,
  loop_number INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loop_sources_order ON loop_sources(order_id);

-- Drop old CHECK and add updated one with all 5 trigger values
ALTER TABLE loop_sources DROP CONSTRAINT IF EXISTS loop_sources_trigger_check;
ALTER TABLE loop_sources ADD CONSTRAINT loop_sources_trigger_check
  CHECK (trigger IN (
    'PHASE_VII_GRADE_FAILURE',
    'CP3_REJECTION',
    'COST_CAP_EXCEEDED',
    'TIER_RECLASSIFICATION',
    'ATTORNEY_REWORK_RESET'    -- R4 ADDED: per R2v2 ST9-01, Binding D1
  ));
