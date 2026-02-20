BEGIN;

-- ============================================================
-- DS-01: Reconcile competing checkpoint_events schemas
-- Two CREATE TABLE IF NOT EXISTS with incompatible columns.
-- Whichever ran first wins. Add ALL missing columns from both.
-- ============================================================
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS event_data JSONB DEFAULT '{}';
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS checkpoint_type TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS data JSONB;

-- ============================================================
-- DS-03: checkpoint-logger.ts columns (NEITHER original schema)
-- ============================================================
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS checkpoint_id UUID;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS actor TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================================
-- DS-06: Ensure RLS on orders (idempotent safety net)
-- RLS was only in schema.sql, not migrations. Fresh rebuild
-- from migrations alone would leave orders table exposed.
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Indexes for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_event_name ON checkpoint_events(event_name);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_checkpoint_type ON checkpoint_events(checkpoint_type);

COMMIT;
