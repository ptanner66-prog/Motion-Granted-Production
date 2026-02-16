-- ==========================================================================
-- MIGRATION: Fix CM-002 -- Replace user_roles references with profiles.role
-- AUDIT REF: CM-002 (P1) -- 4 tables affected
-- DATE: 2026-02-16 CST
-- ==========================================================================

-- ===== 1. workflow_audit_log =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_audit_log') THEN
    DROP POLICY IF EXISTS "Admin view audit log" ON workflow_audit_log;
    DROP POLICY IF EXISTS "workflow_audit_log_admin" ON workflow_audit_log;
    DROP POLICY IF EXISTS "workflow_audit_log_select" ON workflow_audit_log;

    CREATE POLICY "workflow_audit_log_admin_select" ON workflow_audit_log
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

    CREATE POLICY "workflow_audit_log_admin_insert" ON workflow_audit_log
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- ===== 2. workflow_violations =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_violations') THEN
    DROP POLICY IF EXISTS "Admin view violations" ON workflow_violations;
    DROP POLICY IF EXISTS "workflow_violations_admin" ON workflow_violations;

    CREATE POLICY "workflow_violations_admin_select" ON workflow_violations
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- ===== 3. conflict_matches =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_matches') THEN
    DROP POLICY IF EXISTS "Admins can view all conflicts" ON conflict_matches;
    DROP POLICY IF EXISTS "conflict_matches_admin" ON conflict_matches;

    CREATE POLICY "conflict_matches_admin_select" ON conflict_matches
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

    CREATE POLICY "conflict_matches_own_orders" ON conflict_matches
      FOR SELECT TO authenticated
      USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));
  END IF;
END $$;

-- ===== 4. conflict_checks (may not exist per CC-001) =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_checks') THEN
    DROP POLICY IF EXISTS "Admin view conflict checks" ON conflict_checks;
    DROP POLICY IF EXISTS "conflict_checks_admin" ON conflict_checks;

    CREATE POLICY "conflict_checks_admin_select" ON conflict_checks
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Verification:
-- SELECT tablename, policyname, qual FROM pg_policies WHERE qual::text LIKE '%user_roles%';
-- Expected: 0 rows
