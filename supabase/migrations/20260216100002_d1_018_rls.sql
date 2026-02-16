-- ============================================================================
-- SP-2 Task 2 (R4-05 / D1-018): RLS Policies for 6 Tables
-- Date: 2026-02-16
--
-- Creates admin_users view (Pattern 4 prerequisite), ensures all 6 tables
-- exist, then applies RLS policies with:
--   - Attorney SELECT via orders.client_id = auth.uid()
--   - Service role unrestricted ALL
--   - Admin SELECT via Pattern 4 (EXISTS admin_users)
--
-- CRITICAL: Uses orders.client_id (NOT user_id) per CST-01
-- CRITICAL: delivery_packages status gate uses REVISION_REQ per D6 C-005
-- ============================================================================

-- ============================================================================
-- PREREQUISITE: admin_users view for Pattern 4 admin checks
-- Wraps the existing profiles.role check in a view for consistent RLS usage.
-- is_admin() SECURITY DEFINER function still exists for backward compat.
-- ============================================================================
CREATE OR REPLACE VIEW admin_users AS
SELECT id AS user_id FROM profiles WHERE role = 'admin';

-- ============================================================================
-- TABLE CREATION: Ensure tables exist before applying RLS
-- Minimal schemas — expanded in later domain SPs as needed.
-- ============================================================================

-- TABLE 1: delivery_packages
CREATE TABLE IF NOT EXISTS delivery_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_packages_order ON delivery_packages(order_id);

-- TABLE 2: phase_context
CREATE TABLE IF NOT EXISTS phase_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phase_context_order ON phase_context(order_id);

-- TABLE 3: citation_verifications already exists (migration 018/023)
-- TABLE 4: order_documents
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  document_type TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_documents_order ON order_documents(order_id);

-- TABLE 5: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- TABLE 6: parties already exists (migration 003 / types/index.ts)

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- ============================================================
-- TABLE 1: delivery_packages
-- Pattern: orders JOIN via client_id + status gate
-- Status gate: AWAITING_APPROVAL, COMPLETED, REVISION_REQ visible
-- ============================================================
ALTER TABLE delivery_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_select_own ON delivery_packages;
CREATE POLICY dp_select_own ON delivery_packages
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders
      WHERE client_id = auth.uid()
      AND status IN ('AWAITING_APPROVAL', 'COMPLETED', 'REVISION_REQ')
    )
  );

DROP POLICY IF EXISTS dp_service_all ON delivery_packages;
CREATE POLICY dp_service_all ON delivery_packages
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS dp_admin_select ON delivery_packages;
CREATE POLICY dp_admin_select ON delivery_packages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 2: phase_context
-- Pattern: orders JOIN via client_id (SELECT only for attorneys)
-- ============================================================
ALTER TABLE phase_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_select_own ON phase_context;
CREATE POLICY pc_select_own ON phase_context
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS pc_service_all ON phase_context;
CREATE POLICY pc_service_all ON phase_context
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS pc_admin_select ON phase_context;
CREATE POLICY pc_admin_select ON phase_context
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 3: citation_verifications
-- Already has RLS from migration 023. Add admin policy.
-- ============================================================

DROP POLICY IF EXISTS cv_select_own ON citation_verifications;
CREATE POLICY cv_select_own ON citation_verifications
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cv_service_all ON citation_verifications;
CREATE POLICY cv_service_all ON citation_verifications
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS cv_admin_select ON citation_verifications;
CREATE POLICY cv_admin_select ON citation_verifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 4: order_documents
-- Pattern: orders JOIN via client_id (SELECT + INSERT for attorneys)
-- ============================================================
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS od_select_own ON order_documents;
CREATE POLICY od_select_own ON order_documents
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS od_insert_own ON order_documents;
CREATE POLICY od_insert_own ON order_documents
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS od_service_all ON order_documents;
CREATE POLICY od_service_all ON order_documents
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS od_admin_select ON order_documents;
CREATE POLICY od_admin_select ON order_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 5: notifications
-- Pattern: direct user_id match (notifications belong to users, not orders)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select_own ON notifications;
CREATE POLICY notif_select_own ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_update_own ON notifications;
CREATE POLICY notif_update_own ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_service_all ON notifications;
CREATE POLICY notif_service_all ON notifications
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- ============================================================
-- TABLE 6: parties
-- Already has some RLS from migration 20260214. Add consistent policies.
-- ============================================================

DROP POLICY IF EXISTS parties_select_own ON parties;
CREATE POLICY parties_select_own ON parties
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS parties_service_all ON parties;
CREATE POLICY parties_service_all ON parties
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS parties_admin_select ON parties;
CREATE POLICY parties_admin_select ON parties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );
