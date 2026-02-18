-- ============================================================================
-- Migration: Final Pass v1.0 — RLS, Storage Policies, Status Constraint
-- Date: 2026-02-18
-- Source: Production Hardening Final Pass (Groups 2-1, 2-2, 2-3)
-- ============================================================================
--
-- DEPLOY: Run in Supabase SQL editor against production.
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
--
-- WHAT THIS DOES:
-- 1. Enables RLS on order_citations (GAP-P0-001)
-- 2. Creates storage.objects policies for 3 buckets (RLS-16)
-- 3. Adds D6 definitive status constraint on orders.status (DEC-A8-02)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. order_citations RLS (GAP-P0-001)
-- ============================================================================

ALTER TABLE order_citations ENABLE ROW LEVEL SECURITY;

-- Clients/clerks: read citations for their own orders
DO $$ BEGIN
  CREATE POLICY oc_select_own ON order_citations
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_citations.order_id
        AND (orders.client_id = (SELECT auth.uid()) OR orders.clerk_id = (SELECT auth.uid()))
      )
      OR public.is_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins: full access
DO $$ BEGIN
  CREATE POLICY oc_admin_all ON order_citations
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: unrestricted
DO $$ BEGIN
  CREATE POLICY oc_service ON order_citations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. Storage.objects Policies (RLS-16)
-- ============================================================================

-- order-documents: owner reads via order ownership
DO $$ BEGIN
  CREATE POLICY order_documents_read_own ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'order-documents'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM orders WHERE client_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY order_documents_admin_all ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'order-documents' AND public.is_admin())
    WITH CHECK (bucket_id = 'order-documents' AND public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY order_documents_service_all ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'order-documents')
    WITH CHECK (bucket_id = 'order-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- order-archive: service_role only
DO $$ BEGIN
  CREATE POLICY order_archive_service_only ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'order-archive')
    WITH CHECK (bucket_id = 'order-archive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- client-uploads: attorney uploads/reads own order folder
DO $$ BEGIN
  CREATE POLICY client_uploads_insert_own ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'client-uploads'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM orders WHERE client_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_uploads_read_own ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'client-uploads'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM orders WHERE client_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_uploads_admin_all ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'client-uploads' AND public.is_admin())
    WITH CHECK (bucket_id = 'client-uploads' AND public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_uploads_service_all ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'client-uploads')
    WITH CHECK (bucket_id = 'client-uploads');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 3. D6 Definitive Status Constraint (DEC-A8-02)
-- ============================================================================
-- Accepts BOTH UPPERCASE (new canonical) and lowercase (legacy) statuses.
-- This prevents workflow engine crashes from invalid status values.

DO $$
BEGIN
  -- Drop existing constraint if present (may be outdated)
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_valid;

  ALTER TABLE orders ADD CONSTRAINT orders_status_valid CHECK (
    status IN (
      -- UPPERCASE (canonical)
      'SUBMITTED', 'PAID', 'IN_REVIEW', 'ASSIGNED', 'IN_PROGRESS',
      'HOLD_PENDING', 'ON_HOLD', 'AWAITING_APPROVAL',
      'READY_FOR_REVIEW', 'COMPLETED', 'DRAFT_DELIVERED', 'REVISION_DELIVERED',
      'REVISION_REQUESTED', 'CANCELLED', 'CANCELLED_SYSTEM', 'REFUNDED',
      -- lowercase (legacy compatibility)
      'submitted', 'paid', 'in_review', 'assigned', 'in_progress',
      'hold_pending', 'on_hold', 'awaiting_approval',
      'ready_for_review', 'completed', 'draft_delivered', 'revision_delivered',
      'revision_requested', 'cancelled', 'cancelled_system', 'refunded',
      -- Mixed case variants still in use
      'under_review', 'pending_review', 'processing'
    )
  );
END $$;


COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
--
-- 1. order_citations RLS enabled:
--    SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'order_citations';
--    Expected: relrowsecurity = true
--
-- 2. Storage policies created:
--    SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
--    Expected: 8 new policies (order_documents_*, order_archive_*, client_uploads_*)
--
-- 3. Status constraint exists:
--    SELECT conname FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'c';
--    Expected: orders_status_valid
-- ============================================================================
