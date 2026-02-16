-- ==========================================================================
-- ST-049 [P1]: order_deliverables table
-- Child table of delivery_packages. Each row = one file in the filing package.
-- Date: 2026-02-16
-- ==========================================================================

CREATE TABLE IF NOT EXISTS order_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES delivery_packages(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  filing_order INTEGER NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_status TEXT DEFAULT 'PENDING'
    CHECK(generation_status IN ('PENDING','GENERATING','COMPLETE','FAILED')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_deliverables_package_id ON order_deliverables(package_id);

-- RLS
ALTER TABLE order_deliverables ENABLE ROW LEVEL SECURITY;

-- Attorney read access (join through delivery_packages → orders.client_id)
DROP POLICY IF EXISTS od_select_own ON order_deliverables;
CREATE POLICY od_select_own ON order_deliverables
  FOR SELECT USING (
    package_id IN (
      SELECT dp.id FROM delivery_packages dp
      JOIN orders o ON dp.order_id = o.id
      WHERE o.client_id = auth.uid()
      AND o.status IN ('AWAITING_APPROVAL', 'COMPLETED', 'REVISION_REQ')
    )
  );

-- Service role: unrestricted (Inngest functions)
DROP POLICY IF EXISTS od_service_all ON order_deliverables;
CREATE POLICY od_service_all ON order_deliverables
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- Admin SELECT (Pattern 4)
DROP POLICY IF EXISTS od_admin_select ON order_deliverables;
CREATE POLICY od_admin_select ON order_deliverables
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );
