-- ============================================================================
-- Migration: 20260205_batch1_fixes.sql
-- Batch 1 Production Bug Fixes
-- ============================================================================

-- BUG-05: Ensure authority_level column has proper CHECK constraint
-- The column already exists in the 20260130 migration but the insert was
-- failing due to schema cache issues. This migration ensures:
-- 1. The CHECK constraint allows 'binding', 'persuasive', 'unknown'
-- 2. Default value is 'unknown' for safety
-- ============================================================================

-- Add CHECK constraint if not already present
DO $$
BEGIN
  -- Drop existing constraint if any (safe idempotent approach)
  ALTER TABLE order_citations DROP CONSTRAINT IF EXISTS order_citations_authority_level_check;

  -- Add the check constraint with all valid values
  ALTER TABLE order_citations ADD CONSTRAINT order_citations_authority_level_check
    CHECK (authority_level IS NULL OR authority_level IN ('binding', 'persuasive', 'unknown'));

  -- Set default to 'unknown'
  ALTER TABLE order_citations ALTER COLUMN authority_level SET DEFAULT 'unknown';

  RAISE NOTICE 'authority_level constraint added successfully';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'authority_level constraint may already exist: %', SQLERRM;
END $$;

-- BUG-11: Ensure workflow-level revision loop counter exists
-- The loop counter must be at the WORKFLOW level (not step level) to prevent
-- resets when Phase VIII reruns.
DO $$
BEGIN
  -- Add revision_loop_count to workflow_state if missing
  ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;

  RAISE NOTICE 'revision_loop_count column ensured on workflow_state';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'revision_loop_count already exists or table missing: %', SQLERRM;
END $$;

-- BUG-17: Add unique constraint for workflow completion idempotency
-- Prevents duplicate workflow completion records.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_logs_workflow_completed_unique
    ON automation_logs (order_id)
    WHERE action_type = 'workflow_completed';

  RAISE NOTICE 'workflow_completed uniqueness index created';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'workflow_completed index may already exist: %', SQLERRM;
END $$;

-- Refresh the Supabase schema cache by touching the table
-- This forces PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
