-- ============================================================================
-- Migration 006: Fix Security and Performance Issues
-- ============================================================================
-- This migration fixes:
-- 1. SECURITY: Function search_path vulnerabilities (7 functions)
-- 2. PERFORMANCE: Auth RLS initialization plans (~30 policies)
-- 3. PERFORMANCE: Multiple permissive policies (~20 consolidations)
-- ============================================================================

-- ============================================================================
-- PART 1: FIX FUNCTION SEARCH_PATH SECURITY ISSUES
-- ============================================================================
-- All functions need SET search_path = '' and fully qualified table names

-- 1.1 Fix is_admin function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- 1.2 Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1.3 Fix generate_order_number function
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.order_number := 'MG-' || to_char(now(), 'YYMM') || '-' ||
    lpad(nextval('public.order_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

-- 1.4 Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, bar_number, states_licensed)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    '',
    '{}'
  );
  RETURN NEW;
END;
$$;

-- 1.5 Fix update_workflow_timestamp function
CREATE OR REPLACE FUNCTION public.update_workflow_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$;

-- 1.6 Fix update_generic_timestamp function
CREATE OR REPLACE FUNCTION public.update_generic_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1.7 Fix update_superprompt_templates_updated_at function
CREATE OR REPLACE FUNCTION public.update_superprompt_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1.8 Fix update_conversation_timestamp function
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1.9 Fix get_next_automation_task function
CREATE OR REPLACE FUNCTION public.get_next_automation_task(task_types TEXT[] DEFAULT NULL)
RETURNS TABLE (
  task_id UUID,
  task_type TEXT,
  order_id UUID,
  payload JSONB,
  priority INTEGER,
  attempts INTEGER
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  task_record RECORD;
BEGIN
  SELECT t.id, t.task_type, t.order_id, t.payload, t.priority, t.attempts
  INTO task_record
  FROM public.automation_tasks t
  WHERE t.status = 'pending'
    AND t.scheduled_for <= now()
    AND (task_types IS NULL OR t.task_type = ANY(task_types))
  ORDER BY t.priority DESC, t.scheduled_for ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF task_record IS NOT NULL THEN
    UPDATE public.automation_tasks
    SET status = 'processing', started_at = now(), attempts = public.automation_tasks.attempts + 1
    WHERE id = task_record.id;

    task_id := task_record.id;
    task_type := task_record.task_type;
    order_id := task_record.order_id;
    payload := task_record.payload;
    priority := task_record.priority;
    attempts := task_record.attempts + 1;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- 1.10 Fix complete_automation_task function
CREATE OR REPLACE FUNCTION public.complete_automation_task(
  p_task_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.automation_tasks
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE
      CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END
    END,
    completed_at = CASE WHEN p_success OR attempts >= max_attempts THEN now() ELSE NULL END,
    last_error = p_error,
    scheduled_for = CASE
      WHEN NOT p_success AND attempts < max_attempts
      THEN now() + (POWER(2, attempts) * INTERVAL '1 minute')
      ELSE scheduled_for
    END
  WHERE id = p_task_id;
END;
$$;

-- 1.11 Fix get_automation_dashboard_stats function
CREATE OR REPLACE FUNCTION public.get_automation_dashboard_stats()
RETURNS TABLE (
  pending_approvals BIGINT,
  auto_processed_today BIGINT,
  active_alerts BIGINT,
  pending_tasks BIGINT,
  failed_tasks_24h BIGINT,
  notifications_sent_today BIGINT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT COUNT(*) INTO pending_approvals
  FROM public.approval_queue
  WHERE status = 'pending';

  SELECT COUNT(*) INTO auto_processed_today
  FROM public.automation_logs
  WHERE was_auto_approved = true
    AND created_at >= CURRENT_DATE;

  SELECT COUNT(*) INTO active_alerts
  FROM public.approval_queue
  WHERE status = 'pending'
    AND urgency IN ('high', 'critical');

  SELECT COUNT(*) INTO pending_tasks
  FROM public.automation_tasks
  WHERE status = 'pending';

  SELECT COUNT(*) INTO failed_tasks_24h
  FROM public.automation_tasks
  WHERE status = 'failed'
    AND completed_at >= now() - INTERVAL '24 hours';

  SELECT COUNT(*) INTO notifications_sent_today
  FROM public.notification_queue
  WHERE status = 'sent'
    AND sent_at >= CURRENT_DATE;

  RETURN NEXT;
END;
$$;


-- ============================================================================
-- PART 2: FIX RLS POLICIES - PROFILES TABLE
-- ============================================================================
-- Drop and recreate with optimized auth.uid() calls and consolidated policies

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Consolidated SELECT policy for profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- Consolidated UPDATE policy for profiles
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- INSERT policy for profiles (handled by handle_new_user trigger)
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));


-- ============================================================================
-- PART 3: FIX RLS POLICIES - ORDERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Clients can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Clients can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Clerks can view assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Clerks can update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;

-- Consolidated SELECT policy for orders
CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    client_id = (SELECT auth.uid())
    OR clerk_id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- INSERT policy for orders
CREATE POLICY "orders_insert_policy" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (client_id = (SELECT auth.uid()));

-- UPDATE policy for orders
CREATE POLICY "orders_update_policy" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    clerk_id = (SELECT auth.uid())
    OR public.is_admin()
  );

