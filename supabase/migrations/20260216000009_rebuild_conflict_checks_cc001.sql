-- ==========================================================================
-- MIGRATION: Fix CC-001 -- Rebuild conflict_checks without clients FK
-- AUDIT REF: CC-001 (P0 CRITICAL)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DROP VIEW IF EXISTS conflict_review_queue;

CREATE TABLE IF NOT EXISTS conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'clear', 'flagged', 'override', 'blocked')),
  checked_at TIMESTAMPTZ DEFAULT now(),
  checked_by UUID REFERENCES auth.users(id),
  result JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conflict_checks_admin_all" ON conflict_checks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "conflict_checks_own_orders" ON conflict_checks
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conflict_checks_order ON conflict_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_client ON conflict_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_status ON conflict_checks(status) WHERE status != 'clear';

-- Fix conflict_parties RLS if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_parties') THEN
    DROP POLICY IF EXISTS "conflict_parties_own" ON conflict_parties;

    CREATE POLICY "conflict_parties_own_orders" ON conflict_parties
      FOR SELECT TO authenticated
      USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

    CREATE POLICY "conflict_parties_admin" ON conflict_parties
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Recreate conflict_review_queue view
CREATE OR REPLACE VIEW conflict_review_queue AS
SELECT
  cc.id AS check_id, cc.order_id, cc.client_id,
  p.full_name AS client_name, cc.status, cc.checked_at,
  cc.result, cc.notes, o.motion_type_code, o.status AS order_status
FROM conflict_checks cc
JOIN orders o ON o.id = cc.order_id
LEFT JOIN profiles p ON p.id = cc.client_id
WHERE cc.status IN ('flagged', 'pending');
