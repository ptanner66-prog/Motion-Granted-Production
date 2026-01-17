-- Motion Granted Automation Tables Migration
-- This migration adds all tables required for the AI-powered workflow automation system

-- ============================================================================
-- AUTOMATION LOGS TABLE
-- Tracks all automated actions for audit trail and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'payment_processed',
    'payment_failed',
    'conflict_check_started',
    'conflict_check_completed',
    'conflict_detected',
    'conflict_cleared',
    'clerk_assignment_started',
    'clerk_assigned',
    'notification_queued',
    'notification_sent',
    'notification_failed',
    'qa_check_started',
    'qa_check_passed',
    'qa_check_failed',
    'status_changed',
    'deadline_alert',
    'report_generated',
    'approval_requested',
    'approval_granted',
    'approval_denied',
    'task_scheduled',
    'task_completed',
    'task_failed',
    'refund_processed',
    'revision_requested',
    'revision_completed'
  )),
  action_details JSONB NOT NULL DEFAULT '{}',
  confidence_score DECIMAL(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  was_auto_approved BOOLEAN DEFAULT false,
  owner_override BOOLEAN DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying logs by order
CREATE INDEX IF NOT EXISTS idx_automation_logs_order ON public.automation_logs(order_id);
-- Index for querying logs by action type
CREATE INDEX IF NOT EXISTS idx_automation_logs_action ON public.automation_logs(action_type);
-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON public.automation_logs(created_at DESC);

-- ============================================================================
-- AUTOMATION TASKS TABLE
-- Queue for scheduled and background tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'conflict_check',
    'clerk_assignment',
    'send_notification',
    'qa_check',
    'deadline_check',
    'follow_up_reminder',
    'generate_report',
    'process_payment_webhook',
    'retry_failed_notification',
    'cleanup_old_logs'
  )),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
  )),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching pending tasks
CREATE INDEX IF NOT EXISTS idx_automation_tasks_pending ON public.automation_tasks(scheduled_for, status)
  WHERE status = 'pending';
-- Index for order-related tasks
CREATE INDEX IF NOT EXISTS idx_automation_tasks_order ON public.automation_tasks(order_id);
-- Index for task type queries
CREATE INDEX IF NOT EXISTS idx_automation_tasks_type ON public.automation_tasks(task_type, status);

-- ============================================================================
-- APPROVAL QUEUE TABLE
-- Items requiring owner/admin approval before proceeding
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.approval_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  approval_type TEXT NOT NULL CHECK (approval_type IN (
    'conflict_review',
    'clerk_assignment',
    'refund_request',
    'change_order',
    'deadline_extension',
    'qa_override',
    'manual_status_change'
  )),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  request_details JSONB NOT NULL DEFAULT '{}',
  ai_recommendation TEXT,
  ai_reasoning TEXT,
  ai_confidence DECIMAL(5,4) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  alternatives JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'expired',
    'auto_approved'
  )),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  expires_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Index for pending approvals
CREATE INDEX IF NOT EXISTS idx_approval_queue_pending ON public.approval_queue(status, urgency, created_at)
  WHERE status = 'pending';
-- Index for order approvals
CREATE INDEX IF NOT EXISTS idx_approval_queue_order ON public.approval_queue(order_id);

