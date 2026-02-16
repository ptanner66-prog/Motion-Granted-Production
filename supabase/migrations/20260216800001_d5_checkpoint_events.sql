-- ==========================================================================
-- D5 Group 1: checkpoint_events table + attorney_rework_count
-- Retention: 365 days per CCP §340.6
-- ==========================================================================

CREATE TABLE IF NOT EXISTS checkpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_type TEXT NOT NULL CHECK(checkpoint_type IN ('CP1', 'CP2', 'CP3', 'HOLD')),
  actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '365 days')
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_events_order ON checkpoint_events(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_type ON checkpoint_events(checkpoint_type);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_name ON checkpoint_events(event_name);

ALTER TABLE checkpoint_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkpoint_events_admin" ON checkpoint_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "checkpoint_events_own" ON checkpoint_events
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

-- attorney_rework_count on orders (distinct from loop_count)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_rework_count INTEGER DEFAULT 0;
COMMENT ON COLUMN orders.attorney_rework_count IS
  'Number of times attorney requested changes via CP3. Distinct from internal loop_count.';
