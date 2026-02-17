-- SP-19 Block 1: Citation RLS Hardening (D3-004)
--
-- Adds admin-select policies to citation tables that lack them.
-- citation_verifications and citation_verification_log already have admin
-- policies from migrations 021 / d1_018_rls. citation_banks has service_role
-- and user-own policies (migration 018) but no admin-select policy.

-- ============================================================
-- citation_banks — add admin select policy
-- ============================================================
DROP POLICY IF EXISTS "citation_banks_admin_select" ON citation_banks;
CREATE POLICY "citation_banks_admin_select" ON citation_banks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