-- ============================================================================
-- AUTOMATION SETTINGS TABLE
-- Global and per-user automation configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'conflict_checking',
    'clerk_assignment',
    'notifications',
    'qa_checks',
    'deadlines',
    'approvals',
    'reports',
    'general'
  )),
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default automation settings
INSERT INTO public.automation_settings (setting_key, setting_value, description, category) VALUES
  -- Conflict Checking Settings
  ('conflict_auto_clear_threshold', '{"value": 0.95, "enabled": true}',
   'Confidence threshold above which conflicts are auto-cleared (0-1)', 'conflict_checking'),
  ('conflict_check_enabled', '{"enabled": true}',
   'Enable automatic conflict checking on new orders', 'conflict_checking'),
  ('conflict_fuzzy_match_threshold', '{"value": 0.85}',
   'Similarity threshold for fuzzy party name matching (0-1)', 'conflict_checking'),

  -- Clerk Assignment Settings
  ('clerk_auto_assign_threshold', '{"value": 0.85, "enabled": true}',
   'Confidence threshold above which clerks are auto-assigned', 'clerk_assignment'),
  ('clerk_assignment_enabled', '{"enabled": true}',
   'Enable automatic clerk assignment', 'clerk_assignment'),
  ('clerk_max_concurrent_rush', '{"value": 2}',
   'Maximum rush orders per clerk at once', 'clerk_assignment'),
  ('clerk_workload_weight', '{"capacity": 0.3, "expertise": 0.4, "deadline": 0.2, "balance": 0.1}',
   'Weights for clerk assignment scoring', 'clerk_assignment'),

  -- Notification Settings
  ('notifications_enabled', '{"enabled": true}',
   'Enable automated email notifications', 'notifications'),
  ('notification_quiet_hours', '{"start": "22:00", "end": "07:00", "timezone": "America/Chicago", "enabled": false}',
   'Quiet hours during which non-critical notifications are held', 'notifications'),
  ('notification_retry_attempts', '{"value": 3}',
   'Number of retry attempts for failed notifications', 'notifications'),
  ('notification_batch_size', '{"value": 50}',
   'Maximum notifications to process per batch', 'notifications'),

  -- QA Check Settings
  ('qa_auto_deliver_threshold', '{"value": 0.95, "enabled": true}',
   'QA score above which drafts are auto-delivered', 'qa_checks'),
  ('qa_checks_enabled', '{"enabled": true}',
   'Enable automatic QA checks on uploaded deliverables', 'qa_checks'),
  ('qa_check_placeholders', '{"patterns": ["INSERT", "TBD", "TODO", "FIXME", "[PLACEHOLDER]"], "enabled": true}',
   'Placeholder text patterns to flag during QA', 'qa_checks'),

  -- Deadline Settings
  ('deadline_alert_days', '{"warning": 3, "critical": 1}',
   'Days before deadline to send alerts', 'deadlines'),
  ('deadline_monitoring_enabled', '{"enabled": true}',
   'Enable deadline monitoring and alerts', 'deadlines'),
  ('deadline_check_interval_hours', '{"value": 4}',
   'How often to run deadline checks', 'deadlines'),

  -- Approval Settings
  ('approval_expiry_hours', '{"value": 48}',
   'Hours after which pending approvals expire', 'approvals'),
  ('approval_auto_escalate', '{"enabled": true, "after_hours": 24}',
   'Auto-escalate unanswered approvals', 'approvals'),

  -- Report Settings
  ('report_daily_enabled', '{"enabled": true, "time": "08:00", "timezone": "America/Chicago"}',
   'Enable daily operations summary report', 'reports'),
  ('report_weekly_enabled', '{"enabled": true, "day": "monday", "time": "09:00", "timezone": "America/Chicago"}',
   'Enable weekly business intelligence report', 'reports'),
  ('report_recipients', '{"emails": []}',
   'Email addresses to receive automated reports', 'reports'),

  -- General Settings
  ('automation_level', '{"level": "supervised", "description": "AI recommends, most actions require approval"}',
   'Overall automation aggressiveness level', 'general'),
  ('ai_model', '{"model": "claude-sonnet-4-20250514", "max_tokens": 4096}',
   'Claude model configuration for AI tasks', 'general'),
  ('maintenance_mode', '{"enabled": false}',
   'Pause all automation when enabled', 'general')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- NOTIFICATION QUEUE TABLE
-- Queue for outgoing notifications (email, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'order_confirmation',
    'payment_received',
    'payment_failed',
    'conflict_cleared',
    'order_assigned',
    'work_started',
    'draft_ready',
    'revision_ready',
    'deadline_reminder',
    'deadline_warning',
    'deadline_critical',
    'revision_requested',
    'order_completed',
    'feedback_request',
    'approval_needed',
    'report_delivery',
    'welcome_email',
    'status_update'
  )),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',
    'queued',
    'sending',
    'sent',
    'failed',
    'cancelled'
  )),
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  external_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for pending notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending ON public.notification_queue(scheduled_for, status, priority)
  WHERE status IN ('pending', 'queued');
-- Index for recipient notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient ON public.notification_queue(recipient_id);
-- Index for order notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_order ON public.notification_queue(order_id);

-- ============================================================================
-- CLERK EXPERTISE TABLE
-- Track clerk expertise by motion type for smart assignment
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clerk_expertise (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  clerk_id UUID REFERENCES public.clerks(id) ON DELETE CASCADE NOT NULL,
  motion_type TEXT NOT NULL,
  expertise_level INTEGER DEFAULT 1 CHECK (expertise_level >= 1 AND expertise_level <= 5),
  orders_completed INTEGER DEFAULT 0,
  average_completion_days DECIMAL(5,2),
  last_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clerk_id, motion_type)
);

