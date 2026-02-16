-- ============================================================================
-- SP-2 Task 1 (R4-04 / D1-019): Profiles Role Privilege Escalation Fix
-- Date: 2026-02-16
--
-- Problem: The existing profiles_update_policy (migration 006) allows
-- unrestricted self-updates. Any user can execute:
--   UPDATE profiles SET role = 'admin' WHERE id = auth.uid()
-- and gain full admin access.
--
-- Fix: Two layers of defense:
-- 1. RLS policy WITH CHECK prevents role column changes
-- 2. Trigger blocks role changes outside service_role context (defense in depth)
-- ============================================================================

-- PRIMARY FIX: Replace existing update policy with role-protected version
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile except role" ON profiles;

CREATE POLICY "Users can update own profile except role" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- Admin can update any profile (including role changes via Dashboard)
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE
  USING (public.is_admin());

-- DEFENSE-IN-DEPTH: Trigger blocks role changes even if RLS is bypassed
CREATE OR REPLACE FUNCTION prevent_role_self_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
      RAISE EXCEPTION 'Role changes require service_role context. Self-promotion blocked.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_self_update ON profiles;
CREATE TRIGGER trg_prevent_role_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_update();
