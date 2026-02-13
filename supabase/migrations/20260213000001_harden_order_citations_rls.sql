-- ============================================================================
-- Migration: 20260213000001_harden_order_citations_rls.sql
-- SP19 CGA6-001: Harden RLS on order_citations
--
-- Aligns order_citations RLS policies with the codebase standard:
--   - Uses public.is_admin() instead of inline profiles.role checks
--   - Uses (SELECT auth.uid()) subquery for query planner optimization
--   - Separates client SELECT from admin/clerk management policies
--   - Preserves service_role bypass for Inngest workflow pipeline
-- ============================================================================

-- Ensure RLS is enabled (idempotent — safe if already enabled)
ALTER TABLE order_citations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (from 20260130_create_order_citations.sql)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own order citations" ON order_citations;
DROP POLICY IF EXISTS "Admins can manage order citations" ON order_citations;
DROP POLICY IF EXISTS "Service role full access to order_citations" ON order_citations;

-- ============================================================================
-- RECREATE POLICIES — Aligned with codebase standards (migration 006 pattern)
-- ============================================================================

-- 1. Clients can SELECT citations for orders where they are the client.
--    Clerks can SELECT citations for orders assigned to them.
--    Admins can SELECT all citations.
CREATE POLICY "order_citations_select_policy" ON order_citations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_citations.order_id
      AND (
        orders.client_id = (SELECT auth.uid())
        OR orders.clerk_id = (SELECT auth.uid())
      )
    )
    OR public.is_admin()
  );

-- 2. Admin/clerk management policy (INSERT, UPDATE, DELETE).
--    Regular clients cannot modify citations — only the workflow pipeline
--    (via service_role) and admin/clerk users can.
--    Note: Uses inline profiles.role check (not is_admin()) because clerks
--    also need management access and is_admin() only checks for 'admin'.
CREATE POLICY "order_citations_admin_policy" ON order_citations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- 3. Service role bypass for Inngest workflow pipeline.
--    service_role automatically bypasses RLS, but explicit policy is
--    defense-in-depth in case force_row_level_security is ever enabled.
CREATE POLICY "order_citations_service_role_policy" ON order_citations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- CHECKPOINT VERIFICATION (run manually):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'order_citations' ORDER BY policyname;
-- Expected: 3 policies (select_policy, admin_policy, service_role_policy)
-- ============================================================================
