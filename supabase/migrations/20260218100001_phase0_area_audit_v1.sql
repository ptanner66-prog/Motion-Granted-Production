-- ==========================================================================
-- AREA AUDIT v1.0 — Phase 0: Database Prerequisites
-- Date: 2026-02-18
--
-- P0-DB-3: Make storage bucket private (LCV-014)
-- P0-DB-4: Rewrite is_admin() to use admin_users VIEW (DEC-A8-01)
-- P0-DB-6: Add is_rework_reset column to cost_tracking (Area 3 ST4-002)
-- ==========================================================================

-- =========================================================================
-- P0-DB-3: Force documents bucket to PRIVATE
-- Impact: Prevents unauthenticated access to attorney-client privileged docs
-- =========================================================================
UPDATE storage.buckets SET public = false WHERE id = 'documents';
UPDATE storage.buckets SET public = false WHERE id = 'order-documents';
UPDATE storage.buckets SET public = false WHERE id = 'client-uploads';

-- =========================================================================
-- P0-DB-4: Rewrite is_admin() to use admin_users VIEW (DEC-A8-01)
-- Prerequisite: admin_users VIEW created in 20260216100002_d1_018_rls.sql
-- =========================================================================

-- Ensure admin_users VIEW exists
CREATE OR REPLACE VIEW public.admin_users AS
SELECT id AS user_id, role FROM public.profiles WHERE role IN ('admin', 'super_admin');

-- Rewrite is_admin() — SECURITY DEFINER required by RLS context
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- =========================================================================
-- P0-DB-6: Add is_rework_reset to cost_tracking (Area 3 ST4-002)
-- 6 code references exist, 0 migrations create this column
-- =========================================================================
ALTER TABLE cost_tracking ADD COLUMN IF NOT EXISTS is_rework_reset BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_cost_tracking_rework ON cost_tracking(is_rework_reset) WHERE is_rework_reset = false;