-- DELETE policy for orders (admin only)
CREATE POLICY "orders_delete_policy" ON public.orders
  FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- PART 4: FIX RLS POLICIES - PARTIES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view parties for their orders" ON public.parties;
DROP POLICY IF EXISTS "Clients can insert parties for own orders" ON public.parties;
DROP POLICY IF EXISTS "Admins can view all parties" ON public.parties;

-- Consolidated SELECT policy for parties
CREATE POLICY "parties_select_policy" ON public.parties
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = parties.order_id
      AND (orders.client_id = (SELECT auth.uid()) OR orders.clerk_id = (SELECT auth.uid()))
    )
    OR public.is_admin()
  );

-- INSERT policy for parties
CREATE POLICY "parties_insert_policy" ON public.parties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_id AND orders.client_id = (SELECT auth.uid())
    )
    OR public.is_admin()
  );

-- UPDATE/DELETE policy for parties (admin only)
CREATE POLICY "parties_admin_policy" ON public.parties
  FOR ALL
  TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- PART 5: FIX RLS POLICIES - DOCUMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view documents for their orders" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON public.documents;

-- Consolidated SELECT policy for documents
CREATE POLICY "documents_select_policy" ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = documents.order_id
      AND (orders.client_id = (SELECT auth.uid()) OR orders.clerk_id = (SELECT auth.uid()))
    )
    OR public.is_admin()
  );

-- INSERT policy for documents
CREATE POLICY "documents_insert_policy" ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    OR public.is_admin()
  );

-- UPDATE/DELETE policy for documents (admin only)
CREATE POLICY "documents_admin_policy" ON public.documents
  FOR ALL
  TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- PART 6: FIX RLS POLICIES - MESSAGES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages for their orders" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

-- SELECT policy for messages
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = messages.order_id
      AND (orders.client_id = (SELECT auth.uid()) OR orders.clerk_id = (SELECT auth.uid()))
    )
    OR public.is_admin()
  );

-- INSERT policy for messages
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()));


-- ============================================================================
-- PART 7: FIX RLS POLICIES - MOTION_TYPES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Motion types are viewable by all authenticated users" ON public.motion_types;
DROP POLICY IF EXISTS "Admins can manage motion types" ON public.motion_types;

-- Consolidated SELECT policy for motion_types
CREATE POLICY "motion_types_select_policy" ON public.motion_types
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin());

-- Admin-only management policy for motion_types
CREATE POLICY "motion_types_admin_policy" ON public.motion_types
  FOR ALL
  TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- PART 8: FIX RLS POLICIES - SUPERPROMPT_TEMPLATES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage superprompt templates" ON public.superprompt_templates;
DROP POLICY IF EXISTS "Clerks can read superprompt templates" ON public.superprompt_templates;

-- Consolidated SELECT policy for superprompt_templates
CREATE POLICY "superprompt_templates_select_policy" ON public.superprompt_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Admin-only management policy for superprompt_templates
CREATE POLICY "superprompt_templates_admin_policy" ON public.superprompt_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
    )
  );


-- ============================================================================
-- PART 9: FIX RLS POLICIES - ORDER_FEEDBACK TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admin and clerk can manage order feedback" ON public.order_feedback;

-- Consolidated policy for order_feedback
CREATE POLICY "order_feedback_policy" ON public.order_feedback
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 10: FIX RLS POLICIES - ORDER_WORKFLOWS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own order workflows" ON public.order_workflows;
DROP POLICY IF EXISTS "Admins can manage order workflows" ON public.order_workflows;

-- Consolidated SELECT policy for order_workflows
CREATE POLICY "order_workflows_select_policy" ON public.order_workflows
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_workflows.order_id
      AND o.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );

-- Admin management policy for order_workflows
CREATE POLICY "order_workflows_admin_policy" ON public.order_workflows
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 11: FIX RLS POLICIES - WORKFLOW_PHASE_EXECUTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own phase executions" ON public.workflow_phase_executions;
DROP POLICY IF EXISTS "Admins can manage phase executions" ON public.workflow_phase_executions;

-- Consolidated SELECT policy for workflow_phase_executions
CREATE POLICY "workflow_phase_executions_select_policy" ON public.workflow_phase_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_workflows ow
      JOIN public.orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_phase_executions.order_workflow_id
      AND o.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );

