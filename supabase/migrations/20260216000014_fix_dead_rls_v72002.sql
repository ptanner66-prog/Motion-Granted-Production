-- ==========================================================================
-- MIGRATION: Fix V72-002 -- Remove dead service_role RLS policies
-- AUDIT REF: V72-002 (P1 HIGH), PRE-005 (P2)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DO $$
DECLARE
  tbl RECORD;
  pol RECORD;
BEGIN
  FOR tbl IN
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE qual::text LIKE '%service_role%'
  LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE tablename = tbl.tablename
        AND qual::text LIKE '%service_role%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl.tablename);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''admin''))',
        tbl.tablename || '_admin_access',
        tbl.tablename
      );
    END LOOP;
  END LOOP;
END $$;
