-- ==========================================================================
-- MIGRATION: Fix search_path on SECURITY DEFINER functions
-- AUDIT REF: GAP-003 (P2), ST-003 (P2)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DO $$
DECLARE
  func RECORD;
BEGIN
  FOR func IN
    SELECT routine_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM information_schema.routines r
    JOIN pg_proc p ON p.proname = r.routine_name
    WHERE r.routine_schema = 'public'
      AND r.security_type = 'DEFINER'
      AND (p.proconfig IS NULL OR NOT ('search_path=' = ANY(p.proconfig)))
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = ''''',
        func.routine_name, func.args
      );
      RAISE NOTICE 'Fixed search_path for: %', func.routine_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix %: %', func.routine_name, SQLERRM;
    END;
  END LOOP;
END $$;
