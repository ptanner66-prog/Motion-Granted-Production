-- ==========================================================================
-- MIGRATION: Fix phantom table references
-- AUDIT REF: IX1-001 (P0), GAP-002 (P1), PROD-001 (P1)
-- DATE: 2026-02-16 CST
--
-- CONTEXT: Several migrations reference tables by wrong names:
--   - 'order_workflow_state' should be 'workflow_state'
--   - 'workflows' should be 'order_workflows'
-- Those migrations silently failed. This adds the missing columns.
-- ==========================================================================

-- Fix from 026 (IX1-001): Citation tracking on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citations_verified_count INTEGER DEFAULT 0;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citations_failed_count INTEGER DEFAULT 0;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citation_verification_status VARCHAR(20) DEFAULT 'pending';

-- Fix from 023_chunk9 (GAP-002): assigned_to on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- Fix from 20260206 (PROD-001): Phase history on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS phase_history JSONB DEFAULT '[]'::jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_state_citation_status
  ON workflow_state(citation_verification_status);
CREATE INDEX IF NOT EXISTS idx_workflow_state_assigned
  ON workflow_state(assigned_to) WHERE assigned_to IS NOT NULL;
