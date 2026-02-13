-- ============================================================================
-- Migration: 20260213000002_fix_workflow_violations_rls.sql
-- SP19 CGA6-001: Fix RLS on workflow_violations (underlying unresolved_violations VIEW)
--
-- CRITICAL BUG FIX: The existing RLS policies on workflow_violations reference
-- a `user_roles` table that does not exist. This means:
--   - Admin SELECT policy silently returns 0 rows (broken)
--   - Admin UPDATE policy silently blocks all updates (broken)
--   - The unresolved_violations VIEW returns nothing for admins
--
-- This migration replaces the broken policies with working ones using
-- public.is_admin() (defined in migration 006), consistent with the rest
-- of the codebase.
-- ============================================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE workflow_violations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP BROKEN POLICIES (from 029_workflow_violations.sql)
-- These reference `user_roles` which does not exist as a table.
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view violations" ON workflow_violations;
DROP POLICY IF EXISTS "Admins can update violations" ON workflow_violations;
DROP POLICY IF EXISTS "Service role can insert violations" ON workflow_violations;

-- ============================================================================
-- RECREATE POLICIES — Using is_admin() and codebase standard patterns
-- ============================================================================

-- 1. Admin SELECT: Admins can view all violations (for dashboard + resolution)
CREATE POLICY "workflow_violations_admin_select" ON workflow_violations
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 2. Admin UPDATE: Admins can resolve violations (mark resolved, add notes)
CREATE POLICY "workflow_violations_admin_update" ON workflow_violations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 3. Service role full access: Inngest workflow pipeline logs violations
--    and automated jobs may need to SELECT/UPDATE/DELETE.
--    service_role bypasses RLS by default, but explicit policy is defense-in-depth.
CREATE POLICY "workflow_violations_service_role_policy" ON workflow_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- NOTE: The unresolved_violations VIEW (defined in 029_workflow_violations.sql)
-- inherits security from the underlying workflow_violations table RLS.
-- No separate RLS needed on the VIEW itself.
--
-- CHECKPOINT VERIFICATION (run manually):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'workflow_violations' ORDER BY policyname;
-- Expected: 3 policies (admin_select, admin_update, service_role_policy)
-- ============================================================================
