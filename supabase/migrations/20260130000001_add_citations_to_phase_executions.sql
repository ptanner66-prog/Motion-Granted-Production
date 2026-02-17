-- ============================================================================
-- Migration: 20260130_add_citations_to_phase_executions.sql
-- Citation Viewer Feature: Add citations_used column to phase_executions
--
-- Stores the citations array from Phase V output for tracking which citations
-- were actually used in the generated motion.
-- ============================================================================

-- Add column to store extracted citations from each phase
ALTER TABLE phase_executions
ADD COLUMN IF NOT EXISTS citations_used JSONB;

-- Comment for documentation
COMMENT ON COLUMN phase_executions.citations_used IS
'JSON array of citations used in this phase output. Populated after Phase V. Example: [{"citation": "806 F.3d 289", "caseName": "Brumfield v...", "courtlistenerId": "123", ...}]';

-- Index for efficient queries on citations
CREATE INDEX IF NOT EXISTS idx_phase_executions_citations
ON phase_executions USING GIN (citations_used);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
