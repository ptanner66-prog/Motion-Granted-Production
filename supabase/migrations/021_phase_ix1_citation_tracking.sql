-- Migration: 021_phase_ix1_citation_tracking.sql
-- Purpose: Add columns for Phase IX.1 Separate Statement Citation Cross-Check
-- Source: Chunk 6, Task 43 - Workflow v7.2
--
-- Phase IX.1 verifies that all citations in the Separate Statement
-- exist in the Phase IV citation bank before proceeding to Phase X.

-- ============================================================================
-- ADD PHASE IX.1 TRACKING COLUMNS TO order_workflow_state
-- ============================================================================

-- SS Citation Check Status
-- Tracks whether the separate statement passed citation verification
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citation_check_status VARCHAR(20)
CHECK (ss_citation_check_status IN ('PASSED', 'FAILED', 'PENDING', 'SKIPPED'));

COMMENT ON COLUMN order_workflow_state.ss_citation_check_status IS
'Phase IX.1 citation cross-check status: PASSED=all verified, FAILED=missing citations, SKIPPED=not MSJ/MSA';

-- SS Citation Check Timestamp
-- When the citation cross-check was performed
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citation_check_at TIMESTAMPTZ;

COMMENT ON COLUMN order_workflow_state.ss_citation_check_at IS
'Timestamp when Phase IX.1 citation cross-check was performed';

-- SS Citations Verified Count
-- Number of citations that were successfully verified against the bank
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citations_verified INTEGER DEFAULT 0;

COMMENT ON COLUMN order_workflow_state.ss_citations_verified IS
'Count of citations in Separate Statement that passed verification';

-- SS Citations Missing
-- JSONB array of citations that were not found in the bank
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citations_missing JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN order_workflow_state.ss_citations_missing IS
'Array of citations that failed IX.1 verification: [{citation, inBank, verificationStatus, flag}]';

-- ============================================================================
-- ADD CHECKPOINT 3 TRACKING COLUMNS
-- ============================================================================

-- These may already exist but we ensure they're present
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_triggered BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_triggered_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN order_workflow_state.checkpoint_3_triggered IS
'Phase X blocking checkpoint - requires admin approval before delivery';

-- ============================================================================
-- ADD PHASE COMPLETION TRACKING COLUMNS
-- ============================================================================

-- Track completion of code-mode phases
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_i_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_ii_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_viii_5_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_ix_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_x_completed_at TIMESTAMPTZ;

-- ============================================================================
-- CREATE INDEX FOR CITATION CHECK QUERIES
-- ============================================================================

-- Index for finding orders with failed citation checks
CREATE INDEX IF NOT EXISTS idx_workflow_state_ss_citation_status
ON order_workflow_state(ss_citation_check_status)
WHERE ss_citation_check_status IS NOT NULL;

-- Index for finding orders awaiting CP3 approval
CREATE INDEX IF NOT EXISTS idx_workflow_state_cp3_pending
ON order_workflow_state(checkpoint_3_triggered, checkpoint_3_approved)
WHERE checkpoint_3_triggered = TRUE AND (checkpoint_3_approved IS NULL OR checkpoint_3_approved = FALSE);

-- ============================================================================
-- CREATE VIEW FOR CITATION CHECK SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW v_ss_citation_check_summary AS
SELECT
  ows.order_id,
  o.case_number,
  o.motion_type,
  o.jurisdiction,
  ows.ss_citation_check_status,
  ows.ss_citation_check_at,
  ows.ss_citations_verified,
  jsonb_array_length(COALESCE(ows.ss_citations_missing, '[]'::jsonb)) as citations_missing_count,
  ows.ss_citations_missing,
  ows.current_phase
FROM order_workflow_state ows
JOIN orders o ON o.id = ows.order_id
WHERE ows.ss_citation_check_status IS NOT NULL
ORDER BY ows.ss_citation_check_at DESC;

COMMENT ON VIEW v_ss_citation_check_summary IS
'Summary of Phase IX.1 citation cross-check results for MSJ/MSA motions';

-- ============================================================================
-- CREATE FUNCTION TO CHECK IF ORDER NEEDS IX.1
-- ============================================================================

CREATE OR REPLACE FUNCTION needs_phase_ix1(
  p_motion_type TEXT,
  p_jurisdiction TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- MSJ/MSA in California requires separate statement and thus IX.1
  IF p_jurisdiction IN ('ca_state', 'ca_federal') THEN
    IF LOWER(p_motion_type) LIKE '%summary%' OR
       LOWER(p_motion_type) LIKE '%msj%' OR
       LOWER(p_motion_type) LIKE '%msa%' THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION needs_phase_ix1 IS
'Determines if an order needs Phase IX.1 citation cross-check based on motion type and jurisdiction';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Ensure service role can read/write
GRANT ALL ON order_workflow_state TO service_role;
GRANT SELECT ON v_ss_citation_check_summary TO authenticated;
GRANT SELECT ON v_ss_citation_check_summary TO service_role;
GRANT EXECUTE ON FUNCTION needs_phase_ix1 TO authenticated;
GRANT EXECUTE ON FUNCTION needs_phase_ix1 TO service_role;
