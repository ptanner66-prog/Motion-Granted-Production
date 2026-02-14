-- ============================================================================
-- SP-08 TASK 10: Admin RLS Policies for User-Scoped Client
-- Date: 2026-02-14
--
-- After SP-08 removed service_role from admin routes, those routes now use
-- user-scoped clients (anon key + JWT). These policies grant admin users
-- access to tables they need via RLS instead of service_role bypass.
--
-- PREREQUISITE: is_admin() function must exist (from migration 006).
-- CRITICAL: Apply this BEFORE deploying SP-08 code changes.
-- ============================================================================

-- ============================================================================
-- SECTION 1: phase_prompts — Admin SELECT, UPDATE, INSERT
-- Previously only service_role had access (migration 023).
-- Now admin routes use user-scoped client for prompt management.
-- ============================================================================

-- Drop existing service_role-only policy
DROP POLICY IF EXISTS "Service role full access to phase_prompts" ON public.phase_prompts;

-- Admin can read all phase prompts
CREATE POLICY "phase_prompts_admin_select" ON public.phase_prompts
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admin can update phase prompts
CREATE POLICY "phase_prompts_admin_update" ON public.phase_prompts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Admin can insert phase prompts
CREATE POLICY "phase_prompts_admin_insert" ON public.phase_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Service role still needs access for server-side prompt loading (prompts/index.ts)
CREATE POLICY "phase_prompts_service_role" ON public.phase_prompts
  FOR SELECT
  TO service_role
  USING (true);

-- ============================================================================
-- SECTION 2: phase_prompt_versions — Admin SELECT, INSERT
-- Previously had a broad USING(true) policy. Tighten to admin-only.
-- ============================================================================

DROP POLICY IF EXISTS "Service role full access on phase_prompt_versions" ON public.phase_prompt_versions;

-- Admin can read version history
CREATE POLICY "phase_prompt_versions_admin_select" ON public.phase_prompt_versions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admin can insert new versions
CREATE POLICY "phase_prompt_versions_admin_insert" ON public.phase_prompt_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Service role for server-side access
CREATE POLICY "phase_prompt_versions_service_role" ON public.phase_prompt_versions
  FOR SELECT
  TO service_role
  USING (true);

-- ============================================================================
-- SECTION 3: Extend orders UPDATE policy
-- Current policy (migration 006) only allows admin/clerk UPDATE.
-- The user-scoped admin routes still pass is_admin() check, so no change needed.
-- Verified: orders_update_policy allows is_admin() → admin routes work.
-- ============================================================================

-- No changes needed — existing policy already covers admin:
--   CREATE POLICY "orders_update_policy" ON public.orders
--     FOR UPDATE TO authenticated
--     USING (clerk_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- SECTION 4: Extend orders DELETE policy for account deletion
-- Current policy (migration 006) only allows admin DELETE.
-- Add user self-deletion for GDPR/CCPA compliance (account/delete route).
-- ============================================================================

DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;

CREATE POLICY "orders_delete_policy" ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    client_id = (SELECT auth.uid())  -- Users can delete their own orders
    OR public.is_admin()              -- Admins can delete any order
  );

-- ============================================================================
-- SECTION 5: User self-service policies for account deletion
-- The account/delete route uses user-scoped client to delete user's own data.
-- These policies allow users to DELETE their own records.
-- ============================================================================

-- Users can delete their own profile (for account deletion)
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;
CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- Users can delete conversations for their own orders
CREATE POLICY "conversations_user_delete" ON public.conversations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = conversations.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
  );

-- Users can delete conversation messages for their own orders
CREATE POLICY "conversation_messages_user_delete" ON public.conversation_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.orders o ON o.id = c.order_id
      WHERE c.id = conversation_messages.conversation_id
      AND o.client_id = (SELECT auth.uid())
    )
  );

-- Users can delete documents for their own orders
CREATE POLICY "documents_user_delete" ON public.documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = documents.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
  );

-- Users can delete parties for their own orders
CREATE POLICY "parties_user_delete" ON public.parties
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = parties.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- SECTION 6: Admin INSERT on automation_logs
-- The existing admin policy (migration 006) uses FOR ALL with is_admin().
-- Clerk users also need INSERT access for logging (automation/restart route).
-- ============================================================================

-- Extend to include clerk role for INSERT
CREATE POLICY "automation_logs_clerk_insert" ON public.automation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- ============================================================================
-- SECTION 7: Verification
-- ============================================================================

DO $$
DECLARE
  missing_count INTEGER := 0;
  table_name TEXT;
BEGIN
  -- Check critical tables have RLS enabled
  FOR table_name IN
    SELECT t.tablename
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename IN (
        'phase_prompts', 'phase_prompt_versions',
        'orders', 'profiles', 'conversations',
        'conversation_messages', 'automation_logs'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename
      )
  LOOP
    missing_count := missing_count + 1;
    RAISE WARNING 'SP-08: Table % has no RLS policies!', table_name;
  END LOOP;

  IF missing_count = 0 THEN
    RAISE NOTICE 'SP-08: All critical tables have RLS policies configured.';
  END IF;
END;
$$;
