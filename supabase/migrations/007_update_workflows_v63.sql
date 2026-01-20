-- Migration: Update order_workflows for v6.3
-- Date: January 2026
-- Description: Add checkpoint tracking, revision pricing, and v6.3 fields

-- ============================================================================
-- STEP 1: Add checkpoint tracking to order_workflows
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_pending TEXT
CHECK (checkpoint_pending IN ('CP1', 'CP2', 'CP3'));

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_data JSONB DEFAULT '{}';

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_responses JSONB DEFAULT '[]';

-- ============================================================================
-- STEP 2: Add revision tracking fields
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS free_revisions_used INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS paid_revisions_used INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_total_charged DECIMAL(10,2) DEFAULT 0;

-- ============================================================================
-- STEP 3: Add handoff tracking
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_at TIMESTAMPTZ;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_path TEXT;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS handoff_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 4: Add judge simulation fields
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_grade VARCHAR(3);

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_grade_numeric DECIMAL(3,2);

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_passed BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 5: Update status enum to include checkpoint states
-- ============================================================================

-- First, drop the existing constraint if it exists
ALTER TABLE order_workflows
DROP CONSTRAINT IF EXISTS order_workflows_status_check;

-- Add new constraint with checkpoint statuses
ALTER TABLE order_workflows
ADD CONSTRAINT order_workflows_status_check
CHECK (status IN (
  'pending',
  'in_progress',
  'awaiting_cp1',      -- NEW: Waiting for customer at Checkpoint 1
  'awaiting_cp2',      -- NEW: Waiting for customer at Checkpoint 2
  'awaiting_cp3',      -- NEW: Waiting for customer at Checkpoint 3
  'revision_requested', -- NEW: Customer requested revisions at CP2
  'revision_in_progress', -- NEW: Revisions being processed
  'blocked',
  'completed',
  'cancelled'
));

-- ============================================================================
-- STEP 6: Create indexes for checkpoint queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_workflows_checkpoint
ON order_workflows(checkpoint_pending)
WHERE checkpoint_pending IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_workflows_status_v63
ON order_workflows(status);

CREATE INDEX IF NOT EXISTS idx_order_workflows_judge_sim
ON order_workflows(judge_sim_passed, judge_sim_grade);

-- ============================================================================
-- STEP 7: Add comment for documentation
-- ============================================================================

COMMENT ON COLUMN order_workflows.checkpoint_pending IS 'v6.3: Current checkpoint awaiting customer action (CP1, CP2, or CP3)';
COMMENT ON COLUMN order_workflows.checkpoint_data IS 'v6.3: Data passed to checkpoint for customer review';
COMMENT ON COLUMN order_workflows.judge_sim_grade IS 'v6.3: Letter grade from judge simulation (A+, A, A-, B+, etc.)';
COMMENT ON COLUMN order_workflows.judge_sim_grade_numeric IS 'v6.3: Numeric score 0.00-1.00 from judge simulation';
COMMENT ON COLUMN order_workflows.judge_sim_passed IS 'v6.3: Whether motion passed minimum B+ (0.87) threshold';
COMMENT ON COLUMN order_workflows.revision_loop_count IS 'v6.3: Number of revision loops (max 3 before escalation)';
