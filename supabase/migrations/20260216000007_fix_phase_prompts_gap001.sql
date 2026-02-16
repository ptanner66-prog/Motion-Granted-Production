-- ==========================================================================
-- MIGRATION: Fix GAP-001 -- Add missing columns to phase_prompts
-- AUDIT REF: GAP-001 (P0 CRITICAL) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- CONTEXT: 023_chunk9 created a stripped phase_prompts table. The full
-- schema from 023_workflow was silently skipped. This adds missing columns.
-- ==========================================================================

-- Model routing columns (which AI model handles each tier for this phase)
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_a VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_b VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_c VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_d VARCHAR(50);

-- Extended thinking configuration per tier
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_a JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_b JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_c JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_d JSONB DEFAULT '{}'::jsonb;

-- Checkpoint type and next phase
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS checkpoint_type VARCHAR(20);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS next_phase VARCHAR(10);

-- Rename phase_code to phase if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phase_prompts' AND column_name = 'phase_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phase_prompts' AND column_name = 'phase'
  ) THEN
    ALTER TABLE phase_prompts RENAME COLUMN phase_code TO phase;
  END IF;
END $$;

-- Add unique constraint on phase identifier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'phase_prompts' AND indexdef LIKE '%UNIQUE%phase%'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_prompts_phase_unique ON phase_prompts(phase);
  END IF;
END $$;

COMMENT ON TABLE phase_prompts IS
  'Phase prompt configuration with model routing per tier. Schema reconciled 2026-02-16 per GAP-001.';
