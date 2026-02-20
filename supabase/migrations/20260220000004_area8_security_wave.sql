-- ============================================================================
-- Area 8 Security Wave Migration
-- Date: 2026-02-20
-- Tasks: A8-T1, A8-T5, A8-T6, A8-T7, A8-T9, A8-T10, A8-T13
-- All statements are idempotent. Safe to re-run.
-- ============================================================================

-- ============================================================================
-- A8-T1: Fix documents INSERT policy — add ownership check (PROD-001)
-- Current: "Anyone can insert documents" policy with qual=NULL
-- Fix: Require uploaded_by = auth.uid() AND order ownership
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can insert documents" ON public.documents;

DO $$ BEGIN
  CREATE POLICY "Users can insert documents for own orders"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = documents.order_id
      AND orders.client_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role bypass for system-generated documents (AI pipeline)
DO $$ BEGIN
  CREATE POLICY "Service role insert documents"
  ON public.documents FOR INSERT TO service_role
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- A8-T5: Enable RLS on cost_tracking (RLS-25)
-- Current: Table created but ZERO RLS enabled
-- ============================================================================

ALTER TABLE IF EXISTS cost_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ct_admin_all ON cost_tracking
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ct_service_all ON cost_tracking
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ct_select_own ON cost_tracking
    FOR SELECT TO authenticated
    USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- A8-T6: REVOKE on materialized/admin views (BD-A8-003)
-- Current: Zero REVOKE statements on these views
-- ============================================================================

DO $$ BEGIN
  REVOKE ALL ON order_cost_summary FROM anon, authenticated;
  GRANT SELECT ON order_cost_summary TO service_role;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON conflict_review_queue FROM anon, authenticated;
  GRANT SELECT ON conflict_review_queue TO service_role;
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- ============================================================================
-- A8-T7: Drop legacy Clerk policies from orders (PROD-006)
-- Current: Clerk policies from pre-Supabase era still exist
-- ============================================================================

DROP POLICY IF EXISTS "Clerks can view assigned orders" ON orders;
DROP POLICY IF EXISTS "Clerks can manage assigned orders" ON orders;


-- ============================================================================
-- A8-T9: SECURITY DEFINER search_path fix (RLS-20)
-- Fix: Recreate functions with SET search_path = ''
-- ============================================================================

-- increment_rate_counter is handled in A8-T13 below.
-- For any other SECURITY DEFINER functions missing search_path,
-- run the diagnostic:
--   SELECT p.proname, p.proconfig FROM pg_proc p
--   JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname = 'public' AND p.prosecdef = true
--     AND (p.proconfig IS NULL OR NOT ('search_path=' = ANY(p.proconfig)));
-- and apply the fix template as needed.


-- ============================================================================
-- A8-T10: REVOKE anon EXECUTE on all public functions (RLS-23)
-- Current: Zero REVOKE...FROM anon in any migration
-- ============================================================================

DO $$
DECLARE func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT routine_name FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND grantee = 'anon' AND privilege_type = 'EXECUTE'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon', func_record.routine_name);
  END LOOP;
END $$;


-- ============================================================================
-- A8-T13: increment_rate_counter SECURITY DEFINER fix (RLS-24)
-- Current: Plain plpgsql without SECURITY DEFINER or search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_rate_counter(p_api TEXT, p_limit INT)
RETURNS BOOLEAN AS $$
DECLARE v_count INT;
BEGIN
  UPDATE rate_limits SET request_count = request_count + 1
    WHERE api = p_api AND window_start > NOW() - INTERVAL '1 hour'
    AND request_count < p_limit RETURNING request_count INTO v_count;
  IF v_count IS NULL THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
