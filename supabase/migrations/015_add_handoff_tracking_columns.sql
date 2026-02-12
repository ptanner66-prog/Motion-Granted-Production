-- Migration: Add handoff tracking columns to order_workflows
-- Date: January 2026
-- Description: Adds columns referenced by citation-verifier.ts for tracking
-- handoff progress during batched citation verification.
--
-- CRITICAL: These columns were referenced in code but missing from schema.
-- Without them, the batched citation verification would fail.

-- ============================================================================
-- STEP 1: Add missing columns to order_workflows
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 2: Add index for efficient handoff queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_workflows_handoff
ON order_workflows(last_handoff_at DESC)
WHERE last_handoff_at IS NOT NULL;

-- ============================================================================
-- STEP 3: Add comments
-- ============================================================================

COMMENT ON COLUMN order_workflows.last_handoff_at IS 'Timestamp of the last incremental handoff saved during batched citation verification (v6.3 4-citation rule)';
COMMENT ON COLUMN order_workflows.handoff_count IS 'Number of incremental handoffs saved for this workflow, tracks progress through citation batches';
