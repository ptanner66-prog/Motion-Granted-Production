-- ==========================================================================
-- MIGRATION: Fix S-001 -- Privilege Escalation on profiles table
-- AUDIT REF: S-001 (P0 CRITICAL) -- MG_COMPLETE_AUDIT_STATE, Finding #1
-- DATE: 2026-02-16 CST
-- AUTHOR: Clay (via audit) / Porter (implementation)
--
-- WHAT THIS FIXES:
-- The profiles UPDATE RLS policy allows any authenticated user to change
-- their own role column. A user can SET role = 'admin' and gain full
-- admin access to the platform. This adds a WITH CHECK that prevents
-- users from modifying their role column during updates.
--
-- ROLLBACK: DROP POLICY "profiles_update_own" ON profiles;
--           then recreate original policy without WITH CHECK
-- ==========================================================================

-- Step 1: Drop the existing vulnerable policy (both possible names)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Step 2: Recreate with WITH CHECK preventing role modification
-- NOTE: Uses subquery because Supabase RLS does not support OLD in WITH CHECK.
-- The subquery reads the CURRENT role before the update is applied.
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Verification (run manually after migration):
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'profiles' AND cmd = 'UPDATE';
-- Expected: 1 row with with_check containing role subquery
