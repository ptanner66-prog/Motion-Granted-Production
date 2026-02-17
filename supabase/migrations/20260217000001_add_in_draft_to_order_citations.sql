-- Add in_draft column to order_citations
-- Tracks whether a citation was actually used in the motion draft vs just in the research bank
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS in_draft BOOLEAN DEFAULT false;

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_order_citations_in_draft ON order_citations (order_id, in_draft) WHERE in_draft = true;
