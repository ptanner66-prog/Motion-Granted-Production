-- ============================================================================
-- SP-1 R4-10 / BD-R3-01: Ensure handle_new_user() trigger exists on auth.users
-- Date: 2026-02-16
--
-- handle_new_user() creates a profiles row when a user signs up via Supabase Auth.
--
-- SECURITY DEFINER: required because auth schema triggers cannot INSERT into
-- public schema with INVOKER privileges.
--
-- SQL INJECTION SAFE: Uses parameterized NEW.field references, NOT string
-- concatenation. Verified safe against injection attacks (DST-09).
--
-- The function itself was created in migration 006_fix_security_and_performance.sql
-- and audited in 20260214_audit_definer_functions.sql. This migration ensures
-- the trigger binding exists on auth.users.
-- ============================================================================

-- Recreate the function with the role column default to 'customer' (BD-R3-01)
-- This is idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, bar_number, states_licensed)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'customer',
    '',
    '{}'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists on auth.users
-- DROP IF EXISTS + CREATE ensures idempotent application
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
