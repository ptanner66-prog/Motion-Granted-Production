-- SP-23 ST6-02: Track raw upload purge state
--
-- When raw uploads are purged 7 days after delivery, this flag records the purge
-- so revision workflows can detect when original evidence is unavailable and inject
-- an appropriate disclaimer into the revision context.
--
-- This implements Option B (flag + disclaimer) pending Clay's DECISION #7
-- on whether to extend the purge window (Option A) or track purged state (Option B).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged_at TIMESTAMPTZ;

-- Index for purge job query performance:
-- Finds COMPLETED orders where raw_uploads_purged = FALSE (purge candidates)
CREATE INDEX IF NOT EXISTS idx_orders_purge_candidates
  ON orders (status, raw_uploads_purged, completed_at)
  WHERE raw_uploads_purged = FALSE AND deleted_at IS NULL;