-- Admin management policy for workflow_phase_executions
CREATE POLICY "workflow_phase_executions_admin_policy" ON public.workflow_phase_executions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 12: FIX RLS POLICIES - WORKFLOW_CITATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own citations" ON public.workflow_citations;
DROP POLICY IF EXISTS "Admins can manage citations" ON public.workflow_citations;

-- Consolidated SELECT policy for workflow_citations
CREATE POLICY "workflow_citations_select_policy" ON public.workflow_citations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_workflows ow
      JOIN public.orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_citations.order_workflow_id
      AND o.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );

-- Admin management policy for workflow_citations
CREATE POLICY "workflow_citations_admin_policy" ON public.workflow_citations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 13: FIX RLS POLICIES - PARSED_DOCUMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own parsed documents" ON public.parsed_documents;
DROP POLICY IF EXISTS "Admins can manage parsed documents" ON public.parsed_documents;

-- Consolidated SELECT policy for parsed_documents
CREATE POLICY "parsed_documents_select_policy" ON public.parsed_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = parsed_documents.order_id
      AND o.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );

-- Admin management policy for parsed_documents
CREATE POLICY "parsed_documents_admin_policy" ON public.parsed_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 14: FIX RLS POLICIES - AUTOMATION TABLES
-- ============================================================================

-- Fix automation_logs
DROP POLICY IF EXISTS "Admins can manage automation_logs" ON public.automation_logs;
CREATE POLICY "automation_logs_admin_policy" ON public.automation_logs
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix automation_tasks
DROP POLICY IF EXISTS "Admins can manage automation_tasks" ON public.automation_tasks;
CREATE POLICY "automation_tasks_admin_policy" ON public.automation_tasks
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix approval_queue
DROP POLICY IF EXISTS "Admins can manage approval_queue" ON public.approval_queue;
CREATE POLICY "approval_queue_admin_policy" ON public.approval_queue
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix automation_settings
DROP POLICY IF EXISTS "Admins can manage automation_settings" ON public.automation_settings;
CREATE POLICY "automation_settings_admin_policy" ON public.automation_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix notification_queue
DROP POLICY IF EXISTS "Admins can manage notification_queue" ON public.notification_queue;
CREATE POLICY "notification_queue_admin_policy" ON public.notification_queue
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix clerk_expertise
DROP POLICY IF EXISTS "Admins can manage clerk_expertise" ON public.clerk_expertise;
DROP POLICY IF EXISTS "Clerks can view own expertise" ON public.clerk_expertise;

CREATE POLICY "clerk_expertise_select_policy" ON public.clerk_expertise
  FOR SELECT
  TO authenticated
  USING (
    clerk_id = (SELECT auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "clerk_expertise_admin_policy" ON public.clerk_expertise
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix conflict_matches
DROP POLICY IF EXISTS "Admins can manage conflict_matches" ON public.conflict_matches;
CREATE POLICY "conflict_matches_admin_policy" ON public.conflict_matches
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- Fix webhook_events
DROP POLICY IF EXISTS "Admins can manage webhook_events" ON public.webhook_events;
CREATE POLICY "webhook_events_admin_policy" ON public.webhook_events
  FOR ALL
  TO authenticated
  USING (public.is_admin());


-- ============================================================================
-- PART 15: FIX RLS POLICIES - CONVERSATIONS TABLES
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can manage messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "Clients can create revision requests" ON public.revision_requests;
DROP POLICY IF EXISTS "Clients can view own revision requests" ON public.revision_requests;
DROP POLICY IF EXISTS "Admins can manage revision requests" ON public.revision_requests;

-- Conversations - admin/clerk only
CREATE POLICY "conversations_admin_policy" ON public.conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Conversation messages - admin/clerk only
CREATE POLICY "conversation_messages_admin_policy" ON public.conversation_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Revision requests - consolidated policies
CREATE POLICY "revision_requests_select_policy" ON public.revision_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );

CREATE POLICY "revision_requests_insert_policy" ON public.revision_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "revision_requests_admin_policy" ON public.revision_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- PART 16: FIX WORKFLOW_PHASE_DEFINITIONS AND CITATION_VERIFICATION_LOG
-- ============================================================================

DROP POLICY IF EXISTS "Workflow phase definitions are viewable by all authenticated users" ON public.workflow_phase_definitions;
DROP POLICY IF EXISTS "Admins can manage citation verification log" ON public.citation_verification_log;

-- Workflow phase definitions - public read
CREATE POLICY "workflow_phase_definitions_select_policy" ON public.workflow_phase_definitions
  FOR SELECT
  TO authenticated
  USING (true);

-- Citation verification log - admin only
CREATE POLICY "citation_verification_log_admin_policy" ON public.citation_verification_log
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('admin', 'clerk')
    )
  );


-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check functions have search_path set
-- SELECT proname, prosecdef, proconfig
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
-- AND proconfig::text LIKE '%search_path%';

-- Check policies are consolidated
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
