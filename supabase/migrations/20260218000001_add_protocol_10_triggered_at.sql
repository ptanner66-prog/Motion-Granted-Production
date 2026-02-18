-- Add protocol_10_triggered_at column for Protocol 10 tracking
-- Referenced by revision-loop.ts and revision-handler.ts
-- When Protocol 10 fires (max revision loops exhausted), this timestamp is set
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_triggered_at TIMESTAMPTZ DEFAULT NULL;

-- Index for queries filtering by P10 status
CREATE INDEX IF NOT EXISTS idx_orders_protocol_10_triggered_at ON orders (protocol_10_triggered_at) WHERE protocol_10_triggered_at IS NOT NULL;
