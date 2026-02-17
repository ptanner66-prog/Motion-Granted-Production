-- SP-23 ST6-02: Track raw upload purge state
-- This allows revision workflows to detect when original evidence is unavailable
-- and inject a disclaimer into the revision context.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged_at TIMESTAMPTZ;

-- Index for purge job query performance:
-- Finds COMPLETED orders where raw uploads haven't been purged yet.
CREATE INDEX IF NOT EXISTS idx_orders_purge_candidates
  ON orders (status, raw_uploads_purged, completed_at)
  WHERE raw_uploads_purged = FALSE AND deleted_at IS NULL;
