-- RLS Fix for Admin Access
-- Run this in Supabase SQL Editor to fix admin access to profiles, orders, documents, and parties
-- This fixes the infinite recursion issue with admin policies

-- Step 1: Create the is_admin function (security definer avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 2: Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all parties" ON public.parties;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;

-- Step 3: Recreate admin policies using the function

-- Profiles: Admins can view and update all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- Orders: Admins have full access
CREATE POLICY "Admins can view all orders"
  ON public.orders FOR ALL
  USING (public.is_admin());

-- Parties: Admins can view all parties
CREATE POLICY "Admins can view all parties"
  ON public.parties FOR SELECT
  USING (public.is_admin());

-- Documents: Admins have full access
CREATE POLICY "Admins can view all documents"
  ON public.documents FOR ALL
  USING (public.is_admin());

-- Step 4: Grant function execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Done! Admin should now be able to view all profiles, orders, parties, and documents.
