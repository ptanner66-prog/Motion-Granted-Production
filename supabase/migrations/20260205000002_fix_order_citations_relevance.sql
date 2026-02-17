-- ============================================================================
-- Migration: 20260205_fix_order_citations_relevance.sql
-- CHEN CITATION RELEVANCE FIX (2026-02-05)
--
-- Adds proposition tracking and topical relevance scoring columns to
-- the order_citations table. These support the new relevance-based
-- citation filtering that prevents irrelevant cases from entering
-- the citation bank.
-- ============================================================================

-- Proposition tracking: which legal proposition does this citation support?
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_text text;

-- Topical relevance score: 0.0-1.0 indicating how relevant this citation
-- is to its claimed proposition. Below 0.70 should not be in the bank.
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS topical_relevance_score numeric(4,3);

-- Search provenance: which query found this citation?
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS search_query_used text;

-- Index for efficient citation lookups by display order
CREATE INDEX IF NOT EXISTS idx_order_citations_display_order
  ON order_citations(order_id, display_order);

-- Index for finding citations by proposition
CREATE INDEX IF NOT EXISTS idx_order_citations_proposition
  ON order_citations(order_id, proposition_id);

-- Comment for documentation
COMMENT ON COLUMN order_citations.topical_relevance_score IS
  'Score 0.0-1.0 indicating how relevant this citation is to its claimed proposition. Below 0.70 should not be in the bank.';

COMMENT ON COLUMN order_citations.proposition_id IS
  'Links to the legal proposition (P001, P002, etc.) this citation supports';

COMMENT ON COLUMN order_citations.search_query_used IS
  'The CourtListener search query that found this citation (for audit trail)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
