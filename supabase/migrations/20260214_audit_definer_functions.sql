-- ============================================================================
-- SP-08 TASK 7: Audit SECURITY DEFINER Functions
-- Date: 2026-02-14
-- Author: SP-08 Database Security Audit
--
-- This migration hardens all SECURITY DEFINER functions:
--   1. Adds SET search_path = '' to prevent search_path injection
--   2. Downgrades read-only functions to SECURITY INVOKER where safe
--   3. Documents WHY each remaining DEFINER is necessary
--
-- CRITICAL: Apply this migration BEFORE deploying SP-08 code changes.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Functions that KEEP SECURITY DEFINER (with search_path hardening)
-- ============================================================================

-- is_admin(): Used in RLS policies. DEFINER required to avoid infinite recursion
-- (RLS on profiles → calls is_admin() → reads profiles → triggers RLS → loop).
-- Already has SET search_path = '' in migration 006. Re-affirming here.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- handle_new_user(): Auth trigger that creates a profile row on user signup.
-- DEFINER required because auth triggers run as the auth service, not the user.
-- Already has SET search_path = '' in migration 006. Re-affirming here.
-- (Not recreated to avoid dropping existing trigger binding.)

-- refresh_analytics_views(): Refreshes materialized views.
-- DEFINER required for owner-level REFRESH MATERIALIZED VIEW privilege.
-- Already has SET search_path = '' in migration 019. No change needed.

-- auto_cancel_expired_holds(): System cron function.
-- DEFINER required because it runs without user context (Inngest cron).
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.auto_cancel_expired_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cancelled_count INTEGER := 0;
  hold_record RECORD;
BEGIN
  FOR hold_record IN
    SELECT ow.id AS workflow_id, ow.order_id, o.order_number
    FROM public.order_workflows ow
    JOIN public.orders o ON o.id = ow.order_id
    WHERE ow.status = 'blocked'
      AND ow.updated_at < NOW() - INTERVAL '14 days'
  LOOP
    -- Cancel the workflow
    UPDATE public.order_workflows
    SET status = 'cancelled',
        last_error = 'Auto-cancelled: HOLD expired after 14 days',
        updated_at = NOW()
    WHERE id = hold_record.workflow_id;

    -- Update order status
    UPDATE public.orders
    SET status = 'cancelled',
        generation_error = 'Workflow auto-cancelled after 14-day HOLD expiry',
        updated_at = NOW()
    WHERE id = hold_record.order_id;

    -- Log the cancellation
    INSERT INTO public.automation_logs (order_id, action_type, action_details)
    VALUES (
      hold_record.order_id,
      'hold_expired',
      jsonb_build_object(
        'workflow_id', hold_record.workflow_id,
        'order_number', hold_record.order_number,
        'cancelled_at', NOW()::TEXT,
        'reason', 'HOLD expired after 14 days'
      )
    );

    cancelled_count := cancelled_count + 1;
  END LOOP;

  RETURN cancelled_count;
END;
$$;

COMMENT ON FUNCTION public.auto_cancel_expired_holds IS
  'SP-08: SECURITY DEFINER justified — runs as Inngest cron with no user context. search_path hardened.';

-- cleanup_old_metrics(): System maintenance function.
-- DEFINER required because it runs without user context (cron cleanup).
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete workflow metrics older than 90 days
  DELETE FROM public.workflow_metrics
  WHERE recorded_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Delete error logs older than 90 days (keep FATAL for 365 days)
  DELETE FROM public.error_logs
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND severity != 'FATAL';

  DELETE FROM public.error_logs
  WHERE created_at < NOW() - INTERVAL '365 days'
    AND severity = 'FATAL';

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_metrics IS
  'SP-08: SECURITY DEFINER justified — system maintenance cron, no user context. search_path hardened.';

-- log_credential_check(): Logging function for credential verification.
-- DEFINER needed to allow server-side code to log without user INSERT permissions.
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.log_credential_check(
  p_service TEXT,
  p_is_valid BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.credential_check_log (service, is_valid, error_message, checked_at)
  VALUES (p_service, p_is_valid, p_error, NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_credential_check IS
  'SP-08: SECURITY DEFINER justified — server-side logging without user INSERT permissions. search_path hardened.';

-- increment_revision_count(): Atomic counter update for workflow revisions.
-- DEFINER needed because workflow engine calls this server-side during phase execution
-- where the acting user may not own the order.
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.increment_revision_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.orders
  SET revision_count = COALESCE(revision_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING revision_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

COMMENT ON FUNCTION public.increment_revision_count IS
  'SP-08: SECURITY DEFINER justified — workflow engine calls server-side during phase execution. search_path hardened.';

-- ============================================================================
-- SECTION 2: Functions DOWNGRADED to SECURITY INVOKER (no privilege escalation needed)
-- ============================================================================

-- is_citation_overruled(): Read-only check on overruled_cases table.
-- No privilege escalation needed — callers have SELECT access via RLS.
CREATE OR REPLACE FUNCTION public.is_citation_overruled(p_normalized_citation TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.overruled_cases
    WHERE normalized_citation = p_normalized_citation
  );
END;
$$;

COMMENT ON FUNCTION public.is_citation_overruled IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only, no privilege escalation needed.';

-- get_order_violation_count(): Read-only count of workflow violations.
-- No privilege escalation needed — callers have SELECT access.
CREATE OR REPLACE FUNCTION public.get_order_violation_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.workflow_violations
    WHERE order_id = p_order_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_order_violation_count IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only count, no privilege escalation needed.';

-- get_conflict_summary(): Read-only aggregate of conflict statistics.
-- No privilege escalation needed — admin callers have SELECT access.
CREATE OR REPLACE FUNCTION public.get_conflict_summary()
RETURNS TABLE (
  total_conflicts BIGINT,
  blocking_conflicts BIGINT,
  warning_conflicts BIGINT,
  unresolved BIGINT,
  resolved_today BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COUNT(*) AS total_conflicts,
    COUNT(*) FILTER (WHERE severity = 'blocking') AS blocking_conflicts,
    COUNT(*) FILTER (WHERE severity = 'warning') AS warning_conflicts,
    COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved,
    COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE) AS resolved_today
  FROM public.conflict_matches;
$$;

COMMENT ON FUNCTION public.get_conflict_summary IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only aggregate, no privilege escalation needed.';

-- ============================================================================
-- SECTION 3: Verification
-- ============================================================================

-- Verify all SECURITY DEFINER functions now have search_path hardened
DO $$
DECLARE
  unsafe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT (p.proconfig @> ARRAY['search_path=']);

  IF unsafe_count > 0 THEN
    RAISE WARNING 'SP-08 AUDIT: % SECURITY DEFINER function(s) in public schema still lack SET search_path', unsafe_count;
  ELSE
    RAISE NOTICE 'SP-08 AUDIT: All SECURITY DEFINER functions in public schema have SET search_path hardened';
  END IF;
END;
$$;