-- Index for finding experts
CREATE INDEX IF NOT EXISTS idx_clerk_expertise_motion ON public.clerk_expertise(motion_type, expertise_level DESC);

-- ============================================================================
-- CONFLICT MATCHES TABLE
-- Store detected conflicts for review
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conflict_matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  matched_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  party_name TEXT NOT NULL,
  matched_party_name TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'related_entity')),
  similarity_score DECIMAL(5,4) CHECK (similarity_score >= 0 AND similarity_score <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  ai_analysis TEXT,
  is_cleared BOOLEAN DEFAULT false,
  cleared_by UUID REFERENCES public.profiles(id),
  cleared_at TIMESTAMPTZ,
  clear_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for order conflicts
CREATE INDEX IF NOT EXISTS idx_conflict_matches_order ON public.conflict_matches(order_id, is_cleared);

-- ============================================================================
-- WEBHOOK EVENTS TABLE
-- Store incoming webhook events for idempotency and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'resend', 'other')),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for unprocessed webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON public.webhook_events(source, processed)
  WHERE processed = false;
-- Index for event lookup (idempotency)
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events(event_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clerk_expertise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflict_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for automation tables
CREATE POLICY "Admins can manage automation_logs" ON public.automation_logs
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage automation_tasks" ON public.automation_tasks
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage approval_queue" ON public.approval_queue
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage automation_settings" ON public.automation_settings
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage notification_queue" ON public.notification_queue
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage clerk_expertise" ON public.clerk_expertise
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage conflict_matches" ON public.conflict_matches
  FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can manage webhook_events" ON public.webhook_events
  FOR ALL USING (public.is_admin());

-- Clerks can view their own expertise
CREATE POLICY "Clerks can view own expertise" ON public.clerk_expertise
  FOR SELECT USING (auth.uid() = clerk_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at on automation_settings
DROP TRIGGER IF EXISTS update_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER update_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at on clerk_expertise
DROP TRIGGER IF EXISTS update_clerk_expertise_updated_at ON public.clerk_expertise;
CREATE TRIGGER update_clerk_expertise_updated_at
  BEFORE UPDATE ON public.clerk_expertise
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get next pending task
CREATE OR REPLACE FUNCTION get_next_automation_task(task_types TEXT[] DEFAULT NULL)
RETURNS TABLE (
  task_id UUID,
  task_type TEXT,
  order_id UUID,
  payload JSONB,
  priority INTEGER,
  attempts INTEGER
) AS $$
DECLARE
  task_record RECORD;
BEGIN
  -- Lock and fetch the next pending task
  SELECT t.id, t.task_type, t.order_id, t.payload, t.priority, t.attempts
  INTO task_record
  FROM public.automation_tasks t
  WHERE t.status = 'pending'
    AND t.scheduled_for <= NOW()
    AND (task_types IS NULL OR t.task_type = ANY(task_types))
  ORDER BY t.priority DESC, t.scheduled_for ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF task_record IS NOT NULL THEN
    -- Mark as processing
    UPDATE public.automation_tasks
    SET status = 'processing', started_at = NOW(), attempts = attempts + 1
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
$$ LANGUAGE plpgsql;

-- Function to complete a task
CREATE OR REPLACE FUNCTION complete_automation_task(
  p_task_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.automation_tasks
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE
      CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END
    END,
    completed_at = CASE WHEN p_success OR attempts >= max_attempts THEN NOW() ELSE NULL END,
    last_error = p_error,
    scheduled_for = CASE
      WHEN NOT p_success AND attempts < max_attempts
      THEN NOW() + (POWER(2, attempts) * INTERVAL '1 minute')
      ELSE scheduled_for
    END
  WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get automation dashboard stats
CREATE OR REPLACE FUNCTION get_automation_dashboard_stats()
RETURNS TABLE (
  pending_approvals BIGINT,
  auto_processed_today BIGINT,
  active_alerts BIGINT,
  pending_tasks BIGINT,
  failed_tasks_24h BIGINT,
  notifications_sent_today BIGINT
) AS $$
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
    AND completed_at >= NOW() - INTERVAL '24 hours';

  SELECT COUNT(*) INTO notifications_sent_today
  FROM public.notification_queue
  WHERE status = 'sent'
    AND sent_at >= CURRENT_DATE;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
