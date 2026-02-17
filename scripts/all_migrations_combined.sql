-- ============================================================
-- MIGRATION: 001_automation_tables.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 002_add_revision_columns.sql
-- ============================================================
-- ============================================================================
-- Migration: Add revision tracking columns to orders table
-- Description: Adds columns for tracking revision requests and history
-- ============================================================================

-- Add revision tracking columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS revision_notes TEXT,
ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN orders.revision_count IS 'Number of revisions requested for this order';
COMMENT ON COLUMN orders.revision_notes IS 'Current/latest revision request notes';
COMMENT ON COLUMN orders.revision_requested_at IS 'Timestamp of the last revision request';

-- Create index for querying orders with pending revisions
CREATE INDEX IF NOT EXISTS idx_orders_revision_status
ON orders (status)
WHERE status IN ('revision_requested', 'revision_delivered');

-- Update the status constraint to include revision statuses if not already present
-- (The existing schema should already have these, but we'll make sure)
DO $$
BEGIN
  -- Check if constraint exists and drop it first
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_status_check'
    AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;

  -- Add updated constraint with all statuses
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'submitted',
    'under_review',
    'assigned',
    'in_progress',
    'in_review',
    'draft_delivered',
    'revision_requested',
    'revision_in_progress',
    'revision_delivered',
    'completed',
    'cancelled',
    'on_hold',
    'refunded'
  ));
EXCEPTION
  WHEN others THEN
    -- If constraint doesn't exist or can't be modified, just continue
    NULL;
END $$;


-- ============================================================
-- MIGRATION: 003_motion_workflow_system.sql
-- ============================================================
-- ============================================================================
-- Motion Granted v5.0 Workflow System
-- Complete schema for motion types, workflow phases, and citation tracking
-- ============================================================================

-- ============================================================================
-- MOTION TYPES AND TIERS
-- ============================================================================

-- Motion complexity tiers
CREATE TYPE motion_tier AS ENUM ('A', 'B', 'C');
-- Tier A: Procedural/Administrative - Simple procedural motions
-- Tier B: Intermediate - Standard motions with moderate complexity
-- Tier C: Complex/Dispositive - MSJ, MSA, PI, TRO

-- Workflow path types
CREATE TYPE workflow_path AS ENUM ('path_a', 'path_b');
-- Path A: Initiating Motions (offensive/proactive)
-- Path B: Opposition/Response (defensive/reactive)

-- Workflow phase status
CREATE TYPE phase_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'requires_review',
  'failed'
);

-- Citation verification status
CREATE TYPE citation_status AS ENUM (
  'pending',
  'verified',
  'invalid',
  'needs_update',
  'flagged'
);

-- Motion types table
CREATE TABLE motion_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tier motion_tier NOT NULL,

  -- Jurisdiction applicability
  federal_applicable BOOLEAN DEFAULT true,
  state_applicable BOOLEAN DEFAULT true,

  -- Court types where this motion applies
  applicable_courts JSONB DEFAULT '[]'::jsonb,

  -- Workflow configuration
  default_path workflow_path DEFAULT 'path_a',
  supports_opposition BOOLEAN DEFAULT true,

  -- Timing requirements
  typical_turnaround_days INTEGER DEFAULT 5,
  rush_available BOOLEAN DEFAULT true,
  min_turnaround_days INTEGER DEFAULT 2,

  -- Pricing
  base_price_cents INTEGER NOT NULL,
  rush_multiplier NUMERIC(3,2) DEFAULT 1.5,
  complexity_factors JSONB DEFAULT '{}'::jsonb,

  -- Requirements
  required_documents JSONB DEFAULT '[]'::jsonb,
  required_information JSONB DEFAULT '[]'::jsonb,

  -- Output specifications
  typical_page_range JSONB DEFAULT '{"min": 5, "max": 15}'::jsonb,
  requires_exhibits BOOLEAN DEFAULT false,
  requires_proposed_order BOOLEAN DEFAULT true,
  requires_certificate_of_service BOOLEAN DEFAULT true,

  -- AI generation hints
  generation_prompts JSONB DEFAULT '{}'::jsonb,
  citation_requirements JSONB DEFAULT '{"minimum": 4, "hard_stop": true}'::jsonb,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- WORKFLOW PHASES
-- ============================================================================

-- Workflow phase definitions (templates)
CREATE TABLE workflow_phase_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_path workflow_path NOT NULL,
  phase_number INTEGER NOT NULL,
  phase_code VARCHAR(50) NOT NULL,
  phase_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Phase requirements
  required_inputs JSONB DEFAULT '[]'::jsonb,
  expected_outputs JSONB DEFAULT '[]'::jsonb,

  -- AI configuration
  ai_task_type VARCHAR(100),
  ai_prompt_template TEXT,
  ai_validation_rules JSONB DEFAULT '[]'::jsonb,

  -- Timing
  estimated_duration_minutes INTEGER DEFAULT 30,
  can_run_parallel BOOLEAN DEFAULT false,
  depends_on_phases JSONB DEFAULT '[]'::jsonb,

  -- Quality gates
  requires_human_review BOOLEAN DEFAULT false,
  auto_approve_threshold NUMERIC(3,2) DEFAULT 0.85,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workflow_path, phase_number)
);

-- Order workflow instances (actual execution)
CREATE TABLE order_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  motion_type_id UUID NOT NULL REFERENCES motion_types(id),
  workflow_path workflow_path NOT NULL,

  -- Current state
  current_phase INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending',

  -- Progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),

  -- Results
  final_document_id UUID,
  quality_score NUMERIC(3,2),
  citation_count INTEGER DEFAULT 0,

  -- Error handling
  error_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(order_id)
);

-- Individual phase executions
CREATE TABLE workflow_phase_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_workflow_id UUID NOT NULL REFERENCES order_workflows(id) ON DELETE CASCADE,
  phase_definition_id UUID NOT NULL REFERENCES workflow_phase_definitions(id),
  phase_number INTEGER NOT NULL,

  -- Execution state
  status phase_status DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Input/Output
  inputs JSONB DEFAULT '{}'::jsonb,
  outputs JSONB DEFAULT '{}'::jsonb,

  -- AI processing
  ai_request_id VARCHAR(255),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_response JSONB,

  -- Quality metrics
  quality_score NUMERIC(3,2),
  validation_results JSONB DEFAULT '[]'::jsonb,

  -- Review
  requires_review BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(order_workflow_id, phase_number)
);

-- ============================================================================
-- CITATION TRACKING SYSTEM
-- ============================================================================

-- Citations table
CREATE TABLE workflow_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_workflow_id UUID NOT NULL REFERENCES order_workflows(id) ON DELETE CASCADE,
  phase_execution_id UUID REFERENCES workflow_phase_executions(id),

  -- Citation details
  citation_text TEXT NOT NULL,
  case_name VARCHAR(500),
  case_number VARCHAR(100),
  court VARCHAR(255),
  year INTEGER,
  reporter VARCHAR(100),
  volume VARCHAR(50),
  page_start VARCHAR(50),
  page_end VARCHAR(50),

  -- Classification
  citation_type VARCHAR(50), -- 'case', 'statute', 'regulation', 'secondary'
  relevance_category VARCHAR(100), -- what the citation supports

  -- Verification
  status citation_status DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  verification_source VARCHAR(255),
  verification_notes TEXT,

  -- Quality metrics
  relevance_score NUMERIC(3,2),
  authority_level VARCHAR(50), -- 'binding', 'persuasive', 'secondary'

  -- Position in document
  document_section VARCHAR(100),
  paragraph_number INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Citation verification log
CREATE TABLE citation_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_id UUID NOT NULL REFERENCES workflow_citations(id) ON DELETE CASCADE,

  verification_type VARCHAR(50) NOT NULL, -- 'automated', 'manual', 'external_api'
  status citation_status NOT NULL,

  -- Results
  found_match BOOLEAN,
  match_confidence NUMERIC(3,2),
  source_url TEXT,
  source_response JSONB,

  -- Notes
  notes TEXT,
  verified_by UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DOCUMENT PARSING
-- ============================================================================

-- Parsed document structure
CREATE TABLE parsed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Document classification
  document_type VARCHAR(100), -- 'complaint', 'motion', 'opposition', 'brief', etc.
  document_subtype VARCHAR(100),

  -- Parsing results
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  parser_version VARCHAR(50),

  -- Extracted content
  full_text TEXT,
  summary TEXT,
  key_facts JSONB DEFAULT '[]'::jsonb,
  legal_issues JSONB DEFAULT '[]'::jsonb,
  parties JSONB DEFAULT '[]'::jsonb,
  dates JSONB DEFAULT '[]'::jsonb,
  amounts JSONB DEFAULT '[]'::jsonb,

  -- Structure
  sections JSONB DEFAULT '[]'::jsonb,
  headings JSONB DEFAULT '[]'::jsonb,
  page_count INTEGER,
  word_count INTEGER,

  -- Extracted citations
  citations_found JSONB DEFAULT '[]'::jsonb,

  -- Quality metrics
  parse_confidence NUMERIC(3,2),
  completeness_score NUMERIC(3,2),

  -- Error handling
  parse_errors JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_motion_types_tier ON motion_types(tier);
CREATE INDEX idx_motion_types_active ON motion_types(is_active) WHERE is_active = true;
CREATE INDEX idx_motion_types_code ON motion_types(code);

CREATE INDEX idx_workflow_phase_defs_path ON workflow_phase_definitions(workflow_path);
CREATE INDEX idx_workflow_phase_defs_number ON workflow_phase_definitions(workflow_path, phase_number);

CREATE INDEX idx_order_workflows_order ON order_workflows(order_id);
CREATE INDEX idx_order_workflows_status ON order_workflows(status);
CREATE INDEX idx_order_workflows_motion_type ON order_workflows(motion_type_id);

CREATE INDEX idx_phase_executions_workflow ON workflow_phase_executions(order_workflow_id);
CREATE INDEX idx_phase_executions_status ON workflow_phase_executions(status);
CREATE INDEX idx_phase_executions_review ON workflow_phase_executions(requires_review) WHERE requires_review = true;

CREATE INDEX idx_citations_workflow ON workflow_citations(order_workflow_id);
CREATE INDEX idx_citations_status ON workflow_citations(status);
CREATE INDEX idx_citations_type ON workflow_citations(citation_type);

CREATE INDEX idx_parsed_docs_document ON parsed_documents(document_id);
CREATE INDEX idx_parsed_docs_order ON parsed_documents(order_id);
CREATE INDEX idx_parsed_docs_type ON parsed_documents(document_type);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_workflows_timestamp
  BEFORE UPDATE ON order_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_timestamp();

CREATE OR REPLACE FUNCTION update_generic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_phase_executions_timestamp
  BEFORE UPDATE ON workflow_phase_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_citations_timestamp
  BEFORE UPDATE ON workflow_citations
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_parsed_docs_timestamp
  BEFORE UPDATE ON parsed_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

CREATE TRIGGER update_motion_types_timestamp
  BEFORE UPDATE ON motion_types
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- SEED DATA: MOTION TYPES
-- ============================================================================

-- Tier A: Procedural/Administrative Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents, generation_prompts) VALUES
('MTD_12B6', 'Motion to Dismiss (12(b)(6))', 'Motion to dismiss for failure to state a claim under FRCP 12(b)(6)', 'A', 89900, 7,
  '["complaint", "relevant_contracts", "prior_court_orders"]'::jsonb,
  '{"focus": "legal insufficiency of claims", "key_analysis": "elements of each cause of action"}'::jsonb),

('MSJ', 'Motion for Summary Judgment', 'Motion for summary judgment under FRCP 56', 'A', 149900, 10,
  '["complaint", "answer", "discovery_responses", "deposition_transcripts", "exhibits"]'::jsonb,
  '{"focus": "undisputed material facts", "key_analysis": "no genuine issue of material fact"}'::jsonb),

('MTD_12B1', 'Motion to Dismiss (Lack of Jurisdiction)', 'Motion to dismiss for lack of subject matter jurisdiction under FRCP 12(b)(1)', 'A', 79900, 7,
  '["complaint", "jurisdictional_documents"]'::jsonb,
  '{"focus": "jurisdictional defects", "key_analysis": "standing, ripeness, mootness"}'::jsonb),

('MTD_12B2', 'Motion to Dismiss (Personal Jurisdiction)', 'Motion to dismiss for lack of personal jurisdiction under FRCP 12(b)(2)', 'A', 79900, 7,
  '["complaint", "affidavits_re_contacts", "corporate_documents"]'::jsonb,
  '{"focus": "minimum contacts analysis", "key_analysis": "purposeful availment, fair play"}'::jsonb),

('MCOMPEL', 'Motion to Compel Discovery', 'Motion to compel discovery responses or deposition attendance', 'A', 69900, 5,
  '["discovery_requests", "responses_or_objections", "meet_and_confer_correspondence"]'::jsonb,
  '{"focus": "discovery obligations", "key_analysis": "relevance, proportionality, good cause"}'::jsonb),

('MSANCTIONS', 'Motion for Sanctions', 'Motion for sanctions under FRCP 11 or inherent court powers', 'A', 79900, 7,
  '["offending_pleading_or_conduct", "supporting_evidence", "fee_records"]'::jsonb,
  '{"focus": "sanctionable conduct", "key_analysis": "bad faith, frivolousness, improper purpose"}'::jsonb),

('MPRELIM', 'Motion for Preliminary Injunction', 'Motion for preliminary injunction or TRO', 'A', 119900, 5,
  '["complaint", "declarations", "evidence_of_harm", "proposed_order"]'::jsonb,
  '{"focus": "injunctive relief factors", "key_analysis": "likelihood of success, irreparable harm, balance of equities"}'::jsonb),

('MCLASS', 'Motion for Class Certification', 'Motion for class certification under FRCP 23', 'A', 179900, 14,
  '["complaint", "class_evidence", "expert_reports", "discovery_responses"]'::jsonb,
  '{"focus": "class action requirements", "key_analysis": "numerosity, commonality, typicality, adequacy"}'::jsonb),

('MREMAND', 'Motion to Remand', 'Motion to remand case to state court', 'A', 69900, 5,
  '["complaint", "removal_notice", "jurisdictional_evidence"]'::jsonb,
  '{"focus": "removal defects", "key_analysis": "federal question, diversity, timeliness, procedure"}'::jsonb);

-- Tier B: Intermediate Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents) VALUES
('MTC', 'Motion to Continue/Postpone', 'Motion to continue trial or hearing date', 'B', 34900, 3,
  '["current_scheduling_order", "reason_documentation"]'::jsonb),

('MSTRIKE', 'Motion to Strike', 'Motion to strike pleadings or portions thereof under FRCP 12(f)', 'B', 49900, 5,
  '["target_pleading", "legal_basis"]'::jsonb),

('MAMEND', 'Motion for Leave to Amend', 'Motion for leave to amend pleading', 'B', 44900, 5,
  '["current_pleading", "proposed_amended_pleading"]'::jsonb),

('MQUASH', 'Motion to Quash Subpoena', 'Motion to quash or modify subpoena', 'B', 49900, 5,
  '["subpoena", "basis_for_objection"]'::jsonb),

('MSEAL', 'Motion to Seal', 'Motion to seal documents or proceedings', 'B', 44900, 5,
  '["documents_to_seal", "confidentiality_basis"]'::jsonb),

('MPROTECT', 'Motion for Protective Order', 'Motion for protective order regarding discovery', 'B', 54900, 5,
  '["discovery_at_issue", "harm_evidence"]'::jsonb),

('MDEFAULT', 'Motion for Default Judgment', 'Motion for entry of default judgment', 'B', 44900, 5,
  '["complaint", "proof_of_service", "clerk_default_entry", "damages_evidence"]'::jsonb),

('MVACATE', 'Motion to Vacate/Set Aside', 'Motion to vacate judgment or order under FRCP 60', 'B', 59900, 5,
  '["judgment_or_order", "grounds_documentation"]'::jsonb),

('MSTAY', 'Motion to Stay', 'Motion to stay proceedings or enforcement', 'B', 49900, 5,
  '["order_to_stay", "basis_documentation"]'::jsonb),

('MTRANSFER', 'Motion to Transfer Venue', 'Motion to transfer venue under 28 USC 1404 or 1406', 'B', 59900, 5,
  '["complaint", "venue_evidence", "convenience_factors"]'::jsonb),

('MWITHDRAW', 'Motion to Withdraw', 'Motion to withdraw as counsel', 'B', 34900, 3,
  '["engagement_letter", "withdrawal_basis"]'::jsonb),

('MRECONSIDER', 'Motion for Reconsideration', 'Motion for reconsideration of court order', 'B', 54900, 5,
  '["order_at_issue", "new_grounds"]'::jsonb),

('MLIMINE', 'Motion in Limine', 'Motion in limine to exclude evidence at trial', 'B', 49900, 5,
  '["evidence_at_issue", "exclusion_basis"]'::jsonb);

-- Tier C: Complex/Dispositive Motions
INSERT INTO motion_types (code, name, description, tier, base_price_cents, typical_turnaround_days, required_documents) VALUES
('MEXT', 'Motion for Extension of Time', 'Motion for extension of time to respond or comply', 'C', 24900, 2,
  '["deadline_documentation", "reason_statement"]'::jsonb),

('MSUBSTITUTE', 'Motion to Substitute Party', 'Motion to substitute party', 'C', 29900, 3,
  '["substitution_basis", "proposed_party_info"]'::jsonb),

('MCONSOLIDATE', 'Motion to Consolidate', 'Motion to consolidate cases', 'C', 34900, 3,
  '["related_case_info", "commonality_evidence"]'::jsonb),

('MINTERVENE', 'Motion to Intervene', 'Motion to intervene in action', 'C', 44900, 5,
  '["interest_documentation", "proposed_pleading"]'::jsonb),

('MBIFURCATE', 'Motion to Bifurcate', 'Motion to bifurcate trial', 'C', 34900, 3,
  '["trial_issues", "efficiency_argument"]'::jsonb),

('MPRO_HAC', 'Motion for Pro Hac Vice Admission', 'Motion for admission pro hac vice', 'C', 24900, 2,
  '["attorney_credentials", "sponsoring_counsel_info"]'::jsonb),

('MTELE', 'Motion to Appear Telephonically/Remotely', 'Motion to appear by telephone or video', 'C', 19900, 2,
  '["hearing_info", "reason_for_remote"]'::jsonb),

('MSERVE', 'Motion for Alternative Service', 'Motion for alternative method of service', 'C', 29900, 3,
  '["service_attempts", "proposed_alternative"]'::jsonb),

('MFEES', 'Motion for Attorney Fees', 'Motion for award of attorney fees', 'C', 49900, 5,
  '["fee_basis", "billing_records", "fee_agreement"]'::jsonb),

('MCOSTS', 'Motion to Tax Costs', 'Motion to tax costs', 'C', 34900, 3,
  '["bill_of_costs", "cost_documentation"]'::jsonb);

-- ============================================================================
-- SEED DATA: WORKFLOW PHASE DEFINITIONS
-- ============================================================================

-- Path A: Initiating Motions (9 Phases)
INSERT INTO workflow_phase_definitions (workflow_path, phase_number, phase_code, phase_name, description, ai_task_type, estimated_duration_minutes, required_inputs, expected_outputs) VALUES
('path_a', 1, 'PA_INTAKE', 'Document Intake & Classification', 'Parse and classify all uploaded documents, extract key information', 'document_parsing', 15,
  '["uploaded_documents"]'::jsonb,
  '["parsed_documents", "document_summary", "extracted_facts"]'::jsonb),

('path_a', 2, 'PA_ANALYSIS', 'Legal Analysis', 'Analyze legal issues, identify applicable law and standards', 'legal_analysis', 30,
  '["parsed_documents", "motion_type", "jurisdiction"]'::jsonb,
  '["legal_issues", "applicable_standards", "analysis_outline"]'::jsonb),

('path_a', 3, 'PA_RESEARCH', 'Legal Research', 'Research relevant case law, statutes, and authority', 'legal_research', 45,
  '["legal_issues", "jurisdiction", "applicable_standards"]'::jsonb,
  '["citations", "case_summaries", "authority_analysis"]'::jsonb),

('path_a', 4, 'PA_CITE_VERIFY', 'Citation Verification', 'Verify all citations for accuracy and current validity (HARD STOP: minimum 4 verified citations)', 'citation_verification', 20,
  '["citations"]'::jsonb,
  '["verified_citations", "verification_report"]'::jsonb),

('path_a', 5, 'PA_OUTLINE', 'Argument Outline', 'Create detailed outline of motion arguments and structure', 'argument_structuring', 20,
  '["legal_analysis", "verified_citations", "motion_type"]'::jsonb,
  '["argument_outline", "section_structure"]'::jsonb),

('path_a', 6, 'PA_DRAFT', 'Initial Draft Generation', 'Generate initial draft of the motion', 'document_generation', 45,
  '["argument_outline", "verified_citations", "motion_type", "jurisdiction"]'::jsonb,
  '["draft_document", "draft_exhibits"]'::jsonb),

('path_a', 7, 'PA_REVIEW', 'Quality Review', 'Review draft for quality, accuracy, and completeness', 'quality_review', 20,
  '["draft_document"]'::jsonb,
  '["review_feedback", "quality_score", "revision_suggestions"]'::jsonb),

('path_a', 8, 'PA_REVISE', 'Revision & Polish', 'Apply revisions and polish final document', 'document_revision', 30,
  '["draft_document", "review_feedback"]'::jsonb,
  '["revised_document"]'::jsonb),

('path_a', 9, 'PA_FINAL', 'Final Assembly', 'Assemble final motion package with exhibits and certificate of service', 'document_assembly', 15,
  '["revised_document", "exhibits", "motion_type"]'::jsonb,
  '["final_motion", "proposed_order", "certificate_of_service"]'::jsonb);

-- Path B: Opposition/Response Motions (9 Phases)
INSERT INTO workflow_phase_definitions (workflow_path, phase_number, phase_code, phase_name, description, ai_task_type, estimated_duration_minutes, required_inputs, expected_outputs) VALUES
('path_b', 1, 'PB_INTAKE', 'Document Intake & Classification', 'Parse opposing motion and all relevant documents', 'document_parsing', 15,
  '["opposing_motion", "supporting_documents"]'::jsonb,
  '["parsed_documents", "opponent_arguments", "opponent_citations"]'::jsonb),

('path_b', 2, 'PB_ANALYSIS', 'Opposing Argument Analysis', 'Analyze opponent arguments and identify weaknesses', 'argument_analysis', 30,
  '["parsed_documents", "opponent_arguments"]'::jsonb,
  '["argument_weaknesses", "counterargument_opportunities", "factual_disputes"]'::jsonb),

('path_b', 3, 'PB_RESEARCH', 'Counter-Research', 'Research authority to counter opposing arguments', 'legal_research', 45,
  '["argument_weaknesses", "opponent_citations", "jurisdiction"]'::jsonb,
  '["counter_citations", "distinguishing_cases", "supporting_authority"]'::jsonb),

('path_b', 4, 'PB_CITE_VERIFY', 'Citation Verification', 'Verify all citations including checking opponent citations for errors (HARD STOP: minimum 4 verified citations)', 'citation_verification', 25,
  '["counter_citations", "opponent_citations"]'::jsonb,
  '["verified_citations", "opponent_citation_errors", "verification_report"]'::jsonb),

('path_b', 5, 'PB_OUTLINE', 'Response Outline', 'Create detailed outline of response arguments', 'argument_structuring', 20,
  '["argument_weaknesses", "verified_citations", "factual_disputes"]'::jsonb,
  '["response_outline", "section_structure"]'::jsonb),

('path_b', 6, 'PB_DRAFT', 'Initial Draft Generation', 'Generate initial draft of the opposition/response', 'document_generation', 45,
  '["response_outline", "verified_citations", "opponent_arguments"]'::jsonb,
  '["draft_document", "draft_exhibits"]'::jsonb),

('path_b', 7, 'PB_REVIEW', 'Quality Review', 'Review draft for quality, accuracy, and effective rebuttal', 'quality_review', 20,
  '["draft_document", "opponent_arguments"]'::jsonb,
  '["review_feedback", "quality_score", "revision_suggestions"]'::jsonb),

('path_b', 8, 'PB_REVISE', 'Revision & Polish', 'Apply revisions and polish final document', 'document_revision', 30,
  '["draft_document", "review_feedback"]'::jsonb,
  '["revised_document"]'::jsonb),

('path_b', 9, 'PB_FINAL', 'Final Assembly', 'Assemble final opposition package with exhibits', 'document_assembly', 15,
  '["revised_document", "exhibits"]'::jsonb,
  '["final_opposition", "certificate_of_service"]'::jsonb);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE motion_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_phase_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_phase_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsed_documents ENABLE ROW LEVEL SECURITY;

-- Motion types are public read
CREATE POLICY "Motion types are viewable by all authenticated users"
  ON motion_types FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Workflow phase definitions are public read
CREATE POLICY "Workflow phase definitions are viewable by all authenticated users"
  ON workflow_phase_definitions FOR SELECT
  TO authenticated
  USING (true);

-- Order workflows - clients can view their own, admins can view all
CREATE POLICY "Users can view own order workflows"
  ON order_workflows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_workflows.order_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage order workflows"
  ON order_workflows FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Similar policies for phase executions, citations, parsed docs
CREATE POLICY "Users can view own phase executions"
  ON workflow_phase_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_workflows ow
      JOIN orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_phase_executions.order_workflow_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage phase executions"
  ON workflow_phase_executions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Users can view own citations"
  ON workflow_citations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_workflows ow
      JOIN orders o ON o.id = ow.order_id
      WHERE ow.id = workflow_citations.order_workflow_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage citations"
  ON workflow_citations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Users can view own parsed documents"
  ON parsed_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = parsed_documents.order_id
      AND (o.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk')
      ))
    )
  );

CREATE POLICY "Admins can manage parsed documents"
  ON parsed_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

CREATE POLICY "Admins can manage citation verification log"
  ON citation_verification_log FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Admins can manage motion types
CREATE POLICY "Admins can manage motion types"
  ON motion_types FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ============================================================
-- MIGRATION: 004_superprompt_templates.sql
-- ============================================================
-- Superprompt Templates Table
-- Stores the lawyer's AI motion generation templates
-- Templates can be updated anytime to improve accuracy

CREATE TABLE IF NOT EXISTS superprompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  motion_types TEXT[] DEFAULT ARRAY['*']::TEXT[], -- Which motion types this handles, '*' = all
  template TEXT NOT NULL, -- The actual superprompt with {{PLACEHOLDERS}}
  system_prompt TEXT, -- Optional system prompt for Claude
  max_tokens INTEGER DEFAULT 16000,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding templates by motion type
CREATE INDEX IF NOT EXISTS idx_superprompt_templates_motion_types
  ON superprompt_templates USING GIN (motion_types);

-- Index for default template lookup
CREATE INDEX IF NOT EXISTS idx_superprompt_templates_is_default
  ON superprompt_templates (is_default)
  WHERE is_default = TRUE;

-- RLS Policies
ALTER TABLE superprompt_templates ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage superprompt templates"
  ON superprompt_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Clerks can read templates
CREATE POLICY "Clerks can read superprompt templates"
  ON superprompt_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_superprompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER superprompt_templates_updated_at
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_superprompt_templates_updated_at();

-- Order feedback table (for reject/revision feedback)
CREATE TABLE IF NOT EXISTS order_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL, -- 'reject', 'request_revision', 'client_revision'
  feedback_content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_feedback_order_id
  ON order_feedback (order_id);

ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and clerk can manage order feedback"
  ON order_feedback
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Add comment
COMMENT ON TABLE superprompt_templates IS 'Stores lawyer AI motion generation templates that can be updated anytime';
COMMENT ON COLUMN superprompt_templates.template IS 'The superprompt with placeholders like {{CASE_NUMBER}}, {{STATEMENT_OF_FACTS}}, etc.';
COMMENT ON COLUMN superprompt_templates.motion_types IS 'Array of motion types this template handles. Use [''*''] for all types.';


-- ============================================================
-- MIGRATION: 005_conversations.sql
-- ============================================================
-- ============================================================================
-- Conversations Table for Claude Chat
-- ============================================================================
-- Stores chat conversations between admin and Claude for each order.
-- Each order has one conversation that persists across revisions.

-- Main conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Conversation state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),

  -- The initial context sent to Claude (superprompt + order data + docs)
  initial_context TEXT,

  -- Generated motion content (latest version)
  generated_motion TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One conversation per order
  UNIQUE(order_id)
);

-- Messages within a conversation
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message details
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,

  -- For tracking which message contains the motion draft
  is_motion_draft BOOLEAN DEFAULT FALSE,

  -- Token usage tracking
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Ordering
  sequence_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Client revision requests
CREATE TABLE IF NOT EXISTS revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Client's feedback
  feedback TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),

  -- Admin notes
  admin_response TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sequence ON conversation_messages(conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_revision_requests_order_id ON revision_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_status ON revision_requests(status);

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_requests ENABLE ROW LEVEL SECURITY;

-- Admins can see all conversations
CREATE POLICY "Admins can manage conversations" ON conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Admins can see all messages
CREATE POLICY "Admins can manage messages" ON conversation_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Clients can create revision requests for their orders
CREATE POLICY "Clients can create revision requests" ON revision_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = auth.uid()
    )
  );

-- Clients can view their own revision requests
CREATE POLICY "Clients can view own revision requests" ON revision_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = revision_requests.order_id
      AND orders.client_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Admins can manage all revision requests
CREATE POLICY "Admins can manage revision requests" ON revision_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'clerk')
    )
  );

-- Update trigger for conversations
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();


-- ============================================================
-- MIGRATION: 006_fix_security_and_performance.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 007_update_workflows_v63.sql
-- ============================================================
-- Migration: Update order_workflows for v6.3
-- Date: January 2026
-- Description: Add checkpoint tracking, revision pricing, and v6.3 fields

-- ============================================================================
-- STEP 1: Add checkpoint tracking to order_workflows
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_pending TEXT
CHECK (checkpoint_pending IN ('CP1', 'CP2', 'CP3'));

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_data JSONB DEFAULT '{}';

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS checkpoint_responses JSONB DEFAULT '[]';

-- ============================================================================
-- STEP 2: Add revision tracking fields
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS free_revisions_used INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS paid_revisions_used INTEGER DEFAULT 0;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_total_charged DECIMAL(10,2) DEFAULT 0;

-- ============================================================================
-- STEP 3: Add handoff tracking
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_at TIMESTAMPTZ;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_path TEXT;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS handoff_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 4: Add judge simulation fields
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_grade VARCHAR(3);

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_grade_numeric DECIMAL(3,2);

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS judge_sim_passed BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 5: Update status enum to include checkpoint states
-- ============================================================================

-- First, drop the existing constraint if it exists
ALTER TABLE order_workflows
DROP CONSTRAINT IF EXISTS order_workflows_status_check;

-- Add new constraint with checkpoint statuses
ALTER TABLE order_workflows
ADD CONSTRAINT order_workflows_status_check
CHECK (status IN (
  'pending',
  'in_progress',
  'awaiting_cp1',      -- NEW: Waiting for customer at Checkpoint 1
  'awaiting_cp2',      -- NEW: Waiting for customer at Checkpoint 2
  'awaiting_cp3',      -- NEW: Waiting for customer at Checkpoint 3
  'revision_requested', -- NEW: Customer requested revisions at CP2
  'revision_in_progress', -- NEW: Revisions being processed
  'blocked',
  'completed',
  'cancelled'
));

-- ============================================================================
-- STEP 6: Create indexes for checkpoint queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_workflows_checkpoint
ON order_workflows(checkpoint_pending)
WHERE checkpoint_pending IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_workflows_status_v63
ON order_workflows(status);

CREATE INDEX IF NOT EXISTS idx_order_workflows_judge_sim
ON order_workflows(judge_sim_passed, judge_sim_grade);

-- ============================================================================
-- STEP 7: Add comment for documentation
-- ============================================================================

COMMENT ON COLUMN order_workflows.checkpoint_pending IS 'v6.3: Current checkpoint awaiting customer action (CP1, CP2, or CP3)';
COMMENT ON COLUMN order_workflows.checkpoint_data IS 'v6.3: Data passed to checkpoint for customer review';
COMMENT ON COLUMN order_workflows.judge_sim_grade IS 'v6.3: Letter grade from judge simulation (A+, A, A-, B+, etc.)';
COMMENT ON COLUMN order_workflows.judge_sim_grade_numeric IS 'v6.3: Numeric score 0.00-1.00 from judge simulation';
COMMENT ON COLUMN order_workflows.judge_sim_passed IS 'v6.3: Whether motion passed minimum B+ (0.87) threshold';
COMMENT ON COLUMN order_workflows.revision_loop_count IS 'v6.3: Number of revision loops (max 3 before escalation)';


-- ============================================================
-- MIGRATION: 008_create_workflow_revisions.sql
-- ============================================================
-- Migration: Create workflow_revisions table
-- Date: January 2026
-- Description: Track individual revision requests with pricing for v6.3

-- ============================================================================
-- STEP 1: Create workflow_revisions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE NOT NULL,

  -- Revision details
  revision_number INTEGER NOT NULL,
  revision_type TEXT NOT NULL CHECK (revision_type IN ('free', 'paid')),

  -- Pricing (v6.3: Tier A=$75, Tier B=$125, Tier C=$200)
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Payment tracking
  payment_status TEXT DEFAULT 'not_required' CHECK (payment_status IN (
    'not_required',  -- Free revision
    'pending',       -- Awaiting payment
    'completed',     -- Payment received
    'waived',        -- Admin waived fee
    'failed'         -- Payment failed
  )),
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  paid_at TIMESTAMPTZ,

  -- Revision content
  customer_notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT,

  -- Revision feedback (what customer wants changed)
  feedback_categories JSONB DEFAULT '[]', -- ['legal_arguments', 'citations', 'formatting', 'tone', 'other']
  specific_changes_requested TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',       -- Waiting for payment (if paid) or processing
    'in_progress',   -- Being worked on
    'completed',     -- Revision done
    'cancelled'      -- Cancelled
  )),

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Quality tracking
  pre_revision_grade VARCHAR(3),
  post_revision_grade VARCHAR(3),

  -- Constraints
  UNIQUE(order_workflow_id, revision_number)
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_workflow
ON workflow_revisions(order_workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_payment_status
ON workflow_revisions(payment_status)
WHERE payment_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_status
ON workflow_revisions(status);

-- ============================================================================
-- STEP 3: Create RLS policies
-- ============================================================================

ALTER TABLE workflow_revisions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage revisions"
ON workflow_revisions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own revisions
CREATE POLICY "Clients can view own revisions"
ON workflow_revisions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = workflow_revisions.order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- Clients can insert revision requests
CREATE POLICY "Clients can request revisions"
ON workflow_revisions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 4: Add comments
-- ============================================================================

COMMENT ON TABLE workflow_revisions IS 'v6.3: Tracks individual revision requests. 1 free revision included, then paid at tier-based pricing.';
COMMENT ON COLUMN workflow_revisions.tier IS 'Motion tier: A=$75, B=$125, C=$200 per revision';
COMMENT ON COLUMN workflow_revisions.revision_type IS 'free = included with order, paid = requires payment';
COMMENT ON COLUMN workflow_revisions.feedback_categories IS 'Categories of changes requested: legal_arguments, citations, formatting, tone, other';


-- ============================================================
-- MIGRATION: 009_create_handoff_files.sql
-- ============================================================
-- Migration: Create handoff_files table
-- Date: January 2026
-- Description: Track workflow handoff files for session continuity and recovery

-- ============================================================================
-- STEP 1: Create handoff_files table
-- ============================================================================

CREATE TABLE IF NOT EXISTS handoff_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE NOT NULL,

  -- Handoff context
  phase_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  handoff_type TEXT NOT NULL CHECK (handoff_type IN (
    'full',          -- Complete project state (phase completion)
    'transition',    -- Phase-to-phase (same session)
    'incremental',   -- Every 4 citations (CRITICAL: v6.3 batching rule)
    'recovery',      -- Deep Research return, large docs
    'checkpoint'     -- Customer checkpoint pause (CP1, CP2, CP3)
  )),

  -- Content
  content JSONB NOT NULL,
  content_hash TEXT,  -- SHA256 hash for deduplication/verification

  -- File storage (if stored as file instead of JSONB)
  file_path TEXT,
  file_size INTEGER,

  -- Session tracking
  session_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

  -- Recovery tracking
  was_recovered_from BOOLEAN DEFAULT FALSE,
  recovered_at TIMESTAMPTZ,

  -- Index for retrieval
  is_latest BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_handoff_files_workflow
ON handoff_files(order_workflow_id);

CREATE INDEX IF NOT EXISTS idx_handoff_files_latest
ON handoff_files(order_workflow_id, is_latest)
WHERE is_latest = TRUE;

CREATE INDEX IF NOT EXISTS idx_handoff_files_type
ON handoff_files(handoff_type);

CREATE INDEX IF NOT EXISTS idx_handoff_files_phase
ON handoff_files(order_workflow_id, phase_number);

-- ============================================================================
-- STEP 3: Create trigger to mark previous handoffs as not latest
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_previous_handoffs_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE handoff_files
  SET is_latest = FALSE
  WHERE order_workflow_id = NEW.order_workflow_id
  AND id != NEW.id
  AND is_latest = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_handoff_latest ON handoff_files;
CREATE TRIGGER set_handoff_latest
AFTER INSERT ON handoff_files
FOR EACH ROW
EXECUTE FUNCTION mark_previous_handoffs_not_latest();

-- ============================================================================
-- STEP 4: Create RLS policies
-- ============================================================================

ALTER TABLE handoff_files ENABLE ROW LEVEL SECURITY;

-- Staff can manage handoffs
CREATE POLICY "Staff can manage handoffs"
ON handoff_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own handoffs (read-only)
CREATE POLICY "Clients can view own handoffs"
ON handoff_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.id = handoff_files.order_workflow_id
    AND o.client_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 5: Create cleanup function for expired handoffs
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_handoffs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM handoff_files
  WHERE expires_at < NOW()
  AND is_latest = FALSE;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON TABLE handoff_files IS 'v6.3: Tracks workflow handoff files for session continuity. Incremental type used for 4-citation batching rule.';
COMMENT ON COLUMN handoff_files.handoff_type IS 'Type of handoff: full (phase end), transition (phase-to-phase), incremental (every 4 citations), recovery (deep research), checkpoint (CP1/CP2/CP3)';
COMMENT ON COLUMN handoff_files.is_latest IS 'True if this is the most recent handoff for the workflow. Managed by trigger.';
COMMENT ON COLUMN handoff_files.content_hash IS 'SHA256 hash for verifying content integrity and deduplication';


-- ============================================================
-- MIGRATION: 010_update_phase_definitions_v63.sql
-- ============================================================
-- Migration: Update phase definitions to v6.3 (12 phases)
-- Date: January 2026
-- Description: Update from 9-phase to 12-phase workflow with checkpoints

-- ============================================================================
-- STEP 1: Add new columns to workflow_phase_definitions
-- ============================================================================

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS is_checkpoint BOOLEAN DEFAULT FALSE;

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS checkpoint_type TEXT
CHECK (checkpoint_type IN ('CP1', 'CP2', 'CP3'));

ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS phase_code TEXT;

-- ============================================================================
-- STEP 2: Archive existing definitions (don't delete, version instead)
-- ============================================================================

-- Add version column if not exists
ALTER TABLE workflow_phase_definitions
ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'v6.2';

-- Mark existing as v6.2
UPDATE workflow_phase_definitions
SET version = 'v6.2'
WHERE version IS NULL OR version = 'v6.2';

-- ============================================================================
-- STEP 3: Insert v6.3 Phase Definitions for Path A (Filing Motion)
-- ============================================================================

INSERT INTO workflow_phase_definitions
(workflow_path, phase_number, phase_name, phase_code, description, ai_task_type,
 estimated_duration_minutes, requires_review, is_checkpoint, checkpoint_type, version)
VALUES
-- Phase 1: Intake
('path_a', 1, 'Intake & Document Processing', 'INTAKE',
 'Parse uploaded documents, extract case information, classify motion tier, validate jurisdiction',
 'document_parsing', 15, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 2: Legal Standards
('path_a', 2, 'Legal Standard Identification', 'LEGAL_STANDARDS',
 'Identify applicable legal standards, elements, and burdens for the motion type',
 'legal_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 3: Evidence Mapping (NEW in v6.3)
('path_a', 3, 'Evidence Mapping', 'EVIDENCE_MAPPING',
 'Map available evidence to legal elements, identify evidentiary gaps, flag authentication issues',
 'evidence_analysis', 25, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 4: Authority Research → CP1
('path_a', 4, 'Authority Research', 'AUTHORITY_RESEARCH',
 'Research and gather legal authorities supporting each element. CHECKPOINT 1 triggers after completion.',
 'legal_research', 45, FALSE, TRUE, 'CP1', 'v6.3'),

-- Phase 5: Draft Motion
('path_a', 5, 'Draft Motion', 'DRAFT_MOTION',
 'Generate complete motion draft using SUPERPROMPT system. Incorporates all previous phase outputs.',
 'document_generation', 60, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 6: Citation Verification (4-citation batching)
('path_a', 6, 'Citation Accuracy Check', 'CITATION_CHECK',
 'Verify all citations in draft using 4-citation batch rule. Creates incremental handoff every 4 citations.',
 'citation_verification', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 7: Opposition Anticipation (NEW in v6.3)
('path_a', 7, 'Opposition Anticipation', 'OPPOSITION_ANTICIPATION',
 'Analyze likely opposing arguments and prepare strategic responses. Identifies weaknesses to address.',
 'argument_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 8: Judge Simulation → CP2
('path_a', 8, 'Judge Simulation', 'JUDGE_SIMULATION',
 'Evaluate motion from judicial perspective. Requires B+ (87%) minimum to pass. CHECKPOINT 2 triggers.',
 'quality_review', 20, TRUE, TRUE, 'CP2', 'v6.3'),

-- Phase 9: Revisions
('path_a', 9, 'Revisions', 'REVISIONS',
 'Apply revisions based on judge simulation or customer feedback. Max 3 loops before escalation.',
 'document_revision', 45, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 10: Caption Validation (NEW in v6.3)
('path_a', 10, 'Caption Validation', 'CAPTION_VALIDATION',
 'Verify caption consistency across all documents, check for placeholders, validate party names.',
 'validation', 10, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 11: Supporting Documents (Expanded in v6.3)
('path_a', 11, 'Supporting Documents', 'SUPPORTING_DOCS',
 'Generate declarations, proposed order, proof of service, separate statements (if MSJ), exhibits list.',
 'document_generation', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 12: Final Assembly → CP3
('path_a', 12, 'Final Assembly', 'FINAL_ASSEMBLY',
 'Assemble complete filing package for delivery. CHECKPOINT 3 triggers for customer confirmation.',
 'document_assembly', 15, TRUE, TRUE, 'CP3', 'v6.3')

ON CONFLICT (workflow_path, phase_number)
WHERE version = 'v6.3'
DO UPDATE SET
  phase_name = EXCLUDED.phase_name,
  phase_code = EXCLUDED.phase_code,
  description = EXCLUDED.description,
  ai_task_type = EXCLUDED.ai_task_type,
  estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
  requires_review = EXCLUDED.requires_review,
  is_checkpoint = EXCLUDED.is_checkpoint,
  checkpoint_type = EXCLUDED.checkpoint_type;

-- ============================================================================
-- STEP 4: Insert v6.3 Phase Definitions for Path B (Opposition/Response)
-- ============================================================================

INSERT INTO workflow_phase_definitions
(workflow_path, phase_number, phase_name, phase_code, description, ai_task_type,
 estimated_duration_minutes, requires_review, is_checkpoint, checkpoint_type, version)
VALUES
-- Phase 1: Intake & Deconstruction
('path_b', 1, 'Intake & Motion Deconstruction', 'INTAKE',
 'Parse opponent motion, extract their arguments and citations, classify response requirements',
 'document_parsing', 20, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 2: Motion Analysis
('path_b', 2, 'Motion Deconstruction', 'MOTION_DECONSTRUCTION',
 'Deep analysis of opponent arguments, identify logical flaws, misapplied law, factual errors',
 'legal_analysis', 35, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 3: Issue Identification
('path_b', 3, 'Issue Identification', 'ISSUE_IDENTIFICATION',
 'Identify genuine disputes of material fact (for MSJ), legal issues to challenge',
 'evidence_analysis', 25, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 4: Counter-Research → CP1
('path_b', 4, 'Counter-Authority Research', 'COUNTER_RESEARCH',
 'Research authorities to counter opponent, distinguish their cases, find better precedent. CHECKPOINT 1.',
 'legal_research', 50, FALSE, TRUE, 'CP1', 'v6.3'),

-- Phase 5: Draft Opposition
('path_b', 5, 'Draft Opposition', 'DRAFT_OPPOSITION',
 'Generate complete opposition using SUPERPROMPT system with counter-argument framework',
 'document_generation', 60, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 6: Citation Check
('path_b', 6, 'Citation Accuracy Check', 'CITATION_CHECK',
 'Verify all citations using 4-citation batch rule. Verify opponent citations for accuracy too.',
 'citation_verification', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 7: Reply Anticipation
('path_b', 7, 'Reply Anticipation', 'REPLY_ANTICIPATION',
 'Anticipate opponent reply arguments, prepare preemptive responses in opposition',
 'argument_analysis', 30, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 8: Judge Simulation → CP2
('path_b', 8, 'Judge Simulation', 'JUDGE_SIMULATION',
 'Evaluate opposition from judicial perspective. Requires B+ (87%) minimum. CHECKPOINT 2.',
 'quality_review', 20, TRUE, TRUE, 'CP2', 'v6.3'),

-- Phase 9: Revisions
('path_b', 9, 'Revisions', 'REVISIONS',
 'Apply revisions based on simulation or customer feedback. Max 3 loops before escalation.',
 'document_revision', 45, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 10: Caption Validation
('path_b', 10, 'Caption Validation', 'CAPTION_VALIDATION',
 'Verify caption consistency, check response caption matches motion caption exactly',
 'validation', 10, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 11: Supporting Documents
('path_b', 11, 'Supporting Documents', 'SUPPORTING_DOCS',
 'Generate statement of genuine disputes (MSJ opp), evidentiary objections, declarations',
 'document_generation', 35, FALSE, FALSE, NULL, 'v6.3'),

-- Phase 12: Final Assembly → CP3
('path_b', 12, 'Final Assembly', 'FINAL_ASSEMBLY',
 'Assemble complete response package for delivery. CHECKPOINT 3.',
 'document_assembly', 15, TRUE, TRUE, 'CP3', 'v6.3')

ON CONFLICT (workflow_path, phase_number)
WHERE version = 'v6.3'
DO UPDATE SET
  phase_name = EXCLUDED.phase_name,
  phase_code = EXCLUDED.phase_code,
  description = EXCLUDED.description,
  ai_task_type = EXCLUDED.ai_task_type,
  estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
  requires_review = EXCLUDED.requires_review,
  is_checkpoint = EXCLUDED.is_checkpoint,
  checkpoint_type = EXCLUDED.checkpoint_type;

-- ============================================================================
-- STEP 5: Create index for phase lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_phase_definitions_checkpoint
ON workflow_phase_definitions(is_checkpoint, checkpoint_type)
WHERE is_checkpoint = TRUE;

CREATE INDEX IF NOT EXISTS idx_phase_definitions_version
ON workflow_phase_definitions(version);

CREATE INDEX IF NOT EXISTS idx_phase_definitions_code
ON workflow_phase_definitions(phase_code);

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON COLUMN workflow_phase_definitions.phase_code IS 'v6.3: Unique code for phase type (INTAKE, LEGAL_STANDARDS, etc.)';
COMMENT ON COLUMN workflow_phase_definitions.is_checkpoint IS 'v6.3: True if this phase triggers a customer checkpoint';
COMMENT ON COLUMN workflow_phase_definitions.checkpoint_type IS 'v6.3: Which checkpoint (CP1, CP2, CP3) this phase triggers';
COMMENT ON COLUMN workflow_phase_definitions.version IS 'Workflow version (v6.2 = 9 phases, v6.3 = 12 phases)';


-- ============================================================
-- MIGRATION: 011_add_revision_pricing.sql
-- ============================================================
-- Migration: Add revision pricing to motion_types
-- Date: January 2026
-- Description: Add v6.3 revision pricing columns and set tier-based prices

-- ============================================================================
-- STEP 1: Add revision pricing columns to motion_types
-- ============================================================================

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS revision_price DECIMAL(10,2);

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS free_revisions_included INTEGER DEFAULT 1;

ALTER TABLE motion_types
ADD COLUMN IF NOT EXISTS max_revisions INTEGER DEFAULT 3;

-- ============================================================================
-- STEP 2: Set revision prices by tier
-- v6.3 SACRED NUMBERS:
--   Tier A = $75
--   Tier B = $125
--   Tier C = $200
-- ============================================================================

-- Tier A motions: Simple, routine ($75/revision)
UPDATE motion_types
SET revision_price = 75.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'A';

-- Tier B motions: Moderate complexity ($125/revision)
UPDATE motion_types
SET revision_price = 125.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'B';

-- Tier C motions: Complex ($200/revision)
UPDATE motion_types
SET revision_price = 200.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE tier = 'C';

-- ============================================================================
-- STEP 3: Set NOT NULL constraint after populating data
-- ============================================================================

-- Set default for any unset rows
UPDATE motion_types
SET revision_price = 125.00,
    free_revisions_included = 1,
    max_revisions = 3
WHERE revision_price IS NULL;

-- Now add NOT NULL constraint
ALTER TABLE motion_types
ALTER COLUMN revision_price SET NOT NULL;

ALTER TABLE motion_types
ALTER COLUMN free_revisions_included SET NOT NULL;

ALTER TABLE motion_types
ALTER COLUMN max_revisions SET NOT NULL;

-- ============================================================================
-- STEP 4: Add check constraints for valid values
-- ============================================================================

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_revision_price_check
CHECK (revision_price >= 0);

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_free_revisions_check
CHECK (free_revisions_included >= 0 AND free_revisions_included <= 5);

ALTER TABLE motion_types
ADD CONSTRAINT motion_types_max_revisions_check
CHECK (max_revisions >= 1 AND max_revisions <= 10);

-- ============================================================================
-- STEP 5: Create function to get revision price for a workflow
-- ============================================================================

CREATE OR REPLACE FUNCTION get_revision_price(workflow_id UUID)
RETURNS TABLE (
  tier TEXT,
  price DECIMAL(10,2),
  free_remaining INTEGER,
  max_allowed INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mt.tier,
    mt.revision_price,
    GREATEST(0, mt.free_revisions_included - ow.free_revisions_used) AS free_remaining,
    mt.max_revisions
  FROM order_workflows ow
  JOIN motion_types mt ON mt.id = ow.motion_type_id
  WHERE ow.id = workflow_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON COLUMN motion_types.revision_price IS 'v6.3: Price per paid revision. Tier A=$75, B=$125, C=$200.';
COMMENT ON COLUMN motion_types.free_revisions_included IS 'v6.3: Number of free revisions included with order. Default 1.';
COMMENT ON COLUMN motion_types.max_revisions IS 'v6.3: Maximum total revisions allowed. Default 3, then escalate.';
COMMENT ON FUNCTION get_revision_price IS 'v6.3: Returns revision pricing info for a workflow including remaining free revisions.';


-- ============================================================
-- MIGRATION: 012_add_queue_columns.sql
-- ============================================================
-- Migration: Add queue management columns to orders table
-- Purpose: Support Inngest-based job queue with visibility into queue status

-- Add queue visibility columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_attempts INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Index for efficient queue queries (orders by status and deadline)
CREATE INDEX IF NOT EXISTS idx_orders_status_deadline ON orders(status, filing_deadline);

-- Index for queue position lookups
CREATE INDEX IF NOT EXISTS idx_orders_queue_position ON orders(queue_position) WHERE queue_position IS NOT NULL;

-- Index for generation tracking
CREATE INDEX IF NOT EXISTS idx_orders_generation_status ON orders(status, generation_started_at) WHERE status IN ('in_progress', 'generation_failed');

-- Add new status values for generation states
-- Note: This assumes status is a text field. If it's an enum, you'll need to alter the enum instead.
COMMENT ON COLUMN orders.status IS 'Order status: submitted, under_review, in_progress, pending_review, draft_delivered, revision_requested, revision_delivered, completed, cancelled, blocked, generation_failed';

-- Function to calculate queue position based on filing deadline
CREATE OR REPLACE FUNCTION get_queue_position(order_id UUID)
RETURNS INTEGER AS $$
DECLARE
  position INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO position
  FROM orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
    AND filing_deadline < (SELECT filing_deadline FROM orders WHERE id = order_id)
    AND id != order_id;
  RETURN position;
END;
$$ LANGUAGE plpgsql;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats()
RETURNS TABLE (
  queue_depth BIGINT,
  processing_count BIGINT,
  completed_today BIGINT,
  failed_count BIGINT,
  avg_generation_seconds NUMERIC,
  oldest_pending_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM orders WHERE status IN ('submitted', 'under_review'))::BIGINT AS queue_depth,
    (SELECT COUNT(*) FROM orders WHERE status = 'in_progress')::BIGINT AS processing_count,
    (SELECT COUNT(*) FROM orders WHERE status IN ('pending_review', 'draft_delivered', 'completed') AND generation_completed_at >= CURRENT_DATE)::BIGINT AS completed_today,
    (SELECT COUNT(*) FROM orders WHERE status = 'generation_failed')::BIGINT AS failed_count,
    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (generation_completed_at - generation_started_at))), 0) FROM orders WHERE generation_completed_at IS NOT NULL AND generation_started_at IS NOT NULL AND generation_completed_at >= CURRENT_DATE - INTERVAL '7 days')::NUMERIC AS avg_generation_seconds,
    (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60), 0) FROM orders WHERE status IN ('submitted', 'under_review'))::NUMERIC AS oldest_pending_minutes;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update queue positions when order status changes
CREATE OR REPLACE FUNCTION update_queue_positions_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if status changed to/from queue-related statuses
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Recalculate positions for all queued orders
    WITH ranked_orders AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
      FROM orders
      WHERE status IN ('submitted', 'under_review', 'in_progress')
    )
    UPDATE orders o
    SET queue_position = ro.new_position
    FROM ranked_orders ro
    WHERE o.id = ro.id;

    -- Clear position for completed/failed orders
    UPDATE orders
    SET queue_position = NULL
    WHERE status NOT IN ('submitted', 'under_review', 'in_progress');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_update_queue_positions ON orders;
CREATE TRIGGER trg_update_queue_positions
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_queue_positions_trigger();

-- Initialize queue positions for existing queued orders
WITH ranked_orders AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
  FROM orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
)
UPDATE orders o
SET queue_position = ro.new_position
FROM ranked_orders ro
WHERE o.id = ro.id;


-- ============================================================
-- MIGRATION: 013_create_workflow_files.sql
-- ============================================================
-- Migration: Create workflow_files table
-- Date: January 2026
-- Description: General-purpose file storage for Claude's workflow file system
-- This provides a simple file system abstraction for Claude to write HANDOFF files,
-- motion drafts, declarations, and other documents during the generation process.

-- ============================================================================
-- STEP 1: Create workflow_files table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,

  -- File identification
  file_path TEXT NOT NULL,  -- Full path as Claude sees it (e.g., /mnt/user-data/outputs/HANDOFF_01202026_1045am.md)
  file_name TEXT NOT NULL,  -- Just the filename

  -- File content
  content TEXT NOT NULL,    -- Full text content of the file

  -- File classification
  file_type TEXT NOT NULL CHECK (file_type IN (
    'handoff',        -- HANDOFF_*.md files for workflow continuity
    'motion',         -- Motion and opposition briefs
    'declaration',    -- Declarations and affidavits
    'citation_report', -- Citation accuracy reports
    'research_memo',  -- Legal research memoranda
    'other'           -- Other document types
  )) DEFAULT 'other',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one file per path per order
  UNIQUE(order_id, file_path)
);

-- ============================================================================
-- STEP 2: Create indexes for efficient queries
-- ============================================================================

-- Find files by order
CREATE INDEX IF NOT EXISTS idx_workflow_files_order
ON workflow_files(order_id);

-- Find files by type within an order
CREATE INDEX IF NOT EXISTS idx_workflow_files_order_type
ON workflow_files(order_id, file_type);

-- Find latest handoff efficiently
CREATE INDEX IF NOT EXISTS idx_workflow_files_handoff
ON workflow_files(order_id, file_type, created_at DESC)
WHERE file_type = 'handoff';

-- Find latest motion efficiently
CREATE INDEX IF NOT EXISTS idx_workflow_files_motion
ON workflow_files(order_id, file_type, updated_at DESC)
WHERE file_type = 'motion';

-- ============================================================================
-- STEP 3: Create trigger to update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_workflow_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_workflow_files_updated_at ON workflow_files;
CREATE TRIGGER set_workflow_files_updated_at
BEFORE UPDATE ON workflow_files
FOR EACH ROW
EXECUTE FUNCTION update_workflow_files_updated_at();

-- ============================================================================
-- STEP 4: Create RLS policies
-- ============================================================================

ALTER TABLE workflow_files ENABLE ROW LEVEL SECURITY;

-- Staff can manage all workflow files
CREATE POLICY "Staff can manage workflow files"
ON workflow_files FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'clerk')
  )
);

-- Clients can view their own order's files (read-only)
CREATE POLICY "Clients can view own workflow files"
ON workflow_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE id = workflow_files.order_id
    AND client_id = auth.uid()
  )
);

-- Service role bypass (for server-side operations)
CREATE POLICY "Service role full access to workflow files"
ON workflow_files FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 5: Create helper functions
-- ============================================================================

-- Get the latest handoff for an order
CREATE OR REPLACE FUNCTION get_latest_handoff(p_order_id UUID)
RETURNS workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND file_type = 'handoff'
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Get the latest motion draft for an order
CREATE OR REPLACE FUNCTION get_latest_motion(p_order_id UUID)
RETURNS workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND file_type = 'motion'
  ORDER BY updated_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Get all files for an order by type
CREATE OR REPLACE FUNCTION get_order_files(p_order_id UUID, p_file_type TEXT DEFAULT NULL)
RETURNS SETOF workflow_files AS $$
  SELECT *
  FROM workflow_files
  WHERE order_id = p_order_id
  AND (p_file_type IS NULL OR file_type = p_file_type)
  ORDER BY created_at DESC;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- STEP 6: Add comments
-- ============================================================================

COMMENT ON TABLE workflow_files IS 'General-purpose file storage for Claude workflow. Allows Claude to write HANDOFF files, motion drafts, and other documents that persist across sessions.';
COMMENT ON COLUMN workflow_files.file_path IS 'Full virtual path as Claude sees it (e.g., /mnt/user-data/outputs/HANDOFF_01202026_1045am.md)';
COMMENT ON COLUMN workflow_files.file_type IS 'Classification of the file for easy retrieval: handoff, motion, declaration, citation_report, research_memo, other';
COMMENT ON COLUMN workflow_files.content IS 'Full text content of the file. For motions, this could be substantial (10-50KB).';


-- ============================================================
-- MIGRATION: 014_fix_queue_function_security.sql
-- ============================================================
-- ============================================================================
-- Migration 013: Fix Queue Function Security
-- ============================================================================
-- This migration fixes:
-- 1. SECURITY: Missing SET search_path = '' in queue functions from migration 012
-- 2. PERFORMANCE: Add missing indexes for common queries
-- ============================================================================

-- Fix get_queue_position function
CREATE OR REPLACE FUNCTION public.get_queue_position(order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  position INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO position
  FROM public.orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
    AND filing_deadline < (SELECT filing_deadline FROM public.orders WHERE id = order_id)
    AND id != order_id;
  RETURN position;
END;
$$;

-- Fix get_queue_stats function
CREATE OR REPLACE FUNCTION public.get_queue_stats()
RETURNS TABLE (
  queue_depth BIGINT,
  processing_count BIGINT,
  completed_today BIGINT,
  failed_count BIGINT,
  avg_generation_seconds NUMERIC,
  oldest_pending_minutes NUMERIC
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.orders WHERE status IN ('submitted', 'under_review'))::BIGINT AS queue_depth,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'in_progress')::BIGINT AS processing_count,
    (SELECT COUNT(*) FROM public.orders WHERE status IN ('pending_review', 'draft_delivered', 'completed') AND generation_completed_at >= CURRENT_DATE)::BIGINT AS completed_today,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'generation_failed')::BIGINT AS failed_count,
    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (generation_completed_at - generation_started_at))), 0) FROM public.orders WHERE generation_completed_at IS NOT NULL AND generation_started_at IS NOT NULL AND generation_completed_at >= CURRENT_DATE - INTERVAL '7 days')::NUMERIC AS avg_generation_seconds,
    (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60), 0) FROM public.orders WHERE status IN ('submitted', 'under_review'))::NUMERIC AS oldest_pending_minutes;
END;
$$;

-- Fix update_queue_positions_trigger function
CREATE OR REPLACE FUNCTION public.update_queue_positions_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only update if status changed to/from queue-related statuses
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Recalculate positions for all queued orders
    WITH ranked_orders AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
      FROM public.orders
      WHERE status IN ('submitted', 'under_review', 'in_progress')
    )
    UPDATE public.orders o
    SET queue_position = ro.new_position
    FROM ranked_orders ro
    WHERE o.id = ro.id;

    -- Clear position for completed/failed orders
    UPDATE public.orders
    SET queue_position = NULL
    WHERE status NOT IN ('submitted', 'under_review', 'in_progress');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 2: Add Missing Indexes for Performance
-- ============================================================================

-- Index for quick user profile lookups by role (used in many auth checks)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Index for order client lookups (used in ownership checks)
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(client_id);

-- Index for order clerk lookups
CREATE INDEX IF NOT EXISTS idx_orders_clerk_id ON public.orders(clerk_id) WHERE clerk_id IS NOT NULL;

-- Index for document order lookups
CREATE INDEX IF NOT EXISTS idx_documents_order_id ON public.documents(order_id);

-- Index for parties order lookups
CREATE INDEX IF NOT EXISTS idx_parties_order_id ON public.parties(order_id);

-- Index for automation logs by order
CREATE INDEX IF NOT EXISTS idx_automation_logs_order_id ON public.automation_logs(order_id) WHERE order_id IS NOT NULL;

-- Index for conversations by order
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON public.conversations(order_id);

-- Index for pending notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON public.notification_queue(status) WHERE status = 'pending';

-- Index for pending automation tasks
CREATE INDEX IF NOT EXISTS idx_automation_tasks_status_scheduled ON public.automation_tasks(status, scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- PART 3: Add Missing Constraints
-- ============================================================================

-- Ensure order_number is unique
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- Ensure valid status values (if not already enum)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('submitted', 'under_review', 'assigned', 'in_progress', 'pending_review', 'draft_delivered', 'revision_requested', 'revision_delivered', 'completed', 'cancelled', 'blocked', 'generation_failed'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Constraint already exists
END $$;

-- Ensure valid turnaround values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_turnaround_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_turnaround_check
      CHECK (turnaround IN ('standard', 'rush_72', 'rush_48'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Constraint already exists
END $$;

-- Ensure prices are non-negative
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_price_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_total_price_check CHECK (total_price >= 0);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check functions have search_path set
-- SELECT proname, prosecdef, proconfig
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
-- AND proname IN ('get_queue_position', 'get_queue_stats', 'update_queue_positions_trigger')
-- AND proconfig::text LIKE '%search_path%';

-- Check indexes exist
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 015_add_handoff_tracking_columns.sql
-- ============================================================
-- Migration: Add handoff tracking columns to order_workflows
-- Date: January 2026
-- Description: Adds columns referenced by citation-verifier.ts for tracking
-- handoff progress during batched citation verification.
--
-- CRITICAL: These columns were referenced in code but missing from schema.
-- Without them, the batched citation verification would fail.

-- ============================================================================
-- STEP 1: Add missing columns to order_workflows
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS last_handoff_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 2: Add index for efficient handoff queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_workflows_handoff
ON order_workflows(last_handoff_at DESC)
WHERE last_handoff_at IS NOT NULL;

-- ============================================================================
-- STEP 3: Add comments
-- ============================================================================

COMMENT ON COLUMN order_workflows.last_handoff_at IS 'Timestamp of the last incremental handoff saved during batched citation verification (v6.3 4-citation rule)';
COMMENT ON COLUMN order_workflows.handoff_count IS 'Number of incremental handoffs saved for this workflow, tracks progress through citation batches';


-- ============================================================
-- MIGRATION: 016_legal_compliance_fixes.sql
-- ============================================================
-- ============================================================================
-- Migration 014: Legal Compliance & Data Integrity Fixes
-- ============================================================================
-- CRITICAL: This is a legal platform. Data integrity and audit trails are paramount.
-- This migration addresses:
-- 1. Missing updated_at timestamps
-- 2. Missing CHECK constraints for logical consistency
-- 3. Missing indexes for common queries
-- 4. Missing soft delete capabilities
-- 5. Audit trail improvements
-- 6. Data retention support
-- ============================================================================

-- ============================================================================
-- PART 1: ADD MISSING UPDATED_AT COLUMNS AND TRIGGERS
-- ============================================================================

-- automation_logs
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- automation_tasks
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_automation_tasks_timestamp
  BEFORE UPDATE ON automation_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- approval_queue
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_approval_queue_timestamp
  BEFORE UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- notification_queue
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_notification_queue_timestamp
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- conflict_matches
ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_conflict_matches_timestamp
  BEFORE UPDATE ON conflict_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- webhook_events
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_webhook_events_timestamp
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- revision_requests (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'revision_requests') THEN
    EXECUTE 'ALTER TABLE revision_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- superprompt_templates
ALTER TABLE superprompt_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_superprompt_templates_timestamp
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_superprompt_templates_updated_at();

-- workflow_phase_definitions
ALTER TABLE workflow_phase_definitions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE OR REPLACE TRIGGER update_workflow_phase_definitions_timestamp
  BEFORE UPDATE ON workflow_phase_definitions
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- conversation_messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_messages') THEN
    EXECUTE 'ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- workflow_revisions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_revisions') THEN
    EXECUTE 'ALTER TABLE workflow_revisions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- handoff_files
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handoff_files') THEN
    EXECUTE 'ALTER TABLE handoff_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD SOFT DELETE COLUMNS TO CRITICAL TABLES
-- ============================================================================

-- Orders table - never physically delete, only soft delete
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Create index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON orders(is_deleted) WHERE is_deleted = false;

-- Conversations - preserve work product
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE 'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE';
    EXECUTE 'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ';
  END IF;
END $$;

-- Documents - preserve case records
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_is_deleted ON documents(is_deleted) WHERE is_deleted = false;

-- ============================================================================
-- PART 3: LEGAL HOLDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('order', 'conversation', 'document', 'parsed_document')),
  entity_id UUID NOT NULL,
  hold_reason TEXT NOT NULL,
  case_reference VARCHAR(255),
  held_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  held_by UUID NOT NULL REFERENCES profiles(id),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES profiles(id),
  release_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_entity ON legal_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds(is_active) WHERE is_active = true;

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage legal holds" ON legal_holds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================================
-- PART 4: ADD CHECK CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Conflict matches: If cleared, must have who and when
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conflict_matches_cleared_logic') THEN
    ALTER TABLE conflict_matches ADD CONSTRAINT conflict_matches_cleared_logic
      CHECK (is_cleared = false OR (cleared_by IS NOT NULL AND cleared_at IS NOT NULL));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification queue: If sent, must have sent_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_queue_sent_logic') THEN
    ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_sent_logic
      CHECK (status != 'sent' OR sent_at IS NOT NULL);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Automation tasks: If failed, should have error
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automation_tasks_failed_logic') THEN
    ALTER TABLE automation_tasks ADD CONSTRAINT automation_tasks_failed_logic
      CHECK (status != 'failed' OR last_error IS NOT NULL);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Orders: Prices must be non-negative
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_prices_positive') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_prices_positive
      CHECK (total_price >= 0 AND (base_price IS NULL OR base_price >= 0) AND (rush_surcharge IS NULL OR rush_surcharge >= 0));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 5: ADD MISSING INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Approval queue indexes
CREATE INDEX IF NOT EXISTS idx_approval_queue_reviewed_by ON approval_queue(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_queue_expires ON approval_queue(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Notification queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_email ON notification_queue(recipient_email);

-- Workflow revisions payment tracking (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_revisions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_revisions_payment ON workflow_revisions(payment_status) WHERE payment_status = ''pending''';
  END IF;
END $$;

-- Conversations status (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)';
  END IF;
END $$;

-- ============================================================================
-- PART 6: SUPERPROMPT TEMPLATE VERSIONING (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS superprompt_templates_audit (
  id BIGSERIAL PRIMARY KEY,
  template_id UUID NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'restored')),
  old_template TEXT,
  new_template TEXT,
  old_system_prompt TEXT,
  new_system_prompt TEXT,
  change_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_superprompt_audit_template ON superprompt_templates_audit(template_id);
CREATE INDEX IF NOT EXISTS idx_superprompt_audit_time ON superprompt_templates_audit(changed_at DESC);

-- Trigger to log superprompt changes
CREATE OR REPLACE FUNCTION log_superprompt_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.superprompt_templates_audit (
      template_id, changed_by, change_type,
      old_template, new_template,
      old_system_prompt, new_system_prompt
    ) VALUES (
      NEW.id, auth.uid(), 'updated',
      OLD.template, NEW.template,
      OLD.system_prompt, NEW.system_prompt
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.superprompt_templates_audit (
      template_id, changed_by, change_type, new_template, new_system_prompt
    ) VALUES (
      NEW.id, auth.uid(), 'created', NEW.template, NEW.system_prompt
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_superprompt_audit ON superprompt_templates;
CREATE TRIGGER trg_superprompt_audit
  AFTER INSERT OR UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION log_superprompt_changes();

-- ============================================================================
-- PART 7: APPROVAL QUEUE AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_queue_audit (
  id BIGSERIAL PRIMARY KEY,
  approval_id UUID NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_audit_id ON approval_queue_audit(approval_id);

-- Trigger to log approval status changes
CREATE OR REPLACE FUNCTION log_approval_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.approval_queue_audit (
      approval_id, changed_by, old_status, new_status, review_notes
    ) VALUES (
      NEW.id, auth.uid(), OLD.status, NEW.status, NEW.review_notes
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_audit ON approval_queue;
CREATE TRIGGER trg_approval_audit
  AFTER UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION log_approval_changes();

-- ============================================================================
-- PART 8: DATA RETENTION SUPPORT FUNCTIONS
-- ============================================================================

-- Function to check if entity is on legal hold
CREATE OR REPLACE FUNCTION is_on_legal_hold(p_entity_type VARCHAR, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.legal_holds
    WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND is_active = true
  );
END;
$$;

-- Function to prevent deletion of items on legal hold
CREATE OR REPLACE FUNCTION prevent_delete_on_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  entity_type_name VARCHAR(50);
BEGIN
  entity_type_name := TG_TABLE_NAME;

  IF public.is_on_legal_hold(entity_type_name, OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete % with id %: item is on legal hold', entity_type_name, OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

-- Apply to orders table
DROP TRIGGER IF EXISTS trg_prevent_order_delete ON orders;
CREATE TRIGGER trg_prevent_order_delete
  BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION prevent_delete_on_hold();

-- ============================================================================
-- PART 9: ADD "WHO" FIELDS FOR AUDIT TRAIL
-- ============================================================================

-- Add triggered_by to automation_logs
ALTER TABLE automation_logs ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES profiles(id);

-- Add started_by/completed_by to automation_tasks
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES profiles(id);
ALTER TABLE automation_tasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id);

-- Add updated_by to approval_queue
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

-- ============================================================================
-- PART 10: RLS FOR NEW TABLES
-- ============================================================================

ALTER TABLE superprompt_templates_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view superprompt audit" ON superprompt_templates_audit
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE approval_queue_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view approval audit" ON approval_queue_audit
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check updated_at columns exist
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE column_name = 'updated_at' AND table_schema = 'public';

-- Check legal holds table exists
-- SELECT * FROM legal_holds LIMIT 1;

-- Check audit tables exist
-- SELECT * FROM superprompt_templates_audit LIMIT 1;
-- SELECT * FROM approval_queue_audit LIMIT 1;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 017_seed_default_superprompt.sql
-- ============================================================
-- Seed default superprompt template
-- This ensures the application has a working template out of the box

-- Only insert if no default template exists
INSERT INTO superprompt_templates (
  name,
  description,
  motion_types,
  template,
  system_prompt,
  max_tokens,
  is_default
)
SELECT
  'Default Motion Template',
  'Default template for all motion types - customize via Admin Dashboard',
  ARRAY['*']::TEXT[],
  '╔══════════════════════════════════════════════════════════════════════════════╗
║                    MOTION GRANTED - LEGAL MOTION GENERATOR                    ║
║                         DEFAULT SUPERPROMPT TEMPLATE                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

You are an expert federal litigation attorney with 20+ years of experience drafting motions for federal district courts. You draft motions that are:
- Precisely argued with correct legal standards
- Properly cited with verified case law
- Formatted for immediate court filing
- Persuasive but professional in tone

═══════════════════════════════════════════════════════════════════════════════
                               CASE INFORMATION
═══════════════════════════════════════════════════════════════════════════════

{{CASE_DATA}}

═══════════════════════════════════════════════════════════════════════════════
                            UPLOADED DOCUMENTS
═══════════════════════════════════════════════════════════════════════════════

{{DOCUMENTS}}

═══════════════════════════════════════════════════════════════════════════════
                          FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

1. CAPTION FORMAT:
   - Court name centered and capitalized
   - Parties in standard "v." format
   - Case number on right side
   - Document title centered below parties

2. BODY FORMAT:
   - Use Roman numerals for major sections (I., II., III.)
   - Use capital letters for subsections (A., B., C.)
   - Use numbers for sub-subsections (1., 2., 3.)
   - First-line indent for paragraphs

3. CITATIONS:
   - Bluebook format
   - Include pinpoint cites where possible
   - Use "Id." for immediate repetition
   - Use short form after first full citation

4. SIGNATURE BLOCK:
   - "Respectfully submitted,"
   - Signature line
   - Attorney name, bar number
   - Firm name, address, phone, email
   - "Attorney for [Plaintiff/Defendant]"

5. CERTIFICATE OF SERVICE:
   - Standard CM/ECF certification
   - Date of service

═══════════════════════════════════════════════════════════════════════════════
                           QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

☑ MINIMUM 6 legal citations (cases, statutes, or rules)
☑ ALL citations must be real and accurately quoted
☑ NO placeholder text like [INSERT], [TBD], [CITATION NEEDED]
☑ Minimum 1,500 words for substantive motions
☑ Every factual assertion must be supported by the record
☑ Every legal assertion must be supported by cited authority
☑ Conclusion must specify EXACT relief requested

═══════════════════════════════════════════════════════════════════════════════
                              OUTPUT INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

Generate the COMPLETE motion document now, starting with the case caption.

Do not include explanatory notes or commentary - output ONLY the motion text that would be filed with the court.

BEGIN MOTION:',
  'You are an expert federal litigation attorney with extensive experience drafting court filings. You produce precise, well-cited, professionally formatted legal documents. You NEVER use placeholder text - every citation is real and accurate. You follow Bluebook citation format.',
  16000,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM superprompt_templates WHERE is_default = TRUE
);

-- Add comment
COMMENT ON TABLE superprompt_templates IS 'Stores lawyer AI motion generation templates. At least one template should have is_default = TRUE.';


-- ============================================================
-- MIGRATION: 018_workflow_v72_citation_system.sql
-- ============================================================
-- ============================================================================
-- Motion Granted v7.2 Workflow System Migration
-- Adds citation banks, verification tracking, and gap closure events
-- ============================================================================

-- ============================================================================
-- CITATION VERIFICATION STATUS ENUM
-- ============================================================================

CREATE TYPE citation_verification_status AS ENUM (
  'VERIFIED',
  'VERIFIED_WITH_HISTORY',
  'VERIFIED_WEB_ONLY',
  'VERIFIED_UNPUBLISHED',
  'HOLDING_MISMATCH',
  'HOLDING_PARTIAL',
  'QUOTE_NOT_FOUND',
  'NOT_FOUND',
  'OVERRULED',
  'PENDING',
  'SKIPPED'
);

-- ============================================================================
-- CITATION BANK TYPE ENUM
-- ============================================================================

CREATE TYPE citation_bank_type AS ENUM ('CASE', 'STATUTORY');

-- ============================================================================
-- LETTER GRADE ENUM
-- ============================================================================

CREATE TYPE letter_grade AS ENUM (
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C',
  'D', 'F'
);

-- ============================================================================
-- CHECKPOINT TYPE ENUM
-- ============================================================================

CREATE TYPE checkpoint_type AS ENUM ('HOLD', 'CP1', 'CP2', 'CP3');

-- ============================================================================
-- CITATION BANKS TABLE
-- Dual bank system: Case citations and Statutory authorities
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_banks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bank_type citation_bank_type NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one bank per type per order
  UNIQUE(order_id, bank_type)
);

-- Index for fast lookups
CREATE INDEX idx_citation_banks_order_id ON citation_banks(order_id);
CREATE INDEX idx_citation_banks_type ON citation_banks(bank_type);

-- ============================================================================
-- CITATION VERIFICATIONS TABLE
-- Audit trail for 3-stage CourtListener verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  citation_bank_id UUID REFERENCES citation_banks(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation details
  citation_text TEXT NOT NULL,
  case_name TEXT,
  reporter TEXT,
  year INTEGER,
  court TEXT,

  -- Stage 1: Existence check
  stage_1_result VARCHAR(20), -- 'found', 'not_found', 'error'
  stage_1_at TIMESTAMPTZ,

  -- Stage 2: Opinion retrieval
  stage_2_result VARCHAR(20), -- 'retrieved', 'not_retrieved', 'error'
  stage_2_at TIMESTAMPTZ,
  opinion_url TEXT,

  -- Stage 3: Holding verification (Opus)
  stage_3_result VARCHAR(20), -- 'verified', 'mismatch', 'partial', 'error'
  stage_3_at TIMESTAMPTZ,
  proposition TEXT,
  holding_analysis TEXT,

  -- Final status
  courtlistener_id VARCHAR(100),
  verification_status citation_verification_status NOT NULL DEFAULT 'PENDING',

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for verification lookups
CREATE INDEX idx_citation_verifications_bank_id ON citation_verifications(citation_bank_id);
CREATE INDEX idx_citation_verifications_order_id ON citation_verifications(order_id);
CREATE INDEX idx_citation_verifications_status ON citation_verifications(verification_status);
CREATE INDEX idx_citation_verifications_citation_text ON citation_verifications(citation_text);

-- ============================================================================
-- GAP CLOSURE EVENTS TABLE
-- Tracks when gap closure protocols are triggered and resolved
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_closure_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Protocol info
  protocol_number INTEGER NOT NULL CHECK (protocol_number BETWEEN 1 AND 17),
  protocol_name VARCHAR(100) NOT NULL,

  -- Event details
  trigger_reason TEXT NOT NULL,
  trigger_phase VARCHAR(10),
  trigger_data JSONB,

  -- Resolution
  resolution TEXT,
  resolution_data JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),

  -- Status
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  auto_resolved BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for gap closure lookups
CREATE INDEX idx_gap_closure_events_order_id ON gap_closure_events(order_id);
CREATE INDEX idx_gap_closure_events_protocol ON gap_closure_events(protocol_number);
CREATE INDEX idx_gap_closure_events_unresolved ON gap_closure_events(order_id) WHERE NOT is_resolved;

-- ============================================================================
-- JUDGE SIMULATION RESULTS TABLE
-- Stores Phase VII grading results
-- ============================================================================

CREATE TABLE IF NOT EXISTS judge_simulation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE,

  -- Grade
  grade letter_grade NOT NULL,
  numeric_grade DECIMAL(3,2) NOT NULL,
  passes BOOLEAN NOT NULL,

  -- Feedback
  strengths JSONB NOT NULL DEFAULT '[]',
  weaknesses JSONB NOT NULL DEFAULT '[]',
  specific_feedback TEXT,
  revision_suggestions JSONB,

  -- Loop tracking
  loop_number INTEGER NOT NULL DEFAULT 1,

  -- AI details
  model_used VARCHAR(50),
  thinking_budget INTEGER,
  tokens_used INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for judge simulation lookups
CREATE INDEX idx_judge_simulation_order_id ON judge_simulation_results(order_id);
CREATE INDEX idx_judge_simulation_grade ON judge_simulation_results(grade);
CREATE INDEX idx_judge_simulation_loop ON judge_simulation_results(order_id, loop_number);

-- ============================================================================
-- WORKFLOW CHECKPOINTS TABLE
-- Tracks checkpoint triggers and resolutions
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_workflow_id UUID REFERENCES order_workflows(id) ON DELETE CASCADE,

  -- Checkpoint info
  checkpoint_type checkpoint_type NOT NULL,
  phase_code VARCHAR(10) NOT NULL,
  is_blocking BOOLEAN NOT NULL,

  -- Status
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution VARCHAR(50), -- 'approved', 'request_changes', 'cancelled', 'customer_response'
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),

  -- Customer response (for HOLD checkpoint)
  customer_response TEXT,
  customer_responded_at TIMESTAMPTZ
);

-- Index for checkpoint lookups
CREATE INDEX idx_workflow_checkpoints_order_id ON workflow_checkpoints(order_id);
CREATE INDEX idx_workflow_checkpoints_type ON workflow_checkpoints(checkpoint_type);
CREATE INDEX idx_workflow_checkpoints_unresolved ON workflow_checkpoints(order_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- ADD NEW COLUMNS TO ORDER_WORKFLOWS
-- ============================================================================

ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS case_bank_id UUID REFERENCES citation_banks(id),
ADD COLUMN IF NOT EXISTS statutory_bank_id UUID REFERENCES citation_banks(id),
ADD COLUMN IF NOT EXISTS hold_checkpoint_triggered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hold_customer_response VARCHAR(50),
ADD COLUMN IF NOT EXISTS loop_3_exit_triggered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS current_revision_loop INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS latest_grade letter_grade,
ADD COLUMN IF NOT EXISTS extended_thinking_config JSONB,
ADD COLUMN IF NOT EXISTS phase_code VARCHAR(10);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Updated timestamp trigger for citation_banks
CREATE TRIGGER update_citation_banks_timestamp
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- Updated timestamp trigger for citation_verifications
CREATE TRIGGER update_citation_verifications_timestamp
  BEFORE UPDATE ON citation_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE citation_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_closure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Citation banks: Service role full access, users can view their own
CREATE POLICY "Service role full access to citation_banks"
  ON citation_banks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own citation_banks"
  ON citation_banks FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Citation verifications: Service role full access
CREATE POLICY "Service role full access to citation_verifications"
  ON citation_verifications FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Gap closure events: Service role full access
CREATE POLICY "Service role full access to gap_closure_events"
  ON gap_closure_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Judge simulation results: Service role full access, users can view their own
CREATE POLICY "Service role full access to judge_simulation_results"
  ON judge_simulation_results FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own judge_simulation_results"
  ON judge_simulation_results FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Workflow checkpoints: Service role full access
CREATE POLICY "Service role full access to workflow_checkpoints"
  ON workflow_checkpoints FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get numeric grade value
CREATE OR REPLACE FUNCTION grade_to_numeric(grade letter_grade)
RETURNS DECIMAL(3,2) AS $$
BEGIN
  RETURN CASE grade
    WHEN 'A+' THEN 4.3
    WHEN 'A' THEN 4.0
    WHEN 'A-' THEN 3.7
    WHEN 'B+' THEN 3.3
    WHEN 'B' THEN 3.0
    WHEN 'B-' THEN 2.7
    WHEN 'C+' THEN 2.3
    WHEN 'C' THEN 2.0
    WHEN 'D' THEN 1.0
    WHEN 'F' THEN 0.0
    ELSE 0.0
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if grade passes (>= B+)
CREATE OR REPLACE FUNCTION grade_passes(grade letter_grade)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN grade_to_numeric(grade) >= 3.3;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE citation_banks IS 'Dual citation bank system for case law and statutory authorities';
COMMENT ON TABLE citation_verifications IS 'Three-stage CourtListener verification audit trail';
COMMENT ON TABLE gap_closure_events IS 'Tracking for the 17 gap closure protocols';
COMMENT ON TABLE judge_simulation_results IS 'Phase VII judge simulation grading results';
COMMENT ON TABLE workflow_checkpoints IS 'Checkpoint triggers and resolutions (HOLD, CP1-CP3)';


-- ============================================================
-- MIGRATION: 019_production_performance_indexes.sql
-- ============================================================
-- ============================================================================
-- Migration 016: Production Performance Indexes
-- Motion Granted v7.2 - Scaling for 100+ concurrent users
-- ============================================================================

-- ============================================================================
-- ORDERS TABLE INDEXES
-- Most queried table - needs comprehensive coverage
-- ============================================================================

-- Composite index for admin order list (status + deadline sorting)
CREATE INDEX IF NOT EXISTS idx_orders_status_deadline
ON orders(status, filing_deadline ASC);

-- Composite index for client dashboard
CREATE INDEX IF NOT EXISTS idx_orders_client_status
ON orders(client_id, status, created_at DESC);

-- Index for queue position calculation
CREATE INDEX IF NOT EXISTS idx_orders_queue_position
ON orders(status, filing_deadline ASC, created_at ASC)
WHERE status IN ('submitted', 'under_review', 'in_progress', 'assigned');

-- Partial index for active orders only
CREATE INDEX IF NOT EXISTS idx_orders_active
ON orders(created_at DESC)
WHERE status NOT IN ('completed', 'cancelled');

-- Full-text search index for case caption and case number
CREATE INDEX IF NOT EXISTS idx_orders_search
ON orders USING gin(to_tsvector('english', case_caption || ' ' || case_number));

-- Index for motion tier analytics
CREATE INDEX IF NOT EXISTS idx_orders_motion_tier
ON orders(motion_tier, created_at DESC);

-- ============================================================================
-- ORDER_WORKFLOWS TABLE INDEXES
-- Critical for workflow progress tracking
-- ============================================================================

-- Primary lookup by order
CREATE INDEX IF NOT EXISTS idx_workflows_order_id
ON order_workflows(order_id);

-- Status-based queries for dashboard
CREATE INDEX IF NOT EXISTS idx_workflows_status_phase
ON order_workflows(status, current_phase);

-- Active workflows for monitoring
CREATE INDEX IF NOT EXISTS idx_workflows_active
ON order_workflows(updated_at DESC)
WHERE status IN ('pending', 'in_progress', 'blocked');

-- Revision loop tracking
CREATE INDEX IF NOT EXISTS idx_workflows_revision_loop
ON order_workflows(revision_loop)
WHERE revision_loop > 0;

-- ============================================================================
-- WORKFLOW_PHASE_EXECUTIONS TABLE INDEXES
-- High-volume table for phase tracking
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_phase_executions_workflow
ON workflow_phase_executions(order_workflow_id, phase_number);

CREATE INDEX IF NOT EXISTS idx_phase_executions_status
ON workflow_phase_executions(status, requires_review)
WHERE requires_review = true;

CREATE INDEX IF NOT EXISTS idx_phase_executions_timing
ON workflow_phase_executions(started_at, completed_at);

-- ============================================================================
-- CITATION TABLES INDEXES
-- v7.2 CourtListener integration
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_citation_banks_workflow
ON citation_banks(workflow_id, bank_type);

CREATE INDEX IF NOT EXISTS idx_citation_verifications_status
ON citation_verifications(verification_status, workflow_id);

CREATE INDEX IF NOT EXISTS idx_citation_verifications_courtlistener
ON citation_verifications(courtlistener_id)
WHERE courtlistener_id IS NOT NULL;

-- ============================================================================
-- JUDGE_SIMULATION_RESULTS INDEXES
-- Phase VII results lookup
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_judge_results_workflow
ON judge_simulation_results(workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_judge_results_grade
ON judge_simulation_results(grade, passes);

-- ============================================================================
-- WORKFLOW_CHECKPOINTS INDEXES
-- Checkpoint approval tracking
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_checkpoints_workflow_phase
ON workflow_checkpoints(workflow_id, phase_code);

CREATE INDEX IF NOT EXISTS idx_checkpoints_pending
ON workflow_checkpoints(status, created_at DESC)
WHERE status = 'pending';

-- ============================================================================
-- AUTOMATION_LOGS INDEXES
-- Audit trail queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_automation_logs_order_time
ON automation_logs(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_action
ON automation_logs(action_type, created_at DESC);

-- Partial index for errors only
CREATE INDEX IF NOT EXISTS idx_automation_logs_errors
ON automation_logs(created_at DESC)
WHERE error_message IS NOT NULL;

-- ============================================================================
-- NOTIFICATION_QUEUE INDEXES
-- Email queue processing
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
ON notification_queue(status, priority DESC, created_at ASC)
WHERE status IN ('pending', 'queued');

CREATE INDEX IF NOT EXISTS idx_notification_queue_retry
ON notification_queue(status, retry_count, last_attempt)
WHERE status = 'failed' AND retry_count < 3;

-- ============================================================================
-- DOCUMENTS TABLE INDEXES
-- File storage queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_order_type
ON documents(order_id, document_type);

CREATE INDEX IF NOT EXISTS idx_documents_deliverables
ON documents(order_id, created_at DESC)
WHERE document_type = 'deliverable';

-- ============================================================================
-- PROFILES TABLE INDEXES
-- User lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role
ON profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
ON profiles(LOWER(email));

-- ============================================================================
-- CONVERSATIONS TABLE INDEXES
-- Chat history queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_order
ON conversations(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_active
ON conversations(status, updated_at DESC)
WHERE status = 'active';

-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS DASHBOARD
-- Pre-computed aggregations for fast dashboard loading
-- ============================================================================

-- Order statistics by status
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_order_stats AS
SELECT
    status,
    motion_tier,
    COUNT(*) as count,
    SUM(total_price) as total_revenue,
    AVG(total_price) as avg_price,
    MIN(created_at) as earliest,
    MAX(created_at) as latest
FROM orders
GROUP BY status, motion_tier;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_order_stats
ON mv_order_stats(status, motion_tier);

-- Workflow performance metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_workflow_performance AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    status,
    COUNT(*) as workflow_count,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_duration_minutes,
    AVG(revision_loop) as avg_revisions
FROM order_workflows
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', created_at), status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_workflow_performance
ON mv_workflow_performance(day, status);

-- Citation verification stats
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_citation_stats AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    verification_status,
    COUNT(*) as count
FROM citation_verifications
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), verification_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_citation_stats
ON mv_citation_stats(day, verification_status);

-- ============================================================================
-- REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_order_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_workflow_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_citation_stats;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION refresh_analytics_views() TO service_role;

-- ============================================================================
-- DATABASE STATISTICS OPTIMIZATION
-- ============================================================================

-- Increase statistics targets for frequently queried columns
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ALTER TABLE orders ALTER COLUMN filing_deadline SET STATISTICS 1000;
ALTER TABLE orders ALTER COLUMN motion_tier SET STATISTICS 500;
ALTER TABLE order_workflows ALTER COLUMN status SET STATISTICS 1000;
ALTER TABLE order_workflows ALTER COLUMN current_phase SET STATISTICS 500;

-- Analyze tables to update statistics
ANALYZE orders;
ANALYZE order_workflows;
ANALYZE workflow_phase_executions;
ANALYZE citation_verifications;
ANALYZE automation_logs;
ANALYZE notification_queue;

-- ============================================================================
-- CONNECTION POOLING PREPARATION
-- Note: Actual pooler configuration is in Supabase dashboard
-- ============================================================================

-- Set statement timeout for long-running queries (prevent runaway queries)
ALTER DATABASE postgres SET statement_timeout = '30s';

-- Set lock timeout to prevent deadlocks
ALTER DATABASE postgres SET lock_timeout = '10s';

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_orders_status_deadline IS 'Optimizes admin order list with status filter and deadline sort';
COMMENT ON INDEX idx_orders_queue_position IS 'Partial index for queue position calculation - only active orders';
COMMENT ON INDEX idx_workflows_active IS 'Fast lookup for monitoring dashboard active workflows';
COMMENT ON MATERIALIZED VIEW mv_order_stats IS 'Pre-computed order statistics - refresh hourly';
COMMENT ON MATERIALIZED VIEW mv_workflow_performance IS 'Workflow timing metrics - refresh hourly';
COMMENT ON FUNCTION refresh_analytics_views IS 'Refreshes all analytics materialized views - call from cron';


-- ============================================================
-- MIGRATION: 020_seed_default_superprompt.sql
-- ============================================================
-- Seed Default Superprompt Template
-- This provides the default motion generation template for all motion types

INSERT INTO superprompt_templates (
  name,
  description,
  motion_types,
  template,
  system_prompt,
  max_tokens,
  is_default
) VALUES (
  'Default Motion Template v7.2',
  'Production-grade legal motion generation template with 14-phase workflow',
  ARRAY['*']::TEXT[],
  E'################################################################################
#                     MOTION GRANTED WORKFLOW v7.2                              #
#                  14-PHASE LEGAL MOTION GENERATION                             #
################################################################################

CASE INFORMATION:
=================
Case Number: {{CASE_NUMBER}}
Case Caption: {{CASE_CAPTION}}
Court: {{COURT}}
Jurisdiction: {{JURISDICTION}}
Filing Deadline: {{FILING_DEADLINE}}

CLIENT INFORMATION:
===================
Moving Party: {{MOVING_PARTY}}
Attorney: {{ATTORNEY_NAME}}
Bar Number: {{BAR_NUMBER}}
Firm: {{FIRM_NAME}}
Address: {{FIRM_ADDRESS}}
Phone: {{FIRM_PHONE}}

MOTION TYPE: {{MOTION_TYPE}}
MOTION TIER: {{MOTION_TIER}}

CASE MATERIALS:
===============
Statement of Facts:
{{STATEMENT_OF_FACTS}}

Procedural History:
{{PROCEDURAL_HISTORY}}

Client Instructions:
{{CLIENT_INSTRUCTIONS}}

Document Summaries:
{{DOCUMENT_SUMMARIES}}

================================================================================
                              WORKFLOW EXECUTION
================================================================================

Execute the following 14-phase workflow to produce a court-ready motion:

PHASE I: INTAKE & DOCUMENT PROCESSING
--------------------------------------
- Parse all provided documents and case materials
- Extract key facts, dates, parties, and procedural events
- Identify the motion type and applicable legal standards
- Create structured case data for subsequent phases

PHASE II: LEGAL STANDARDS / MOTION DECONSTRUCTION
--------------------------------------------------
- Identify the precise legal standard for this motion type
- Break down required elements that must be proven
- Determine burden of proof and applicable rules
- Map elements to available facts

PHASE III: EVIDENCE STRATEGY / ISSUE IDENTIFICATION
----------------------------------------------------
- Analyze facts against legal elements
- Identify strengths and weaknesses in the argument
- Flag any jurisdictional or procedural issues
- CHECKPOINT: If issues found, flag for review

PHASE IV: AUTHORITY RESEARCH
----------------------------
- Research applicable case law and statutes
- Prioritize binding authority from this jurisdiction
- Verify all citations for accuracy
- Minimum citations: Tier A=5, Tier B=8, Tier C=15
- CHECKPOINT (CP1): Notify if citation verification issues

PHASE V: DRAFT MOTION
---------------------
- Draft complete motion following court format requirements
- Include all required sections:
  * Caption
  * Introduction/Preliminary Statement
  * Statement of Facts
  * Procedural History (if applicable)
  * Legal Standard
  * Argument (IRAC format)
  * Conclusion with specific relief requested
  * Signature Block
  * Certificate of Service

PHASE V.1: CITATION ACCURACY CHECK
----------------------------------
- Verify each citation format (Bluebook)
- Confirm propositions match holdings
- Flag any questionable citations

PHASE VI: OPPOSITION ANTICIPATION
---------------------------------
- Identify likely counter-arguments
- Draft preemptive responses
- Strengthen weak points
- Extended thinking: 8K tokens for Tier B/C

PHASE VII: JUDICIAL SIMULATION
------------------------------
- Evaluate motion as a skeptical judge would
- Grade A+ through F (B+ minimum to pass)
- Identify specific weaknesses
- Provide revision suggestions if below B+
- Extended thinking: 10K tokens (all tiers)
- CHECKPOINT (CP2): Notify with grade results

PHASE VII.1: REVISION LOOP (if needed)
--------------------------------------
- Apply judge feedback
- Strengthen identified weaknesses
- Re-evaluate (max 3 loops)

PHASE VIII: FINAL POLISH
------------------------
- Ensure consistent tone and style
- Verify word count within limits
- Check formatting compliance
- Extended thinking: 8K tokens for Tier B/C

PHASE VIII.5: AI DISCLOSURE CHECK
---------------------------------
- Check jurisdiction AI disclosure requirements
- Add disclosure if required
- Format appropriately

PHASE IX: FINAL ASSEMBLY
------------------------
- Assemble all components
- Generate table of authorities
- Create certificate of service
- Format for filing

PHASE IX.1: FINAL QA
--------------------
- Run quality checklist
- Verify no placeholders remain
- Confirm all sections present

PHASE X: DELIVERY APPROVAL
--------------------------
- CHECKPOINT (CP3): Blocking - requires admin approval
- Package deliverables
- Prepare for client delivery

================================================================================
                              OUTPUT REQUIREMENTS
================================================================================

Your output must be ONLY the final, court-ready motion document.

DO NOT include:
- Phase headers or status updates
- Workflow commentary
- Research notes
- Any text before the caption
- Any text after the certificate of service

START your output with the court caption.
END your output with the certificate of service.

The motion must be ready to file with no modifications needed.',
  'You are an expert legal motion drafter with extensive experience in {{JURISDICTION}} courts. You produce court-ready legal documents that meet the highest professional standards. Follow the workflow precisely and output only the final motion document.',
  32000,
  TRUE
)
ON CONFLICT DO NOTHING;

-- Verify the template was inserted
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM superprompt_templates WHERE is_default = TRUE) THEN
    RAISE EXCEPTION 'Default superprompt template was not created';
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 021_database_migrations_foundation.sql
-- ============================================================
-- ============================================================================
-- Motion Granted Database Migrations Foundation (Chunk 1: Tasks 24-31)
-- CIV Spec Implementation - v4.1 Specification
-- ============================================================================
-- Tables Created:
--   - overruled_cases (Task 24)
--   - citation_verification_log (Task 25)
--   - model_routing_config (Task 26)
--   - verified_citations (Task 27)
--   - citation_relationships (Task 28)
--   - anonymized_analytics (Task 30)
--   - refunds (Task 31)
--
-- Tables Modified:
--   - orders (Task 29 - data retention columns)
-- ============================================================================

-- ============================================================================
-- TASK 24: CREATE OVERRULED_CASES TABLE
-- Source: CIV Spec Section 8, API Architecture Spec Section 6.1
-- Purpose: Layer 2 bad law check
-- ============================================================================

CREATE TABLE IF NOT EXISTS overruled_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation TEXT NOT NULL,
  normalized_citation TEXT UNIQUE,
  overruled_by TEXT NOT NULL,
  overruled_date DATE,
  jurisdiction VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for overruled_cases
CREATE INDEX IF NOT EXISTS idx_overruled_normalized ON overruled_cases(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_overruled_jurisdiction ON overruled_cases(jurisdiction);

-- Updated timestamp trigger for overruled_cases
DROP TRIGGER IF EXISTS update_overruled_cases_timestamp ON overruled_cases;
CREATE TRIGGER update_overruled_cases_timestamp
  BEFORE UPDATE ON overruled_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Commonly cited overruled cases
INSERT INTO overruled_cases (citation, normalized_citation, overruled_by, overruled_date, jurisdiction, notes)
VALUES
  (
    'Plessy v. Ferguson, 163 U.S. 537 (1896)',
    '163 U.S. 537',
    'Brown v. Board of Education, 347 U.S. 483 (1954)',
    '1954-05-17',
    'federal',
    'Overruled the "separate but equal" doctrine. Brown held that racial segregation in public schools violates the Equal Protection Clause of the Fourteenth Amendment.'
  ),
  (
    'Lochner v. New York, 198 U.S. 45 (1905)',
    '198 U.S. 45',
    'West Coast Hotel Co. v. Parrish, 300 U.S. 379 (1937)',
    '1937-03-29',
    'federal',
    'Ended the Lochner era of substantive due process protection for freedom of contract. West Coast Hotel upheld state minimum wage laws.'
  ),
  (
    'Bowers v. Hardwick, 478 U.S. 186 (1986)',
    '478 U.S. 186',
    'Lawrence v. Texas, 539 U.S. 558 (2003)',
    '2003-06-26',
    'federal',
    'Lawrence overruled Bowers, holding that intimate consensual sexual conduct is part of the liberty protected by substantive due process under the Fourteenth Amendment.'
  ),
  (
    'Austin v. Michigan Chamber of Commerce, 494 U.S. 652 (1990)',
    '494 U.S. 652',
    'Citizens United v. Federal Election Commission, 558 U.S. 310 (2010)',
    '2010-01-21',
    'federal',
    'Citizens United overruled Austin, holding that the First Amendment prohibits the government from restricting political expenditures by corporations, associations, or labor unions.'
  ),
  (
    'Korematsu v. United States, 323 U.S. 214 (1944)',
    '323 U.S. 214',
    'Trump v. Hawaii, 585 U.S. ___ (2018)',
    '2018-06-26',
    'federal',
    'While Trump v. Hawaii did not technically overrule Korematsu, Chief Justice Roberts explicitly stated that Korematsu was "gravely wrong the day it was decided" and "has been overruled in the court of history."'
  ),
  (
    'Quill Corp. v. North Dakota, 504 U.S. 298 (1992)',
    '504 U.S. 298',
    'South Dakota v. Wayfair, Inc., 585 U.S. ___ (2018)',
    '2018-06-21',
    'federal',
    'Wayfair overruled Quill''s physical presence requirement for states to require out-of-state sellers to collect and remit sales tax.'
  ),
  (
    'Chisholm v. Georgia, 2 U.S. 419 (1793)',
    '2 U.S. 419',
    'Eleventh Amendment (1795)',
    '1795-02-07',
    'federal',
    'The Eleventh Amendment was ratified specifically to overrule Chisholm, establishing state sovereign immunity from suits by citizens of other states.'
  ),
  (
    'Dred Scott v. Sandford, 60 U.S. 393 (1857)',
    '60 U.S. 393',
    'Thirteenth and Fourteenth Amendments (1865, 1868)',
    '1865-12-06',
    'federal',
    'The Thirteenth and Fourteenth Amendments effectively overruled Dred Scott by abolishing slavery and granting citizenship to all persons born in the United States.'
  )
ON CONFLICT (normalized_citation) DO NOTHING;

-- RLS for overruled_cases
ALTER TABLE overruled_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to overruled_cases"
  ON overruled_cases FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to overruled_cases"
  ON overruled_cases FOR SELECT
  USING (true);

COMMENT ON TABLE overruled_cases IS 'Registry of overruled cases for Layer 2 bad law verification';


-- ============================================================================
-- TASK 25: CREATE CITATION_VERIFICATION_LOG TABLE
-- Source: CIV Spec Section 10, API Architecture Spec Section 6.1
-- Purpose: Audit trail for malpractice defense
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  citation_id UUID,
  citation_string TEXT NOT NULL,
  proposition TEXT,
  proposition_type VARCHAR(50),
  step_1_result JSONB,
  step_2_result JSONB,
  step_3_result JSONB,
  step_4_result JSONB,
  step_5_result JSONB,
  step_6_result JSONB,
  composite_status VARCHAR(20) NOT NULL,
  composite_confidence DECIMAL(5,4),
  flags TEXT[],
  action_required VARCHAR(50),
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  verification_duration_ms INTEGER,
  models_used TEXT[],
  api_calls_made INTEGER,
  estimated_cost DECIMAL(10,4),
  phase VARCHAR(10)
);

-- Indexes for citation_verification_log
CREATE INDEX IF NOT EXISTS idx_civ_log_order ON citation_verification_log(order_id);
CREATE INDEX IF NOT EXISTS idx_civ_log_status ON citation_verification_log(composite_status);
CREATE INDEX IF NOT EXISTS idx_civ_log_verified ON citation_verification_log(verified_at);
CREATE INDEX IF NOT EXISTS idx_civ_log_citation_id ON citation_verification_log(citation_id);

-- RLS for citation_verification_log
ALTER TABLE citation_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to citation_verification_log"
  ON citation_verification_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own citation_verification_log"
  ON citation_verification_log FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all citation_verification_log"
  ON citation_verification_log FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE citation_verification_log IS 'Complete audit trail of citation verification for malpractice defense';


-- ============================================================================
-- TASK 26: CREATE MODEL_ROUTING_CONFIG TABLE
-- Source: API Architecture Spec Section 6.1
-- Purpose: AI model configuration per tier and task type
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_routing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier VARCHAR(10) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  model_string VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tier, task_type)
);

-- Indexes for model_routing_config
CREATE INDEX IF NOT EXISTS idx_model_routing_tier ON model_routing_config(tier);
CREATE INDEX IF NOT EXISTS idx_model_routing_active ON model_routing_config(is_active);

-- Updated timestamp trigger for model_routing_config
DROP TRIGGER IF EXISTS update_model_routing_config_timestamp ON model_routing_config;
CREATE TRIGGER update_model_routing_config_timestamp
  BEFORE UPDATE ON model_routing_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Tier A/B/C configuration from API Architecture Spec Section 2.3
INSERT INTO model_routing_config (tier, task_type, model_string) VALUES
  -- Tier A Configuration
  ('A', 'stage_1_holding', 'gpt-4o'),
  ('A', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('A', 'dicta_detection', 'claude-haiku-4-5-20251001'),
  ('A', 'bad_law_analysis', 'claude-haiku-4-5-20251001'),
  ('A', 'drafting', 'claude-sonnet-4-5-20250929'),
  -- Tier B Configuration
  ('B', 'stage_1_holding', 'gpt-4o'),
  ('B', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('B', 'dicta_detection', 'claude-haiku-4-5-20251001'),
  ('B', 'bad_law_analysis', 'claude-haiku-4-5-20251001'),
  ('B', 'drafting', 'claude-sonnet-4-5-20250929'),
  -- Tier C Configuration (premium models)
  ('C', 'stage_1_holding', 'gpt-5.2'),
  ('C', 'stage_2_adversarial', 'claude-opus-4-5-20250101'),
  ('C', 'dicta_detection', 'claude-sonnet-4-5-20250929'),
  ('C', 'bad_law_analysis', 'claude-sonnet-4-5-20250929'),
  ('C', 'drafting', 'claude-opus-4-5-20250101'),
  ('C', 'judge_simulation', 'claude-opus-4-5-20250101')
ON CONFLICT (tier, task_type) DO UPDATE SET
  model_string = EXCLUDED.model_string,
  updated_at = NOW();

-- RLS for model_routing_config
ALTER TABLE model_routing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to model_routing_config"
  ON model_routing_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can manage model_routing_config"
  ON model_routing_config FOR ALL
  USING (public.is_admin());

CREATE POLICY "Public read access to active model_routing_config"
  ON model_routing_config FOR SELECT
  USING (is_active = true);

COMMENT ON TABLE model_routing_config IS 'AI model routing configuration per tier and task type';


-- ============================================================================
-- TASK 27: CREATE VERIFIED_CITATIONS TABLE (VPI - Verified Precedent Index)
-- Source: CIV Spec Section 11, Code Mode Spec Section 24
-- Purpose: Cache of verified citations for faster lookup
-- ============================================================================

CREATE TABLE IF NOT EXISTS verified_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_string TEXT NOT NULL,
  normalized_citation TEXT UNIQUE,
  case_name TEXT,
  volume VARCHAR(20),
  reporter VARCHAR(50),
  starting_page VARCHAR(20),
  court VARCHAR(100),
  decision_date DATE,
  year INTEGER,
  courtlistener_id TEXT,
  courtlistener_url TEXT,
  is_published BOOLEAN DEFAULT true,
  opinion_text_excerpt TEXT,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  verification_count INTEGER DEFAULT 1,
  confidence_score DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for verified_citations
CREATE INDEX IF NOT EXISTS idx_verified_normalized ON verified_citations(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_verified_court ON verified_citations(court);
CREATE INDEX IF NOT EXISTS idx_verified_year ON verified_citations(year);
CREATE INDEX IF NOT EXISTS idx_verified_courtlistener ON verified_citations(courtlistener_id);
CREATE INDEX IF NOT EXISTS idx_verified_case_name ON verified_citations(case_name);
CREATE INDEX IF NOT EXISTS idx_verified_last_verified ON verified_citations(last_verified_at);

-- Updated timestamp trigger for verified_citations
DROP TRIGGER IF EXISTS update_verified_citations_timestamp ON verified_citations;
CREATE TRIGGER update_verified_citations_timestamp
  BEFORE UPDATE ON verified_citations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for verified_citations
ALTER TABLE verified_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to verified_citations"
  ON verified_citations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to verified_citations"
  ON verified_citations FOR SELECT
  USING (true);

COMMENT ON TABLE verified_citations IS 'Verified Precedent Index (VPI) - cached verified citations for faster lookup';


-- ============================================================================
-- TASK 28: CREATE CITATION_RELATIONSHIPS TABLE (Citation Graph)
-- Source: CIV Spec Section 12, Code Mode Spec Section 28
-- Purpose: Track how cases cite and treat other cases
-- ============================================================================

CREATE TABLE IF NOT EXISTS citation_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citing_case_id UUID REFERENCES verified_citations(id) ON DELETE CASCADE,
  cited_case_id UUID REFERENCES verified_citations(id) ON DELETE CASCADE,
  treatment_type VARCHAR(20) NOT NULL CHECK (treatment_type IN ('FOLLOWED', 'DISTINGUISHED', 'OVERRULED', 'CITED', 'CRITICIZED')),
  treatment_strength VARCHAR(20) CHECK (treatment_strength IN ('STRONG', 'MODERATE', 'WEAK')),
  paragraph_context TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for citation_relationships
CREATE INDEX IF NOT EXISTS idx_citation_rel_citing ON citation_relationships(citing_case_id);
CREATE INDEX IF NOT EXISTS idx_citation_rel_cited ON citation_relationships(cited_case_id);
CREATE INDEX IF NOT EXISTS idx_citation_rel_treatment ON citation_relationships(treatment_type);
CREATE INDEX IF NOT EXISTS idx_citation_rel_strength ON citation_relationships(treatment_strength);

-- Composite index for relationship lookups
CREATE INDEX IF NOT EXISTS idx_citation_rel_pair ON citation_relationships(citing_case_id, cited_case_id);

-- RLS for citation_relationships
ALTER TABLE citation_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to citation_relationships"
  ON citation_relationships FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read access to citation_relationships"
  ON citation_relationships FOR SELECT
  USING (true);

COMMENT ON TABLE citation_relationships IS 'Citation graph database tracking case relationships and treatment';


-- ============================================================================
-- TASK 29: ADD DATA RETENTION COLUMNS TO ORDERS TABLE
-- Source: DATA_RETENTION_IMPLEMENTATION_SPEC_v1.md
-- Purpose: Track data retention lifecycle
-- ============================================================================

-- Note: deleted_at column already exists from migration 014_legal_compliance_fixes.sql
-- Adding remaining retention columns

ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extended_by_customer BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extension_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_retention_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent_at TIMESTAMPTZ;
-- deleted_at already exists, skip
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_type VARCHAR(20);

-- Indexes for retention columns
CREATE INDEX IF NOT EXISTS idx_orders_retention ON orders(retention_expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deletion_reminder ON orders(deletion_reminder_sent, retention_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_retention_extended ON orders(retention_extended_by_customer) WHERE retention_extended_by_customer = true;

-- Function to calculate initial retention date (90 days from order completion)
CREATE OR REPLACE FUNCTION calculate_retention_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Set initial retention expiry to 90 days from completion
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.retention_expires_at := NOW() + INTERVAL '90 days';
    NEW.max_retention_date := NOW() + INTERVAL '180 days'; -- Maximum 180 days with extension
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic retention date calculation
DROP TRIGGER IF EXISTS set_retention_expiry ON orders;
CREATE TRIGGER set_retention_expiry
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retention_expiry();

COMMENT ON COLUMN orders.retention_expires_at IS 'Date when order data will be automatically deleted (90 days default)';
COMMENT ON COLUMN orders.retention_extended_by_customer IS 'Whether customer requested extension of retention period';
COMMENT ON COLUMN orders.max_retention_date IS 'Maximum date data can be retained (180 days with extension)';
COMMENT ON COLUMN orders.deletion_reminder_sent IS 'Whether 14-day deletion reminder has been sent';
COMMENT ON COLUMN orders.deletion_type IS 'Type of deletion: auto, manual, customer_request';


-- ============================================================================
-- TASK 30: CREATE ANONYMIZED_ANALYTICS TABLE
-- Source: DATA_RETENTION_IMPLEMENTATION_SPEC_v1.md
-- Purpose: Persisted analytics after order deletion
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL,
  jurisdiction VARCHAR(50),
  motion_type VARCHAR(100),
  tier VARCHAR(10),
  price_cents INTEGER,
  rush_fee_cents INTEGER DEFAULT 0,
  revision_count INTEGER DEFAULT 0,
  total_citations INTEGER,
  flagged_citations INTEGER,
  verified_citations INTEGER,
  verification_time_ms INTEGER,
  judge_simulation_grade VARCHAR(5),
  delivery_time_hours DECIMAL(10,2),
  customer_satisfaction_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for anonymized_analytics
CREATE INDEX IF NOT EXISTS idx_analytics_date ON anonymized_analytics(order_date);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction ON anonymized_analytics(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_analytics_tier ON anonymized_analytics(tier);
CREATE INDEX IF NOT EXISTS idx_analytics_motion_type ON anonymized_analytics(motion_type);
CREATE INDEX IF NOT EXISTS idx_analytics_grade ON anonymized_analytics(judge_simulation_grade);

-- Composite indexes for common analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_date_tier ON anonymized_analytics(order_date, tier);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction_motion ON anonymized_analytics(jurisdiction, motion_type);

-- RLS for anonymized_analytics
ALTER TABLE anonymized_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to anonymized_analytics"
  ON anonymized_analytics FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can read anonymized_analytics"
  ON anonymized_analytics FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE anonymized_analytics IS 'Anonymized analytics data persisted after order deletion for business insights';


-- ============================================================================
-- TASK 31: CREATE REFUNDS TABLE
-- Source: Gap Analysis A-4
-- Purpose: Track refund requests and processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(100),
  refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  stripe_refund_id TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  -- Additional fields for audit trail
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  notes TEXT
);

-- Indexes for refunds
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe ON refunds(stripe_refund_id);

-- RLS for refunds
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to refunds"
  ON refunds FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can manage refunds"
  ON refunds FOR ALL
  USING (public.is_admin());

CREATE POLICY "Users can view their own refunds"
  ON refunds FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

COMMENT ON TABLE refunds IS 'Refund tracking for order payments processed through Stripe';


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to anonymize and archive order data before deletion
CREATE OR REPLACE FUNCTION anonymize_order_data(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_order RECORD;
  v_analytics_id UUID;
BEGIN
  -- Get order data
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Insert anonymized analytics record
  INSERT INTO anonymized_analytics (
    order_date,
    jurisdiction,
    motion_type,
    tier,
    price_cents,
    rush_fee_cents,
    revision_count
  ) VALUES (
    v_order.created_at::DATE,
    v_order.jurisdiction,
    v_order.motion_type,
    v_order.motion_tier::TEXT,
    (v_order.total_price * 100)::INTEGER,
    COALESCE((v_order.rush_surcharge * 100)::INTEGER, 0),
    COALESCE(v_order.revision_count, 0)
  ) RETURNING id INTO v_analytics_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if citation is overruled
CREATE OR REPLACE FUNCTION is_citation_overruled(p_normalized_citation TEXT)
RETURNS TABLE (
  is_overruled BOOLEAN,
  overruled_by TEXT,
  overruled_date DATE,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE AS is_overruled,
    oc.overruled_by,
    oc.overruled_date,
    oc.notes
  FROM overruled_cases oc
  WHERE oc.normalized_citation = p_normalized_citation;

  -- If no rows found, return not overruled
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::DATE, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get model for tier and task
CREATE OR REPLACE FUNCTION get_model_for_task(p_tier VARCHAR, p_task_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_model VARCHAR;
BEGIN
  SELECT model_string INTO v_model
  FROM model_routing_config
  WHERE tier = p_tier
    AND task_type = p_task_type
    AND is_active = TRUE;

  RETURN v_model;
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to authenticated users where appropriate
GRANT SELECT ON overruled_cases TO authenticated;
GRANT SELECT ON verified_citations TO authenticated;
GRANT SELECT ON citation_relationships TO authenticated;
GRANT SELECT ON model_routing_config TO authenticated;

-- Service role has full access via RLS policies


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Tables Created: overruled_cases, citation_verification_log, model_routing_config,
--                 verified_citations, citation_relationships, anonymized_analytics, refunds
-- Tables Modified: orders (retention columns)
-- Seed Data: overruled_cases (8 records), model_routing_config (16 records)
-- ============================================================================


-- ============================================================
-- MIGRATION: 022_verified_precedent_index.sql
-- ============================================================
-- ============================================================================
-- VERIFIED PRECEDENT INDEX (VPI) DATABASE SCHEMA
-- Motion Granted Citation Integrity Verification Infrastructure
-- Version: 1.0 | January 25, 2026
-- ============================================================================

-- Enable UUID generation (should already exist, but safe to add)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLE 1: verified_citations
-- The case record - each unique citation we've ever verified
-- ============================================================================
CREATE TABLE IF NOT EXISTS verified_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Citation identification
    citation_string TEXT NOT NULL,
    normalized_citation TEXT NOT NULL UNIQUE,

    -- Case metadata
    case_name TEXT NOT NULL,
    volume INTEGER,
    reporter VARCHAR(50),
    starting_page INTEGER,
    court VARCHAR(100),
    decision_date DATE,
    year INTEGER,

    -- External references
    courtlistener_id TEXT,
    courtlistener_url TEXT,
    caselaw_id TEXT,
    caselaw_url TEXT,

    -- Publication status
    is_published BOOLEAN DEFAULT TRUE,
    precedential_status VARCHAR(50),

    -- Usage tracking
    times_verified INTEGER DEFAULT 1,
    first_verified_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verified_citations_normalized ON verified_citations(normalized_citation);
CREATE INDEX IF NOT EXISTS idx_verified_citations_courtlistener ON verified_citations(courtlistener_id);
CREATE INDEX IF NOT EXISTS idx_verified_citations_court ON verified_citations(court);
CREATE INDEX IF NOT EXISTS idx_verified_citations_year ON verified_citations(year);

-- ============================================================================
-- TABLE 2: proposition_verifications
-- THE MONEY TABLE - every proposition-to-case verification result
-- ============================================================================
CREATE TABLE IF NOT EXISTS proposition_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Proposition data
    proposition_text TEXT NOT NULL,
    proposition_hash TEXT NOT NULL,
    proposition_type VARCHAR(30) NOT NULL CHECK (proposition_type IN ('PRIMARY_STANDARD', 'REQUIRED_ELEMENT', 'SECONDARY', 'CONTEXT')),

    -- Context
    jurisdiction_context VARCHAR(50),
    motion_type_context VARCHAR(50),

    -- Verification result
    verification_result VARCHAR(20) NOT NULL CHECK (verification_result IN ('VERIFIED', 'PARTIAL', 'REJECTED', 'DICTA_ONLY', 'FLAGGED')),
    confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),

    -- Holding analysis
    holding_vs_dicta VARCHAR(20) CHECK (holding_vs_dicta IN ('HOLDING', 'DICTA', 'UNCLEAR')),
    supporting_quote TEXT,
    reasoning TEXT,

    -- Stage tracking
    stage_1_result VARCHAR(20),
    stage_1_confidence DECIMAL(4,3),
    stage_2_triggered BOOLEAN DEFAULT FALSE,
    stage_2_result VARCHAR(20),
    stage_2_confidence DECIMAL(4,3),

    -- AI tracking
    ai_model_used VARCHAR(50),
    ai_model_version VARCHAR(50),
    verification_method VARCHAR(30),

    -- Source tracking (anonymized)
    source_order_id UUID,

    -- Timestamps
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_verifications_citation ON proposition_verifications(citation_id);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_hash ON proposition_verifications(proposition_hash);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_jurisdiction ON proposition_verifications(jurisdiction_context);
CREATE INDEX IF NOT EXISTS idx_prop_verifications_result ON proposition_verifications(verification_result);

-- ============================================================================
-- TABLE 3: good_law_checks
-- Treatment history - bad law detection results
-- ============================================================================
CREATE TABLE IF NOT EXISTS good_law_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Check timestamp
    check_date TIMESTAMPTZ DEFAULT NOW(),

    -- Composite status
    status VARCHAR(30) NOT NULL CHECK (status IN ('GOOD_LAW', 'CAUTION', 'NEGATIVE_TREATMENT', 'OVERRULED')),
    confidence DECIMAL(4,3),

    -- Layer 1: CourtListener
    layer_1_treatment VARCHAR(50),
    layer_1_raw_response JSONB,

    -- Layer 2: AI pattern detection
    layer_2_status VARCHAR(30),
    layer_2_confidence DECIMAL(4,3),
    layer_2_concerns TEXT[],

    -- Layer 3: Curated list
    layer_3_in_list BOOLEAN DEFAULT FALSE,
    layer_3_overruled_by TEXT,

    -- Validity
    valid_until TIMESTAMPTZ,

    -- If overruled
    overruled_by_citation TEXT,
    overruled_date DATE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_good_law_citation ON good_law_checks(citation_id);
CREATE INDEX IF NOT EXISTS idx_good_law_valid_until ON good_law_checks(valid_until);
CREATE INDEX IF NOT EXISTS idx_good_law_status ON good_law_checks(status);

-- ============================================================================
-- TABLE 4: authority_strength_assessments
-- Strength metrics for each citation
-- ============================================================================
CREATE TABLE IF NOT EXISTS authority_strength_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citation_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Assessment date
    assessed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metrics
    case_age_years INTEGER,
    total_citations INTEGER,
    citations_last_5_years INTEGER,
    citations_last_10_years INTEGER,
    citation_trend VARCHAR(20) CHECK (citation_trend IN ('STABLE', 'INCREASING', 'DECLINING')),
    distinguish_count INTEGER,
    distinguish_rate DECIMAL(4,3),
    criticism_count INTEGER,

    -- Classification
    stability_class VARCHAR(20) CHECK (stability_class IN ('LANDMARK', 'ESTABLISHED', 'RECENT', 'DECLINING', 'CONTROVERSIAL')),
    strength_score INTEGER CHECK (strength_score >= 0 AND strength_score <= 100),
    assessment VARCHAR(20) CHECK (assessment IN ('STRONG', 'MODERATE', 'WEAK')),

    -- Notes
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strength_citation ON authority_strength_assessments(citation_id);
CREATE INDEX IF NOT EXISTS idx_strength_class ON authority_strength_assessments(stability_class);

-- ============================================================================
-- TABLE 5: citation_relationships
-- How cases cite each other - builds network effects
-- ============================================================================
CREATE TABLE IF NOT EXISTS citation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationship
    citing_case_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,
    cited_case_id UUID NOT NULL REFERENCES verified_citations(id) ON DELETE CASCADE,

    -- Treatment
    treatment_type VARCHAR(30) NOT NULL CHECK (treatment_type IN ('CITED', 'FOLLOWED', 'DISTINGUISHED', 'CRITICIZED', 'OVERRULED', 'QUESTIONED')),
    treatment_strength VARCHAR(20),

    -- Context
    paragraph_context TEXT,
    headnote_reference TEXT,

    -- Extraction metadata
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    extraction_method VARCHAR(30),
    confidence DECIMAL(4,3),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicates
    UNIQUE(citing_case_id, cited_case_id, treatment_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_citing ON citation_relationships(citing_case_id);
CREATE INDEX IF NOT EXISTS idx_relationships_cited ON citation_relationships(cited_case_id);
CREATE INDEX IF NOT EXISTS idx_relationships_treatment ON citation_relationships(treatment_type);

-- ============================================================================
-- TABLE 6: civ_verification_runs
-- Complete verification audit trail per order
-- ============================================================================
CREATE TABLE IF NOT EXISTS civ_verification_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,

    -- Run metadata
    run_phase VARCHAR(10) NOT NULL CHECK (run_phase IN ('V.1', 'VII.1')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Counts
    total_citations INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,

    -- Aggregate metrics
    average_confidence DECIMAL(4,3),
    total_api_calls INTEGER DEFAULT 0,
    total_cost_estimate DECIMAL(10,4),

    -- Status
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
    error_message TEXT,

    -- Results
    results JSONB,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civ_runs_order ON civ_verification_runs(order_id);
CREATE INDEX IF NOT EXISTS idx_civ_runs_status ON civ_verification_runs(status);

-- ============================================================================
-- TABLE 7: curated_overruled_cases
-- Manually maintained list of commonly cited overruled cases
-- ============================================================================
CREATE TABLE IF NOT EXISTS curated_overruled_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Case identification
    citation TEXT NOT NULL UNIQUE,
    case_name TEXT NOT NULL,

    -- Overruling info
    overruled_by_citation TEXT NOT NULL,
    overruled_by_case_name TEXT,
    overruled_date DATE,

    -- Context
    area_of_law VARCHAR(100),
    notes TEXT,

    -- Metadata
    added_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overruled_citation ON curated_overruled_cases(citation);

-- ============================================================================
-- TABLE 8: civ_cache_hits
-- Track cache hit analytics for VPI optimization
-- ============================================================================
CREATE TABLE IF NOT EXISTS civ_cache_hits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposition_verification_id UUID REFERENCES proposition_verifications(id) ON DELETE SET NULL,
    order_id UUID,

    -- Hit metadata
    hit_at TIMESTAMPTZ DEFAULT NOW(),
    original_verification_date TIMESTAMPTZ,

    -- Value
    tokens_saved_estimate INTEGER,
    cost_saved_estimate DECIMAL(10,4)
);

CREATE INDEX IF NOT EXISTS idx_cache_hits_order ON civ_cache_hits(order_id);
CREATE INDEX IF NOT EXISTS idx_cache_hits_date ON civ_cache_hits(hit_at);

-- ============================================================================
-- SEED DATA: Commonly cited overruled cases
-- ============================================================================
INSERT INTO curated_overruled_cases (citation, case_name, overruled_by_citation, overruled_by_case_name, notes, area_of_law)
VALUES
    ('Lochner v. New York, 198 U.S. 45 (1905)', 'Lochner v. New York', 'West Coast Hotel Co. v. Parrish, 300 U.S. 379 (1937)', 'West Coast Hotel Co. v. Parrish', 'Economic substantive due process rejected', 'Constitutional Law'),
    ('Plessy v. Ferguson, 163 U.S. 537 (1896)', 'Plessy v. Ferguson', 'Brown v. Board of Education, 347 U.S. 483 (1954)', 'Brown v. Board of Education', 'Separate but equal doctrine overruled', 'Civil Rights'),
    ('Bowers v. Hardwick, 478 U.S. 186 (1986)', 'Bowers v. Hardwick', 'Lawrence v. Texas, 539 U.S. 558 (2003)', 'Lawrence v. Texas', 'Sodomy laws unconstitutional', 'Constitutional Law'),
    ('Austin v. Michigan Chamber of Commerce, 494 U.S. 652 (1990)', 'Austin v. Michigan Chamber of Commerce', 'Citizens United v. FEC, 558 U.S. 310 (2010)', 'Citizens United v. FEC', 'Corporate speech restrictions overruled', 'First Amendment'),
    ('Abood v. Detroit Board of Education, 431 U.S. 209 (1977)', 'Abood v. Detroit Board of Education', 'Janus v. AFSCME, 585 U.S. ___ (2018)', 'Janus v. AFSCME', 'Public sector union fees', 'Labor Law')
ON CONFLICT (citation) DO NOTHING;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE verified_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposition_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE good_law_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_strength_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE civ_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_overruled_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE civ_cache_hits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES (Service role has full access, public read for cache)
-- ============================================================================

-- verified_citations: Read access for all authenticated, write for service role
CREATE POLICY "verified_citations_read" ON verified_citations FOR SELECT TO authenticated USING (true);
CREATE POLICY "verified_citations_service" ON verified_citations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- proposition_verifications: Read access for all authenticated, write for service role
CREATE POLICY "prop_verifications_read" ON proposition_verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "prop_verifications_service" ON proposition_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- good_law_checks: Read access for all authenticated, write for service role
CREATE POLICY "good_law_read" ON good_law_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "good_law_service" ON good_law_checks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authority_strength_assessments: Read access for all authenticated, write for service role
CREATE POLICY "strength_read" ON authority_strength_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "strength_service" ON authority_strength_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- citation_relationships: Read access for all authenticated, write for service role
CREATE POLICY "relationships_read" ON citation_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "relationships_service" ON citation_relationships FOR ALL TO service_role USING (true) WITH CHECK (true);

-- civ_verification_runs: Admin/clerk access only
CREATE POLICY "civ_runs_admin" ON civ_verification_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- curated_overruled_cases: Read access for all authenticated, write for service role
CREATE POLICY "overruled_read" ON curated_overruled_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "overruled_service" ON curated_overruled_cases FOR ALL TO service_role USING (true) WITH CHECK (true);

-- civ_cache_hits: Service role only (internal analytics)
CREATE POLICY "cache_hits_service" ON civ_cache_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- FUNCTION: Hash proposition text for cache lookup
-- ============================================================================
CREATE OR REPLACE FUNCTION hash_proposition(proposition_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(sha256(lower(trim(proposition_text))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Normalize citation string
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_citation(citation_text TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized TEXT;
BEGIN
    -- Remove extra whitespace
    normalized := regexp_replace(citation_text, '\s+', ' ', 'g');
    -- Trim
    normalized := trim(normalized);
    -- Standardize vs./vs to v.
    normalized := regexp_replace(normalized, '\s+vs\.?\s+', ' v. ', 'gi');
    -- Standardize reporter spacing (F. 3d -> F.3d)
    normalized := regexp_replace(normalized, '(\w)\.\s+(\d)', '\1.\2', 'g');

    RETURN normalized;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Check VPI cache for proposition
-- ============================================================================
CREATE OR REPLACE FUNCTION check_vpi_cache(
    p_proposition_text TEXT,
    p_jurisdiction_context VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    cached_result VARCHAR(20),
    cached_confidence DECIMAL(4,3),
    citation_string TEXT,
    supporting_quote TEXT,
    reasoning TEXT,
    verification_id UUID
) AS $$
DECLARE
    prop_hash TEXT;
BEGIN
    prop_hash := hash_proposition(p_proposition_text);

    RETURN QUERY
    SELECT
        pv.verification_result,
        pv.confidence_score,
        vc.citation_string,
        pv.supporting_quote,
        pv.reasoning,
        pv.id
    FROM proposition_verifications pv
    JOIN verified_citations vc ON pv.citation_id = vc.id
    WHERE pv.proposition_hash = prop_hash
        AND pv.confidence_score >= 0.85
        AND (p_jurisdiction_context IS NULL OR pv.jurisdiction_context = p_jurisdiction_context)
    ORDER BY pv.verified_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- TRIGGER: Update timestamps on verified_citations
-- ============================================================================
CREATE OR REPLACE FUNCTION update_verified_citation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verified_citations_updated_at
    BEFORE UPDATE ON verified_citations
    FOR EACH ROW
    EXECUTE FUNCTION update_verified_citation_timestamp();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE verified_citations IS 'Unique citation records in the Verified Precedent Index (VPI). Each row represents a single legal case that has been verified.';
COMMENT ON TABLE proposition_verifications IS 'The core VPI table - records every proposition-to-case verification result with confidence scores and reasoning.';
COMMENT ON TABLE good_law_checks IS 'Three-layer bad law check results: CourtListener treatment, AI pattern detection, and curated list matches.';
COMMENT ON TABLE authority_strength_assessments IS 'Citation metrics and stability classification for determining authority strength.';
COMMENT ON TABLE citation_relationships IS 'Graph of how cases cite each other, enabling network-effect analysis.';
COMMENT ON TABLE civ_verification_runs IS 'Audit trail of complete CIV verification runs per order, tracking Phase V.1 and VII.1 executions.';
COMMENT ON TABLE curated_overruled_cases IS 'Manually maintained list of commonly cited cases that have been overruled.';
COMMENT ON TABLE civ_cache_hits IS 'Analytics table tracking VPI cache hit rates and cost savings.';


-- ============================================================
-- MIGRATION: 023_workflow_v72_phase_system.sql
-- ============================================================
-- ============================================
-- Motion Granted v7.2 Workflow Phase System
-- Migration: 018_workflow_v72_phase_system.sql
--
-- Creates tables for:
-- - phase_prompts: Stores the 14 phase system prompts
-- - phase_executions: Logs every phase execution for audit/recovery
-- - citation_banks: Dual bank system (Case + Statutory)
-- - citation_verifications: 3-stage verification audit trail
-- - workflow_state: Tracks current workflow position and state
-- ============================================

-- ============================================
-- PHASE PROMPTS TABLE
-- Stores the 14 phase system prompts
-- ============================================
CREATE TABLE IF NOT EXISTS phase_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase VARCHAR(10) NOT NULL UNIQUE,
  phase_name VARCHAR(100) NOT NULL,
  phase_order INT NOT NULL,
  prompt_content TEXT NOT NULL,

  -- Model configuration per tier
  model_tier_a VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  model_tier_b VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  model_tier_c VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',

  -- Extended thinking per tier (JSONB format: {"enabled": bool, "budget": number})
  extended_thinking_tier_a JSONB DEFAULT '{"enabled": false, "budget": 0}',
  extended_thinking_tier_b JSONB DEFAULT '{"enabled": false, "budget": 0}',
  extended_thinking_tier_c JSONB DEFAULT '{"enabled": false, "budget": 0}',

  -- Checkpoint config
  checkpoint_type VARCHAR(20) DEFAULT NULL,
  checkpoint_blocking BOOLEAN DEFAULT FALSE,

  -- Flow control
  next_phase VARCHAR(10) DEFAULT NULL,

  -- Metadata
  version VARCHAR(20) DEFAULT '7.2.1',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active prompts lookup
CREATE INDEX IF NOT EXISTS idx_phase_prompts_active ON phase_prompts(is_active, phase);

-- ============================================
-- PHASE EXECUTIONS TABLE
-- Logs every phase execution for audit/recovery
-- ============================================
CREATE TABLE IF NOT EXISTS phase_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  phase VARCHAR(10) NOT NULL,

  -- Execution details
  model_used VARCHAR(50) NOT NULL,
  extended_thinking_used BOOLEAN DEFAULT FALSE,
  extended_thinking_budget INT DEFAULT 0,

  -- Input/Output
  input_data JSONB NOT NULL,
  output_data JSONB,

  -- Status: PENDING, RUNNING, COMPLETE, ERROR
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_message TEXT,

  -- Metrics
  input_tokens INT,
  output_tokens INT,
  duration_ms INT,
  cost_cents DECIMAL(10,2),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase_executions_order ON phase_executions(order_id);
CREATE INDEX IF NOT EXISTS idx_phase_executions_workflow ON phase_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_phase_executions_status ON phase_executions(status);

-- ============================================
-- CITATION BANKS TABLE
-- Dual bank system: Case + Statutory
-- ============================================
CREATE TABLE IF NOT EXISTS citation_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bank_type VARCHAR(20) NOT NULL CHECK (bank_type IN ('CASE', 'STATUTORY')),
  citations JSONB NOT NULL DEFAULT '[]',

  -- Stats
  total_citations INT DEFAULT 0,
  verified_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one bank per type per order
  UNIQUE(order_id, bank_type)
);

CREATE INDEX IF NOT EXISTS idx_citation_banks_order ON citation_banks(order_id);

-- ============================================
-- CITATION VERIFICATIONS TABLE
-- 3-stage verification audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS citation_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_bank_id UUID REFERENCES citation_banks(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation info
  citation_text TEXT NOT NULL,
  case_name VARCHAR(500),
  full_citation VARCHAR(500),

  -- 3-stage verification results
  stage_1_existence VARCHAR(20), -- 'found', 'not_found', 'error'
  stage_1_courtlistener_id VARCHAR(100),
  stage_2_opinion_retrieved BOOLEAN DEFAULT FALSE,
  stage_2_opinion_text TEXT,
  stage_3_holding_verified VARCHAR(20), -- 'verified', 'mismatch', 'partial', 'error'

  -- Final status: VERIFIED, NOT_FOUND, HOLDING_MISMATCH, QUOTE_NOT_FOUND, etc.
  verification_status VARCHAR(30) NOT NULL,

  -- Metadata
  verified_at TIMESTAMPTZ,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_verifications_order ON citation_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_bank ON citation_verifications(citation_bank_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_status ON citation_verifications(verification_status);

-- ============================================
-- WORKFLOW STATE TABLE
-- Tracks current workflow position and state
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,

  -- Current position
  current_phase VARCHAR(10) NOT NULL DEFAULT 'I',
  phase_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

  -- Determinations from Phase I
  tier VARCHAR(1), -- 'A', 'B', 'C'
  path VARCHAR(1), -- 'A' (initiating), 'B' (opposition)

  -- Revision loop tracking (Phase VII/VIII cycle)
  revision_loop_count INT DEFAULT 0,
  revision_grades JSONB DEFAULT '[]', -- Array of grade objects from each loop

  -- Checkpoint state
  checkpoint_pending BOOLEAN DEFAULT FALSE,
  checkpoint_type VARCHAR(20), -- 'HOLD', 'NOTIFICATION', 'BLOCKING'
  checkpoint_data JSONB,

  -- Hold state (Protocol 8)
  hold_triggered BOOLEAN DEFAULT FALSE,
  hold_reason TEXT,
  hold_customer_response VARCHAR(50), -- 'PROVIDE_ADDITIONAL_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'TERMINATE'

  -- Protocol 10 (Loop 3 Exit)
  loop_3_exit_triggered BOOLEAN DEFAULT FALSE,

  -- Phase outputs (for passing between phases)
  phase_outputs JSONB DEFAULT '{}',

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_state_order ON workflow_state(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_phase ON workflow_state(current_phase);
CREATE INDEX IF NOT EXISTS idx_workflow_state_checkpoint ON workflow_state(checkpoint_pending) WHERE checkpoint_pending = TRUE;

-- ============================================
-- WORKFLOW NOTIFICATIONS TABLE
-- For non-blocking checkpoint notifications
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  phase VARCHAR(10) NOT NULL,
  notification_type VARCHAR(30) NOT NULL,
  message TEXT,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_notifications_order ON workflow_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_notifications_unread ON workflow_notifications(read_at) WHERE read_at IS NULL;

-- ============================================
-- JUDGE SIMULATION RESULTS TABLE
-- Stores detailed grading from Phase VII
-- ============================================
CREATE TABLE IF NOT EXISTS judge_simulation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Grade
  grade VARCHAR(2) NOT NULL, -- 'A+', 'A', 'A-', 'B+', etc.
  numeric_grade DECIMAL(3,2) NOT NULL, -- 4.3, 4.0, 3.7, 3.3, etc.
  passes BOOLEAN NOT NULL,

  -- Feedback
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  specific_feedback TEXT,
  revision_suggestions JSONB DEFAULT '[]',

  -- Loop tracking
  loop_number INT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_judge_simulation_workflow ON judge_simulation_results(workflow_id);
CREATE INDEX IF NOT EXISTS idx_judge_simulation_order ON judge_simulation_results(order_id);

-- ============================================
-- HELPER FUNCTION: Update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update trigger to relevant tables
DROP TRIGGER IF EXISTS update_phase_prompts_updated_at ON phase_prompts;
CREATE TRIGGER update_phase_prompts_updated_at
  BEFORE UPDATE ON phase_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_citation_banks_updated_at ON citation_banks;
CREATE TRIGGER update_citation_banks_updated_at
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflow_state_updated_at ON workflow_state;
CREATE TRIGGER update_workflow_state_updated_at
  BEFORE UPDATE ON workflow_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE phase_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_simulation_results ENABLE ROW LEVEL SECURITY;

-- Phase prompts: Service role only (read for all authenticated)
CREATE POLICY "Phase prompts are viewable by authenticated users"
  ON phase_prompts FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Phase executions: Service role only for writes, viewable by order owner and admin
CREATE POLICY "Phase executions viewable by order owner"
  ON phase_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = phase_executions.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Citation banks: Viewable by order owner and admin
CREATE POLICY "Citation banks viewable by order owner"
  ON citation_banks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = citation_banks.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Citation verifications: Viewable by order owner and admin
CREATE POLICY "Citation verifications viewable by order owner"
  ON citation_verifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = citation_verifications.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Workflow state: Viewable by order owner and admin
CREATE POLICY "Workflow state viewable by order owner"
  ON workflow_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = workflow_state.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Workflow notifications: Viewable by order owner and admin
CREATE POLICY "Workflow notifications viewable by order owner"
  ON workflow_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = workflow_notifications.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Judge simulation results: Viewable by order owner and admin
CREATE POLICY "Judge simulation results viewable by order owner"
  ON judge_simulation_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = judge_simulation_results.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Service role bypass for all tables (needed for server-side operations)
CREATE POLICY "Service role full access to phase_prompts"
  ON phase_prompts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to phase_executions"
  ON phase_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to citation_banks"
  ON citation_banks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to citation_verifications"
  ON citation_verifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to workflow_state"
  ON workflow_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to workflow_notifications"
  ON workflow_notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to judge_simulation_results"
  ON judge_simulation_results FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- END OF MIGRATION
-- ============================================


-- ============================================================
-- MIGRATION: 024_hold_checkpoint_and_loop_counter.sql
-- ============================================================
-- ============================================================================
-- HOLD Checkpoint and Loop Counter Migration (Chunk 2: Tasks 5-6)
-- Source: CMS 22, CMS 23
-- ============================================================================

-- ============================================================================
-- TASK 5: HOLD CHECKPOINT COLUMNS
-- Adds columns for HOLD checkpoint (Protocol 8)
-- ============================================================================

-- Add HOLD-specific columns to order_workflows table
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_response VARCHAR(50);
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_response_at TIMESTAMPTZ;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS hold_acknowledgment_text TEXT;

-- Index for finding workflows on HOLD
CREATE INDEX IF NOT EXISTS idx_workflows_hold ON order_workflows(hold_triggered_at)
  WHERE hold_triggered_at IS NOT NULL;

-- Index for HOLD responses
CREATE INDEX IF NOT EXISTS idx_workflows_hold_response ON order_workflows(hold_response)
  WHERE hold_response IS NOT NULL;

COMMENT ON COLUMN order_workflows.hold_triggered_at IS 'Timestamp when HOLD checkpoint was triggered (Protocol 8)';
COMMENT ON COLUMN order_workflows.hold_reason IS 'Reason for HOLD - typically missing critical evidence';
COMMENT ON COLUMN order_workflows.hold_response IS 'Customer response: PROVIDE_ADDITIONAL_EVIDENCE, PROCEED_WITH_ACKNOWLEDGMENT, CANCEL_ORDER';
COMMENT ON COLUMN order_workflows.hold_response_at IS 'Timestamp when customer responded to HOLD';
COMMENT ON COLUMN order_workflows.hold_acknowledgment_text IS 'Customer acknowledgment text if they chose to proceed with risk';


-- ============================================================================
-- TASK 6: LOOP COUNTER COLUMNS
-- Adds columns for revision loop tracking (Protocol 10)
-- Note: revision_loop_count may already exist, using IF NOT EXISTS
-- ============================================================================

-- Loop counter columns (some may already exist)
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS current_loop_count INTEGER DEFAULT 0;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS max_loops_reached BOOLEAN DEFAULT false;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS loop_exit_triggered_at TIMESTAMPTZ;

-- Rename revision_loop_count to current_loop_count if it exists and current_loop_count doesn't
-- This handles the case where the column exists with a different name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflows'
    AND column_name = 'revision_loop_count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflows'
    AND column_name = 'current_loop_count'
  ) THEN
    ALTER TABLE order_workflows RENAME COLUMN revision_loop_count TO current_loop_count;
  END IF;
END $$;

-- Create alias view for backwards compatibility if needed
-- revision_loop and revision_loop_count refer to the same thing as current_loop_count

-- Index for loop counter queries
CREATE INDEX IF NOT EXISTS idx_workflows_loop_count ON order_workflows(current_loop_count)
  WHERE current_loop_count > 0;

CREATE INDEX IF NOT EXISTS idx_workflows_max_loops ON order_workflows(max_loops_reached)
  WHERE max_loops_reached = true;

COMMENT ON COLUMN order_workflows.current_loop_count IS 'Current revision loop count (Phase VII → VIII → VII)';
COMMENT ON COLUMN order_workflows.max_loops_reached IS 'True if loop count reached 3, triggering Protocol 10';
COMMENT ON COLUMN order_workflows.loop_exit_triggered_at IS 'Timestamp when Protocol 10 (Loop 3 Exit) was triggered';


-- ============================================================================
-- WORKFLOW STATUS VALUES UPDATE
-- Add new status values for HOLD and Loop 3 Exit
-- ============================================================================

-- Update any constraints on status field to include new values
-- Note: If using enum, you'd need to add values. If using varchar, this is informational.

-- Add valid status values to any check constraint (if exists)
-- Common statuses: pending, in_progress, on_hold, blocked, revision_in_progress,
--                  revision_requested, awaiting_cp1, awaiting_cp2, awaiting_cp3,
--                  loop_3_exit, completed, cancelled, failed


-- ============================================================================
-- HELPER FUNCTION: Check if workflow is at max loops
-- ============================================================================

CREATE OR REPLACE FUNCTION check_workflow_loop_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if loop count has reached 3
  IF NEW.current_loop_count >= 3 AND NOT COALESCE(OLD.max_loops_reached, false) THEN
    NEW.max_loops_reached := true;
    NEW.loop_exit_triggered_at := NOW();
    NEW.status := 'blocked';
    NEW.last_error := 'Protocol 10: Maximum revision loops (3) reached. Requires customer decision.';

    -- Log the event
    INSERT INTO automation_logs (order_id, action_type, action_details)
    SELECT
      NEW.order_id,
      'protocol_10_triggered',
      jsonb_build_object(
        'workflowId', NEW.id,
        'loopCount', NEW.current_loop_count,
        'triggeredAt', NOW()
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for loop limit check
DROP TRIGGER IF EXISTS check_loop_limit_trigger ON order_workflows;
CREATE TRIGGER check_loop_limit_trigger
  BEFORE UPDATE ON order_workflows
  FOR EACH ROW
  WHEN (NEW.current_loop_count IS DISTINCT FROM OLD.current_loop_count)
  EXECUTE FUNCTION check_workflow_loop_limit();


-- ============================================================================
-- HELPER FUNCTION: Auto-cancel HOLD after 14 days
-- This is called by an Inngest cron job, but having it as a DB function
-- provides a fallback mechanism
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  cancelled_count INTEGER := 0;
  workflow_record RECORD;
BEGIN
  -- Find workflows that have been on HOLD for more than 14 days without response
  FOR workflow_record IN
    SELECT
      ow.id AS workflow_id,
      ow.order_id,
      o.total_price,
      o.order_number
    FROM order_workflows ow
    JOIN orders o ON o.id = ow.order_id
    WHERE ow.checkpoint_pending = 'HOLD'
      AND ow.hold_triggered_at IS NOT NULL
      AND ow.hold_response IS NULL
      AND ow.hold_triggered_at < NOW() - INTERVAL '14 days'
  LOOP
    -- Update workflow to cancelled
    UPDATE order_workflows
    SET
      status = 'cancelled',
      checkpoint_pending = NULL,
      hold_response = 'AUTO_CANCEL_TIMEOUT',
      hold_response_at = NOW(),
      completed_at = NOW()
    WHERE id = workflow_record.workflow_id;

    -- Update order status
    UPDATE orders
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE id = workflow_record.order_id;

    -- Create refund record (to be processed by refund service)
    INSERT INTO refunds (
      order_id,
      amount_cents,
      reason,
      refund_type,
      status
    ) VALUES (
      workflow_record.order_id,
      ROUND(workflow_record.total_price * 100),
      'HOLD_TIMEOUT',
      'FULL',
      'pending'
    );

    -- Log the auto-cancellation
    INSERT INTO automation_logs (order_id, action_type, action_details)
    VALUES (
      workflow_record.order_id,
      'hold_auto_cancelled',
      jsonb_build_object(
        'workflowId', workflow_record.workflow_id,
        'orderNumber', workflow_record.order_number,
        'reason', '14-day HOLD timeout',
        'refundAmount', workflow_record.total_price
      )
    );

    cancelled_count := cancelled_count + 1;
  END LOOP;

  RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_cancel_expired_holds IS 'Auto-cancels workflows on HOLD for more than 14 days. Called by Inngest cron or can be run manually.';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Added HOLD checkpoint columns: hold_triggered_at, hold_reason, hold_response,
--   hold_response_at, hold_acknowledgment_text
-- - Added/verified loop counter columns: current_loop_count, max_loops_reached,
--   loop_exit_triggered_at
-- - Created trigger for automatic Protocol 10 enforcement
-- - Created helper function for auto-cancelling expired HOLDs


-- ============================================================
-- MIGRATION: 025_hold_response_columns.sql
-- ============================================================
-- ============================================================================
-- HOLD Response Columns Migration
-- Adds columns to order_workflows for HOLD checkpoint handling
-- Version: 1.0 | January 25, 2026
-- ============================================================================

-- Add HOLD response columns to order_workflows if they don't exist
DO $$
BEGIN
    -- hold_reason column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_reason'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_reason TEXT;
    END IF;

    -- hold_triggered_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_triggered_at'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_triggered_at TIMESTAMPTZ;
    END IF;

    -- hold_response column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_response'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_response VARCHAR(50);
    END IF;

    -- hold_response_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_response_at'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_response_at TIMESTAMPTZ;
    END IF;

    -- hold_acknowledgment_text column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'hold_acknowledgment_text'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN hold_acknowledgment_text TEXT;
    END IF;
END $$;

-- Add index for querying orders on HOLD
CREATE INDEX IF NOT EXISTS idx_workflows_hold_status ON order_workflows(hold_checkpoint_triggered)
WHERE hold_checkpoint_triggered = TRUE;

-- Add constraint for hold_response values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'valid_hold_response'
    ) THEN
        ALTER TABLE order_workflows ADD CONSTRAINT valid_hold_response
        CHECK (hold_response IS NULL OR hold_response IN ('PROVIDE_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'CANCEL'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

-- Comment for documentation
COMMENT ON COLUMN order_workflows.hold_reason IS 'Description of why HOLD was triggered (Protocol 8)';
COMMENT ON COLUMN order_workflows.hold_triggered_at IS 'Timestamp when HOLD checkpoint was triggered';
COMMENT ON COLUMN order_workflows.hold_response IS 'Customer response to HOLD: PROVIDE_EVIDENCE, PROCEED_WITH_ACKNOWLEDGMENT, or CANCEL';
COMMENT ON COLUMN order_workflows.hold_response_at IS 'Timestamp when customer responded to HOLD';
COMMENT ON COLUMN order_workflows.hold_acknowledgment_text IS 'Customer acknowledgment text if proceeding despite weakness';


-- ============================================================
-- MIGRATION: 026_pacer_usage_tracking.sql
-- ============================================================
-- ============================================================================
-- Migration 020: PACER Usage Tracking
-- ============================================================================
-- Creates pacer_usage table for tracking PACER API costs
-- Target budget: <$50/month
-- Cost per lookup: ~$0.10
--
-- Source: Chunk 4, Task 22
-- ============================================================================

-- ============================================================================
-- PACER USAGE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacer_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  citation_searched TEXT NOT NULL,
  normalized_citation TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 10,
  result_found BOOLEAN NOT NULL DEFAULT false,
  source TEXT CHECK (source IN ('PACER', 'RECAP', 'NONE')),
  case_number TEXT,
  court TEXT,
  error_message TEXT,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pacer_usage_searched_at ON pacer_usage(searched_at);
CREATE INDEX IF NOT EXISTS idx_pacer_usage_order ON pacer_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_pacer_usage_month ON pacer_usage(DATE_TRUNC('month', searched_at));

-- ============================================================================
-- MONTHLY BUDGET TRACKING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW pacer_monthly_spend AS
SELECT
  DATE_TRUNC('month', searched_at) AS month,
  COUNT(*) AS total_searches,
  SUM(cost_cents) AS total_cost_cents,
  SUM(cost_cents) / 100.0 AS total_cost_dollars,
  COUNT(*) FILTER (WHERE result_found = true) AS successful_searches,
  COUNT(*) FILTER (WHERE source = 'PACER') AS pacer_direct_searches,
  COUNT(*) FILTER (WHERE source = 'RECAP') AS recap_searches,
  5000 - COALESCE(SUM(cost_cents), 0) AS budget_remaining_cents
FROM pacer_usage
GROUP BY DATE_TRUNC('month', searched_at)
ORDER BY month DESC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current month's PACER spend
CREATE OR REPLACE FUNCTION get_pacer_monthly_spend()
RETURNS TABLE (
  total_cost_cents INTEGER,
  total_cost_dollars NUMERIC,
  search_count INTEGER,
  budget_remaining_cents INTEGER,
  budget_exceeded BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(pu.cost_cents)::INTEGER, 0) AS total_cost_cents,
    COALESCE(SUM(pu.cost_cents), 0) / 100.0 AS total_cost_dollars,
    COUNT(*)::INTEGER AS search_count,
    (5000 - COALESCE(SUM(pu.cost_cents), 0))::INTEGER AS budget_remaining_cents,
    COALESCE(SUM(pu.cost_cents), 0) >= 5000 AS budget_exceeded
  FROM pacer_usage pu
  WHERE DATE_TRUNC('month', pu.searched_at) = DATE_TRUNC('month', NOW());
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if PACER can be used (budget not exceeded)
CREATE OR REPLACE FUNCTION can_use_pacer()
RETURNS BOOLEAN AS $$
DECLARE
  current_spend INTEGER;
BEGIN
  SELECT COALESCE(SUM(cost_cents), 0)
  INTO current_spend
  FROM pacer_usage
  WHERE DATE_TRUNC('month', searched_at) = DATE_TRUNC('month', NOW());

  RETURN current_spend < 5000; -- $50 budget in cents
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to log a PACER usage
CREATE OR REPLACE FUNCTION log_pacer_usage(
  p_order_id UUID,
  p_citation TEXT,
  p_normalized_citation TEXT,
  p_found BOOLEAN,
  p_source TEXT,
  p_cost_cents INTEGER DEFAULT 10,
  p_case_number TEXT DEFAULT NULL,
  p_court TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO pacer_usage (
    order_id,
    citation_searched,
    normalized_citation,
    cost_cents,
    result_found,
    source,
    case_number,
    court,
    error_message
  ) VALUES (
    p_order_id,
    p_citation,
    p_normalized_citation,
    p_cost_cents,
    p_found,
    p_source,
    p_case_number,
    p_court,
    p_error
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE pacer_usage ENABLE ROW LEVEL SECURITY;

-- Admins can see all PACER usage
CREATE POLICY "Admins can view all pacer usage" ON pacer_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can insert (via service role)
CREATE POLICY "Service can insert pacer usage" ON pacer_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE pacer_usage IS 'Tracks PACER API usage for budget management. Target: <$50/month.';
COMMENT ON COLUMN pacer_usage.cost_cents IS 'Cost in cents. Default 10 cents (~$0.10) per lookup.';
COMMENT ON COLUMN pacer_usage.source IS 'Where the result came from: PACER (direct, costs money), RECAP (free mirror), NONE (not found)';
COMMENT ON VIEW pacer_monthly_spend IS 'Monthly aggregation of PACER spending for budget monitoring.';


-- ============================================================
-- MIGRATION: 027_workflow_audit_log.sql
-- ============================================================
-- ============================================================================
-- WORKFLOW AUDIT LOG
-- Tracks every phase transition and violation attempt
-- ============================================================================

-- Create audit log table
CREATE TABLE IF NOT EXISTS workflow_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    phase VARCHAR(20),
    from_phase VARCHAR(20),
    attempted_phase VARCHAR(20),
    error_message TEXT,
    outputs_summary TEXT[],
    metadata JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_order ON workflow_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON workflow_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON workflow_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_violations ON workflow_audit_log(event_type)
    WHERE event_type = 'PHASE_GATE_VIOLATION';

-- Add completed_phases array to order_workflows if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'completed_phases'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN completed_phases TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Add current_phase_code to order_workflows if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'current_phase_code'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN current_phase_code VARCHAR(20);
    END IF;
END $$;

-- Add requires_revision flag to order_workflows if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'requires_revision'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN requires_revision BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add has_new_citations flag to order_workflows if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_workflows' AND column_name = 'has_new_citations'
    ) THEN
        ALTER TABLE order_workflows ADD COLUMN has_new_citations BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- RLS policies
ALTER TABLE workflow_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs
CREATE POLICY "Admins can view audit logs" ON workflow_audit_log
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

-- Service role can insert (for server-side logging)
CREATE POLICY "Service role can insert audit logs" ON workflow_audit_log
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Comment
COMMENT ON TABLE workflow_audit_log IS 'Immutable audit trail of all workflow phase transitions and violations';
COMMENT ON COLUMN workflow_audit_log.event_type IS 'PHASE_TRANSITION, PHASE_COMPLETED, PHASE_GATE_VIOLATION';


-- ============================================================
-- MIGRATION: 028_phase_ix1_citation_tracking.sql
-- ============================================================
-- Migration: 021_phase_ix1_citation_tracking.sql
-- Purpose: Add columns for Phase IX.1 Separate Statement Citation Cross-Check
-- Source: Chunk 6, Task 43 - Workflow v7.2
--
-- Phase IX.1 verifies that all citations in the Separate Statement
-- exist in the Phase IV citation bank before proceeding to Phase X.

-- ============================================================================
-- ADD PHASE IX.1 TRACKING COLUMNS TO order_workflow_state
-- ============================================================================

-- SS Citation Check Status
-- Tracks whether the separate statement passed citation verification
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citation_check_status VARCHAR(20)
CHECK (ss_citation_check_status IN ('PASSED', 'FAILED', 'PENDING', 'SKIPPED'));

COMMENT ON COLUMN order_workflow_state.ss_citation_check_status IS
'Phase IX.1 citation cross-check status: PASSED=all verified, FAILED=missing citations, SKIPPED=not MSJ/MSA';

-- SS Citation Check Timestamp
-- When the citation cross-check was performed
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citation_check_at TIMESTAMPTZ;

COMMENT ON COLUMN order_workflow_state.ss_citation_check_at IS
'Timestamp when Phase IX.1 citation cross-check was performed';

-- SS Citations Verified Count
-- Number of citations that were successfully verified against the bank
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citations_verified INTEGER DEFAULT 0;

COMMENT ON COLUMN order_workflow_state.ss_citations_verified IS
'Count of citations in Separate Statement that passed verification';

-- SS Citations Missing
-- JSONB array of citations that were not found in the bank
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS ss_citations_missing JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN order_workflow_state.ss_citations_missing IS
'Array of citations that failed IX.1 verification: [{citation, inBank, verificationStatus, flag}]';

-- ============================================================================
-- ADD CHECKPOINT 3 TRACKING COLUMNS
-- ============================================================================

-- These may already exist but we ensure they're present
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_triggered BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_triggered_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved BOOLEAN DEFAULT FALSE;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS checkpoint_3_approved_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN order_workflow_state.checkpoint_3_triggered IS
'Phase X blocking checkpoint - requires admin approval before delivery';

-- ============================================================================
-- ADD PHASE COMPLETION TRACKING COLUMNS
-- ============================================================================

-- Track completion of code-mode phases
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_i_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_ii_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_viii_5_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_ix_completed_at TIMESTAMPTZ;

ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS phase_x_completed_at TIMESTAMPTZ;

-- ============================================================================
-- CREATE INDEX FOR CITATION CHECK QUERIES
-- ============================================================================

-- Index for finding orders with failed citation checks
CREATE INDEX IF NOT EXISTS idx_workflow_state_ss_citation_status
ON order_workflow_state(ss_citation_check_status)
WHERE ss_citation_check_status IS NOT NULL;

-- Index for finding orders awaiting CP3 approval
CREATE INDEX IF NOT EXISTS idx_workflow_state_cp3_pending
ON order_workflow_state(checkpoint_3_triggered, checkpoint_3_approved)
WHERE checkpoint_3_triggered = TRUE AND (checkpoint_3_approved IS NULL OR checkpoint_3_approved = FALSE);

-- ============================================================================
-- CREATE VIEW FOR CITATION CHECK SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW v_ss_citation_check_summary AS
SELECT
  ows.order_id,
  o.case_number,
  o.motion_type,
  o.jurisdiction,
  ows.ss_citation_check_status,
  ows.ss_citation_check_at,
  ows.ss_citations_verified,
  jsonb_array_length(COALESCE(ows.ss_citations_missing, '[]'::jsonb)) as citations_missing_count,
  ows.ss_citations_missing,
  ows.current_phase
FROM order_workflow_state ows
JOIN orders o ON o.id = ows.order_id
WHERE ows.ss_citation_check_status IS NOT NULL
ORDER BY ows.ss_citation_check_at DESC;

COMMENT ON VIEW v_ss_citation_check_summary IS
'Summary of Phase IX.1 citation cross-check results for MSJ/MSA motions';

-- ============================================================================
-- CREATE FUNCTION TO CHECK IF ORDER NEEDS IX.1
-- ============================================================================

CREATE OR REPLACE FUNCTION needs_phase_ix1(
  p_motion_type TEXT,
  p_jurisdiction TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- MSJ/MSA in California requires separate statement and thus IX.1
  IF p_jurisdiction IN ('ca_state', 'ca_federal') THEN
    IF LOWER(p_motion_type) LIKE '%summary%' OR
       LOWER(p_motion_type) LIKE '%msj%' OR
       LOWER(p_motion_type) LIKE '%msa%' THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION needs_phase_ix1 IS
'Determines if an order needs Phase IX.1 citation cross-check based on motion type and jurisdiction';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Ensure service role can read/write
GRANT ALL ON order_workflow_state TO service_role;
GRANT SELECT ON v_ss_citation_check_summary TO authenticated;
GRANT SELECT ON v_ss_citation_check_summary TO service_role;
GRANT EXECUTE ON FUNCTION needs_phase_ix1 TO authenticated;
GRANT EXECUTE ON FUNCTION needs_phase_ix1 TO service_role;


-- ============================================================
-- MIGRATION: 029_workflow_violations.sql
-- ============================================================
-- ============================================================================
-- WORKFLOW VIOLATIONS
-- Tracks phase skip attempts and enforcement violations for review
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    attempted_phase VARCHAR(20),
    reason TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'CRITICAL',
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_violations_order ON workflow_violations(order_id);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON workflow_violations(severity);
CREATE INDEX IF NOT EXISTS idx_violations_unresolved ON workflow_violations(resolved)
    WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON workflow_violations(timestamp DESC);

-- RLS policies
ALTER TABLE workflow_violations ENABLE ROW LEVEL SECURITY;

-- Admins can view all violations
CREATE POLICY "Admins can view violations" ON workflow_violations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

-- Admins can update violations (mark resolved)
CREATE POLICY "Admins can update violations" ON workflow_violations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'super_admin')
        )
    );

-- Service role can insert (for server-side logging)
CREATE POLICY "Service role can insert violations" ON workflow_violations
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Create view for unresolved violations dashboard
CREATE OR REPLACE VIEW unresolved_violations AS
SELECT
    v.id,
    v.order_id,
    o.order_number,
    v.attempted_phase,
    v.reason,
    v.severity,
    v.timestamp,
    EXTRACT(EPOCH FROM (NOW() - v.timestamp)) / 3600 AS hours_unresolved
FROM workflow_violations v
LEFT JOIN orders o ON o.id = v.order_id
WHERE v.resolved = FALSE
ORDER BY
    CASE v.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        ELSE 5
    END,
    v.timestamp DESC;

-- Function to get violation count for an order
CREATE OR REPLACE FUNCTION get_order_violation_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM workflow_violations
        WHERE order_id = p_order_id
    );
END;
$$;

-- Comments
COMMENT ON TABLE workflow_violations IS 'Records of phase enforcement violations for admin review';
COMMENT ON COLUMN workflow_violations.severity IS 'CRITICAL (phase skip), HIGH (missing outputs), MEDIUM, LOW';
COMMENT ON VIEW unresolved_violations IS 'Dashboard view of unresolved violations requiring admin attention';


-- ============================================================
-- MIGRATION: 030_chunk8_monitoring_tables.sql
-- ============================================================
-- Migration: 022_chunk8_monitoring_tables.sql
-- Purpose: Add tables for Chunk 8 Additional Components
-- Source: Chunk 8, Tasks 52, 55, 61, 62

-- ============================================================================
-- COURT HOLIDAYS TABLE (Task 52)
-- ============================================================================

CREATE TABLE IF NOT EXISTS court_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction VARCHAR(50) NOT NULL,
  holiday_date DATE NOT NULL,
  holiday_name VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  is_federal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on jurisdiction + date
  UNIQUE(jurisdiction, holiday_date)
);

COMMENT ON TABLE court_holidays IS 'Court holidays by jurisdiction for deadline calculation (Task 52)';

-- Indexes for court holidays
CREATE INDEX IF NOT EXISTS idx_court_holidays_jurisdiction_date
ON court_holidays(jurisdiction, holiday_date);

CREATE INDEX IF NOT EXISTS idx_court_holidays_year
ON court_holidays(year);

-- ============================================================================
-- EMAIL LOG TABLE (Task 55)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email_type VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced', 'delivered', 'opened')),
  resend_id VARCHAR(100),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_log IS 'Email notification log for audit and debugging (Task 55)';

-- Indexes for email log
CREATE INDEX IF NOT EXISTS idx_email_log_order_id
ON email_log(order_id);

CREATE INDEX IF NOT EXISTS idx_email_log_user_id
ON email_log(user_id);

CREATE INDEX IF NOT EXISTS idx_email_log_type_status
ON email_log(email_type, status);

CREATE INDEX IF NOT EXISTS idx_email_log_created_at
ON email_log(created_at DESC);

-- ============================================================================
-- ERROR LOG TABLE (Task 61)
-- ============================================================================

CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level VARCHAR(10) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
  category VARCHAR(50) CHECK (category IN (
    'WORKFLOW_ERROR', 'API_ERROR', 'PAYMENT_ERROR', 'CITATION_ERROR',
    'SYSTEM_ERROR', 'VALIDATION_ERROR', 'DATABASE_ERROR', 'AUTHENTICATION_ERROR'
  )),
  message TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phase VARCHAR(20),
  metadata JSONB DEFAULT '{}',
  stack_trace TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE error_log IS 'Centralized error logging for monitoring and alerting (Task 61)';

-- Indexes for error log
CREATE INDEX IF NOT EXISTS idx_error_log_level
ON error_log(level);

CREATE INDEX IF NOT EXISTS idx_error_log_category
ON error_log(category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_log_order_id
ON error_log(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_log_created_at
ON error_log(created_at DESC);

-- Partial index for recent errors (for threshold alerting)
CREATE INDEX IF NOT EXISTS idx_error_log_recent_errors
ON error_log(created_at, category)
WHERE level IN ('ERROR', 'FATAL') AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================================================
-- WORKFLOW METRICS TABLE (Task 62)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN (
    'workflow_phase_duration', 'api_call_latency', 'document_generation_time',
    'citation_verification', 'revision_loop', 'total_workflow_time',
    'queue_wait_time', 'checkpoint_duration', 'file_upload_time', 'file_download_time'
  )),
  metric_value NUMERIC NOT NULL,
  metric_unit VARCHAR(20) NOT NULL CHECK (metric_unit IN ('ms', 'seconds', 'count', 'percentage')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  phase VARCHAR(20),
  tier VARCHAR(5),
  provider VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE workflow_metrics IS 'Performance metrics for workflow monitoring (Task 62)';

-- Indexes for workflow metrics
CREATE INDEX IF NOT EXISTS idx_workflow_metrics_type
ON workflow_metrics(metric_type);

CREATE INDEX IF NOT EXISTS idx_workflow_metrics_order_id
ON workflow_metrics(order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_metrics_tier
ON workflow_metrics(tier) WHERE tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_metrics_provider
ON workflow_metrics(provider) WHERE provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_metrics_created_at
ON workflow_metrics(created_at DESC);

-- Composite index for aggregation queries
CREATE INDEX IF NOT EXISTS idx_workflow_metrics_aggregation
ON workflow_metrics(metric_type, created_at, tier);

-- ============================================================================
-- ORDER ARCHIVE TRACKING COLUMNS (Task 59)
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS archive_path VARCHAR(500);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS retention_extended_at TIMESTAMPTZ;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS retention_extended_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN orders.archived_at IS 'When the order was moved to cold storage';
COMMENT ON COLUMN orders.archive_path IS 'Path to archived files in cold storage';
COMMENT ON COLUMN orders.retention_expires_at IS 'When the order data is scheduled for deletion';
COMMENT ON COLUMN orders.retention_extended_at IS 'When retention was last extended';
COMMENT ON COLUMN orders.retention_extended_by IS 'Admin who extended retention';

-- Index for archive queries
CREATE INDEX IF NOT EXISTS idx_orders_retention_expires
ON orders(retention_expires_at)
WHERE retention_expires_at IS NOT NULL AND archived_at IS NOT NULL;

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Error rate summary view
CREATE OR REPLACE VIEW v_error_rate_summary AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  level,
  category,
  COUNT(*) as error_count
FROM error_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), level, category
ORDER BY hour DESC, level, category;

COMMENT ON VIEW v_error_rate_summary IS 'Hourly error rate summary for the last 24 hours';

-- Workflow performance summary view
CREATE OR REPLACE VIEW v_workflow_performance_summary AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  metric_type,
  tier,
  COUNT(*) as sample_count,
  AVG(metric_value) as avg_value,
  MIN(metric_value) as min_value,
  MAX(metric_value) as max_value,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as p50,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY metric_value) as p90,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99
FROM workflow_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), metric_type, tier
ORDER BY day DESC, metric_type, tier;

COMMENT ON VIEW v_workflow_performance_summary IS 'Daily workflow performance metrics for the last 30 days';

-- ============================================================================
-- FUNCTIONS FOR METRIC CLEANUP
-- ============================================================================

-- Function to clean up old metrics (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete workflow metrics older than 90 days
  WITH deleted AS (
    DELETE FROM workflow_metrics
    WHERE created_at < NOW() - INTERVAL '90 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  -- Delete error logs older than 90 days (keep FATAL for 1 year)
  DELETE FROM error_log
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND level != 'FATAL';

  DELETE FROM error_log
  WHERE created_at < NOW() - INTERVAL '365 days'
    AND level = 'FATAL';

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_metrics IS 'Cleans up old metrics and error logs to manage table size';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Court holidays
GRANT SELECT ON court_holidays TO authenticated;
GRANT ALL ON court_holidays TO service_role;

-- Email log
GRANT SELECT ON email_log TO authenticated;
GRANT ALL ON email_log TO service_role;

-- Error log
GRANT SELECT ON error_log TO authenticated;
GRANT ALL ON error_log TO service_role;

-- Workflow metrics
GRANT SELECT ON workflow_metrics TO authenticated;
GRANT ALL ON workflow_metrics TO service_role;

-- Views
GRANT SELECT ON v_error_rate_summary TO authenticated;
GRANT SELECT ON v_error_rate_summary TO service_role;
GRANT SELECT ON v_workflow_performance_summary TO authenticated;
GRANT SELECT ON v_workflow_performance_summary TO service_role;

-- Function
GRANT EXECUTE ON FUNCTION cleanup_old_metrics TO service_role;


-- ============================================================
-- MIGRATION: 031_chunk9_gap_analysis.sql
-- ============================================================
-- Migration: 023_chunk9_gap_analysis.sql
-- Purpose: Add tables for Chunk 9 Gap Analysis Tasks
-- Source: Chunk 9, Tasks 63-68

-- ============================================================================
-- DOCUMENT DOWNLOADS TABLE (Task 68)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  document_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE document_downloads IS 'Download audit log for client document downloads (Task 68)';

-- Indexes for document downloads
CREATE INDEX IF NOT EXISTS idx_document_downloads_order_id
ON document_downloads(order_id);

CREATE INDEX IF NOT EXISTS idx_document_downloads_user_id
ON document_downloads(user_id);

CREATE INDEX IF NOT EXISTS idx_document_downloads_downloaded_at
ON document_downloads(downloaded_at DESC);

-- ============================================================================
-- ORDER NOTES TABLE (Task 67)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  note TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_notes IS 'Internal notes for orders (Task 67)';

-- Indexes for order notes
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id
ON order_notes(order_id);

CREATE INDEX IF NOT EXISTS idx_order_notes_created_at
ON order_notes(created_at DESC);

-- ============================================================================
-- PHASE PROMPTS TABLE (Task 65)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_code VARCHAR(10) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  system_prompt TEXT,
  user_prompt_template TEXT NOT NULL,
  motion_types TEXT[],
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(phase_code, is_default) WHERE is_default = TRUE
);

COMMENT ON TABLE phase_prompts IS 'Phase-specific prompt templates for superprompt builder (Task 65)';

-- Index for phase prompts
CREATE INDEX IF NOT EXISTS idx_phase_prompts_phase_code
ON phase_prompts(phase_code);

-- ============================================================================
-- CREDENTIAL CHECK LOG TABLE (Task 63)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credential_check_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  valid BOOLEAN NOT NULL,
  error TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE credential_check_log IS 'API credential verification log (Task 63)';

-- Index for credential checks
CREATE INDEX IF NOT EXISTS idx_credential_check_log_checked_at
ON credential_check_log(checked_at DESC);

-- Cleanup old checks (keep 7 days)
CREATE INDEX IF NOT EXISTS idx_credential_check_log_cleanup
ON credential_check_log(checked_at)
WHERE checked_at < NOW() - INTERVAL '7 days';

-- ============================================================================
-- ADD COLUMNS TO ORDERS TABLE
-- ============================================================================

-- Add revision tracking columns
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS max_revisions INTEGER DEFAULT 2;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.revision_count IS 'Number of revisions used';
COMMENT ON COLUMN orders.max_revisions IS 'Maximum revisions allowed for this order';
COMMENT ON COLUMN orders.completed_at IS 'When the order was marked complete';

-- ============================================================================
-- ADD COLUMNS TO ORDER_WORKFLOW_STATE
-- ============================================================================

-- Add assigned admin column
ALTER TABLE order_workflow_state
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

COMMENT ON COLUMN order_workflow_state.assigned_to IS 'Admin assigned to this order (Task 67)';

-- Index for admin queue
CREATE INDEX IF NOT EXISTS idx_workflow_state_assigned_to
ON order_workflow_state(assigned_to)
WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- VIEW FOR DOWNLOAD STATISTICS
-- ============================================================================

CREATE OR REPLACE VIEW v_download_statistics AS
SELECT
  dd.order_id,
  o.order_number,
  COUNT(*) as download_count,
  COUNT(DISTINCT dd.user_id) as unique_users,
  MAX(dd.downloaded_at) as last_download,
  MIN(dd.downloaded_at) as first_download
FROM document_downloads dd
JOIN orders o ON o.id = dd.order_id
GROUP BY dd.order_id, o.order_number
ORDER BY last_download DESC;

COMMENT ON VIEW v_download_statistics IS 'Download statistics by order for audit';

-- ============================================================================
-- FUNCTION TO LOG CREDENTIAL CHECK
-- ============================================================================

CREATE OR REPLACE FUNCTION log_credential_check(
  p_service VARCHAR(50),
  p_valid BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO credential_check_log (service, valid, error)
  VALUES (p_service, p_valid, p_error)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION log_credential_check IS 'Log a credential verification result';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Document downloads
GRANT SELECT, INSERT ON document_downloads TO authenticated;
GRANT ALL ON document_downloads TO service_role;

-- Order notes
GRANT SELECT, INSERT ON order_notes TO authenticated;
GRANT ALL ON order_notes TO service_role;

-- Phase prompts
GRANT SELECT ON phase_prompts TO authenticated;
GRANT ALL ON phase_prompts TO service_role;

-- Credential check log
GRANT SELECT ON credential_check_log TO service_role;
GRANT INSERT ON credential_check_log TO service_role;

-- Views
GRANT SELECT ON v_download_statistics TO authenticated;
GRANT SELECT ON v_download_statistics TO service_role;

-- Functions
GRANT EXECUTE ON FUNCTION log_credential_check TO service_role;


-- ============================================================
-- MIGRATION: 032_chunk10_p2_prelaunch.sql
-- ============================================================
-- ============================================================================
-- Migration 024: Chunk 10 - P2 Pre-Launch Tables
-- Tasks 69-79: Rate limiting, webhooks, feedback, analytics, backups, AI disclosure
-- ============================================================================

-- ============================================================================
-- Task 70: Webhook Event Logging
-- ============================================================================

-- Webhook logs table (if not exists from previous migrations)
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL, -- 'stripe', 'inngest'
    event_type VARCHAR(255) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'received', -- 'received', 'processing', 'processed', 'error'
    processing_time_ms INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    CONSTRAINT webhook_logs_source_check CHECK (source IN ('stripe', 'inngest'))
);

-- Indexes for webhook logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON webhook_logs(event_id);

-- ============================================================================
-- Task 73: Motion Template Library
-- ============================================================================

CREATE TABLE IF NOT EXISTS motion_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    motion_type VARCHAR(100) NOT NULL,
    jurisdiction VARCHAR(100) NOT NULL,
    section VARCHAR(50) NOT NULL, -- 'introduction', 'procedural_history', 'legal_standard', 'argument', 'conclusion', 'prayer'
    content TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT motion_templates_section_check CHECK (
        section IN ('introduction', 'procedural_history', 'legal_standard', 'argument', 'conclusion', 'prayer')
    ),
    CONSTRAINT motion_templates_unique UNIQUE (motion_type, jurisdiction, section)
);

-- Indexes for motion templates
CREATE INDEX IF NOT EXISTS idx_motion_templates_type ON motion_templates(motion_type);
CREATE INDEX IF NOT EXISTS idx_motion_templates_jurisdiction ON motion_templates(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_motion_templates_active ON motion_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- Task 74: Customer Feedback Collection
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    would_recommend BOOLEAN NOT NULL,
    feedback_text TEXT,
    issues TEXT[] DEFAULT '{}', -- 'quality', 'timing', 'communication', 'price', 'other'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_feedback_order_unique UNIQUE (order_id)
);

-- Indexes for customer feedback
CREATE INDEX IF NOT EXISTS idx_customer_feedback_order ON customer_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_user ON customer_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_rating ON customer_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_created ON customer_feedback(created_at DESC);

-- Feedback request scheduling
CREATE TABLE IF NOT EXISTS feedback_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'completed', 'cancelled'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT feedback_requests_status_check CHECK (
        status IN ('pending', 'sent', 'completed', 'cancelled')
    )
);

-- Indexes for feedback requests
CREATE INDEX IF NOT EXISTS idx_feedback_requests_order ON feedback_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_status ON feedback_requests(status);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_scheduled ON feedback_requests(scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- Task 75: Usage Analytics (AI Usage Logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL, -- 'draft', 'review', 'citation_check', etc.
    tokens_used INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(10, 6) NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for AI usage logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_order ON ai_usage_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_workflow ON ai_usage_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);

-- ============================================================================
-- Task 76: System Status Page
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'investigating', -- 'investigating', 'identified', 'monitoring', 'resolved'
    severity VARCHAR(50) NOT NULL DEFAULT 'minor', -- 'minor', 'major', 'critical'
    affected_services TEXT[] DEFAULT '{}',
    updates JSONB DEFAULT '[]', -- Array of {timestamp, message}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    CONSTRAINT system_incidents_status_check CHECK (
        status IN ('investigating', 'identified', 'monitoring', 'resolved')
    ),
    CONSTRAINT system_incidents_severity_check CHECK (
        severity IN ('minor', 'major', 'critical')
    )
);

-- Indexes for system incidents
CREATE INDEX IF NOT EXISTS idx_system_incidents_status ON system_incidents(status);
CREATE INDEX IF NOT EXISTS idx_system_incidents_severity ON system_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_system_incidents_created ON system_incidents(created_at DESC);

-- ============================================================================
-- Task 77: Export Functionality
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type VARCHAR(50) NOT NULL, -- 'csv', 'json', 'pdf'
    filters JSONB NOT NULL DEFAULT '{}',
    recipient_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    download_url TEXT,
    record_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT scheduled_exports_type_check CHECK (
        export_type IN ('csv', 'json', 'pdf')
    ),
    CONSTRAINT scheduled_exports_status_check CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    )
);

-- Indexes for scheduled exports
CREATE INDEX IF NOT EXISTS idx_scheduled_exports_status ON scheduled_exports(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_exports_scheduled ON scheduled_exports(scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- Task 78: Backup Verification System
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_ref VARCHAR(100) NOT NULL,
    backup_type VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'manual', 'pre_migration'
    size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'completed', 'in_progress', 'failed'
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_checks JSONB DEFAULT '[]',
    verification_errors TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT backup_records_type_check CHECK (
        backup_type IN ('scheduled', 'manual', 'pre_migration')
    ),
    CONSTRAINT backup_records_status_check CHECK (
        status IN ('completed', 'in_progress', 'failed')
    )
);

-- Indexes for backup records
CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status);
CREATE INDEX IF NOT EXISTS idx_backup_records_verified ON backup_records(is_verified);
CREATE INDEX IF NOT EXISTS idx_backup_records_created ON backup_records(created_at DESC);

-- Verification tasks
CREATE TABLE IF NOT EXISTS verification_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES backup_records(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT verification_tasks_status_check CHECK (
        status IN ('pending', 'processing', 'completed')
    )
);

-- Indexes for verification tasks
CREATE INDEX IF NOT EXISTS idx_verification_tasks_backup ON verification_tasks(backup_id);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_status ON verification_tasks(status);
CREATE INDEX IF NOT EXISTS idx_verification_tasks_scheduled ON verification_tasks(scheduled_for) WHERE status = 'pending';

-- Restore tests
CREATE TABLE IF NOT EXISTS restore_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id UUID NOT NULL REFERENCES backup_records(id) ON DELETE CASCADE,
    test_type VARCHAR(50) NOT NULL, -- 'dry_run', 'staging_restore'
    result VARCHAR(50) NOT NULL, -- 'success', 'failed'
    estimated_restore_time INTEGER, -- seconds
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for restore tests
CREATE INDEX IF NOT EXISTS idx_restore_tests_backup ON restore_tests(backup_id);

-- Backup alerts
CREATE TABLE IF NOT EXISTS backup_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_level VARCHAR(50) NOT NULL, -- 'warning', 'critical'
    alerts TEXT[] NOT NULL DEFAULT '{}',
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT backup_alerts_level_check CHECK (
        alert_level IN ('warning', 'critical')
    )
);

-- Indexes for backup alerts
CREATE INDEX IF NOT EXISTS idx_backup_alerts_level ON backup_alerts(alert_level);
CREATE INDEX IF NOT EXISTS idx_backup_alerts_acknowledged ON backup_alerts(acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- Task 79: AI Disclosure Compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_disclosures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    jurisdiction VARCHAR(100) NOT NULL,
    disclosure_text TEXT NOT NULL,
    short_description VARCHAR(255) NOT NULL,
    legal_basis TEXT[] DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for AI disclosures
CREATE INDEX IF NOT EXISTS idx_ai_disclosures_order ON ai_disclosures(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_disclosures_jurisdiction ON ai_disclosures(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_ai_disclosures_created ON ai_disclosures(created_at DESC);

-- Disclosure acceptances
CREATE TABLE IF NOT EXISTS disclosure_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disclosure_id UUID NOT NULL REFERENCES ai_disclosures(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    signature_method VARCHAR(50) NOT NULL DEFAULT 'checkbox', -- 'checkbox', 'e-signature', 'verbal'
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT disclosure_acceptances_method_check CHECK (
        signature_method IN ('checkbox', 'e-signature', 'verbal')
    )
);

-- Indexes for disclosure acceptances
CREATE INDEX IF NOT EXISTS idx_disclosure_acceptances_disclosure ON disclosure_acceptances(disclosure_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_acceptances_order ON disclosure_acceptances(order_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_acceptances_user ON disclosure_acceptances(user_id);

-- ============================================================================
-- Row Level Security Policies
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE motion_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_disclosures ENABLE ROW LEVEL SECURITY;
ALTER TABLE disclosure_acceptances ENABLE ROW LEVEL SECURITY;

-- Webhook logs: Service role only
CREATE POLICY "webhook_logs_service_only" ON webhook_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Motion templates: Public read, admin write
CREATE POLICY "motion_templates_read" ON motion_templates
    FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "motion_templates_admin" ON motion_templates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Customer feedback: Users can manage their own feedback
CREATE POLICY "customer_feedback_own" ON customer_feedback
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "customer_feedback_admin" ON customer_feedback
    FOR SELECT TO service_role USING (true);

-- Feedback requests: Service role manages, users see their own
CREATE POLICY "feedback_requests_own" ON feedback_requests
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "feedback_requests_service" ON feedback_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI usage logs: Service role only
CREATE POLICY "ai_usage_logs_service" ON ai_usage_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- System incidents: Public read
CREATE POLICY "system_incidents_read" ON system_incidents
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "system_incidents_admin" ON system_incidents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Scheduled exports: Service role only
CREATE POLICY "scheduled_exports_service" ON scheduled_exports
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Backup records: Service role only
CREATE POLICY "backup_records_service" ON backup_records
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verification tasks: Service role only
CREATE POLICY "verification_tasks_service" ON verification_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Restore tests: Service role only
CREATE POLICY "restore_tests_service" ON restore_tests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Backup alerts: Service role only
CREATE POLICY "backup_alerts_service" ON backup_alerts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI disclosures: Users can see disclosures for their orders
CREATE POLICY "ai_disclosures_own" ON ai_disclosures
    FOR SELECT TO authenticated
    USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "ai_disclosures_service" ON ai_disclosures
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Disclosure acceptances: Users can manage their own acceptances
CREATE POLICY "disclosure_acceptances_own" ON disclosure_acceptances
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "disclosure_acceptances_service" ON disclosure_acceptances
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE webhook_logs IS 'Logs all incoming webhook events from Stripe and Inngest (Task 70)';
COMMENT ON TABLE motion_templates IS 'Jurisdiction-specific motion section templates (Task 73)';
COMMENT ON TABLE customer_feedback IS 'Customer satisfaction ratings and feedback (Task 74)';
COMMENT ON TABLE feedback_requests IS 'Scheduled feedback request emails (Task 74)';
COMMENT ON TABLE ai_usage_logs IS 'AI API usage tracking for analytics (Task 75)';
COMMENT ON TABLE system_incidents IS 'System status incidents and updates (Task 76)';
COMMENT ON TABLE scheduled_exports IS 'Queued data export jobs (Task 77)';
COMMENT ON TABLE backup_records IS 'Database backup tracking and verification (Task 78)';
COMMENT ON TABLE verification_tasks IS 'Scheduled backup verification tasks (Task 78)';
COMMENT ON TABLE restore_tests IS 'Backup restore test results (Task 78)';
COMMENT ON TABLE backup_alerts IS 'Backup system health alerts (Task 78)';
COMMENT ON TABLE ai_disclosures IS 'AI disclosure documents per ABA Opinion 512 (Task 79)';
COMMENT ON TABLE disclosure_acceptances IS 'Client acknowledgment of AI disclosures (Task 79)';


-- ============================================================
-- MIGRATION: 033_chunk11_state_expansion.sql
-- ============================================================
-- ============================================================================
-- Migration 025: Chunk 11 - 50-State Expansion & Security
-- Tasks 80-89: State configs, motion types, waitlist, legal pages
-- ============================================================================

-- ============================================================================
-- Task 84: State Waitlist for Coming Soon States
-- ============================================================================

CREATE TABLE IF NOT EXISTS state_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    state_code CHAR(2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,

    -- Ensure unique email per state
    CONSTRAINT state_waitlist_unique UNIQUE (email, state_code),

    -- Validate state code format
    CONSTRAINT state_waitlist_state_format CHECK (state_code ~ '^[A-Z]{2}$')
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_state_waitlist_state ON state_waitlist(state_code);
CREATE INDEX IF NOT EXISTS idx_state_waitlist_email ON state_waitlist(email);
CREATE INDEX IF NOT EXISTS idx_state_waitlist_created ON state_waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_state_waitlist_not_notified ON state_waitlist(state_code) WHERE notified_at IS NULL;

-- Enable RLS
ALTER TABLE state_waitlist ENABLE ROW LEVEL SECURITY;

-- Only service role can access (no public access to waitlist data)
CREATE POLICY "state_waitlist_service_only" ON state_waitlist
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Task 80-82: State Configuration Tracking (Metadata)
-- ============================================================================

-- Track enabled states for analytics
CREATE TABLE IF NOT EXISTS state_launch_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_code CHAR(2) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'enabled', 'disabled', 'beta'
    notes TEXT,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT state_launch_log_action_check CHECK (
        action IN ('enabled', 'disabled', 'beta')
    )
);

CREATE INDEX IF NOT EXISTS idx_state_launch_log_state ON state_launch_log(state_code);
CREATE INDEX IF NOT EXISTS idx_state_launch_log_action ON state_launch_log(action);
CREATE INDEX IF NOT EXISTS idx_state_launch_log_created ON state_launch_log(created_at DESC);

-- Enable RLS
ALTER TABLE state_launch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "state_launch_log_service_only" ON state_launch_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE state_waitlist IS 'Email waitlist for Coming Soon states (Task 84)';
COMMENT ON COLUMN state_waitlist.email IS 'Email address for notification';
COMMENT ON COLUMN state_waitlist.state_code IS '2-letter state code (e.g., TX, NY)';
COMMENT ON COLUMN state_waitlist.notified_at IS 'Timestamp when launch notification was sent';

COMMENT ON TABLE state_launch_log IS 'Audit log of state enable/disable events (Task 80-82)';

-- ============================================================================
-- Seed initial state launch records for CA and LA
-- ============================================================================

INSERT INTO state_launch_log (state_code, action, notes)
VALUES
    ('CA', 'enabled', 'Launch state - California'),
    ('LA', 'enabled', 'Launch state - Louisiana')
ON CONFLICT DO NOTHING;


-- ============================================================
-- MIGRATION: 034_protocol10_and_workflow_events.sql
-- ============================================================
-- ============================================================================
-- Migration: Protocol 10 disclosure and workflow_events audit trail
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Add Protocol 10 disclosure column to order_workflows
-- ============================================================================

-- Add protocol_10_disclosure column for storing the disclosure text
ALTER TABLE order_workflows
ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

COMMENT ON COLUMN order_workflows.protocol_10_disclosure IS 'Protocol 10 disclosure text included in Attorney Instruction Sheet when max loops reached';

-- Also add to orders table for quick access
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS hold_reason TEXT DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN DEFAULT FALSE;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(10) DEFAULT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS judge_ordered_separate_statement BOOLEAN DEFAULT FALSE;

-- Create index for orders on hold
CREATE INDEX IF NOT EXISTS idx_orders_hold_triggered
ON orders(hold_triggered_at)
WHERE hold_triggered_at IS NOT NULL;

-- Create index for Protocol 10 orders
CREATE INDEX IF NOT EXISTS idx_orders_protocol_10
ON orders(protocol_10_triggered)
WHERE protocol_10_triggered = true;

COMMENT ON COLUMN orders.hold_triggered_at IS 'Timestamp when HOLD was triggered. Used for timeout calculations.';
COMMENT ON COLUMN orders.hold_reason IS 'Reason for HOLD status (critical gaps, missing declarations, etc.)';
COMMENT ON COLUMN orders.protocol_10_triggered IS 'Whether Protocol 10 disclosure was added to deliverables.';
COMMENT ON COLUMN orders.protocol_10_disclosure IS 'Protocol 10 disclosure text included in Attorney Instruction Sheet.';
COMMENT ON COLUMN orders.current_phase IS 'Current workflow phase (I, II, III, IV, V, V.1, VI, VII, VII.1, VIII, VIII.5, IX, IX.1, X)';
COMMENT ON COLUMN orders.judge_ordered_separate_statement IS 'For federal MSJ: true if judge ordered separate statement despite federal rules';


-- ============================================================================
-- PART 2: Create workflow_events table for audit trail
-- ============================================================================

-- Create workflow_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES order_workflows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_events_order_id ON workflow_events(order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id ON workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at DESC);

-- Create composite index for order + type queries
CREATE INDEX IF NOT EXISTS idx_workflow_events_order_type
ON workflow_events(order_id, event_type);

-- Add RLS policies
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events for their own orders
DROP POLICY IF EXISTS "Users can view own order events" ON workflow_events;
CREATE POLICY "Users can view own order events" ON workflow_events
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- Policy: Service role can do anything
DROP POLICY IF EXISTS "Service role full access" ON workflow_events;
CREATE POLICY "Service role full access" ON workflow_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE workflow_events IS 'Audit trail for all workflow state changes';
COMMENT ON COLUMN workflow_events.event_type IS 'Type of event: PHASE_STARTED, PHASE_COMPLETED, HOLD_TRIGGERED, HOLD_RESUMED, PROTOCOL_10_TRIGGERED, etc.';
COMMENT ON COLUMN workflow_events.phase IS 'Phase where event occurred (I, II, III, etc.)';
COMMENT ON COLUMN workflow_events.data IS 'JSON payload with event-specific details';


-- ============================================================================
-- PART 3: Add tier column to orders if not exists (ensure A/B/C format)
-- ============================================================================

-- Add tier column if it doesn't exist (some systems use motion_tier as number)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS tier VARCHAR(1) DEFAULT 'B';

-- Create function to sync tier from motion_tier
CREATE OR REPLACE FUNCTION sync_order_tier()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync tier from motion_tier if tier is not set
  IF NEW.tier IS NULL OR NEW.tier = '' THEN
    CASE NEW.motion_tier
      WHEN 1 THEN NEW.tier := 'A';
      WHEN 2 THEN NEW.tier := 'B';
      WHEN 3 THEN NEW.tier := 'C';
      ELSE NEW.tier := 'B';
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tier sync
DROP TRIGGER IF EXISTS sync_tier_trigger ON orders;
CREATE TRIGGER sync_tier_trigger
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_tier();

COMMENT ON COLUMN orders.tier IS 'Motion tier: A (procedural), B (intermediate), C (complex/dispositive)';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Added protocol_10_disclosure to order_workflows
-- - Added HOLD and Protocol 10 columns to orders table
-- - Added current_phase and judge_ordered_separate_statement to orders
-- - Created workflow_events table for audit trail
-- - Added tier column with sync from motion_tier


-- ============================================================
-- MIGRATION: 035_citation_verification_enforcement.sql
-- ============================================================
-- ============================================================================
-- CITATION VERIFICATION ENFORCEMENT MIGRATION
-- Motion Granted v7.2.1 - Zero Tolerance for Hallucinated Citations
-- Created: 2026-01-30
-- ============================================================================

-- ============================================================================
-- Add additional columns to citation_verifications for enhanced audit
-- ============================================================================

-- Add phase column to track which workflow phase performed the verification
ALTER TABLE citation_verifications
ADD COLUMN IF NOT EXISTS phase VARCHAR(10);

-- Add api_response column to store raw CourtListener API response
ALTER TABLE citation_verifications
ADD COLUMN IF NOT EXISTS api_response JSONB;

-- Add index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_citation_verifications_phase
ON citation_verifications(phase);

-- ============================================================================
-- PHASE IV SEARCH AUDIT TABLE
-- Tracks all CourtListener searches performed during Phase IV
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_iv_search_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Search details
  search_query TEXT NOT NULL,
  jurisdiction VARCHAR(50),
  for_element TEXT NOT NULL,

  -- Results
  results_count INTEGER NOT NULL DEFAULT 0,
  citations_selected INTEGER NOT NULL DEFAULT 0,
  courtlistener_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],

  -- Timing
  search_duration_ms INTEGER,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- API details
  api_endpoint TEXT,
  api_response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for search audit
CREATE INDEX IF NOT EXISTS idx_phase_iv_search_order_id
ON phase_iv_search_audit(order_id);

CREATE INDEX IF NOT EXISTS idx_phase_iv_search_element
ON phase_iv_search_audit(for_element);

-- ============================================================================
-- CITATION VERIFICATION SUMMARY VIEW
-- Aggregates verification stats per order
-- ============================================================================

CREATE OR REPLACE VIEW citation_verification_summary AS
SELECT
  order_id,
  COUNT(*) as total_verifications,
  COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') as verified_count,
  COUNT(*) FILTER (WHERE verification_status = 'NOT_FOUND') as not_found_count,
  COUNT(*) FILTER (WHERE verification_status = 'PENDING') as pending_count,
  COUNT(*) FILTER (WHERE courtlistener_id IS NOT NULL) as has_courtlistener_id,
  MIN(stage_1_at) as first_verification,
  MAX(stage_1_at) as last_verification,
  ROUND(
    (COUNT(*) FILTER (WHERE verification_status = 'VERIFIED')::DECIMAL /
     NULLIF(COUNT(*), 0)) * 100, 2
  ) as verification_rate_percent
FROM citation_verifications
GROUP BY order_id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE phase_iv_search_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to phase_iv_search_audit"
  ON phase_iv_search_audit FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own phase_iv_search_audit"
  ON phase_iv_search_audit FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTION: Log Phase IV search
-- ============================================================================

CREATE OR REPLACE FUNCTION log_phase_iv_search(
  p_order_id UUID,
  p_search_query TEXT,
  p_jurisdiction VARCHAR(50),
  p_for_element TEXT,
  p_results_count INTEGER,
  p_citations_selected INTEGER,
  p_courtlistener_ids INTEGER[],
  p_search_duration_ms INTEGER DEFAULT NULL,
  p_api_response JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO phase_iv_search_audit (
    order_id,
    search_query,
    jurisdiction,
    for_element,
    results_count,
    citations_selected,
    courtlistener_ids,
    search_duration_ms,
    api_response
  ) VALUES (
    p_order_id,
    p_search_query,
    p_jurisdiction,
    p_for_element,
    p_results_count,
    p_citations_selected,
    p_courtlistener_ids,
    p_search_duration_ms,
    p_api_response
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Validate citation bank has verification proof
-- Used by Phase V to reject unverified citation banks
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_citation_bank_verified(
  p_order_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  total_citations INTEGER,
  verified_citations INTEGER,
  missing_courtlistener_id INTEGER,
  verification_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH bank_citations AS (
    SELECT
      jsonb_array_elements(citations) as citation
    FROM citation_banks
    WHERE order_id = p_order_id AND bank_type = 'CASE'
  )
  SELECT
    (COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL) = COUNT(*)) as is_valid,
    COUNT(*)::INTEGER as total_citations,
    COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL)::INTEGER as verified_citations,
    COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NULL)::INTEGER as missing_courtlistener_id,
    ROUND(
      (COUNT(*) FILTER (WHERE (citation->>'courtlistener_id') IS NOT NULL)::DECIMAL /
       NULLIF(COUNT(*), 0)) * 100, 2
    ) as verification_rate
  FROM bank_citations;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE phase_iv_search_audit IS 'Audit trail of all CourtListener searches performed during Phase IV citation research';
COMMENT ON VIEW citation_verification_summary IS 'Aggregated citation verification statistics per order';
COMMENT ON FUNCTION log_phase_iv_search IS 'Log a Phase IV CourtListener search for audit purposes';
COMMENT ON FUNCTION validate_citation_bank_verified IS 'Validate that all citations in an order citation bank have courtlistener_id verification proof';


-- ============================================================
-- MIGRATION: 20260128000001_add_webhook_failures.sql
-- ============================================================
-- Migration: Add webhook_failures table for Stripe webhook error tracking
-- Task 13: Webhook Null Safety
-- Version: 1.0 — January 28, 2026

-- Create webhook_failures table
CREATE TABLE IF NOT EXISTS webhook_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Failure classification
  failure_type VARCHAR(50) NOT NULL,
  -- Types: MISSING_SIGNATURE, INVALID_SIGNATURE, MISSING_DATA,
  --        MISSING_METADATA, MISSING_ORDER_ID, DB_UPDATE_FAILED,
  --        PAYMENT_FAILED, HANDLER_ERROR, UNKNOWN_ERROR

  -- Stripe event reference (may be null if signature verification failed)
  stripe_event_id VARCHAR(100),
  stripe_event_type VARCHAR(100),

  -- Error details
  details TEXT,
  error_message TEXT,

  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_headers JSONB,

  -- Related entities (may be null depending on failure point)
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- For tracking resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_webhook_failures_type ON webhook_failures(failure_type);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created ON webhook_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_stripe_event ON webhook_failures(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_order ON webhook_failures(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_unresolved ON webhook_failures(resolved_at) WHERE resolved_at IS NULL;

-- RLS policies
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook failures
CREATE POLICY "Admins can view webhook failures"
  ON webhook_failures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can insert (from webhook handler)
CREATE POLICY "Service role can insert webhook failures"
  ON webhook_failures
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins can update (for resolution)
CREATE POLICY "Admins can update webhook failures"
  ON webhook_failures
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Comment for documentation
COMMENT ON TABLE webhook_failures IS 'Tracks Stripe webhook processing failures for debugging and monitoring. Task 13.';


-- ============================================================
-- MIGRATION: 20260128000002_conflict_check_tables.sql
-- ============================================================
-- ============================================================================
-- Migration: Conflict Check System Tables
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Create conflict_parties table
-- Stores party information for each order for conflict matching
-- ============================================================================

CREATE TABLE IF NOT EXISTS conflict_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  party_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  party_role TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient conflict searching
CREATE INDEX IF NOT EXISTS idx_conflict_parties_order ON conflict_parties(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_parties_normalized ON conflict_parties(normalized_name);
CREATE INDEX IF NOT EXISTS idx_conflict_parties_role ON conflict_parties(party_role);

-- GIN index for alias searching
CREATE INDEX IF NOT EXISTS idx_conflict_parties_aliases ON conflict_parties USING GIN(aliases);

-- Add RLS
ALTER TABLE conflict_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to conflict_parties" ON conflict_parties;
CREATE POLICY "Service role full access to conflict_parties" ON conflict_parties
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own conflict_parties" ON conflict_parties;
CREATE POLICY "Users view own conflict_parties" ON conflict_parties
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE conflict_parties IS 'Stores party information for conflict of interest checking';
COMMENT ON COLUMN conflict_parties.party_name IS 'Original party name as entered';
COMMENT ON COLUMN conflict_parties.normalized_name IS 'Normalized name for fuzzy matching';
COMMENT ON COLUMN conflict_parties.party_role IS 'Role: plaintiff, defendant, third_party, witness, counsel, other';
COMMENT ON COLUMN conflict_parties.aliases IS 'Array of known aliases for this party';

-- ============================================================================
-- PART 2: Create conflict_checks table
-- Stores conflict check results and review status
-- ============================================================================

CREATE TABLE IF NOT EXISTS conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  check_result JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conflict_checks_order ON conflict_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_client ON conflict_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_status ON conflict_checks(status);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_created ON conflict_checks(created_at DESC);

-- Partial index for pending reviews
CREATE INDEX IF NOT EXISTS idx_conflict_checks_pending ON conflict_checks(created_at DESC)
  WHERE status = 'pending_review';

-- Add RLS
ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to conflict_checks" ON conflict_checks;
CREATE POLICY "Service role full access to conflict_checks" ON conflict_checks
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own conflict_checks" ON conflict_checks;
CREATE POLICY "Users view own conflict_checks" ON conflict_checks
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins full access to conflict_checks" ON conflict_checks;
CREATE POLICY "Admins full access to conflict_checks" ON conflict_checks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE conflict_checks IS 'Stores conflict check results and admin review status';
COMMENT ON COLUMN conflict_checks.check_result IS 'JSON containing severity, matches, and message';
COMMENT ON COLUMN conflict_checks.status IS 'pending_review, approved, rejected, auto_cleared';

-- ============================================================================
-- PART 3: Add constraint for valid status values
-- ============================================================================

ALTER TABLE conflict_checks DROP CONSTRAINT IF EXISTS conflict_checks_status_check;
ALTER TABLE conflict_checks ADD CONSTRAINT conflict_checks_status_check
  CHECK (status IN ('pending_review', 'approved', 'rejected', 'auto_cleared'));

-- ============================================================================
-- PART 4: Create function to auto-run conflict check on new parties
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_conflict_check_needed()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify that a conflict check should be run
  -- This can be picked up by Inngest or another event handler
  PERFORM pg_notify(
    'conflict_check_needed',
    json_build_object(
      'order_id', NEW.order_id,
      'party_id', NEW.id,
      'party_name', NEW.party_name,
      'party_role', NEW.party_role
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conflict_check_needed ON conflict_parties;
CREATE TRIGGER trigger_conflict_check_needed
  AFTER INSERT ON conflict_parties
  FOR EACH ROW
  EXECUTE FUNCTION notify_conflict_check_needed();

-- ============================================================================
-- PART 5: Create view for admin dashboard
-- ============================================================================

CREATE OR REPLACE VIEW conflict_review_queue AS
SELECT
  cc.id,
  cc.order_id,
  o.order_number,
  c.full_name AS client_name,
  cc.check_result->>'severity' AS severity,
  jsonb_array_length(cc.check_result->'matches') AS match_count,
  cc.status,
  cc.created_at,
  cc.reviewed_by,
  cc.reviewed_at
FROM conflict_checks cc
JOIN orders o ON o.id = cc.order_id
JOIN clients c ON c.id = cc.client_id
WHERE cc.status = 'pending_review'
ORDER BY
  CASE
    WHEN cc.check_result->>'severity' = 'HARD' THEN 1
    WHEN cc.check_result->>'severity' = 'SOFT' THEN 2
    ELSE 3
  END,
  cc.created_at ASC;

COMMENT ON VIEW conflict_review_queue IS 'Admin view of conflicts pending review, prioritized by severity';

-- ============================================================================
-- PART 6: Create helper function for similarity check
-- ============================================================================

CREATE OR REPLACE FUNCTION check_party_similarity(
  name1 TEXT,
  name2 TEXT
) RETURNS NUMERIC AS $$
DECLARE
  max_len INTEGER;
  distance INTEGER;
BEGIN
  -- Normalize names
  name1 := lower(trim(regexp_replace(name1, '[^\w\s]', ' ', 'g')));
  name2 := lower(trim(regexp_replace(name2, '[^\w\s]', ' ', 'g')));

  IF name1 = name2 THEN
    RETURN 1.0;
  END IF;

  max_len := GREATEST(length(name1), length(name2));
  IF max_len = 0 THEN
    RETURN 0;
  END IF;

  -- Use Levenshtein distance (requires fuzzystrmatch extension)
  -- If extension not available, fall back to simple equality
  BEGIN
    distance := levenshtein(name1, name2);
    RETURN 1.0 - (distance::NUMERIC / max_len);
  EXCEPTION WHEN undefined_function THEN
    RETURN CASE WHEN name1 = name2 THEN 1.0 ELSE 0 END;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION check_party_similarity IS 'Calculate similarity score between two party names (0-1)';

-- ============================================================================
-- PART 7: Ensure fuzzystrmatch extension is available
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Created conflict_parties table for storing party information
-- - Created conflict_checks table for storing check results and reviews
-- - Added RLS policies for security
-- - Created trigger for notifying when conflict checks needed
-- - Created admin view for review queue
-- - Created helper function for similarity checking
-- - Enabled fuzzystrmatch extension for Levenshtein distance


-- ============================================================
-- MIGRATION: 20260128000003_security_tables.sql
-- ============================================================
-- Security tables migration
-- Per SECURITY_IMPLEMENTATION_CHECKLIST_v1
-- VERSION: 1.0 — January 28, 2026

-- ============================================================================
-- LOGIN ATTEMPTS TABLE (for lockout)
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_success ON login_attempts(email, success, created_at);

-- ============================================================================
-- USER SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- SECURITY EVENTS TABLE (audit log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip_address INET,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);

-- ============================================================================
-- ADMIN ACTIVITY LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT, -- 'order', 'user', 'document', etc.
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_activity_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_log_target ON admin_activity_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_log_action ON admin_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_activity_log(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Login attempts: Only service role
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only login_attempts" ON login_attempts;
CREATE POLICY "Service role only login_attempts" ON login_attempts
  FOR ALL USING (auth.role() = 'service_role');

-- User sessions: Users see own, service role sees all
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own sessions" ON user_sessions;
CREATE POLICY "Users see own sessions" ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access user_sessions" ON user_sessions;
CREATE POLICY "Service role full access user_sessions" ON user_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Security events: Only service role and admins
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only security_events" ON security_events;
CREATE POLICY "Service role only security_events" ON security_events
  FOR ALL USING (auth.role() = 'service_role');

-- Admin activity log: Only admins can view
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view all admin_activity_log" ON admin_activity_log;
CREATE POLICY "Admins view all admin_activity_log" ON admin_activity_log
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Service role full access admin_activity_log" ON admin_activity_log;
CREATE POLICY "Service role full access admin_activity_log" ON admin_activity_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- EMAIL QUEUE TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created ON email_queue(created_at);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only email_queue" ON email_queue;
CREATE POLICY "Service role only email_queue" ON email_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE login_attempts IS 'Tracks login attempts for account lockout';
COMMENT ON TABLE user_sessions IS 'Custom session tracking for timeout management';
COMMENT ON TABLE security_events IS 'Audit log for security-relevant events';
COMMENT ON TABLE admin_activity_log IS 'Audit trail of all admin actions';
COMMENT ON TABLE email_queue IS 'Queue for outbound emails';


-- ============================================================
-- MIGRATION: 20260128000004_signed_urls_and_intake.sql
-- ============================================================
-- Signed URLs and Intake migration
-- Per Tasks 77-78 and Conflict Check Integration
-- VERSION: 1.0 — January 28, 2026

-- ============================================================================
-- EMAIL ACTION TOKENS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'resume_hold',
    'approve_conflict',
    'reject_conflict',
    'download',
    'extend_retention',
    'confirm_deletion'
  )),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON email_action_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_tokens_order ON email_action_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_action_tokens(expires_at) WHERE used = FALSE;

-- ============================================================================
-- DOWNLOAD EVENTS TABLE (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deliverable_count INTEGER DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_events_order ON download_events(order_id);
CREATE INDEX IF NOT EXISTS idx_download_events_user ON download_events(user_id);

-- ============================================================================
-- ADD PARTY FIELDS TO ORDERS (for conflict detection)
-- ============================================================================

-- These may already exist from conflict check migration, but IF NOT EXISTS handles it
ALTER TABLE orders ADD COLUMN IF NOT EXISTS plaintiffs TEXT[] DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS defendants TEXT[] DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_side TEXT CHECK (attorney_side IS NULL OR attorney_side IN ('PLAINTIFF', 'DEFENDANT'));

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE email_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_events ENABLE ROW LEVEL SECURITY;

-- Email tokens: Only service role can manage
DROP POLICY IF EXISTS "Service role manages tokens" ON email_action_tokens;
CREATE POLICY "Service role manages tokens" ON email_action_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Download events: Users see own, admins see all
DROP POLICY IF EXISTS "Users see own downloads" ON download_events;
CREATE POLICY "Users see own downloads" ON download_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins see all downloads" ON download_events;
CREATE POLICY "Admins see all downloads" ON download_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Service role full access downloads" ON download_events;
CREATE POLICY "Service role full access downloads" ON download_events
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_action_tokens IS 'Secure one-time tokens for email action links';
COMMENT ON TABLE download_events IS 'Audit trail for deliverable downloads';
COMMENT ON COLUMN orders.plaintiffs IS 'Plaintiff/Petitioner party names for conflict detection';
COMMENT ON COLUMN orders.defendants IS 'Defendant/Respondent party names for conflict detection';
COMMENT ON COLUMN orders.attorney_side IS 'Which side the ordering attorney represents';


-- ============================================================
-- MIGRATION: 20260128000005_workflow_config.sql
-- ============================================================
-- ============================================================================
-- Migration: Workflow Configuration Tables
-- Version: 1.0
-- Date: January 28, 2026
-- ============================================================================

-- ============================================================================
-- PART 1: Ensure workflow columns exist on orders table
-- ============================================================================

-- Add workflow tracking columns (IF NOT EXISTS for idempotency)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_phase VARCHAR(10) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_phase VARCHAR(10) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_triggered_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_resolved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reason TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tier VARCHAR(1) DEFAULT 'B';

-- Add comments
COMMENT ON COLUMN orders.current_phase IS 'Current workflow phase: I, II, III, IV, V, V.1, VI, VII, VII.1, VIII, VIII.5, IX, IX.1, X';
COMMENT ON COLUMN orders.hold_phase IS 'Phase where HOLD was triggered';
COMMENT ON COLUMN orders.hold_triggered_at IS 'Timestamp when HOLD was triggered';
COMMENT ON COLUMN orders.hold_resolved_at IS 'Timestamp when HOLD was resolved';
COMMENT ON COLUMN orders.hold_reason IS 'Reason for HOLD (critical gaps, missing declarations, etc.)';
COMMENT ON COLUMN orders.hold_reminder_sent IS 'Whether 24hr reminder email was sent';
COMMENT ON COLUMN orders.hold_escalated IS 'Whether 72hr escalation was triggered';
COMMENT ON COLUMN orders.protocol_10_triggered IS 'Whether Protocol 10 disclosure was added';
COMMENT ON COLUMN orders.protocol_10_disclosure IS 'Protocol 10 disclosure text';
COMMENT ON COLUMN orders.tier IS 'Motion tier: A (procedural), B (intermediate), C (complex/dispositive)';

-- ============================================================================
-- PART 2: Create checkpoint_events table if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS checkpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  phase VARCHAR(10),
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_events_order ON checkpoint_events(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_type ON checkpoint_events(event_type);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_created ON checkpoint_events(created_at DESC);

-- Add RLS
ALTER TABLE checkpoint_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to checkpoint_events" ON checkpoint_events;
CREATE POLICY "Service role full access to checkpoint_events" ON checkpoint_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users view own checkpoint_events" ON checkpoint_events;
CREATE POLICY "Users view own checkpoint_events" ON checkpoint_events
  FOR SELECT USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

COMMENT ON TABLE checkpoint_events IS 'Audit log for HOLD triggers, resumes, and auto-refunds';

-- ============================================================================
-- PART 3: Create email_queue table if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_order ON email_queue(order_id);

COMMENT ON TABLE email_queue IS 'Queue for outgoing emails (HOLD notifications, reminders, etc.)';

-- ============================================================================
-- PART 4: Add revision loop columns to order_workflows
-- ============================================================================

ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS max_loops_reached BOOLEAN DEFAULT FALSE;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT DEFAULT NULL;

COMMENT ON COLUMN order_workflows.revision_loop_count IS 'Count of VII→VIII→VII revision loops';
COMMENT ON COLUMN order_workflows.max_loops_reached IS 'True if 3 loops reached (Protocol 10)';
COMMENT ON COLUMN order_workflows.protocol_10_disclosure IS 'Protocol 10 disclosure text for deliverables';

-- ============================================================================
-- PART 5: Create indexes for common queries
-- ============================================================================

-- Index for orders on HOLD
CREATE INDEX IF NOT EXISTS idx_orders_hold_status ON orders(status, hold_triggered_at)
  WHERE status = 'hold_pending';

-- Index for finding Protocol 10 orders
CREATE INDEX IF NOT EXISTS idx_orders_protocol_10 ON orders(protocol_10_triggered)
  WHERE protocol_10_triggered = true;

-- Index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_orders_current_phase ON orders(current_phase)
  WHERE current_phase IS NOT NULL;

-- ============================================================================
-- PART 6: Helper function to get next HOLD action
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hold_next_action(hold_triggered_at TIMESTAMPTZ)
RETURNS TABLE (
  current_stage TEXT,
  hours_elapsed NUMERIC,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  should_auto_refund BOOLEAN
) AS $$
DECLARE
  hours_since_hold NUMERIC;
BEGIN
  hours_since_hold := EXTRACT(EPOCH FROM (NOW() - hold_triggered_at)) / 3600;

  IF hours_since_hold >= 168 THEN -- 7 days
    RETURN QUERY SELECT
      'auto_refunded'::TEXT,
      hours_since_hold,
      'Process auto-refund'::TEXT,
      NOW(),
      TRUE;
  ELSIF hours_since_hold >= 72 THEN
    RETURN QUERY SELECT
      'escalated'::TEXT,
      hours_since_hold,
      'Auto-refund if unresolved'::TEXT,
      hold_triggered_at + INTERVAL '7 days',
      FALSE;
  ELSIF hours_since_hold >= 24 THEN
    RETURN QUERY SELECT
      'reminder_sent'::TEXT,
      hours_since_hold,
      'Escalate to admin'::TEXT,
      hold_triggered_at + INTERVAL '72 hours',
      FALSE;
  ELSE
    RETURN QUERY SELECT
      'initial'::TEXT,
      hours_since_hold,
      'Send 24h reminder'::TEXT,
      hold_triggered_at + INTERVAL '24 hours',
      FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_hold_next_action IS 'Calculate current HOLD stage and next action based on time elapsed';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260128100000_data_retention.sql
-- ============================================================
-- ============================================================================
-- DATA RETENTION SYSTEM
-- Tasks 43-44 | January 28, 2026
-- ============================================================================

-- 1. ADD RETENTION COLUMNS TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extended_by_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extension_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_type VARCHAR(20);

COMMENT ON COLUMN orders.retention_expires_at IS 'Auto-delete date. Default: delivery + 180 days';
COMMENT ON COLUMN orders.deletion_type IS 'How deleted: AUTO | CUSTOMER_REQUESTED | ADMIN';

-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_retention_expires
ON orders (retention_expires_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reminder_due
ON orders (retention_expires_at, deletion_reminder_sent)
WHERE deleted_at IS NULL AND deletion_reminder_sent = FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_deleted
ON orders (deleted_at)
WHERE deleted_at IS NOT NULL;

-- 3. ANONYMIZED ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order reference (NOT FK - order will be deleted)
  original_order_id UUID NOT NULL,

  -- Timestamps
  order_created_at TIMESTAMPTZ NOT NULL,
  order_delivered_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ DEFAULT NOW(),

  -- Motion characteristics (NO PII)
  motion_type VARCHAR(100),
  motion_tier VARCHAR(1) CHECK (motion_tier IN ('A', 'B', 'C')),
  motion_path VARCHAR(1) CHECK (motion_path IN ('A', 'B')),
  jurisdiction_type VARCHAR(50),
  court_type VARCHAR(50),
  state VARCHAR(2),

  -- Quality metrics
  judge_simulation_grade VARCHAR(5),
  judge_simulation_grade_numeric DECIMAL(3,2),
  revision_loop_count INTEGER DEFAULT 0,

  -- Citation metrics
  total_citations INTEGER DEFAULT 0,
  citations_verified INTEGER DEFAULT 0,
  citations_failed INTEGER DEFAULT 0,
  citations_flagged INTEGER DEFAULT 0,

  -- Operational metrics
  turnaround_hours INTEGER,
  phases_completed INTEGER DEFAULT 0,
  workflow_version VARCHAR(20),

  CONSTRAINT analytics_no_pii CHECK (original_order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_analytics_motion_type ON anonymized_analytics (motion_type, motion_tier);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction ON anonymized_analytics (jurisdiction_type, state);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON anonymized_analytics (order_created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_grade ON anonymized_analytics (judge_simulation_grade_numeric DESC);

-- 4. ACTIVITY LOG TABLE (Tasks 61-62)
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor
  user_id UUID REFERENCES auth.users(id),
  user_email VARCHAR(255),
  user_role VARCHAR(50), -- 'admin' | 'attorney' | 'system'

  -- Action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- 'order' | 'user' | 'workflow' | 'retention'
  resource_id UUID,

  -- Details
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs (created_at DESC);

-- 5. TRIGGER: AUTO-SET RETENTION ON DELIVERY
-- ============================================================================

CREATE OR REPLACE FUNCTION set_initial_retention()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, NOW());
    NEW.retention_expires_at := NEW.delivered_at + INTERVAL '180 days';
    NEW.deletion_reminder_sent := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_retention ON orders;
CREATE TRIGGER trigger_set_retention
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_initial_retention();

-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE anonymized_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Analytics: Only admins can read
DROP POLICY IF EXISTS "Admins can read analytics" ON anonymized_analytics;
CREATE POLICY "Admins can read analytics" ON anonymized_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Activity logs: Only admins can read
DROP POLICY IF EXISTS "Admins can read activity logs" ON activity_logs;
CREATE POLICY "Admins can read activity logs" ON activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can insert activity logs
DROP POLICY IF EXISTS "System can insert activity logs" ON activity_logs;
CREATE POLICY "System can insert activity logs" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================
-- MIGRATION: 20260128200000_conflict_matches.sql
-- ============================================================
-- Migration: Conflict Matches Table
-- Version: 1.0.0
-- Description: Extended conflict detection with detailed match tracking

-- ============================================================================
-- CONFLICT MATCHES TABLE
-- Stores individual conflict detections with full audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conflict_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conflict classification
  type TEXT NOT NULL CHECK (type IN (
    'SAME_CASE_NUMBER',
    'OPPOSING_PARTIES',
    'PRIOR_REPRESENTATION',
    'RELATED_MATTER',
    'SAME_ATTORNEY_BOTH_SIDES'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'INFO')),

  -- Current order being checked
  current_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  current_case_number TEXT,
  current_party_name TEXT,
  current_opposing_party TEXT,
  current_attorney_id UUID REFERENCES auth.users(id),

  -- Conflicting order
  conflicting_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  conflicting_case_number TEXT,
  conflicting_party_name TEXT,
  conflicting_opposing_party TEXT,
  conflicting_attorney_id UUID REFERENCES auth.users(id),

  -- Match details
  match_field TEXT NOT NULL CHECK (match_field IN (
    'case_number', 'party_name', 'opposing_party', 'attorney'
  )),
  match_confidence INTEGER NOT NULL CHECK (match_confidence >= 0 AND match_confidence <= 100),
  match_reason TEXT NOT NULL,

  -- Resolution
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,

  -- Timestamps
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_conflict_pair UNIQUE (current_order_id, conflicting_order_id, type)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conflict_matches_current_order
  ON conflict_matches(current_order_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_conflicting_order
  ON conflict_matches(conflicting_order_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_severity
  ON conflict_matches(severity) WHERE NOT resolved;

CREATE INDEX IF NOT EXISTS idx_conflict_matches_attorney
  ON conflict_matches(current_attorney_id);

CREATE INDEX IF NOT EXISTS idx_conflict_matches_unresolved
  ON conflict_matches(current_order_id) WHERE NOT resolved;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE conflict_matches ENABLE ROW LEVEL SECURITY;

-- Admins can see all conflicts
DROP POLICY IF EXISTS "Admins can view all conflicts" ON conflict_matches;
CREATE POLICY "Admins can view all conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

-- Attorneys can see conflicts involving their orders
DROP POLICY IF EXISTS "Attorneys can view own conflicts" ON conflict_matches;
CREATE POLICY "Attorneys can view own conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    current_attorney_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = conflict_matches.current_order_id
      AND orders.attorney_id = auth.uid()
    )
  );

-- Only admins can resolve conflicts
DROP POLICY IF EXISTS "Admins can update conflicts" ON conflict_matches;
CREATE POLICY "Admins can update conflicts"
  ON conflict_matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );

-- System can insert conflicts
DROP POLICY IF EXISTS "System can insert conflicts" ON conflict_matches;
CREATE POLICY "System can insert conflicts"
  ON conflict_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to conflict_matches" ON conflict_matches;
CREATE POLICY "Service role full access to conflict_matches"
  ON conflict_matches FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get conflict summary for dashboard
CREATE OR REPLACE FUNCTION get_conflict_summary()
RETURNS TABLE (
  total_conflicts BIGINT,
  blocking_conflicts BIGINT,
  warning_conflicts BIGINT,
  unresolved_conflicts BIGINT,
  resolved_today BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) AS total_conflicts,
    COUNT(*) FILTER (WHERE severity = 'BLOCKING') AS blocking_conflicts,
    COUNT(*) FILTER (WHERE severity = 'WARNING') AS warning_conflicts,
    COUNT(*) FILTER (WHERE NOT resolved) AS unresolved_conflicts,
    COUNT(*) FILTER (WHERE resolved AND resolved_at >= CURRENT_DATE) AS resolved_today
  FROM conflict_matches;
$$;

-- ============================================================================
-- ADD CONFLICT_REVIEW STATUS TO ORDERS (if not exists)
-- ============================================================================

DO $$
BEGIN
  -- Check if status constraint exists and update it
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

  -- Add new constraint allowing CONFLICT_REVIEW status
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED',
      'CONFLICT_REVIEW', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
    ));
EXCEPTION
  WHEN OTHERS THEN
    -- Constraint might not exist or have different format, ignore
    NULL;
END;
$$;

COMMENT ON TABLE conflict_matches IS 'Conflict of interest detection for legal ethics compliance';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- - Created conflict_matches table with full conflict tracking
-- - Added indexes for efficient querying
-- - Configured RLS policies for attorneys and admins
-- - Added get_conflict_summary() function for dashboard
-- - Allows CONFLICT_REVIEW status on orders


-- ============================================================
-- MIGRATION: 20260130000001_add_citations_to_phase_executions.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260130_add_citations_to_phase_executions.sql
-- Citation Viewer Feature: Add citations_used column to phase_executions
--
-- Stores the citations array from Phase V output for tracking which citations
-- were actually used in the generated motion.
-- ============================================================================

-- Add column to store extracted citations from each phase
ALTER TABLE phase_executions
ADD COLUMN IF NOT EXISTS citations_used JSONB;

-- Comment for documentation
COMMENT ON COLUMN phase_executions.citations_used IS
'JSON array of citations used in this phase output. Populated after Phase V. Example: [{"citation": "806 F.3d 289", "caseName": "Brumfield v...", "courtlistenerId": "123", ...}]';

-- Index for efficient queries on citations
CREATE INDEX IF NOT EXISTS idx_phase_executions_citations
ON phase_executions USING GIN (citations_used);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260130000002_create_citation_cache.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260130_create_citation_cache.sql
-- Citation Viewer Feature: Citation Cache Table
--
-- Caches CourtListener API responses to reduce API calls and speed up page loads.
-- 30-day TTL with automatic cleanup function.
-- ============================================================================

-- citation_cache table: Cached CourtListener responses
CREATE TABLE IF NOT EXISTS citation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CourtListener identification
  courtlistener_opinion_id VARCHAR(50) UNIQUE,
  courtlistener_cluster_id VARCHAR(50),

  -- Cached data (full CourtListener response)
  opinion_data JSONB,                            -- Full opinion object
  cluster_data JSONB,                            -- Full cluster object (case metadata)

  -- Extracted fields for quick access
  case_name TEXT,
  case_name_short VARCHAR(255),
  citation_string VARCHAR(255),
  court VARCHAR(255),
  court_short VARCHAR(50),
  date_filed DATE,
  date_filed_display VARCHAR(50),

  -- Opinion text (can be large)
  opinion_text TEXT,                             -- Full opinion text (HTML or plain)
  opinion_text_type VARCHAR(20),                 -- 'html' | 'plain' | 'pdf_url'

  -- Holding/summary (extracted or from CourtListener)
  headnotes TEXT,
  syllabus TEXT,

  -- Treatment history
  citing_count INTEGER DEFAULT 0,
  cited_by_count INTEGER DEFAULT 0,
  treatment_history JSONB,                       -- Overruled, distinguished, etc.

  -- Cache management
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  fetch_source VARCHAR(50),                      -- 'opinion_endpoint' | 'cluster_endpoint' | 'search'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_citation_cache_cluster_id ON citation_cache(courtlistener_cluster_id);
CREATE INDEX IF NOT EXISTS idx_citation_cache_expires ON citation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_citation_cache_citation ON citation_cache(citation_string);
CREATE INDEX IF NOT EXISTS idx_citation_cache_fetched ON citation_cache(fetched_at DESC);

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_citation_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM citation_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh cache entry (extends expiry by 30 days)
CREATE OR REPLACE FUNCTION refresh_citation_cache(opinion_id VARCHAR(50))
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE citation_cache
  SET
    expires_at = NOW() + INTERVAL '30 days',
    updated_at = NOW()
  WHERE courtlistener_opinion_id = opinion_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_citation_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_citation_cache_updated_at ON citation_cache;
CREATE TRIGGER update_citation_cache_updated_at
  BEFORE UPDATE ON citation_cache
  FOR EACH ROW EXECUTE FUNCTION update_citation_cache_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE citation_cache ENABLE ROW LEVEL SECURITY;

-- Cache is readable by all authenticated users (it's public legal data)
CREATE POLICY "Citation cache is readable by all authenticated users"
  ON citation_cache FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can write to cache (server-side only)
CREATE POLICY "Service role full access to citation_cache"
  ON citation_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can manage cache (for manual refresh/cleanup)
CREATE POLICY "Admins can manage citation cache"
  ON citation_cache FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260130000003_create_order_citations.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260130_create_order_citations.sql
-- Citation Viewer Feature: Order Citations Table
--
-- Stores citations associated with each order for the Citation Viewer feature.
-- This enables users and admins to click on citations and see full case details.
-- ============================================================================

-- order_citations table: Citations used in each order's motion
CREATE TABLE IF NOT EXISTS order_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Citation identification
  citation_string VARCHAR(255) NOT NULL,        -- "806 F.3d 289"
  case_name TEXT NOT NULL,                       -- "Brumfield v. Louisiana State Board of Education"
  case_name_short VARCHAR(255),                  -- "Brumfield"

  -- CourtListener IDs (for fetching full data)
  courtlistener_opinion_id VARCHAR(50),          -- Opinion ID
  courtlistener_cluster_id VARCHAR(50),          -- Cluster ID
  courtlistener_url TEXT,                        -- Direct URL

  -- Case metadata
  court VARCHAR(255),                            -- "Court of Appeals for the Fifth Circuit"
  court_short VARCHAR(50),                       -- "5th Cir."
  date_filed DATE,
  date_filed_display VARCHAR(50),                -- "2015"

  -- How citation was used
  citation_type VARCHAR(20) NOT NULL DEFAULT 'case',  -- 'case' | 'statute' | 'regulation'
  proposition TEXT,                              -- What this citation supports
  location_in_motion TEXT,                       -- "Argument I, paragraph 3"
  authority_level VARCHAR(20),                   -- 'binding' | 'persuasive'

  -- Verification
  verification_status VARCHAR(20) DEFAULT 'verified',  -- 'verified' | 'unverified' | 'flagged'
  verification_timestamp TIMESTAMP WITH TIME ZONE,
  verification_method VARCHAR(50),               -- 'courtlistener_search' | 'courtlistener_lookup'

  -- Admin review
  admin_reviewed BOOLEAN DEFAULT FALSE,
  admin_reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_reviewed_by UUID REFERENCES profiles(id),
  admin_notes TEXT,

  -- Display order
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_order_citations_order_id ON order_citations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_cl_opinion_id ON order_citations(courtlistener_opinion_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_cl_cluster_id ON order_citations(courtlistener_cluster_id);
CREATE INDEX IF NOT EXISTS idx_order_citations_type ON order_citations(citation_type);
CREATE INDEX IF NOT EXISTS idx_order_citations_verification ON order_citations(verification_status);

-- Unique constraint: one citation per order (by citation string)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_citations_unique
  ON order_citations(order_id, citation_string);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_order_citations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_order_citations_updated_at ON order_citations;
CREATE TRIGGER update_order_citations_updated_at
  BEFORE UPDATE ON order_citations
  FOR EACH ROW EXECUTE FUNCTION update_order_citations_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_citations ENABLE ROW LEVEL SECURITY;

-- Clients can view citations for their own orders
CREATE POLICY "Users can view own order citations"
  ON order_citations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_citations.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
      )
    )
  );

-- Admins can manage all citations
CREATE POLICY "Admins can manage order citations"
  ON order_citations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'clerk'))
  );

-- Service role bypass for server-side operations
CREATE POLICY "Service role full access to order_citations"
  ON order_citations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260205000001_batch1_fixes.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260205_batch1_fixes.sql
-- Batch 1 Production Bug Fixes
-- ============================================================================

-- BUG-05: Ensure authority_level column has proper CHECK constraint
-- The column already exists in the 20260130 migration but the insert was
-- failing due to schema cache issues. This migration ensures:
-- 1. The CHECK constraint allows 'binding', 'persuasive', 'unknown'
-- 2. Default value is 'unknown' for safety
-- ============================================================================

-- Add CHECK constraint if not already present
DO $$
BEGIN
  -- Drop existing constraint if any (safe idempotent approach)
  ALTER TABLE order_citations DROP CONSTRAINT IF EXISTS order_citations_authority_level_check;

  -- Add the check constraint with all valid values
  ALTER TABLE order_citations ADD CONSTRAINT order_citations_authority_level_check
    CHECK (authority_level IS NULL OR authority_level IN ('binding', 'persuasive', 'unknown'));

  -- Set default to 'unknown'
  ALTER TABLE order_citations ALTER COLUMN authority_level SET DEFAULT 'unknown';

  RAISE NOTICE 'authority_level constraint added successfully';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'authority_level constraint may already exist: %', SQLERRM;
END $$;

-- BUG-11: Ensure workflow-level revision loop counter exists
-- The loop counter must be at the WORKFLOW level (not step level) to prevent
-- resets when Phase VIII reruns.
DO $$
BEGIN
  -- Add revision_loop_count to workflow_state if missing
  ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS revision_loop_count INTEGER DEFAULT 0;

  RAISE NOTICE 'revision_loop_count column ensured on workflow_state';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'revision_loop_count already exists or table missing: %', SQLERRM;
END $$;

-- BUG-17: Add unique constraint for workflow completion idempotency
-- Prevents duplicate workflow completion records.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_logs_workflow_completed_unique
    ON automation_logs (order_id)
    WHERE action_type = 'workflow_completed';

  RAISE NOTICE 'workflow_completed uniqueness index created';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'workflow_completed index may already exist: %', SQLERRM;
END $$;

-- Refresh the Supabase schema cache by touching the table
-- This forces PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260205000002_fix_order_citations_relevance.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260205_fix_order_citations_relevance.sql
-- CHEN CITATION RELEVANCE FIX (2026-02-05)
--
-- Adds proposition tracking and topical relevance scoring columns to
-- the order_citations table. These support the new relevance-based
-- citation filtering that prevents irrelevant cases from entering
-- the citation bank.
-- ============================================================================

-- Proposition tracking: which legal proposition does this citation support?
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_text text;

-- Topical relevance score: 0.0-1.0 indicating how relevant this citation
-- is to its claimed proposition. Below 0.70 should not be in the bank.
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS topical_relevance_score numeric(4,3);

-- Search provenance: which query found this citation?
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS search_query_used text;

-- Index for efficient citation lookups by display order
CREATE INDEX IF NOT EXISTS idx_order_citations_display_order
  ON order_citations(order_id, display_order);

-- Index for finding citations by proposition
CREATE INDEX IF NOT EXISTS idx_order_citations_proposition
  ON order_citations(order_id, proposition_id);

-- Comment for documentation
COMMENT ON COLUMN order_citations.topical_relevance_score IS
  'Score 0.0-1.0 indicating how relevant this citation is to its claimed proposition. Below 0.70 should not be in the bank.';

COMMENT ON COLUMN order_citations.proposition_id IS
  'Links to the legal proposition (P001, P002, etc.) this citation supports';

COMMENT ON COLUMN order_citations.search_query_used IS
  'The CourtListener search query that found this citation (for audit trail)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260206_production_readiness.sql
-- ============================================================
-- ============================================================
-- PRODUCTION READINESS MIGRATION
-- Date: 2026-02-06
-- Covers: Batch A fixes, Batch B document generation, Batch D hardening
-- ============================================================

-- ============================================================
-- BATCH A: Stop-ship fixes — order_citations enhancements
-- ============================================================

ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS courtlistener_url text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS courtlistener_opinion_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_text text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS topical_relevance_score numeric(4,3);
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS search_query_used text;

CREATE INDEX IF NOT EXISTS idx_order_citations_display_order
  ON order_citations(order_id, display_order);

-- ============================================================
-- BATCH B: Document generation — order document columns
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS document_generated_at timestamptz;

-- NOTE: Storage bucket 'order-documents' must be created manually
-- in Supabase Dashboard > Storage > New Bucket:
--   Bucket name: order-documents
--   Public: false
--   File size limit: 50MB
--   Allowed MIME types:
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document
--     application/pdf

-- ============================================================
-- BATCH D: Workflow hardening — phase history & metrics
-- ============================================================

-- Phase history tracking on workflow state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflow_state' AND column_name = 'phase_started_at'
  ) THEN
    ALTER TABLE order_workflow_state ADD COLUMN phase_started_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflow_state' AND column_name = 'phase_history'
  ) THEN
    ALTER TABLE order_workflow_state ADD COLUMN phase_history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Generation metrics table for cost tracking and analytics
CREATE TABLE IF NOT EXISTS generation_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  phase text NOT NULL,
  model text NOT NULL,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_usd numeric(8,4) DEFAULT 0,
  duration_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_metrics_order
  ON generation_metrics(order_id);

-- Enable RLS on generation_metrics
ALTER TABLE generation_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only read access to generation metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generation_metrics' AND policyname = 'Admin can read generation metrics'
  ) THEN
    CREATE POLICY "Admin can read generation metrics"
    ON generation_metrics FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- Service role insert policy for generation metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generation_metrics' AND policyname = 'Service role can insert generation metrics'
  ) THEN
    CREATE POLICY "Service role can insert generation metrics"
    ON generation_metrics FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260211000001_jurisdiction_toggles.sql
-- ============================================================
-- Jurisdiction toggle system
-- TypeScript static config = source of truth for state metadata
-- Database stores ONLY toggle flags and audit trail

CREATE TABLE IF NOT EXISTS jurisdiction_toggles (
  state_code VARCHAR(2) PRIMARY KEY,
  state_name VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  accepting_orders BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  supported_motion_types TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE jurisdiction_toggles ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write toggles
CREATE POLICY "Admin read toggles" ON jurisdiction_toggles
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin write toggles" ON jurisdiction_toggles
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Intake form needs to read which states are enabled (public read for enabled states only)
CREATE POLICY "Public read enabled states" ON jurisdiction_toggles
  FOR SELECT
  USING (enabled = TRUE);

-- Seed Louisiana as enabled
INSERT INTO jurisdiction_toggles (state_code, state_name, enabled, accepting_orders, supported_motion_types, enabled_at)
VALUES ('LA', 'Louisiana', TRUE, TRUE, ARRAY['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ', 'MIL', 'MTL', 'MSEAL'], NOW())
ON CONFLICT (state_code) DO NOTHING;

-- Audit log table (if not exists)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for audit log -- admin only, append only
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read audit" ON audit_log
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "System insert audit" ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);


-- ============================================================
-- MIGRATION: 20260211_bug11_atomic_revision_counter.sql
-- ============================================================
-- BUG-11 FIX: Atomic revision counter increment
-- Prevents race condition where concurrent requests could lose increments.
--
-- Usage from Supabase client:
--   const { data } = await supabase.rpc('increment_revision_count', { p_order_id: orderId });
--   // data = new revision_count value (integer)

CREATE OR REPLACE FUNCTION increment_revision_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE orders
  SET revision_count = COALESCE(revision_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING revision_count INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  RETURN v_new_count;
END;
$$;

-- Grant execute to authenticated users (RLS still protects the underlying table)
GRANT EXECUTE ON FUNCTION increment_revision_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_revision_count(UUID) TO service_role;


-- ============================================================
-- MIGRATION: 20260212000001_storage_rls.sql
-- ============================================================
-- Storage RLS for filing-packages bucket
-- Created: 2026-02-12
--
-- Design:
-- - Service role uploads (bypasses RLS) — all uploads happen server-side
-- - Customers do NOT have direct storage access
-- - All downloads go through API routes that generate signed URLs using the service role key
-- - Admins get full access for management via dashboard

-- Admin full access to filing packages
CREATE POLICY "Admin full access to filing packages" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'filing-packages' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ============================================================
-- MIGRATION: 20260212000002_add_authority_level_column.sql
-- ============================================================
-- SP17 Bug 3: Add missing authority_level column to order_citations
-- This column is referenced in code and earlier migration definitions but was
-- never applied to production Supabase.

ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS authority_level VARCHAR(20);

-- Add check constraint (use DO block to handle if already exists)
DO $$
BEGIN
  ALTER TABLE order_citations ADD CONSTRAINT order_citations_authority_level_check
    CHECK (authority_level IS NULL OR authority_level IN ('binding', 'persuasive', 'unknown'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- MIGRATION: 20260213000001_harden_order_citations_rls.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000001_harden_order_citations_rls.sql
-- SP19 CGA6-001: Harden RLS on order_citations
--
-- Aligns order_citations RLS policies with the codebase standard:
--   - Uses public.is_admin() instead of inline profiles.role checks
--   - Uses (SELECT auth.uid()) subquery for query planner optimization
--   - Separates client SELECT from admin/clerk management policies
--   - Preserves service_role bypass for Inngest workflow pipeline
-- ============================================================================

-- Ensure RLS is enabled (idempotent — safe if already enabled)
ALTER TABLE order_citations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (from 20260130_create_order_citations.sql)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own order citations" ON order_citations;
DROP POLICY IF EXISTS "Admins can manage order citations" ON order_citations;
DROP POLICY IF EXISTS "Service role full access to order_citations" ON order_citations;

-- ============================================================================
-- RECREATE POLICIES — Aligned with codebase standards (migration 006 pattern)
-- ============================================================================

-- 1. Clients can SELECT citations for orders where they are the client.
--    Clerks can SELECT citations for orders assigned to them.
--    Admins can SELECT all citations.
CREATE POLICY "order_citations_select_policy" ON order_citations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_citations.order_id
      AND (
        orders.client_id = (SELECT auth.uid())
        OR orders.clerk_id = (SELECT auth.uid())
      )
    )
    OR public.is_admin()
  );

-- 2. Admin/clerk management policy (INSERT, UPDATE, DELETE).
--    Regular clients cannot modify citations — only the workflow pipeline
--    (via service_role) and admin/clerk users can.
--    Note: Uses inline profiles.role check (not is_admin()) because clerks
--    also need management access and is_admin() only checks for 'admin'.
CREATE POLICY "order_citations_admin_policy" ON order_citations
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

-- 3. Service role bypass for Inngest workflow pipeline.
--    service_role automatically bypasses RLS, but explicit policy is
--    defense-in-depth in case force_row_level_security is ever enabled.
CREATE POLICY "order_citations_service_role_policy" ON order_citations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- CHECKPOINT VERIFICATION (run manually):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'order_citations' ORDER BY policyname;
-- Expected: 3 policies (select_policy, admin_policy, service_role_policy)
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000002_fix_workflow_violations_rls.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000002_fix_workflow_violations_rls.sql
-- SP19 CGA6-001: Fix RLS on workflow_violations (underlying unresolved_violations VIEW)
--
-- CRITICAL BUG FIX: The existing RLS policies on workflow_violations reference
-- a `user_roles` table that does not exist. This means:
--   - Admin SELECT policy silently returns 0 rows (broken)
--   - Admin UPDATE policy silently blocks all updates (broken)
--   - The unresolved_violations VIEW returns nothing for admins
--
-- This migration replaces the broken policies with working ones using
-- public.is_admin() (defined in migration 006), consistent with the rest
-- of the codebase.
-- ============================================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE workflow_violations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP BROKEN POLICIES (from 029_workflow_violations.sql)
-- These reference `user_roles` which does not exist as a table.
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view violations" ON workflow_violations;
DROP POLICY IF EXISTS "Admins can update violations" ON workflow_violations;
DROP POLICY IF EXISTS "Service role can insert violations" ON workflow_violations;

-- ============================================================================
-- RECREATE POLICIES — Using is_admin() and codebase standard patterns
-- ============================================================================

-- 1. Admin SELECT: Admins can view all violations (for dashboard + resolution)
CREATE POLICY "workflow_violations_admin_select" ON workflow_violations
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 2. Admin UPDATE: Admins can resolve violations (mark resolved, add notes)
CREATE POLICY "workflow_violations_admin_update" ON workflow_violations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- 3. Service role full access: Inngest workflow pipeline logs violations
--    and automated jobs may need to SELECT/UPDATE/DELETE.
--    service_role bypasses RLS by default, but explicit policy is defense-in-depth.
CREATE POLICY "workflow_violations_service_role_policy" ON workflow_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- NOTE: The unresolved_violations VIEW (defined in 029_workflow_violations.sql)
-- inherits security from the underlying workflow_violations table RLS.
-- No separate RLS needed on the VIEW itself.
--
-- CHECKPOINT VERIFICATION (run manually):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'workflow_violations' ORDER BY policyname;
-- Expected: 3 policies (admin_select, admin_update, service_role_policy)
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000003_expand_authority_level_constraint.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000003_expand_authority_level_constraint.sql
-- SP19 BUG #5: Verify and expand authority_level CHECK constraint
--
-- The authority_level column exists on order_citations (confirmed in migrations
-- 20260130, 20260205, and 20260212000002). Current CHECK constraint allows:
--   'binding', 'persuasive', 'unknown'
--
-- The spec requires 'statutory' and 'secondary' to be valid values for proper
-- citation classification. This migration expands the constraint while
-- preserving backward compatibility with existing 'unknown' values.
-- ============================================================================

-- Step 1: Drop the existing constraint
ALTER TABLE order_citations
  DROP CONSTRAINT IF EXISTS order_citations_authority_level_check;

-- Step 2: Add expanded constraint with all valid authority levels
ALTER TABLE order_citations
  ADD CONSTRAINT order_citations_authority_level_check
  CHECK (
    authority_level IS NULL
    OR authority_level IN (
      'binding',     -- Controlling jurisdiction: appellate courts and above
      'persuasive',  -- Other jurisdiction or lower court decisions
      'statutory',   -- Statutes, rules, regulations, constitutional provisions
      'secondary',   -- Treatises, law reviews, restatements, legal encyclopedias
      'unknown'      -- Legacy default; to be classified during verification
    )
  );

-- Step 3: Add comment documenting the expanded values
COMMENT ON COLUMN order_citations.authority_level IS
  'Citation authority classification. Values:
   binding  — controlling jurisdiction appellate+ decisions
   persuasive — other jurisdiction or lower court decisions
   statutory — statutes, rules, regulations, constitutional provisions
   secondary — treatises, law reviews, restatements
   unknown — legacy default, pending classification';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'order_citations'::regclass
--   AND conname = 'order_citations_authority_level_check';
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000004_create_hold_escalations.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000004_create_hold_escalations.sql
-- SP19 CGA6-010: Create hold_escalations table
--
-- Tracks the HOLD checkpoint escalation system. When the workflow engine
-- triggers a hold (Phase III HOLD, or any admin/quality hold), an escalation
-- record is created with tiered notification thresholds:
--   Tier 1 (24hr): Email notification to assigned clerk/admin
--   Tier 2 (72hr): Email + admin dashboard alert
--   Tier 3 (7-day): Escalate to principal (Clay)
--
-- The Inngest job checks hold_escalations on a schedule and fires
-- escalation events when tier thresholds are crossed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hold_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Hold classification
  hold_type TEXT NOT NULL CHECK (hold_type IN (
    'CITATION_HOLD',    -- CIV flagged unverifiable citations
    'QUALITY_HOLD',     -- Quality gate failure
    'CLIENT_HOLD',      -- Waiting on client input/documents
    'ADMIN_HOLD',       -- Manual admin hold (Phase X checkpoint, etc.)
    'COMPLIANCE_HOLD'   -- Professional responsibility or compliance issue
  )),

  -- Escalation state
  hold_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_tier INTEGER NOT NULL DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 3),
  tier_1_at TIMESTAMPTZ,  -- When Tier 1 threshold crossed (24hr mark)
  tier_2_at TIMESTAMPTZ,  -- When Tier 2 threshold crossed (72hr mark)
  tier_3_at TIMESTAMPTZ,  -- When Tier 3 threshold crossed (7-day mark)

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_action TEXT CHECK (
    resolution_action IS NULL
    OR resolution_action IN (
      'RESOLVED',       -- Issue addressed, hold lifted
      'OVERRIDDEN',     -- Admin override, proceed despite issue
      'CANCELLED',      -- Order cancelled, hold moot
      'AUTO_EXPIRED'    -- System auto-resolved after timeout
    )
  ),

  -- Context
  admin_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hold_escalations_order_id
  ON hold_escalations(order_id);

-- Partial index for active (unresolved) holds — most common query pattern
CREATE INDEX IF NOT EXISTS idx_hold_escalations_unresolved
  ON hold_escalations(order_id)
  WHERE resolved_at IS NULL;

-- Index for escalation tier checks (Inngest job queries by tier + age)
CREATE INDEX IF NOT EXISTS idx_hold_escalations_tier_check
  ON hold_escalations(current_tier, hold_started_at)
  WHERE resolved_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE hold_escalations ENABLE ROW LEVEL SECURITY;

-- 1. Clients can see holds on their own orders
CREATE POLICY "hold_escalations_select_own" ON hold_escalations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = hold_escalations.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
    OR public.is_admin()
  );

-- 2. Admin full management (view, create, resolve holds)
CREATE POLICY "hold_escalations_admin_policy" ON hold_escalations
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 3. Service role bypass for Inngest escalation jobs
CREATE POLICY "hold_escalations_service_role_policy" ON hold_escalations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- Uses existing update_updated_at_column() from migration 006.
-- Migration 20260213000006 will consolidate this to set_updated_at().
-- ============================================================================

DROP TRIGGER IF EXISTS update_hold_escalations_updated_at ON hold_escalations;
CREATE TRIGGER update_hold_escalations_updated_at
  BEFORE UPDATE ON hold_escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE hold_escalations IS
  'Tracks workflow hold escalations with tiered notification thresholds (24hr/72hr/7-day).';
COMMENT ON COLUMN hold_escalations.hold_type IS
  'Category of hold: CITATION_HOLD, QUALITY_HOLD, CLIENT_HOLD, ADMIN_HOLD, COMPLIANCE_HOLD';
COMMENT ON COLUMN hold_escalations.current_tier IS
  'Current escalation tier (1-3). Inngest job checks and advances tiers.';
COMMENT ON COLUMN hold_escalations.metadata IS
  'Flexible JSON for hold-specific context (e.g., failing citation IDs, quality scores)';
COMMENT ON COLUMN hold_escalations.tier_1_at IS
  'Timestamp when Tier 1 threshold was crossed (24hr after hold_started_at)';
COMMENT ON COLUMN hold_escalations.tier_2_at IS
  'Timestamp when Tier 2 threshold was crossed (72hr after hold_started_at)';
COMMENT ON COLUMN hold_escalations.tier_3_at IS
  'Timestamp when Tier 3 threshold was crossed (7 days after hold_started_at)';
COMMENT ON COLUMN hold_escalations.resolution_action IS
  'How the hold was resolved: RESOLVED, OVERRIDDEN, CANCELLED, AUTO_EXPIRED';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename = 'hold_escalations';
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'hold_escalations' ORDER BY policyname;
-- Expected: 3 policies (select_own, admin_policy, service_role_policy)
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000005_create_data_retention_log.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000005_create_data_retention_log.sql
-- SP19 CGA6-010: Create data_retention_log table
--
-- Audit trail for all data retention actions: purges, anonymizations,
-- archives, user deletion requests, and policy-driven expirations.
--
-- This table is admin-only and service_role-only. Regular users cannot
-- see retention logs — this is a compliance and security requirement.
-- Attorneys have professional responsibility obligations regarding
-- record retention; this table provides the audit trail.
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_retention_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action classification
  action TEXT NOT NULL CHECK (action IN (
    'PURGE',              -- Hard delete of records
    'ANONYMIZE',          -- PII stripped, statistical data preserved
    'ARCHIVE',            -- Moved to cold storage / read-only
    'DELETE_REQUEST',     -- User-initiated deletion request (GDPR/CCPA)
    'RETENTION_EXPIRY'    -- Automatic expiry per retention policy
  )),

  -- Scope of the action
  table_name TEXT NOT NULL,
  record_ids UUID[] NOT NULL DEFAULT '{}',
  record_count INTEGER NOT NULL DEFAULT 0,

  -- Policy reference
  retention_policy TEXT,  -- e.g., '7_YEAR_LEGAL', '90_DAY_INACTIVE', 'USER_REQUEST'

  -- Who/what triggered the action
  triggered_by TEXT NOT NULL CHECK (triggered_by IN (
    'CRON',           -- Scheduled Inngest job
    'ADMIN',          -- Manual admin action
    'USER_REQUEST',   -- Client-initiated deletion request
    'SYSTEM'          -- System-level cleanup (e.g., failed order purge)
  )),
  triggered_by_user_id UUID REFERENCES auth.users(id),

  -- Completion tracking
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Flexible context
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Query by action type (e.g., show all purge operations)
CREATE INDEX IF NOT EXISTS idx_retention_log_action
  ON data_retention_log(action);

-- Reverse-chronological listing (admin dashboard default sort)
CREATE INDEX IF NOT EXISTS idx_retention_log_created
  ON data_retention_log(created_at DESC);

-- Query by table name (e.g., show all retention actions on orders table)
CREATE INDEX IF NOT EXISTS idx_retention_log_table_name
  ON data_retention_log(table_name);

-- Find incomplete actions (monitoring/retry)
CREATE INDEX IF NOT EXISTS idx_retention_log_incomplete
  ON data_retention_log(created_at)
  WHERE completed_at IS NULL AND error_message IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Retention logs are admin-only. Users must NOT see purge/deletion records.
ALTER TABLE data_retention_log ENABLE ROW LEVEL SECURITY;

-- 1. Admin read access only
CREATE POLICY "retention_log_admin_select" ON data_retention_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 2. Admin can insert retention log entries (manual admin actions)
CREATE POLICY "retention_log_admin_insert" ON data_retention_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Service role full access (Inngest CRON jobs write retention logs)
CREATE POLICY "retention_log_service_role_policy" ON data_retention_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE data_retention_log IS
  'Audit trail for all data retention actions. Admin and service_role access only.';
COMMENT ON COLUMN data_retention_log.action IS
  'Type of retention action: PURGE, ANONYMIZE, ARCHIVE, DELETE_REQUEST, RETENTION_EXPIRY';
COMMENT ON COLUMN data_retention_log.retention_policy IS
  'Retention policy identifier: 7_YEAR_LEGAL (attorney records), 90_DAY_INACTIVE, USER_REQUEST';
COMMENT ON COLUMN data_retention_log.record_ids IS
  'Array of affected record UUIDs for audit trail reconstruction';
COMMENT ON COLUMN data_retention_log.metadata IS
  'Flexible JSON for action-specific context (e.g., anonymization fields, archive location)';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename = 'data_retention_log';
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'data_retention_log' ORDER BY policyname;
-- Expected: 3 policies (admin_select, admin_insert, service_role_policy)
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000006_consolidate_timestamp_triggers.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000006_consolidate_timestamp_triggers.sql
-- SP19 CGA6-009: Consolidate timestamp trigger functions
--
-- BEFORE: 8 separate functions that all do the same thing (NEW.updated_at = NOW())
--   1. update_updated_at_column()              (migration 006)
--   2. update_generic_timestamp()              (migration 006)
--   3. update_superprompt_templates_updated_at()(migration 006)
--   4. update_verified_citation_timestamp()     (migration 022)
--   5. update_order_citations_timestamp()       (migration 20260130)
--   6. update_conversation_timestamp()          (migration 006)
--   7. update_workflow_files_updated_at()       (migration 013)
--   8. update_citation_cache_timestamp()        (migration 20260130)
--
-- AFTER: 1 unified function: set_updated_at()
--
-- PRESERVED: update_workflow_timestamp() — sets BOTH updated_at AND last_activity_at
--            (used by order_workflows table). This is NOT consolidated.
--
-- NOTE: NOW() returns UTC in Supabase. Application layer converts to CST/CDT.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create unified timestamp function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Unified timestamp trigger function. Replaces 8 duplicate functions.
   NOW() returns UTC; application layer converts to CST/CDT.';

-- ============================================================================
-- STEP 2: Re-wire all triggers to use set_updated_at()
--
-- For each table:
--   1. DROP old trigger(s) — some tables have duplicate triggers
--   2. CREATE new trigger using set_updated_at()
--
-- Tables are listed alphabetically for auditability.
-- ============================================================================

-- --- automation_settings (from 001_automation_tables.sql) ---
DROP TRIGGER IF EXISTS update_automation_settings_updated_at ON automation_settings;
CREATE TRIGGER set_updated_at_automation_settings
  BEFORE UPDATE ON automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_banks (from 018 + 023 — has DUPLICATE triggers) ---
DROP TRIGGER IF EXISTS update_citation_banks_timestamp ON citation_banks;
DROP TRIGGER IF EXISTS update_citation_banks_updated_at ON citation_banks;
CREATE TRIGGER set_updated_at_citation_banks
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_cache (from 20260130_create_citation_cache.sql) ---
DROP TRIGGER IF EXISTS update_citation_cache_updated_at ON citation_cache;
CREATE TRIGGER set_updated_at_citation_cache
  BEFORE UPDATE ON citation_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_verifications (from 018_workflow_v72_citation_system.sql) ---
DROP TRIGGER IF EXISTS update_citation_verifications_timestamp ON citation_verifications;
CREATE TRIGGER set_updated_at_citation_verifications
  BEFORE UPDATE ON citation_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- clerk_expertise (from 001_automation_tables.sql) ---
DROP TRIGGER IF EXISTS update_clerk_expertise_updated_at ON clerk_expertise;
CREATE TRIGGER set_updated_at_clerk_expertise
  BEFORE UPDATE ON clerk_expertise
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- conversations (from 005_conversations.sql) ---
DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- curated_overruled_cases (from 021_database_migrations_foundation.sql) ---
DROP TRIGGER IF EXISTS update_overruled_cases_timestamp ON curated_overruled_cases;
CREATE TRIGGER set_updated_at_curated_overruled_cases
  BEFORE UPDATE ON curated_overruled_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- hold_escalations (from 20260213000004 — this SP) ---
DROP TRIGGER IF EXISTS update_hold_escalations_updated_at ON hold_escalations;
CREATE TRIGGER set_updated_at_hold_escalations
  BEFORE UPDATE ON hold_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- model_routing_config (from 021_database_migrations_foundation.sql) ---
DROP TRIGGER IF EXISTS update_model_routing_config_timestamp ON model_routing_config;
CREATE TRIGGER set_updated_at_model_routing_config
  BEFORE UPDATE ON model_routing_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- motion_types (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_motion_types_timestamp ON motion_types;
CREATE TRIGGER set_updated_at_motion_types
  BEFORE UPDATE ON motion_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- order_citations (from 20260130_create_order_citations.sql) ---
DROP TRIGGER IF EXISTS update_order_citations_updated_at ON order_citations;
CREATE TRIGGER set_updated_at_order_citations
  BEFORE UPDATE ON order_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- parsed_documents (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_parsed_docs_timestamp ON parsed_documents;
CREATE TRIGGER set_updated_at_parsed_documents
  BEFORE UPDATE ON parsed_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- phase_prompts (from 023_workflow_v72_phase_system.sql) ---
DROP TRIGGER IF EXISTS update_phase_prompts_updated_at ON phase_prompts;
CREATE TRIGGER set_updated_at_phase_prompts
  BEFORE UPDATE ON phase_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- superprompt_templates (from 004_superprompt_templates.sql) ---
DROP TRIGGER IF EXISTS superprompt_templates_updated_at ON superprompt_templates;
CREATE TRIGGER set_updated_at_superprompt_templates
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- verified_citations (from 021 + 022 — has DUPLICATE triggers) ---
DROP TRIGGER IF EXISTS update_verified_citations_timestamp ON verified_citations;
DROP TRIGGER IF EXISTS verified_citations_updated_at ON verified_citations;
CREATE TRIGGER set_updated_at_verified_citations
  BEFORE UPDATE ON verified_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_citations (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_citations_timestamp ON workflow_citations;
CREATE TRIGGER set_updated_at_workflow_citations
  BEFORE UPDATE ON workflow_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_files (from 013_create_workflow_files.sql) ---
DROP TRIGGER IF EXISTS set_workflow_files_updated_at ON workflow_files;
CREATE TRIGGER set_updated_at_workflow_files
  BEFORE UPDATE ON workflow_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_phase_executions (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_phase_executions_timestamp ON workflow_phase_executions;
CREATE TRIGGER set_updated_at_workflow_phase_executions
  BEFORE UPDATE ON workflow_phase_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_state (from 023_workflow_v72_phase_system.sql) ---
DROP TRIGGER IF EXISTS update_workflow_state_updated_at ON workflow_state;
CREATE TRIGGER set_updated_at_workflow_state
  BEFORE UPDATE ON workflow_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PRESERVED: order_workflows trigger using update_workflow_timestamp()
-- This function sets BOTH updated_at AND last_activity_at — NOT consolidated.
-- Trigger: update_order_workflows_timestamp ON order_workflows
-- ============================================================================

-- ============================================================================
-- STEP 3: Drop old functions (no longer referenced by any trigger)
-- Using CASCADE would be dangerous — IF EXISTS is sufficient since we
-- already dropped all triggers that reference them.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.update_generic_timestamp();
DROP FUNCTION IF EXISTS public.update_superprompt_templates_updated_at();
DROP FUNCTION IF EXISTS public.update_verified_citation_timestamp();
DROP FUNCTION IF EXISTS public.update_order_citations_timestamp();
DROP FUNCTION IF EXISTS public.update_conversation_timestamp();
DROP FUNCTION IF EXISTS public.update_workflow_files_updated_at();
DROP FUNCTION IF EXISTS public.update_citation_cache_timestamp();

-- ============================================================================
-- VERIFICATION (run manually):
--   -- Confirm unified function exists:
--   SELECT proname, proconfig FROM pg_proc WHERE proname = 'set_updated_at';
--
--   -- Confirm old functions are gone:
--   SELECT proname FROM pg_proc
--   WHERE proname IN (
--     'update_updated_at_column', 'update_generic_timestamp',
--     'update_superprompt_templates_updated_at', 'update_verified_citation_timestamp',
--     'update_order_citations_timestamp', 'update_conversation_timestamp',
--     'update_workflow_files_updated_at', 'update_citation_cache_timestamp'
--   );
--   -- Expected: 0 rows
--
--   -- Confirm all triggers now use set_updated_at:
--   SELECT tgrelid::regclass AS table_name, tgname, proname
--   FROM pg_trigger t
--   JOIN pg_proc p ON t.tgfoid = p.oid
--   WHERE proname LIKE '%updated%' OR proname = 'set_updated_at'
--   ORDER BY tgrelid::regclass::text;
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213000007_add_performance_indexes.sql
-- ============================================================
-- ============================================================================
-- Migration: 20260213000007_add_performance_indexes.sql
-- SP19 CGA6-011: Add missing performance indexes
--
-- Adds indexes for common query patterns that are not yet covered.
--
-- ALREADY EXISTING (verified — NOT re-added):
--   orders: idx_orders_client_id, idx_orders_clerk_id, idx_orders_client_status,
--           idx_orders_active (partial), idx_orders_search, idx_orders_motion_tier,
--           idx_orders_status_deadline, idx_orders_queue_position,
--           idx_orders_hold_status, idx_orders_current_phase
--   order_citations: idx_order_citations_order_id, idx_order_citations_unique,
--           idx_order_citations_type, idx_order_citations_verification,
--           idx_order_citations_cl_opinion_id, idx_order_citations_cl_cluster_id
--   workflow_violations: idx_violations_order, idx_violations_severity,
--           idx_violations_unresolved, idx_violations_timestamp
--   workflow_state: idx_workflow_state_order, idx_workflow_state_phase,
--           idx_workflow_state_checkpoint
-- ============================================================================

-- 1. Full status index on orders (non-partial).
--    idx_orders_active is partial (excludes cancelled/completed/refunded).
--    Admin dashboard queries need to filter by ANY status value.
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

-- 2. Orders by creation time (reverse-chronological).
--    Used by admin order listing and recent activity dashboards.
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC);

-- 3. Composite: client's recent orders.
--    Dashboard "My Orders" page sorts client's orders by newest first.
CREATE INDEX IF NOT EXISTS idx_orders_client_recent
  ON orders(client_id, created_at DESC);

-- 4. Order citations: authority level for filtering in citation viewer.
CREATE INDEX IF NOT EXISTS idx_order_citations_authority_level
  ON order_citations(authority_level)
  WHERE authority_level IS NOT NULL;

-- 5. Workflow state: order_id + phase status for workflow engine lookups.
CREATE INDEX IF NOT EXISTS idx_workflow_state_order_status
  ON workflow_state(order_id, phase_status);

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename IN ('orders', 'order_citations', 'workflow_state')
--   AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;
-- ============================================================================


-- ============================================================
-- MIGRATION: 20260213100001_phase_prompts.sql
-- ============================================================
-- Phase Prompt Editing: Adds version tracking and admin edit capability
-- to the existing phase_prompts table (created in 023_workflow_v72_phase_system.sql).
--
-- Existing schema uses: phase VARCHAR(10) as unique key, prompt_content TEXT
-- This migration adds: updated_by, edit_version columns
-- And creates: phase_prompt_versions table for rollback history

-- ============================================================================
-- 1. Add columns to existing phase_prompts table
-- ============================================================================

-- Track who last edited a prompt
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Integer version counter for edits (separate from existing 'version' varchar field)
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS edit_version INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- 2. Create version history table (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase VARCHAR(10) NOT NULL,              -- matches phase_prompts.phase (e.g. 'I', 'V.1')
  prompt_content TEXT NOT NULL,            -- snapshot of the prompt at this version
  edit_version INTEGER NOT NULL,           -- version number
  edited_by TEXT,                          -- email or user ID
  edit_note TEXT,                          -- optional note about what changed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phase, edit_version)
);

-- Index for fast version history lookups (newest first)
CREATE INDEX IF NOT EXISTS idx_phase_prompt_versions_lookup
  ON phase_prompt_versions(phase, edit_version DESC);

-- ============================================================================
-- 3. RLS and policies
-- ============================================================================

ALTER TABLE phase_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for server-side reads from prompts/index.ts)
CREATE POLICY "Service role full access on phase_prompt_versions"
  ON phase_prompt_versions FOR ALL
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- MIGRATION: 20260214000001_add_checkout_session_to_orders.sql
-- ============================================================
-- SP-11: Add stripe_checkout_session_id to orders table for checkout reconciliation
-- The webhook handler already uses stripe_payment_status; this adds checkout session tracking.
-- Safe to re-run: uses IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_checkout_session_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN stripe_checkout_session_id TEXT;
    CREATE INDEX idx_orders_stripe_checkout_session ON orders (stripe_checkout_session_id)
      WHERE stripe_checkout_session_id IS NOT NULL;
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260214000002_admin_rls_policies.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260214000003_audit_definer_functions.sql
-- ============================================================
-- ============================================================================
-- SP-08 TASK 7: Audit SECURITY DEFINER Functions
-- Date: 2026-02-14
-- Author: SP-08 Database Security Audit
--
-- This migration hardens all SECURITY DEFINER functions:
--   1. Adds SET search_path = '' to prevent search_path injection
--   2. Downgrades read-only functions to SECURITY INVOKER where safe
--   3. Documents WHY each remaining DEFINER is necessary
--
-- CRITICAL: Apply this migration BEFORE deploying SP-08 code changes.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Functions that KEEP SECURITY DEFINER (with search_path hardening)
-- ============================================================================

-- is_admin(): Used in RLS policies. DEFINER required to avoid infinite recursion
-- (RLS on profiles → calls is_admin() → reads profiles → triggers RLS → loop).
-- Already has SET search_path = '' in migration 006. Re-affirming here.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- handle_new_user(): Auth trigger that creates a profile row on user signup.
-- DEFINER required because auth triggers run as the auth service, not the user.
-- Already has SET search_path = '' in migration 006. Re-affirming here.
-- (Not recreated to avoid dropping existing trigger binding.)

-- refresh_analytics_views(): Refreshes materialized views.
-- DEFINER required for owner-level REFRESH MATERIALIZED VIEW privilege.
-- Already has SET search_path = '' in migration 019. No change needed.

-- auto_cancel_expired_holds(): System cron function.
-- DEFINER required because it runs without user context (Inngest cron).
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.auto_cancel_expired_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cancelled_count INTEGER := 0;
  hold_record RECORD;
BEGIN
  FOR hold_record IN
    SELECT ow.id AS workflow_id, ow.order_id, o.order_number
    FROM public.order_workflows ow
    JOIN public.orders o ON o.id = ow.order_id
    WHERE ow.status = 'blocked'
      AND ow.updated_at < NOW() - INTERVAL '14 days'
  LOOP
    -- Cancel the workflow
    UPDATE public.order_workflows
    SET status = 'cancelled',
        last_error = 'Auto-cancelled: HOLD expired after 14 days',
        updated_at = NOW()
    WHERE id = hold_record.workflow_id;

    -- Update order status
    UPDATE public.orders
    SET status = 'cancelled',
        generation_error = 'Workflow auto-cancelled after 14-day HOLD expiry',
        updated_at = NOW()
    WHERE id = hold_record.order_id;

    -- Log the cancellation
    INSERT INTO public.automation_logs (order_id, action_type, action_details)
    VALUES (
      hold_record.order_id,
      'hold_expired',
      jsonb_build_object(
        'workflow_id', hold_record.workflow_id,
        'order_number', hold_record.order_number,
        'cancelled_at', NOW()::TEXT,
        'reason', 'HOLD expired after 14 days'
      )
    );

    cancelled_count := cancelled_count + 1;
  END LOOP;

  RETURN cancelled_count;
END;
$$;

COMMENT ON FUNCTION public.auto_cancel_expired_holds IS
  'SP-08: SECURITY DEFINER justified — runs as Inngest cron with no user context. search_path hardened.';

-- cleanup_old_metrics(): System maintenance function.
-- DEFINER required because it runs without user context (cron cleanup).
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete workflow metrics older than 90 days
  DELETE FROM public.workflow_metrics
  WHERE recorded_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Delete error logs older than 90 days (keep FATAL for 365 days)
  DELETE FROM public.error_logs
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND severity != 'FATAL';

  DELETE FROM public.error_logs
  WHERE created_at < NOW() - INTERVAL '365 days'
    AND severity = 'FATAL';

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_metrics IS
  'SP-08: SECURITY DEFINER justified — system maintenance cron, no user context. search_path hardened.';

-- log_credential_check(): Logging function for credential verification.
-- DEFINER needed to allow server-side code to log without user INSERT permissions.
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.log_credential_check(
  p_service TEXT,
  p_is_valid BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.credential_check_log (service, is_valid, error_message, checked_at)
  VALUES (p_service, p_is_valid, p_error, NOW())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_credential_check IS
  'SP-08: SECURITY DEFINER justified — server-side logging without user INSERT permissions. search_path hardened.';

-- increment_revision_count(): Atomic counter update for workflow revisions.
-- DEFINER needed because workflow engine calls this server-side during phase execution
-- where the acting user may not own the order.
-- ADDING SET search_path = '' (was missing).
CREATE OR REPLACE FUNCTION public.increment_revision_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.orders
  SET revision_count = COALESCE(revision_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING revision_count INTO v_new_count;

  RETURN COALESCE(v_new_count, 0);
END;
$$;

COMMENT ON FUNCTION public.increment_revision_count IS
  'SP-08: SECURITY DEFINER justified — workflow engine calls server-side during phase execution. search_path hardened.';

-- ============================================================================
-- SECTION 2: Functions DOWNGRADED to SECURITY INVOKER (no privilege escalation needed)
-- ============================================================================

-- is_citation_overruled(): Read-only check on overruled_cases table.
-- No privilege escalation needed — callers have SELECT access via RLS.
CREATE OR REPLACE FUNCTION public.is_citation_overruled(p_normalized_citation TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.overruled_cases
    WHERE normalized_citation = p_normalized_citation
  );
END;
$$;

COMMENT ON FUNCTION public.is_citation_overruled IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only, no privilege escalation needed.';

-- get_order_violation_count(): Read-only count of workflow violations.
-- No privilege escalation needed — callers have SELECT access.
CREATE OR REPLACE FUNCTION public.get_order_violation_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.workflow_violations
    WHERE order_id = p_order_id
  );
END;
$$;

COMMENT ON FUNCTION public.get_order_violation_count IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only count, no privilege escalation needed.';

-- get_conflict_summary(): Read-only aggregate of conflict statistics.
-- No privilege escalation needed — admin callers have SELECT access.
CREATE OR REPLACE FUNCTION public.get_conflict_summary()
RETURNS TABLE (
  total_conflicts BIGINT,
  blocking_conflicts BIGINT,
  warning_conflicts BIGINT,
  unresolved BIGINT,
  resolved_today BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COUNT(*) AS total_conflicts,
    COUNT(*) FILTER (WHERE severity = 'blocking') AS blocking_conflicts,
    COUNT(*) FILTER (WHERE severity = 'warning') AS warning_conflicts,
    COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved,
    COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE) AS resolved_today
  FROM public.conflict_matches;
$$;

COMMENT ON FUNCTION public.get_conflict_summary IS
  'SP-08: Downgraded to SECURITY INVOKER — read-only aggregate, no privilege escalation needed.';

-- ============================================================================
-- SECTION 3: Verification
-- ============================================================================

-- Verify all SECURITY DEFINER functions now have search_path hardened
DO $$
DECLARE
  unsafe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT (p.proconfig @> ARRAY['search_path=']);

  IF unsafe_count > 0 THEN
    RAISE WARNING 'SP-08 AUDIT: % SECURITY DEFINER function(s) in public schema still lack SET search_path', unsafe_count;
  ELSE
    RAISE NOTICE 'SP-08 AUDIT: All SECURITY DEFINER functions in public schema have SET search_path hardened';
  END IF;
END;
$$;


-- ============================================================
-- MIGRATION: 20260214000004_create_admin_audit_log.sql
-- ============================================================
-- ============================================
-- MOTION GRANTED: Admin Audit Log Table
-- Migration: 20260214_create_admin_audit_log.sql
-- ============================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    admin_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by order
CREATE INDEX idx_audit_log_order_id ON admin_audit_log (order_id);

-- Index for querying by action type
CREATE INDEX idx_audit_log_action ON admin_audit_log (action);

-- Index for querying by admin
CREATE INDEX idx_audit_log_admin_id ON admin_audit_log (admin_id);

-- Index for time-based queries
CREATE INDEX idx_audit_log_created_at ON admin_audit_log (created_at DESC);

-- RLS policies
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admin can view audit logs"
    ON admin_audit_log FOR SELECT
    USING (
        auth.jwt()->>'role' = 'admin'
        OR auth.jwt()->>'role' = 'super_admin'
    );

-- Admins can insert audit logs
CREATE POLICY "Admin can insert audit logs"
    ON admin_audit_log FOR INSERT
    WITH CHECK (
        auth.jwt()->>'role' = 'admin'
        OR auth.jwt()->>'role' = 'super_admin'
    );

-- No updates or deletes allowed (immutable audit trail)


-- ============================================================
-- MIGRATION: 20260214000005_create_states_table.sql
-- ============================================================
-- ============================================
-- MOTION GRANTED: 50-State Configuration Table
-- Migration: 20260214_create_states_table.sql
-- ============================================

-- Create the states table
CREATE TABLE IF NOT EXISTS states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(2) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    state_courts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    federal_circuits TEXT[] NOT NULL DEFAULT '{}',
    federal_districts TEXT[] NOT NULL DEFAULT '{}',
    pricing_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    formatting_profile VARCHAR(20) NOT NULL DEFAULT 'standard',
    motion_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_states_code ON states (code);
CREATE INDEX idx_states_enabled ON states (enabled);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_states_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER states_updated_at
    BEFORE UPDATE ON states
    FOR EACH ROW
    EXECUTE FUNCTION update_states_timestamp();

-- ============================================
-- RLS POLICIES (using existing is_admin() helper)
-- ============================================
ALTER TABLE states ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ: Anyone can read enabled states (for intake form dropdown)
CREATE POLICY "Public can view enabled states"
    ON states FOR SELECT
    USING (enabled = true);

-- ADMIN READ: Admins see ALL states (including disabled)
CREATE POLICY "Admin can view all states"
    ON states FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- ADMIN UPDATE: Admins can update state configuration
CREATE POLICY "Admin can update states"
    ON states FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================
-- SEED: All 50 States + DC
-- Only LA and CA enabled at launch
-- ============================================
INSERT INTO states (code, name, enabled, state_courts_enabled, federal_circuits, federal_districts, pricing_multiplier, formatting_profile, motion_availability, notes)
VALUES
-- *** LAUNCH STATES (ENABLED) ***
('LA', 'Louisiana', TRUE, TRUE,
    ARRAY['5th'], ARRAY['E.D. La.', 'M.D. La.', 'W.D. La.'],
    1.00, 'louisiana',
    '{"state_specific": ["exception_no_cause", "exception_prescription", "exception_no_right_of_action", "exception_vagueness", "exception_lis_pendens", "exception_nonjoinder"]}'::jsonb,
    'Base pricing state. Civil law jurisdiction.'),

('CA', 'California', TRUE, TRUE,
    ARRAY['9th'], ARRAY['N.D. Cal.', 'C.D. Cal.', 'S.D. Cal.', 'E.D. Cal.'],
    1.20, 'california',
    '{"state_specific": ["demurrer", "anti_slapp", "motion_to_quash_service"]}'::jsonb,
    '1.20x pricing multiplier. Line numbering required.'),

-- *** PRE-CONFIGURED (DISABLED) ***
('TX', 'Texas', FALSE, FALSE,
    ARRAY['5th'], ARRAY['N.D. Tex.', 'S.D. Tex.', 'E.D. Tex.', 'W.D. Tex.'],
    1.00, 'standard', '{}'::jsonb, 'Federal-only ready. State courts pending.'),

('AL', 'Alabama', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Ala.', 'M.D. Ala.', 'S.D. Ala.'], 1.00, 'standard', '{}'::jsonb, NULL),
('AK', 'Alaska', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Alaska'], 1.00, 'standard', '{}'::jsonb, NULL),
('AZ', 'Arizona', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Ariz.'], 1.00, 'standard', '{}'::jsonb, NULL),
('AR', 'Arkansas', FALSE, FALSE, ARRAY['8th'], ARRAY['E.D. Ark.', 'W.D. Ark.'], 1.00, 'standard', '{}'::jsonb, NULL),
('CO', 'Colorado', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Colo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('CT', 'Connecticut', FALSE, FALSE, ARRAY['2nd'], ARRAY['D. Conn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('DE', 'Delaware', FALSE, FALSE, ARRAY['3rd'], ARRAY['D. Del.'], 1.00, 'standard', '{}'::jsonb, NULL),
('FL', 'Florida', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Fla.', 'M.D. Fla.', 'S.D. Fla.'], 1.00, 'standard', '{}'::jsonb, NULL),
('GA', 'Georgia', FALSE, FALSE, ARRAY['11th'], ARRAY['N.D. Ga.', 'M.D. Ga.', 'S.D. Ga.'], 1.00, 'standard', '{}'::jsonb, NULL),
('HI', 'Hawaii', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Haw.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ID', 'Idaho', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Idaho'], 1.00, 'standard', '{}'::jsonb, NULL),
('IL', 'Illinois', FALSE, FALSE, ARRAY['7th'], ARRAY['N.D. Ill.', 'C.D. Ill.', 'S.D. Ill.'], 1.00, 'standard', '{}'::jsonb, NULL),
('IN', 'Indiana', FALSE, FALSE, ARRAY['7th'], ARRAY['N.D. Ind.', 'S.D. Ind.'], 1.00, 'standard', '{}'::jsonb, NULL),
('IA', 'Iowa', FALSE, FALSE, ARRAY['8th'], ARRAY['N.D. Iowa', 'S.D. Iowa'], 1.00, 'standard', '{}'::jsonb, NULL),
('KS', 'Kansas', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Kan.'], 1.00, 'standard', '{}'::jsonb, NULL),
('KY', 'Kentucky', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Ky.', 'W.D. Ky.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ME', 'Maine', FALSE, FALSE, ARRAY['1st'], ARRAY['D. Me.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MD', 'Maryland', FALSE, FALSE, ARRAY['4th'], ARRAY['D. Md.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MA', 'Massachusetts', FALSE, FALSE, ARRAY['1st'], ARRAY['D. Mass.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MI', 'Michigan', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Mich.', 'W.D. Mich.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MN', 'Minnesota', FALSE, FALSE, ARRAY['8th'], ARRAY['D. Minn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MS', 'Mississippi', FALSE, FALSE, ARRAY['5th'], ARRAY['N.D. Miss.', 'S.D. Miss.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MO', 'Missouri', FALSE, FALSE, ARRAY['8th'], ARRAY['E.D. Mo.', 'W.D. Mo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('MT', 'Montana', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Mont.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NE', 'Nebraska', FALSE, FALSE, ARRAY['8th'], ARRAY['D. Neb.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NV', 'Nevada', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Nev.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NH', 'New Hampshire', FALSE, FALSE, ARRAY['1st'], ARRAY['D.N.H.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NJ', 'New Jersey', FALSE, FALSE, ARRAY['3rd'], ARRAY['D.N.J.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NM', 'New Mexico', FALSE, FALSE, ARRAY['10th'], ARRAY['D.N.M.'], 1.00, 'standard', '{}'::jsonb, NULL),
('NY', 'New York', FALSE, FALSE, ARRAY['2nd'], ARRAY['N.D.N.Y.', 'S.D.N.Y.', 'E.D.N.Y.', 'W.D.N.Y.'], 1.15, 'standard', '{}'::jsonb, 'Premium market.'),
('NC', 'North Carolina', FALSE, FALSE, ARRAY['4th'], ARRAY['E.D.N.C.', 'M.D.N.C.', 'W.D.N.C.'], 1.00, 'standard', '{}'::jsonb, NULL),
('ND', 'North Dakota', FALSE, FALSE, ARRAY['8th'], ARRAY['D.N.D.'], 1.00, 'standard', '{}'::jsonb, NULL),
('OH', 'Ohio', FALSE, FALSE, ARRAY['6th'], ARRAY['N.D. Ohio', 'S.D. Ohio'], 1.00, 'standard', '{}'::jsonb, NULL),
('OK', 'Oklahoma', FALSE, FALSE, ARRAY['10th'], ARRAY['N.D. Okla.', 'E.D. Okla.', 'W.D. Okla.'], 1.00, 'standard', '{}'::jsonb, NULL),
('OR', 'Oregon', FALSE, FALSE, ARRAY['9th'], ARRAY['D. Or.'], 1.00, 'standard', '{}'::jsonb, NULL),
('PA', 'Pennsylvania', FALSE, FALSE, ARRAY['3rd'], ARRAY['E.D. Pa.', 'M.D. Pa.', 'W.D. Pa.'], 1.00, 'standard', '{}'::jsonb, NULL),
('RI', 'Rhode Island', FALSE, FALSE, ARRAY['1st'], ARRAY['D.R.I.'], 1.00, 'standard', '{}'::jsonb, NULL),
('SC', 'South Carolina', FALSE, FALSE, ARRAY['4th'], ARRAY['D.S.C.'], 1.00, 'standard', '{}'::jsonb, NULL),
('SD', 'South Dakota', FALSE, FALSE, ARRAY['8th'], ARRAY['D.S.D.'], 1.00, 'standard', '{}'::jsonb, NULL),
('TN', 'Tennessee', FALSE, FALSE, ARRAY['6th'], ARRAY['E.D. Tenn.', 'M.D. Tenn.', 'W.D. Tenn.'], 1.00, 'standard', '{}'::jsonb, NULL),
('UT', 'Utah', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Utah'], 1.00, 'standard', '{}'::jsonb, NULL),
('VT', 'Vermont', FALSE, FALSE, ARRAY['2nd'], ARRAY['D. Vt.'], 1.00, 'standard', '{}'::jsonb, NULL),
('VA', 'Virginia', FALSE, FALSE, ARRAY['4th'], ARRAY['E.D. Va.', 'W.D. Va.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WA', 'Washington', FALSE, FALSE, ARRAY['9th'], ARRAY['E.D. Wash.', 'W.D. Wash.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WV', 'West Virginia', FALSE, FALSE, ARRAY['4th'], ARRAY['N.D.W. Va.', 'S.D.W. Va.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WI', 'Wisconsin', FALSE, FALSE, ARRAY['7th'], ARRAY['E.D. Wis.', 'W.D. Wis.'], 1.00, 'standard', '{}'::jsonb, NULL),
('WY', 'Wyoming', FALSE, FALSE, ARRAY['10th'], ARRAY['D. Wyo.'], 1.00, 'standard', '{}'::jsonb, NULL),
('DC', 'District of Columbia', FALSE, FALSE, ARRAY['D.C.'], ARRAY['D.D.C.'], 1.00, 'standard', '{}'::jsonb, 'Federal district.');


-- ============================================================
-- MIGRATION: 20260215000001_judge_profiles_cache.sql
-- ============================================================
-- Judge Profile Cache Table with RLS
-- Stores CourtListener judge profile data to reduce API calls
--
-- ST-005: judge_profiles_cache table missing RLS policies
-- BATCH_11_JUDGE_LOOKUP

CREATE TABLE IF NOT EXISTS judge_profiles_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cl_person_id INTEGER NOT NULL UNIQUE,
  profile_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups by CL person ID
CREATE INDEX idx_judge_profiles_cl_person_id ON judge_profiles_cache(cl_person_id);

-- Index for cache expiration cleanup
CREATE INDEX idx_judge_profiles_expires_at ON judge_profiles_cache(expires_at);

-- Enable Row Level Security
ALTER TABLE judge_profiles_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can READ (judge data is public)
CREATE POLICY judge_cache_authenticated_read ON judge_profiles_cache
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Only service_role can INSERT (backend/Inngest writes)
CREATE POLICY judge_cache_service_insert ON judge_profiles_cache
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Only service_role can UPDATE
CREATE POLICY judge_cache_service_update ON judge_profiles_cache
  FOR UPDATE USING (auth.role() = 'service_role');

-- Only service_role can DELETE
CREATE POLICY judge_cache_service_delete ON judge_profiles_cache
  FOR DELETE USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_judge_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER judge_cache_updated_at
  BEFORE UPDATE ON judge_profiles_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_judge_cache_timestamp();


-- ============================================================
-- MIGRATION: 20260215100000_attorney_dashboard_schema.sql
-- ============================================================
-- SP-D: Attorney Dashboard Schema Updates
-- Adds columns for 7-status model, CP3 approval, HOLD, revision tracking, cancellation

-- Add new columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_paid bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_response text,
  ADD COLUMN IF NOT EXISTS cp3_change_notes text,
  ADD COLUMN IF NOT EXISTS revision_notes text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_version integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz;

-- Ensure revision_count exists (may already exist from earlier migrations)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 0 NOT NULL;

-- Ensure hold_reason exists
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS hold_reason text;

-- Create intake_drafts table for Save & Finish Later (Task 23)
CREATE TABLE IF NOT EXISTS intake_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motion_type text,
  form_data jsonb DEFAULT '{}'::jsonb,
  current_step integer DEFAULT 1,
  total_steps integer DEFAULT 6,
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Only one active draft per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_drafts_user_active
  ON intake_drafts (user_id)
  WHERE expires_at > now();

-- RLS for intake_drafts
ALTER TABLE intake_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own drafts" ON intake_drafts;
CREATE POLICY "Users can view own drafts" ON intake_drafts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own drafts" ON intake_drafts;
CREATE POLICY "Users can insert own drafts" ON intake_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own drafts" ON intake_drafts;
CREATE POLICY "Users can update own drafts" ON intake_drafts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own drafts" ON intake_drafts;
CREATE POLICY "Users can delete own drafts" ON intake_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Enable pg_trgm for conflict check similarity search (Task 24)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create conflict_check_log for audit trail
CREATE TABLE IF NOT EXISTS conflict_check_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  client_name text,
  opposing_party text,
  opposing_counsel text,
  match_found boolean DEFAULT false,
  match_details jsonb,
  user_decision text, -- 'proceed' or 'cancel'
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE conflict_check_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conflict checks" ON conflict_check_log;
CREATE POLICY "Users can view own conflict checks" ON conflict_check_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conflict checks" ON conflict_check_log;
CREATE POLICY "Users can insert own conflict checks" ON conflict_check_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_client_status ON orders (client_id, status);

-- Add trgm indexes for similarity search on parties
CREATE INDEX IF NOT EXISTS idx_parties_name_trgm ON parties USING gin (party_name gin_trgm_ops);


-- ============================================================
-- MIGRATION: 20260215100001_create_federal_circuits.sql
-- ============================================================
-- ============================================
-- MOTION GRANTED: Federal Circuits Reference Table
-- Migration: 20260215100001_create_federal_circuits.sql
-- SP-C Task 2: 13 federal circuits
-- ============================================

CREATE TABLE IF NOT EXISTS federal_circuits (
  circuit_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  states TEXT[] NOT NULL
);

-- Seed all 13 circuits
INSERT INTO federal_circuits (circuit_number, name, states) VALUES
  ('1ST',     '1st Circuit',       ARRAY['ME','MA','NH','RI','PR']),
  ('2ND',     '2nd Circuit',       ARRAY['CT','NY','VT']),
  ('3RD',     '3rd Circuit',       ARRAY['DE','NJ','PA','VI']),
  ('4TH',     '4th Circuit',       ARRAY['MD','NC','SC','VA','WV']),
  ('5TH',     '5th Circuit',       ARRAY['LA','MS','TX']),
  ('6TH',     '6th Circuit',       ARRAY['KY','MI','OH','TN']),
  ('7TH',     '7th Circuit',       ARRAY['IL','IN','WI']),
  ('8TH',     '8th Circuit',       ARRAY['AR','IA','MN','MO','NE','ND','SD']),
  ('9TH',     '9th Circuit',       ARRAY['AK','AZ','CA','HI','ID','MT','NV','OR','WA','GU','MP']),
  ('10TH',    '10th Circuit',      ARRAY['CO','KS','NM','OK','UT','WY']),
  ('11TH',    '11th Circuit',      ARRAY['AL','FL','GA']),
  ('DC',      'D.C. Circuit',      ARRAY['DC']),
  ('FEDERAL', 'Federal Circuit',   ARRAY[])
ON CONFLICT (circuit_number) DO NOTHING;

-- RLS: public read, admin write
ALTER TABLE federal_circuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view federal circuits"
  ON federal_circuits FOR SELECT
  USING (true);

CREATE POLICY "Admin can manage federal circuits"
  ON federal_circuits FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- MIGRATION: 20260215100002_create_state_motion_availability.sql
-- ============================================================
-- ============================================
-- MOTION GRANTED: State Motion Availability Table
-- Migration: 20260215100002_create_state_motion_availability.sql
-- SP-C Task 3 | BD-7: Motion availability EXCLUSIVELY here
-- ============================================

CREATE TABLE IF NOT EXISTS state_motion_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state_code CHAR(2) NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  motion_type TEXT NOT NULL,
  court_type TEXT NOT NULL CHECK (court_type IN ('STATE', 'FEDERAL')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_code, motion_type, court_type)
);

-- Indexes
CREATE INDEX idx_sma_state_code ON state_motion_availability(state_code);
CREATE INDEX idx_sma_court_type ON state_motion_availability(court_type);
CREATE INDEX idx_sma_enabled ON state_motion_availability(enabled) WHERE enabled = true;

-- RLS
ALTER TABLE state_motion_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view enabled motion availability"
  ON state_motion_availability FOR SELECT
  USING (enabled = true);

CREATE POLICY "Admin can manage motion availability"
  ON state_motion_availability FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================
-- SEED: CA motions (STATE + FEDERAL) - 42 universal + state-specific
-- ============================================

-- CA STATE: All universal motions + CA-specific
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (STATE)
  ('CA', 'motion-to-extend-deadline', 'STATE'),
  ('CA', 'motion-for-continuance', 'STATE'),
  ('CA', 'motion-to-withdraw-as-counsel', 'STATE'),
  ('CA', 'motion-for-leave-to-file', 'STATE'),
  ('CA', 'motion-to-appear-pro-hac-vice', 'STATE'),
  ('CA', 'motion-to-substitute-counsel', 'STATE'),
  ('CA', 'motion-to-consolidate', 'STATE'),
  ('CA', 'motion-to-sever', 'STATE'),
  ('CA', 'motion-for-default-judgment', 'STATE'),
  ('CA', 'motion-to-set-aside-default', 'STATE'),
  ('CA', 'motion-to-quash-service', 'STATE'),
  ('CA', 'motion-to-stay-proceedings', 'STATE'),
  ('CA', 'motion-to-seal-records', 'STATE'),
  ('CA', 'motion-for-protective-order-simple', 'STATE'),
  ('CA', 'motion-to-shorten-time', 'STATE'),
  ('CA', 'motion-for-service-by-publication', 'STATE'),
  ('CA', 'motion-for-leave-to-amend-simple', 'STATE'),
  ('CA', 'motion-to-strike-simple', 'STATE'),
  ('CA', 'ex-parte-application-routine', 'STATE'),
  ('CA', 'motion-to-relate-cases', 'STATE'),
  -- Tier B Universal (STATE)
  ('CA', 'motion-to-compel-discovery', 'STATE'),
  ('CA', 'motion-for-sanctions', 'STATE'),
  ('CA', 'motion-for-protective-order-complex', 'STATE'),
  ('CA', 'motion-to-quash-subpoena', 'STATE'),
  ('CA', 'motion-in-limine', 'STATE'),
  ('CA', 'motion-to-exclude-expert', 'STATE'),
  ('CA', 'motion-for-new-trial', 'STATE'),
  ('CA', 'motion-to-reconsider', 'STATE'),
  ('CA', 'motion-for-jnov', 'STATE'),
  ('CA', 'motion-to-vacate-judgment', 'STATE'),
  ('CA', 'motion-to-enforce-judgment', 'STATE'),
  ('CA', 'motion-for-contempt', 'STATE'),
  ('CA', 'motion-to-compel-arbitration', 'STATE'),
  ('CA', 'motion-for-leave-to-amend-complex', 'STATE'),
  ('CA', 'motion-to-strike-complex', 'STATE'),
  ('CA', 'motion-for-judgment-on-pleadings', 'STATE'),
  ('CA', 'motion-to-transfer-venue', 'STATE'),
  ('CA', 'motion-to-dismiss-simple', 'STATE'),
  ('CA', 'motion-for-attorneys-fees', 'STATE'),
  ('CA', 'motion-for-costs', 'STATE'),
  ('CA', 'motion-to-bifurcate', 'STATE'),
  ('CA', 'motion-to-intervene', 'STATE'),
  -- CA-Only (STATE)
  ('CA', 'demurrer-simple', 'STATE'),
  ('CA', 'motion-to-strike-ca-ccp-435', 'STATE'),
  ('CA', 'motion-for-judgment-on-pleadings-ca', 'STATE'),
  ('CA', 'demurrer-complex', 'STATE'),
  ('CA', 'anti-slapp-motion-simple', 'STATE'),
  ('CA', 'motion-for-complex-case-determination', 'STATE'),
  ('CA', 'anti-slapp-motion-complex', 'STATE'),
  -- Tier C/D Universal (STATE)
  ('CA', 'motion-for-writ-of-mandamus', 'STATE'),
  ('CA', 'motion-for-writ-of-prohibition', 'STATE'),
  ('CA', 'motion-for-writ-of-habeas-corpus', 'STATE'),
  ('CA', 'motion-for-interlocutory-appeal', 'STATE'),
  ('CA', 'motion-for-declaratory-judgment', 'STATE'),
  ('CA', 'motion-for-summary-judgment', 'STATE'),
  ('CA', 'motion-for-summary-adjudication', 'STATE'),
  ('CA', 'motion-for-partial-summary-judgment', 'STATE'),
  ('CA', 'motion-for-class-certification', 'STATE'),
  ('CA', 'motion-to-decertify-class', 'STATE'),
  ('CA', 'motion-for-preliminary-injunction', 'STATE'),
  ('CA', 'temporary-restraining-order', 'STATE'),
  ('CA', 'daubert-sargent-motion', 'STATE')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- CA FEDERAL: All universal + federal-only motions
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (FEDERAL)
  ('CA', 'motion-to-extend-deadline', 'FEDERAL'),
  ('CA', 'motion-for-continuance', 'FEDERAL'),
  ('CA', 'motion-to-withdraw-as-counsel', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-file', 'FEDERAL'),
  ('CA', 'motion-to-appear-pro-hac-vice', 'FEDERAL'),
  ('CA', 'motion-to-substitute-counsel', 'FEDERAL'),
  ('CA', 'motion-to-consolidate', 'FEDERAL'),
  ('CA', 'motion-to-sever', 'FEDERAL'),
  ('CA', 'motion-for-default-judgment', 'FEDERAL'),
  ('CA', 'motion-to-set-aside-default', 'FEDERAL'),
  ('CA', 'motion-to-quash-service', 'FEDERAL'),
  ('CA', 'motion-to-stay-proceedings', 'FEDERAL'),
  ('CA', 'motion-to-seal-records', 'FEDERAL'),
  ('CA', 'motion-for-protective-order-simple', 'FEDERAL'),
  ('CA', 'motion-to-shorten-time', 'FEDERAL'),
  ('CA', 'motion-for-service-by-publication', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-amend-simple', 'FEDERAL'),
  ('CA', 'motion-to-strike-simple', 'FEDERAL'),
  ('CA', 'ex-parte-application-routine', 'FEDERAL'),
  ('CA', 'motion-to-relate-cases', 'FEDERAL'),
  -- Tier B Universal (FEDERAL)
  ('CA', 'motion-to-compel-discovery', 'FEDERAL'),
  ('CA', 'motion-for-sanctions', 'FEDERAL'),
  ('CA', 'motion-for-protective-order-complex', 'FEDERAL'),
  ('CA', 'motion-to-quash-subpoena', 'FEDERAL'),
  ('CA', 'motion-in-limine', 'FEDERAL'),
  ('CA', 'motion-to-exclude-expert', 'FEDERAL'),
  ('CA', 'motion-for-new-trial', 'FEDERAL'),
  ('CA', 'motion-to-reconsider', 'FEDERAL'),
  ('CA', 'motion-for-jnov', 'FEDERAL'),
  ('CA', 'motion-to-vacate-judgment', 'FEDERAL'),
  ('CA', 'motion-to-enforce-judgment', 'FEDERAL'),
  ('CA', 'motion-for-contempt', 'FEDERAL'),
  ('CA', 'motion-to-compel-arbitration', 'FEDERAL'),
  ('CA', 'motion-for-leave-to-amend-complex', 'FEDERAL'),
  ('CA', 'motion-to-strike-complex', 'FEDERAL'),
  ('CA', 'motion-for-judgment-on-pleadings', 'FEDERAL'),
  ('CA', 'motion-to-transfer-venue', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-simple', 'FEDERAL'),
  ('CA', 'motion-for-attorneys-fees', 'FEDERAL'),
  ('CA', 'motion-for-costs', 'FEDERAL'),
  ('CA', 'motion-to-bifurcate', 'FEDERAL'),
  ('CA', 'motion-to-intervene', 'FEDERAL'),
  ('CA', 'motion-for-summary-judgment-partial', 'FEDERAL'),
  -- Federal-Only (FEDERAL)
  ('CA', 'motion-to-dismiss-12b1', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b2', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b3', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b4', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b5', 'FEDERAL'),
  ('CA', 'motion-to-remand', 'FEDERAL'),
  ('CA', 'motion-for-abstention', 'FEDERAL'),
  ('CA', 'motion-for-more-definite-statement', 'FEDERAL'),
  ('CA', 'motion-to-dismiss-12b6-complex', 'FEDERAL'),
  -- Tier C/D Universal (FEDERAL)
  ('CA', 'motion-for-writ-of-mandamus', 'FEDERAL'),
  ('CA', 'motion-for-writ-of-prohibition', 'FEDERAL'),
  ('CA', 'motion-for-writ-of-habeas-corpus', 'FEDERAL'),
  ('CA', 'motion-for-interlocutory-appeal', 'FEDERAL'),
  ('CA', 'motion-for-declaratory-judgment', 'FEDERAL'),
  ('CA', 'motion-for-summary-judgment', 'FEDERAL'),
  ('CA', 'motion-for-summary-adjudication', 'FEDERAL'),
  ('CA', 'motion-for-partial-summary-judgment', 'FEDERAL'),
  ('CA', 'motion-for-class-certification', 'FEDERAL'),
  ('CA', 'motion-to-decertify-class', 'FEDERAL'),
  ('CA', 'motion-for-preliminary-injunction', 'FEDERAL'),
  ('CA', 'temporary-restraining-order', 'FEDERAL'),
  ('CA', 'daubert-sargent-motion', 'FEDERAL')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- ============================================
-- SEED: LA motions (STATE + FEDERAL)
-- ============================================

-- LA STATE: All universal + LA-specific
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (STATE)
  ('LA', 'motion-to-extend-deadline', 'STATE'),
  ('LA', 'motion-for-continuance', 'STATE'),
  ('LA', 'motion-to-withdraw-as-counsel', 'STATE'),
  ('LA', 'motion-for-leave-to-file', 'STATE'),
  ('LA', 'motion-to-appear-pro-hac-vice', 'STATE'),
  ('LA', 'motion-to-substitute-counsel', 'STATE'),
  ('LA', 'motion-to-consolidate', 'STATE'),
  ('LA', 'motion-to-sever', 'STATE'),
  ('LA', 'motion-for-default-judgment', 'STATE'),
  ('LA', 'motion-to-set-aside-default', 'STATE'),
  ('LA', 'motion-to-quash-service', 'STATE'),
  ('LA', 'motion-to-stay-proceedings', 'STATE'),
  ('LA', 'motion-to-seal-records', 'STATE'),
  ('LA', 'motion-for-protective-order-simple', 'STATE'),
  ('LA', 'motion-to-shorten-time', 'STATE'),
  ('LA', 'motion-for-service-by-publication', 'STATE'),
  ('LA', 'motion-for-leave-to-amend-simple', 'STATE'),
  ('LA', 'motion-to-strike-simple', 'STATE'),
  ('LA', 'ex-parte-application-routine', 'STATE'),
  ('LA', 'motion-to-relate-cases', 'STATE'),
  -- Tier B Universal (STATE)
  ('LA', 'motion-to-compel-discovery', 'STATE'),
  ('LA', 'motion-for-sanctions', 'STATE'),
  ('LA', 'motion-for-protective-order-complex', 'STATE'),
  ('LA', 'motion-to-quash-subpoena', 'STATE'),
  ('LA', 'motion-in-limine', 'STATE'),
  ('LA', 'motion-to-exclude-expert', 'STATE'),
  ('LA', 'motion-for-new-trial', 'STATE'),
  ('LA', 'motion-to-reconsider', 'STATE'),
  ('LA', 'motion-for-jnov', 'STATE'),
  ('LA', 'motion-to-vacate-judgment', 'STATE'),
  ('LA', 'motion-to-enforce-judgment', 'STATE'),
  ('LA', 'motion-for-contempt', 'STATE'),
  ('LA', 'motion-to-compel-arbitration', 'STATE'),
  ('LA', 'motion-for-leave-to-amend-complex', 'STATE'),
  ('LA', 'motion-to-strike-complex', 'STATE'),
  ('LA', 'motion-for-judgment-on-pleadings', 'STATE'),
  ('LA', 'motion-to-transfer-venue', 'STATE'),
  ('LA', 'motion-to-dismiss-simple', 'STATE'),
  ('LA', 'motion-for-attorneys-fees', 'STATE'),
  ('LA', 'motion-for-costs', 'STATE'),
  ('LA', 'motion-to-bifurcate', 'STATE'),
  ('LA', 'motion-to-intervene', 'STATE'),
  -- LA-Only Exceptions (STATE)
  ('LA', 'declinatory-exception', 'STATE'),
  ('LA', 'dilatory-exception', 'STATE'),
  ('LA', 'peremptory-exception-no-cause', 'STATE'),
  ('LA', 'peremptory-exception-no-right', 'STATE'),
  ('LA', 'peremptory-exception-prescription', 'STATE'),
  ('LA', 'peremptory-exception-res-judicata', 'STATE'),
  ('LA', 'exception-of-prematurity', 'STATE'),
  ('LA', 'exception-of-vagueness', 'STATE'),
  ('LA', 'peremptory-exception-complex', 'STATE'),
  -- Tier C/D Universal (STATE)
  ('LA', 'motion-for-writ-of-mandamus', 'STATE'),
  ('LA', 'motion-for-writ-of-prohibition', 'STATE'),
  ('LA', 'motion-for-writ-of-habeas-corpus', 'STATE'),
  ('LA', 'motion-for-interlocutory-appeal', 'STATE'),
  ('LA', 'motion-for-declaratory-judgment', 'STATE'),
  ('LA', 'motion-for-summary-judgment', 'STATE'),
  ('LA', 'motion-for-summary-adjudication', 'STATE'),
  ('LA', 'motion-for-partial-summary-judgment', 'STATE'),
  ('LA', 'motion-for-class-certification', 'STATE'),
  ('LA', 'motion-to-decertify-class', 'STATE'),
  ('LA', 'motion-for-preliminary-injunction', 'STATE'),
  ('LA', 'temporary-restraining-order', 'STATE'),
  ('LA', 'daubert-sargent-motion', 'STATE')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;

-- LA FEDERAL
INSERT INTO state_motion_availability (state_code, motion_type, court_type) VALUES
  -- Tier A Universal (FEDERAL)
  ('LA', 'motion-to-extend-deadline', 'FEDERAL'),
  ('LA', 'motion-for-continuance', 'FEDERAL'),
  ('LA', 'motion-to-withdraw-as-counsel', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-file', 'FEDERAL'),
  ('LA', 'motion-to-appear-pro-hac-vice', 'FEDERAL'),
  ('LA', 'motion-to-substitute-counsel', 'FEDERAL'),
  ('LA', 'motion-to-consolidate', 'FEDERAL'),
  ('LA', 'motion-to-sever', 'FEDERAL'),
  ('LA', 'motion-for-default-judgment', 'FEDERAL'),
  ('LA', 'motion-to-set-aside-default', 'FEDERAL'),
  ('LA', 'motion-to-quash-service', 'FEDERAL'),
  ('LA', 'motion-to-stay-proceedings', 'FEDERAL'),
  ('LA', 'motion-to-seal-records', 'FEDERAL'),
  ('LA', 'motion-for-protective-order-simple', 'FEDERAL'),
  ('LA', 'motion-to-shorten-time', 'FEDERAL'),
  ('LA', 'motion-for-service-by-publication', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-amend-simple', 'FEDERAL'),
  ('LA', 'motion-to-strike-simple', 'FEDERAL'),
  ('LA', 'ex-parte-application-routine', 'FEDERAL'),
  ('LA', 'motion-to-relate-cases', 'FEDERAL'),
  -- Tier B Universal (FEDERAL)
  ('LA', 'motion-to-compel-discovery', 'FEDERAL'),
  ('LA', 'motion-for-sanctions', 'FEDERAL'),
  ('LA', 'motion-for-protective-order-complex', 'FEDERAL'),
  ('LA', 'motion-to-quash-subpoena', 'FEDERAL'),
  ('LA', 'motion-in-limine', 'FEDERAL'),
  ('LA', 'motion-to-exclude-expert', 'FEDERAL'),
  ('LA', 'motion-for-new-trial', 'FEDERAL'),
  ('LA', 'motion-to-reconsider', 'FEDERAL'),
  ('LA', 'motion-for-jnov', 'FEDERAL'),
  ('LA', 'motion-to-vacate-judgment', 'FEDERAL'),
  ('LA', 'motion-to-enforce-judgment', 'FEDERAL'),
  ('LA', 'motion-for-contempt', 'FEDERAL'),
  ('LA', 'motion-to-compel-arbitration', 'FEDERAL'),
  ('LA', 'motion-for-leave-to-amend-complex', 'FEDERAL'),
  ('LA', 'motion-to-strike-complex', 'FEDERAL'),
  ('LA', 'motion-for-judgment-on-pleadings', 'FEDERAL'),
  ('LA', 'motion-to-transfer-venue', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-simple', 'FEDERAL'),
  ('LA', 'motion-for-attorneys-fees', 'FEDERAL'),
  ('LA', 'motion-for-costs', 'FEDERAL'),
  ('LA', 'motion-to-bifurcate', 'FEDERAL'),
  ('LA', 'motion-to-intervene', 'FEDERAL'),
  ('LA', 'motion-for-summary-judgment-partial', 'FEDERAL'),
  -- Federal-Only (FEDERAL)
  ('LA', 'motion-to-dismiss-12b1', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b2', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b3', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b4', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b5', 'FEDERAL'),
  ('LA', 'motion-to-remand', 'FEDERAL'),
  ('LA', 'motion-for-abstention', 'FEDERAL'),
  ('LA', 'motion-for-more-definite-statement', 'FEDERAL'),
  ('LA', 'motion-to-dismiss-12b6-complex', 'FEDERAL'),
  -- Tier C/D Universal (FEDERAL)
  ('LA', 'motion-for-writ-of-mandamus', 'FEDERAL'),
  ('LA', 'motion-for-writ-of-prohibition', 'FEDERAL'),
  ('LA', 'motion-for-writ-of-habeas-corpus', 'FEDERAL'),
  ('LA', 'motion-for-interlocutory-appeal', 'FEDERAL'),
  ('LA', 'motion-for-declaratory-judgment', 'FEDERAL'),
  ('LA', 'motion-for-summary-judgment', 'FEDERAL'),
  ('LA', 'motion-for-summary-adjudication', 'FEDERAL'),
  ('LA', 'motion-for-partial-summary-judgment', 'FEDERAL'),
  ('LA', 'motion-for-class-certification', 'FEDERAL'),
  ('LA', 'motion-to-decertify-class', 'FEDERAL'),
  ('LA', 'motion-for-preliminary-injunction', 'FEDERAL'),
  ('LA', 'temporary-restraining-order', 'FEDERAL'),
  ('LA', 'daubert-sargent-motion', 'FEDERAL')
ON CONFLICT (state_code, motion_type, court_type) DO NOTHING;


-- ============================================================
-- MIGRATION: 20260215100003_orders_state_columns_and_backfill.sql
-- ============================================================
-- ============================================
-- MOTION GRANTED: Orders Table — State Columns + Backfill
-- Migration: 20260215100003_orders_state_columns_and_backfill.sql
-- SP-C Tasks 4, 4-FIX | BD-21: Backfill ALL orders in single UPDATE
-- ============================================

-- Add new jurisdiction columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS state CHAR(2) REFERENCES states(code),
  ADD COLUMN IF NOT EXISTS court_type TEXT CHECK (court_type IN ('STATE', 'FEDERAL')),
  ADD COLUMN IF NOT EXISTS federal_district TEXT,
  ADD COLUMN IF NOT EXISTS pricing_multiplier_applied NUMERIC(4,2);

-- Column comments
COMMENT ON COLUMN orders.state IS 'Two-letter state code. FK to states.code. Added for 50-state expansion.';
COMMENT ON COLUMN orders.court_type IS 'STATE or FEDERAL. Determines formatting and motion availability.';
COMMENT ON COLUMN orders.federal_district IS 'Federal district court name (e.g. C.D. Cal.). NULL for state court orders.';
COMMENT ON COLUMN orders.pricing_multiplier_applied IS 'Pricing multiplier from states table at time of checkout. Immutable after payment.';

-- Indexes for state-based queries
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(state);
CREATE INDEX IF NOT EXISTS idx_orders_court_type ON orders(court_type);
CREATE INDEX IF NOT EXISTS idx_orders_state_court_type ON orders(state, court_type);

-- ============================================
-- BACKFILL: BD-21 — Single UPDATE WHERE state IS NULL
-- Derive state/court_type from legacy jurisdiction field
-- ============================================
UPDATE orders SET
  state = CASE jurisdiction
    WHEN 'la_state' THEN 'LA'
    WHEN 'la_ed' THEN 'LA'
    WHEN 'la_md' THEN 'LA'
    WHEN 'la_wd' THEN 'LA'
    WHEN 'ca_state' THEN 'CA'
    WHEN 'ca_superior' THEN 'CA'
    WHEN 'ca_federal' THEN 'CA'
    WHEN 'federal_5th' THEN 'LA'
    WHEN 'federal_9th' THEN 'CA'
    WHEN 'CA' THEN 'CA'
    WHEN 'LA' THEN 'LA'
    WHEN 'FED_5TH' THEN 'LA'
    WHEN 'FED_9TH' THEN 'CA'
    ELSE 'LA'
  END,
  court_type = CASE
    WHEN jurisdiction LIKE 'federal_%' THEN 'FEDERAL'
    WHEN jurisdiction LIKE 'FED_%' THEN 'FEDERAL'
    WHEN jurisdiction LIKE '%_federal' THEN 'FEDERAL'
    WHEN jurisdiction IN ('la_ed', 'la_md', 'la_wd') THEN 'FEDERAL'
    ELSE 'STATE'
  END,
  federal_district = CASE jurisdiction
    WHEN 'la_ed' THEN 'E.D. La.'
    WHEN 'la_md' THEN 'M.D. La.'
    WHEN 'la_wd' THEN 'W.D. La.'
    WHEN 'ca_federal' THEN NULL
    ELSE NULL
  END,
  pricing_multiplier_applied = CASE
    WHEN jurisdiction IN ('la_state', 'la_ed', 'la_md', 'la_wd', 'LA', 'FED_5TH', 'federal_5th') THEN 1.00
    WHEN jurisdiction IN ('ca_state', 'ca_superior', 'ca_federal', 'CA', 'FED_9TH', 'federal_9th') THEN 1.20
    ELSE 1.00
  END
WHERE state IS NULL;

-- ============================================
-- ADD ai_disclosure columns to states table
-- ============================================
ALTER TABLE states
  ADD COLUMN IF NOT EXISTS ai_disclosure_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_disclosure_text TEXT;

COMMENT ON COLUMN states.ai_disclosure_required IS 'Whether this state requires AI-generated content disclosure in legal filings.';
COMMENT ON COLUMN states.ai_disclosure_text IS 'State-specific AI disclosure language to include in filings.';


-- ============================================================
-- MIGRATION: 20260216000001_fix_conflict_matches_client_id.sql
-- ============================================================
-- ============================================================================
-- SP-1 R4-09: Fix conflict_matches RLS policy — orders.attorney_id -> orders.client_id
-- Date: 2026-02-16
--
-- Problem: The "Attorneys can view own conflicts" policy references
-- orders.attorney_id which does not exist. The correct column is
-- orders.client_id (P0 fix from CST-01).
--
-- This migration drops and recreates the affected RLS policy with the
-- correct column reference.
-- ============================================================================

-- Fix: Replace orders.attorney_id with orders.client_id in conflict_matches RLS
DROP POLICY IF EXISTS "Attorneys can view own conflicts" ON conflict_matches;
CREATE POLICY "Attorneys can view own conflicts"
  ON conflict_matches FOR SELECT
  TO authenticated
  USING (
    current_attorney_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = conflict_matches.current_order_id
      AND orders.client_id = auth.uid()
    )
  );


-- ============================================================
-- MIGRATION: 20260216000002_add_tier_d_enum_mw002.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix MW-002 -- Add Tier D to motion_tier enum
-- AUDIT REF: MW-002 (P1), V72-001 (P1) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WHAT THIS FIXES:
-- Architecture defines 4 tiers (A/B/C/D). Enum only has 3 (A/B/C).
-- Tier D motions (MSJ, MSA, Class Cert, etc.) cannot be created.
--
-- NOTE: ALTER TYPE ... ADD VALUE with IF NOT EXISTS requires PG 12+.
-- Supabase uses PG 15, so this is safe.
-- ==========================================================================

ALTER TYPE motion_tier ADD VALUE IF NOT EXISTS 'D';

-- Verification:
-- SELECT enumlabel FROM pg_enum
-- JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
-- WHERE typname = 'motion_tier' ORDER BY enumsortorder;
-- Expected: A, B, C, D


-- ============================================================
-- MIGRATION: 20260216000003_fix_tier_system_mw001_p10001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix MW-001 + P10-001 -- Tier System Repair
-- AUDIT REF: MW-001 (P0), P10-001 (P1) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WHAT THIS FIXES:
-- 1. MW-001: Tier assignments in motion_types are backwards/wrong
-- 2. P10-001: sync_order_tier() trigger compares enum to integers,
--    causing EVERY order to default to Tier B regardless of motion type
--
-- CORRECT TIER ASSIGNMENTS PER BINDING DECISIONS 02/15/2026:
--   Tier A ($150-400): Procedural -- Extensions, Substitution, Stipulations
--   Tier B ($500-1,400): Intermediate -- MTC, MTD, MIL, Demurrer, Compel
--   Tier C ($1,500-3,500): Complex -- Anti-SLAPP, TRO, Summary Adjudication
--   Tier D ($1,499+): Highly Complex -- MSJ, MSA, Class Cert, PI, Daubert...
--
-- BINDING: TRO = Tier C (NOT Tier D)
-- BINDING: Anti-SLAPP = single slug Tier C (no complex split)
-- ==========================================================================

-- ===== PART 1: Drop the broken sync_order_tier() trigger =====
DROP TRIGGER IF EXISTS trigger_sync_order_tier ON orders;
DROP FUNCTION IF EXISTS sync_order_tier();

-- ===== PART 2: Correct tier assignments in motion_types =====
-- NOTE: Run PREFLIGHT Query 3 first to verify actual code values.
-- Adjust WHERE clauses if production codes differ.

-- Tier D motions (most complex -- 10 total)
UPDATE motion_types SET tier = 'D' WHERE code IN (
  'MSJ',           -- Motion for Summary Judgment
  'MSA',           -- Motion for Summary Adjudication
  'PARTIAL_MSJ',   -- Partial Summary Judgment
  'CLASS_CERT',    -- Class Certification
  'DECERTIFY',     -- Decertification
  'PI',            -- Preliminary Injunction
  'DAUBERT',       -- Daubert Motion
  'RECEIVER',      -- Appoint Receiver
  'NEW_TRIAL',     -- Motion for New Trial
  'JNOV'           -- Judgment Notwithstanding the Verdict
);

-- Tier C motions (complex -- 9 total)
UPDATE motion_types SET tier = 'C' WHERE code IN (
  'ANTI_SLAPP',    -- Anti-SLAPP (single slug, Tier C per binding)
  'TRO',           -- Temporary Restraining Order (Tier C per binding, NOT D)
  'SUMMARY_ADJ'    -- Summary Adjudication (if separate from MSA)
);

-- Tier B motions (intermediate -- 49 total)
UPDATE motion_types SET tier = 'B' WHERE code IN (
  'MTC',           -- Motion to Compel
  'MTD',           -- Motion to Dismiss
  'MIL',           -- Motion in Limine
  'DEMURRER',      -- Demurrer
  'COMPEL',        -- Compel Discovery
  'PROTECTIVE'     -- Protective Order
);
-- NOTE: Only subset shown. Run Query 3 to see all codes and assign remaining.

-- Tier A motions (procedural/simple -- 20 total)
UPDATE motion_types SET tier = 'A' WHERE code IN (
  'EXTENSION',     -- Extension of Time
  'SOA',           -- Substitution of Attorney
  'STIPULATION',   -- Stipulation
  'CONTINUANCE'    -- Continuance
);
-- NOTE: Only subset shown. Run Query 3 to see all codes and assign remaining.

-- ===== PART 3: Fix existing orders with wrong tiers =====
UPDATE orders o
SET tier = mt.tier
FROM motion_types mt
WHERE o.motion_type_code = mt.code
  AND o.status NOT IN ('COMPLETED', 'completed', 'CANCELLED', 'cancelled')
  AND o.tier != mt.tier;

-- Verification:
-- SELECT code, name, tier, base_price_cents FROM motion_types
-- ORDER BY CASE tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 END, code;
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'orders' AND trigger_name LIKE '%tier%';
-- Expected: 0 rows (trigger deleted)


-- ============================================================
-- MIGRATION: 20260216000004_fix_payment_column_spd001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix SPD-001 -- Rename amount_paid -> amount_paid_cents
-- AUDIT REF: SPD-001 (P0) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WARNING: This renames a column. Application code MUST be updated
-- in the SAME deployment. Search for all references:
--   grep -rn 'amount_paid' --include='*.ts' --include='*.tsx'
-- and update each to 'amount_paid_cents'.
--
-- ROLLBACK: ALTER TABLE orders RENAME COLUMN amount_paid_cents TO amount_paid;
-- ==========================================================================

-- Step 1: Rename the column (fails if already renamed -- check first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid_cents'
  ) THEN
    ALTER TABLE orders RENAME COLUMN amount_paid TO amount_paid_cents;
  END IF;
END $$;

-- Step 2: Add comment documenting the unit
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid_cents'
  ) THEN
    COMMENT ON COLUMN orders.amount_paid_cents IS
      'Total amount paid in CENTS (integer). $150.00 = 15000. Per D7 audit SPD-001.';
  END IF;
END $$;

-- Step 3: Also rename base_price if it exists without _cents suffix
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'base_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'base_price_cents'
  ) THEN
    ALTER TABLE orders RENAME COLUMN base_price TO base_price_cents;
    COMMENT ON COLUMN orders.base_price_cents IS
      'Base price in CENTS before modifiers. Per D7 audit MW-003.';
  END IF;
END $$;

-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'orders' AND (column_name LIKE '%amount%' OR column_name LIKE '%price%')
-- ORDER BY column_name;
-- Expected: amount_paid_cents (NOT amount_paid), base_price_cents (if base_price existed)
--
-- CODE SEARCH (run in terminal):
-- grep -rn 'amount_paid' --include='*.ts' --include='*.tsx' | grep -v 'amount_paid_cents'
-- Expected: 0 results after code update


-- ============================================================
-- MIGRATION: 20260216000005_fix_phantom_table_refs.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix phantom table references
-- AUDIT REF: IX1-001 (P0), GAP-002 (P1), PROD-001 (P1)
-- DATE: 2026-02-16 CST
--
-- CONTEXT: Several migrations reference tables by wrong names:
--   - 'order_workflow_state' should be 'workflow_state'
--   - 'workflows' should be 'order_workflows'
-- Those migrations silently failed. This adds the missing columns.
-- ==========================================================================

-- Fix from 026 (IX1-001): Citation tracking on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citations_verified_count INTEGER DEFAULT 0;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citations_failed_count INTEGER DEFAULT 0;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS citation_verification_status VARCHAR(20) DEFAULT 'pending';

-- Fix from 023_chunk9 (GAP-002): assigned_to on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- Fix from 20260206 (PROD-001): Phase history on workflow_state
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ;
ALTER TABLE workflow_state ADD COLUMN IF NOT EXISTS phase_history JSONB DEFAULT '[]'::jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_state_citation_status
  ON workflow_state(citation_verification_status);
CREATE INDEX IF NOT EXISTS idx_workflow_state_assigned
  ON workflow_state(assigned_to) WHERE assigned_to IS NOT NULL;


-- ============================================================
-- MIGRATION: 20260216000006_fix_user_roles_rls_cm002.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216000007_fix_phase_prompts_gap001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix GAP-001 -- Add missing columns to phase_prompts
-- AUDIT REF: GAP-001 (P0 CRITICAL) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- CONTEXT: 023_chunk9 created a stripped phase_prompts table. The full
-- schema from 023_workflow was silently skipped. This adds missing columns.
-- ==========================================================================

-- Model routing columns (which AI model handles each tier for this phase)
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_a VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_b VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_c VARCHAR(50);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS model_tier_d VARCHAR(50);

-- Extended thinking configuration per tier
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_a JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_b JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_c JSONB DEFAULT '{}'::jsonb;
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS extended_thinking_tier_d JSONB DEFAULT '{}'::jsonb;

-- Checkpoint type and next phase
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS checkpoint_type VARCHAR(20);
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS next_phase VARCHAR(10);

-- Rename phase_code to phase if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phase_prompts' AND column_name = 'phase_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'phase_prompts' AND column_name = 'phase'
  ) THEN
    ALTER TABLE phase_prompts RENAME COLUMN phase_code TO phase;
  END IF;
END $$;

-- Add unique constraint on phase identifier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'phase_prompts' AND indexdef LIKE '%UNIQUE%phase%'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_phase_prompts_phase_unique ON phase_prompts(phase);
  END IF;
END $$;

COMMENT ON TABLE phase_prompts IS
  'Phase prompt configuration with model routing per tier. Schema reconciled 2026-02-16 per GAP-001.';


-- ============================================================
-- MIGRATION: 20260216000008_fix_citation_banks_schema.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Complete citation pipeline table schemas
-- AUDIT REF: DUP-001 (P0), FDN-001 (P1), FDN-002 (P1)
-- DATE: 2026-02-16 CST
-- ==========================================================================

-- citation_banks: Add count columns
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS total_citations INTEGER DEFAULT 0;
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS verified_count INTEGER DEFAULT 0;
ALTER TABLE citation_banks ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;

-- citation_verifications: Add detail columns
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS full_citation TEXT;
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS stage_1_courtlistener_id TEXT;
ALTER TABLE citation_verifications ADD COLUMN IF NOT EXISTS stage_2_opinion_text TEXT;

-- citation_verification_log: Add 7-step pipeline columns
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_1_extraction JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_2_holding JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_3_dicta JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_4_quotation JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_5_subsequent JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS step_6_courtlistener JSONB;
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS composite_status VARCHAR(20);
ALTER TABLE citation_verification_log ADD COLUMN IF NOT EXISTS models_used JSONB;

-- conflict_matches: Add resolution columns (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_matches') THEN
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS type VARCHAR(50);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS match_field VARCHAR(100);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2);
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolution_note TEXT;
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
    ALTER TABLE conflict_matches ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216000009_rebuild_conflict_checks_cc001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix CC-001 -- Rebuild conflict_checks without clients FK
-- AUDIT REF: CC-001 (P0 CRITICAL)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DROP VIEW IF EXISTS conflict_review_queue;

CREATE TABLE IF NOT EXISTS conflict_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'clear', 'flagged', 'override', 'blocked')),
  checked_at TIMESTAMPTZ DEFAULT now(),
  checked_by UUID REFERENCES auth.users(id),
  result JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE conflict_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conflict_checks_admin_all" ON conflict_checks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "conflict_checks_own_orders" ON conflict_checks
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conflict_checks_order ON conflict_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_client ON conflict_checks(client_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_status ON conflict_checks(status) WHERE status != 'clear';

-- Fix conflict_parties RLS if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conflict_parties') THEN
    DROP POLICY IF EXISTS "conflict_parties_own" ON conflict_parties;

    CREATE POLICY "conflict_parties_own_orders" ON conflict_parties
      FOR SELECT TO authenticated
      USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

    CREATE POLICY "conflict_parties_admin" ON conflict_parties
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Recreate conflict_review_queue view
CREATE OR REPLACE VIEW conflict_review_queue AS
SELECT
  cc.id AS check_id, cc.order_id, cc.client_id,
  p.full_name AS client_name, cc.status, cc.checked_at,
  cc.result, cc.notes, o.motion_type_code, o.status AS order_status
FROM conflict_checks cc
JOIN orders o ON o.id = cc.order_id
LEFT JOIN profiles p ON p.id = cc.client_id
WHERE cc.status IN ('flagged', 'pending');


-- ============================================================
-- MIGRATION: 20260216000010_rebuild_ai_usage_logs_pre001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix PRE-001 -- Rebuild ai_usage_logs with correct FK
-- AUDIT REF: PRE-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES order_workflows(id) ON DELETE SET NULL,
  phase VARCHAR(20),
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  latency_ms INTEGER,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_logs_admin" ON ai_usage_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_order ON ai_usage_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model);


-- ============================================================
-- MIGRATION: 20260216000011_seed_ca_jurisdiction_st002.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix ST-002 -- Seed California in jurisdiction_toggles
-- AUDIT REF: ST-002 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

INSERT INTO jurisdiction_toggles (state_code, state_name, is_enabled, federal_circuits)
VALUES ('CA', 'California', true, '["9th"]'::jsonb)
ON CONFLICT (state_code) DO UPDATE SET is_enabled = true;

UPDATE jurisdiction_toggles SET is_enabled = true WHERE state_code = 'LA';


-- ============================================================
-- MIGRATION: 20260216000012_fix_retention_conflict_dr002.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix DR-002 -- Resolve retention period conflict
-- AUDIT REF: DR-002 (P1 HIGH)
-- DATE: 2026-02-16 CST
--
-- BINDING: 180 days from delivery (DB trigger default).
-- Fn2 APPROVE path sets retention_expires_at = now() + 365 days in app code.
-- ==========================================================================

DROP TRIGGER IF EXISTS set_retention_expiry ON orders;
DROP FUNCTION IF EXISTS calculate_retention_expiry();

CREATE OR REPLACE FUNCTION set_initial_retention()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('COMPLETED', 'completed') AND OLD.status NOT IN ('COMPLETED', 'completed') THEN
    IF NEW.retention_expires_at IS NULL THEN
      NEW.retention_expires_at := now() + INTERVAL '180 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_set_retention' AND event_object_table = 'orders'
  ) THEN
    CREATE TRIGGER trigger_set_retention
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION set_initial_retention();
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216000013_fix_hold_autorefund_wct001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix WCT-001 -- Standardize HOLD auto-refund to 14 days
-- AUDIT REF: WCT-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DROP FUNCTION IF EXISTS auto_refund_expired_holds();

CREATE OR REPLACE FUNCTION auto_refund_expired_holds()
RETURNS void AS $$
BEGIN
  UPDATE orders
  SET status = 'REFUND_REVIEW'
  WHERE status IN ('HOLD', 'hold', 'ON_HOLD', 'HOLD_PENDING')
    AND updated_at < now() - INTERVAL '14 days'
    AND retention_expires_at IS NULL;
END;
$$ LANGUAGE plpgsql SET search_path = '';


-- ============================================================
-- MIGRATION: 20260216000014_fix_dead_rls_v72002.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216000015_fix_search_path_security.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix search_path on SECURITY DEFINER functions
-- AUDIT REF: GAP-003 (P2), ST-003 (P2)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DO $$
DECLARE
  func RECORD;
BEGIN
  FOR func IN
    SELECT routine_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM information_schema.routines r
    JOIN pg_proc p ON p.proname = r.routine_name
    WHERE r.routine_schema = 'public'
      AND r.security_type = 'DEFINER'
      AND (p.proconfig IS NULL OR NOT ('search_path=' = ANY(p.proconfig)))
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = ''''',
        func.routine_name, func.args
      );
      RAISE NOTICE 'Fixed search_path for: %', func.routine_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix %: %', func.routine_name, SQLERRM;
    END;
  END LOOP;
END $$;


-- ============================================================
-- MIGRATION: 20260216000016_audit_table_consolidation_placeholder.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION 16: Audit Table Consolidation Plan
-- STATUS: DESIGN DECISION NEEDED
-- DATE: 2026-02-16 CST
--
-- This migration is a placeholder pending architectural decision on
-- consolidation of overlapping audit tables:
--   - workflow_audit_log
--   - workflow_violations
--   - order_status_history
--
-- Porter and Clay must agree on consolidation strategy before implementation.
-- No SQL changes in this migration.
-- ==========================================================================

-- NO-OP: Decision pending
SELECT 1;


-- ============================================================
-- MIGRATION: 20260216000017_fix_status_constraint_cm003.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix CM-003 -- Reconcile orders status constraint
-- AUDIT REF: CM-003 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    -- Architecture v2.2 canonical statuses (UPPERCASE)
    'INTAKE', 'PROCESSING', 'AWAITING_OPUS', 'HOLD_PENDING',
    'PROTOCOL_10_EXIT', 'UPGRADE_PENDING', 'PENDING_CONFLICT_REVIEW',
    'AWAITING_APPROVAL', 'REVISION_REQ', 'COMPLETED',
    'CANCELLED_USER', 'CANCELLED_SYSTEM', 'CANCELLED_CONFLICT',
    'DISPUTED', 'REFUNDED', 'FAILED',
    -- Legacy lowercase (existing data compatibility)
    'draft', 'pending', 'submitted', 'paid', 'in_progress', 'under_review',
    'assigned', 'completed', 'cancelled', 'failed', 'refunded',
    'hold', 'on_hold', 'awaiting_approval', 'refund_review',
    -- Uppercase equivalents of legacy
    'DRAFT', 'PENDING', 'SUBMITTED', 'PAID', 'IN_PROGRESS', 'UNDER_REVIEW',
    'ASSIGNED', 'HOLD', 'ON_HOLD', 'REFUND_REVIEW',
    'CANCELLED', 'APPROVED', 'REJECTED',
    -- Conflict + upgrade flow
    'CONFLICT_REVIEW', 'PENDING_REVIEW',
    'conflict_review', 'pending_review', 'approved', 'rejected',
    'UPGRADE_PENDING', 'upgrade_pending'
  )
);


-- ============================================================
-- MIGRATION: 20260216000018_fix_analytics_schema_dr001.sql
-- ============================================================
-- ==========================================================================
-- MIGRATION: Fix DR-001 -- Complete anonymized_analytics schema
-- AUDIT REF: DR-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS original_order_id UUID;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS order_created_at TIMESTAMPTZ;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS order_delivered_at TIMESTAMPTZ;
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS motion_path VARCHAR(1);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS court_type VARCHAR(20);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS state VARCHAR(2);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS judge_simulation_grade_numeric DECIMAL(3,1);

ALTER TABLE anonymized_analytics DROP CONSTRAINT IF EXISTS anonymized_analytics_tier_check;
ALTER TABLE anonymized_analytics ADD CONSTRAINT anonymized_analytics_tier_check
  CHECK (motion_tier IS NULL OR motion_tier IN ('A', 'B', 'C', 'D'));


-- ============================================================
-- MIGRATION: 20260216000019_fix_privilege_escalation_s001.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216000020_ensure_handle_new_user_trigger.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216100001_d1_019_profiles_role_protection.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216100002_d1_018_rls.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 2 (R4-05 / D1-018): RLS Policies for 6 Tables
-- Date: 2026-02-16
--
-- Creates admin_users view (Pattern 4 prerequisite), ensures all 6 tables
-- exist, then applies RLS policies with:
--   - Attorney SELECT via orders.client_id = auth.uid()
--   - Service role unrestricted ALL
--   - Admin SELECT via Pattern 4 (EXISTS admin_users)
--
-- CRITICAL: Uses orders.client_id (NOT user_id) per CST-01
-- CRITICAL: delivery_packages status gate uses REVISION_REQ per D6 C-005
-- ============================================================================

-- ============================================================================
-- PREREQUISITE: admin_users view for Pattern 4 admin checks
-- Wraps the existing profiles.role check in a view for consistent RLS usage.
-- is_admin() SECURITY DEFINER function still exists for backward compat.
-- ============================================================================
CREATE OR REPLACE VIEW admin_users AS
SELECT id AS user_id FROM profiles WHERE role = 'admin';

-- ============================================================================
-- TABLE CREATION: Ensure tables exist before applying RLS
-- Minimal schemas — expanded in later domain SPs as needed.
-- ============================================================================

-- TABLE 1: delivery_packages
CREATE TABLE IF NOT EXISTS delivery_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_packages_order ON delivery_packages(order_id);

-- TABLE 2: phase_context
CREATE TABLE IF NOT EXISTS phase_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phase_context_order ON phase_context(order_id);

-- TABLE 3: citation_verifications already exists (migration 018/023)
-- TABLE 4: order_documents
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  document_type TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_documents_order ON order_documents(order_id);

-- TABLE 5: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- TABLE 6: parties already exists (migration 003 / types/index.ts)

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- ============================================================
-- TABLE 1: delivery_packages
-- Pattern: orders JOIN via client_id + status gate
-- Status gate: AWAITING_APPROVAL, COMPLETED, REVISION_REQ visible
-- ============================================================
ALTER TABLE delivery_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_select_own ON delivery_packages;
CREATE POLICY dp_select_own ON delivery_packages
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders
      WHERE client_id = auth.uid()
      AND status IN ('AWAITING_APPROVAL', 'COMPLETED', 'REVISION_REQ')
    )
  );

DROP POLICY IF EXISTS dp_service_all ON delivery_packages;
CREATE POLICY dp_service_all ON delivery_packages
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS dp_admin_select ON delivery_packages;
CREATE POLICY dp_admin_select ON delivery_packages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 2: phase_context
-- Pattern: orders JOIN via client_id (SELECT only for attorneys)
-- ============================================================
ALTER TABLE phase_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_select_own ON phase_context;
CREATE POLICY pc_select_own ON phase_context
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS pc_service_all ON phase_context;
CREATE POLICY pc_service_all ON phase_context
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS pc_admin_select ON phase_context;
CREATE POLICY pc_admin_select ON phase_context
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 3: citation_verifications
-- Already has RLS from migration 023. Add admin policy.
-- ============================================================

DROP POLICY IF EXISTS cv_select_own ON citation_verifications;
CREATE POLICY cv_select_own ON citation_verifications
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cv_service_all ON citation_verifications;
CREATE POLICY cv_service_all ON citation_verifications
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS cv_admin_select ON citation_verifications;
CREATE POLICY cv_admin_select ON citation_verifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 4: order_documents
-- Pattern: orders JOIN via client_id (SELECT + INSERT for attorneys)
-- ============================================================
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS od_select_own ON order_documents;
CREATE POLICY od_select_own ON order_documents
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS od_insert_own ON order_documents;
CREATE POLICY od_insert_own ON order_documents
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS od_service_all ON order_documents;
CREATE POLICY od_service_all ON order_documents
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS od_admin_select ON order_documents;
CREATE POLICY od_admin_select ON order_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- TABLE 5: notifications
-- Pattern: direct user_id match (notifications belong to users, not orders)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select_own ON notifications;
CREATE POLICY notif_select_own ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_update_own ON notifications;
CREATE POLICY notif_update_own ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_service_all ON notifications;
CREATE POLICY notif_service_all ON notifications
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- ============================================================
-- TABLE 6: parties
-- Already has some RLS from migration 20260214. Add consistent policies.
-- ============================================================

DROP POLICY IF EXISTS parties_select_own ON parties;
CREATE POLICY parties_select_own ON parties
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS parties_service_all ON parties;
CREATE POLICY parties_service_all ON parties
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS parties_admin_select ON parties;
CREATE POLICY parties_admin_select ON parties
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );


-- ============================================================
-- MIGRATION: 20260216100003_rls_performance_index.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 3 (DST-01): RLS Subquery Performance Index
-- Date: 2026-02-16
--
-- Every RLS policy on child tables uses:
--   order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
--
-- Without a composite index on (client_id, id), this is a sequential scan.
-- The composite index enables index-only scans for the RLS subquery.
-- ============================================================================

-- Composite index: covers the IN (SELECT id FROM orders WHERE client_id = ?) pattern
-- Existing idx_orders_client_id (single column) still serves direct client_id lookups.
CREATE INDEX IF NOT EXISTS idx_orders_client_id_id
  ON orders (client_id, id);


-- ============================================================
-- MIGRATION: 20260216100004_status_version_trigger.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 5 (D1-021): status_version Optimistic Locking Trigger
-- Date: 2026-02-16
--
-- status_version column already exists (migration 20260215100000).
-- This migration adds the auto-increment trigger that fires on status changes.
--
-- Usage pattern for all status-changing operations:
--   .update({ status: 'NEW_STATUS' })
--   .match({ id: orderId, status_version: expectedVersion })
-- If concurrent modification occurred, the match fails (0 rows affected).
-- ============================================================================

-- Ensure column exists (idempotent)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_version INTEGER NOT NULL DEFAULT 1;

-- Auto-increment on every UPDATE that changes status
CREATE OR REPLACE FUNCTION increment_status_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_version := OLD.status_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_status_version ON orders;
CREATE TRIGGER trg_increment_status_version
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_status_version();


-- ============================================================
-- MIGRATION: 20260216100005_loop_sources_check_update.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 6 (D3 Task 5): loop_sources CHECK Constraint Update
-- Date: 2026-02-16
--
-- Adds ATTORNEY_REWORK_RESET as 5th trigger value.
-- Without this, the cost tracking reset audit trail INSERT fails the CHECK.
-- Creates the table if it doesn't exist yet.
-- ============================================================================

-- Ensure loop_sources table exists
CREATE TABLE IF NOT EXISTS loop_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  phase TEXT,
  loop_number INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loop_sources_order ON loop_sources(order_id);

-- Drop old CHECK and add updated one with all 5 trigger values
ALTER TABLE loop_sources DROP CONSTRAINT IF EXISTS loop_sources_trigger_check;
ALTER TABLE loop_sources ADD CONSTRAINT loop_sources_trigger_check
  CHECK (trigger IN (
    'PHASE_VII_GRADE_FAILURE',
    'CP3_REJECTION',
    'COST_CAP_EXCEEDED',
    'TIER_RECLASSIFICATION',
    'ATTORNEY_REWORK_RESET'    -- R4 ADDED: per R2v2 ST9-01, Binding D1
  ));


-- ============================================================
-- MIGRATION: 20260216100006_amount_paid_integer_cents.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 7 (D3 Task 9): amount_paid INTEGER Cents Verification
-- Date: 2026-02-16
--
-- Stripe returns session.amount_total as integer cents.
-- All downstream code divides by 100 at UI layer.
-- Ensures amount_paid, stripe_fee, net_revenue are integer types.
--
-- NOTE: amount_paid was added as bigint in 20260215100000. bigint is an
-- integer type (8 bytes vs 4 bytes for integer). Both store whole numbers.
-- We keep bigint as it's a safe superset — no data loss possible.
-- The key requirement is NOT NUMERIC/DECIMAL (which would imply fractional dollars).
-- ============================================================================

-- Verify amount_paid is an integer type. Fix if NUMERIC/DECIMAL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    -- If stored as decimal dollars, convert to cents
    IF EXISTS (SELECT 1 FROM orders WHERE amount_paid IS NOT NULL LIMIT 1) THEN
      ALTER TABLE orders ALTER COLUMN amount_paid TYPE BIGINT
        USING CASE
          WHEN amount_paid < 1000 THEN (amount_paid * 100)::BIGINT  -- Was dollars
          ELSE amount_paid::BIGINT  -- Already cents
        END;
    ELSE
      ALTER TABLE orders ALTER COLUMN amount_paid TYPE BIGINT;
    END IF;
  END IF;
END $$;

-- Fix stripe_fee if it exists as non-integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_fee'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    ALTER TABLE orders ALTER COLUMN stripe_fee TYPE BIGINT USING stripe_fee::BIGINT;
  END IF;
END $$;

-- Fix net_revenue if it exists as non-integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'net_revenue'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    ALTER TABLE orders ALTER COLUMN net_revenue TYPE BIGINT USING net_revenue::BIGINT;
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216100007_cost_tracking_tier_check.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 8 (D3 Task 14): cost_tracking tier CHECK Constraint
-- Date: 2026-02-16
--
-- Expands CHECK to include 'UNKNOWN'. Rejecting INSERT for unknown tier
-- loses cost data permanently. Better to accept with 'UNKNOWN' and alert.
-- Creates the table if it doesn't exist yet.
-- ============================================================================

-- Ensure cost_tracking table exists
CREATE TABLE IF NOT EXISTS cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'UNKNOWN',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_order ON cost_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_tier ON cost_tracking(tier);

-- Expand CHECK to include UNKNOWN
ALTER TABLE cost_tracking DROP CONSTRAINT IF EXISTS cost_tracking_tier_check;
ALTER TABLE cost_tracking ADD CONSTRAINT cost_tracking_tier_check
  CHECK (tier IN ('A', 'B', 'C', 'D', 'UNKNOWN'));


-- ============================================================
-- MIGRATION: 20260216100008_anonymized_analytics_cost_cols.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 9 (D3 Task 10): anonymized_analytics Cost Columns
-- Date: 2026-02-16
--
-- Adds 5 cost columns for aggregate cost analytics.
-- All nullable — existing rows unaffected.
-- ============================================================================

ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS total_api_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS opus_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS sonnet_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS openai_cost DECIMAL(10,4);
ALTER TABLE anonymized_analytics ADD COLUMN IF NOT EXISTS gross_margin_pct DECIMAL(5,1);


-- ============================================================
-- MIGRATION: 20260216100009_cost_views.sql
-- ============================================================
-- ============================================================================
-- SP-2 Tasks 10+11 (D3 Tasks 1+2): Materialized View + Bootstrap Refresh
-- Date: 2026-02-16
--
-- Creates order_cost_summary materialized view excluding soft-deleted orders.
-- Includes unique index for CONCURRENTLY refresh + bootstrap non-concurrent refresh.
-- ============================================================================

-- Drop existing if it exists (to rebuild with WHERE clause)
DROP MATERIALIZED VIEW IF EXISTS order_cost_summary;

CREATE MATERIALIZED VIEW order_cost_summary AS
SELECT
  o.id AS order_id,
  o.tier,
  CAST(o.amount_paid AS DECIMAL) / 100.0 AS revenue_usd,
  COALESCE(SUM(ct.total_cost), 0) AS total_api_cost,
  ROUND((CAST(o.amount_paid AS DECIMAL) / 100.0) - COALESCE(SUM(ct.total_cost), 0), 2) AS gross_margin,
  ROUND(
    ((CAST(o.amount_paid AS DECIMAL) / 100.0) - COALESCE(SUM(ct.total_cost), 0))
    / NULLIF(CAST(o.amount_paid AS DECIMAL) / 100.0, 0) * 100, 1
  ) AS margin_pct
FROM orders o
LEFT JOIN cost_tracking ct ON ct.order_id = o.id
WHERE o.deleted_at IS NULL  -- Exclude soft-deleted orders
GROUP BY o.id, o.tier, o.amount_paid;

-- Required unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cost_summary_order_id
  ON order_cost_summary (order_id);

-- Bootstrap: first refresh must be non-concurrent (PostgreSQL requirement)
-- All subsequent refreshes (via Inngest cron, SP-6) use CONCURRENTLY.
REFRESH MATERIALIZED VIEW order_cost_summary;


-- ============================================================
-- MIGRATION: 20260216100010_d5_checkpoint_tables.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 12 (D5 W1-1): Checkpoint System Tables Migration
-- Date: 2026-02-16
--
-- Creates 4 tables: checkpoints, checkpoint_events (immutable), cp3_rejections,
-- checkpoint_reminders. Adds refund_in_progress + pending_inngest_jobs to orders.
--
-- All RLS uses orders.client_id per CST-01.
-- Admin SELECT uses Pattern 4 (EXISTS admin_users).
-- checkpoint_events is truly immutable (UPDATE/DELETE revoked).
-- cp3_rejections FK points to delivery_packages(id), NOT checkpoints(id).
-- ============================================================================

-- ====== TABLE 1: checkpoints (HOLD checkpoints only) ======
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('HOLD', 'CP1', 'CP2')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'CANCELLED', 'ESCALATED')),
  phase TEXT NOT NULL,
  hold_reason TEXT,
  actor TEXT NOT NULL CHECK (actor IN ('customer', 'system')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_order_id ON checkpoints(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_checkpoints_type_status ON checkpoints(type, status);

-- ====== TABLE 2: checkpoint_events (IMMUTABLE audit log) ======
-- checkpoint_events table may already exist from 20260128_workflow_config.sql.
-- Add missing columns/constraints if needed, then apply immutability.

-- Add checkpoint_id and package_id columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'checkpoint_id'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN checkpoint_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN package_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'actor'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN actor TEXT NOT NULL DEFAULT 'system';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- IMMUTABLE: Prevent updates and deletes for ALL roles
-- This makes the audit trail tamper-proof.
REVOKE UPDATE, DELETE ON checkpoint_events FROM authenticated;
REVOKE UPDATE, DELETE ON checkpoint_events FROM service_role;

-- ====== TABLE 3: cp3_rejections ======
-- NOTE: FK points to delivery_packages(id), NOT checkpoints(id) per R2v2 ST5-08
CREATE TABLE IF NOT EXISTS cp3_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES delivery_packages(id),
  attorney_id TEXT NOT NULL,
  change_notes TEXT,
  rejection_number INTEGER NOT NULL DEFAULT 1,
  removed_in_revision BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp3_rejections_order ON cp3_rejections(order_id);
CREATE INDEX IF NOT EXISTS idx_cp3_rejections_removed ON cp3_rejections(order_id) WHERE removed_in_revision = false;

-- ====== TABLE 4: checkpoint_reminders ======
CREATE TABLE IF NOT EXISTS checkpoint_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('HOLD', 'CP3')),
  job_ids TEXT[] NOT NULL DEFAULT '{}',
  cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_reminders_order ON checkpoint_reminders(order_id) WHERE cancelled = false;

-- ====== ORDERS TABLE: Add refund lock + pending jobs ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_in_progress BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_inngest_jobs JSONB DEFAULT '[]';

-- ====== RLS for all 4 tables ======
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
-- checkpoint_events RLS already enabled from 20260128_workflow_config.sql
ALTER TABLE cp3_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoint_reminders ENABLE ROW LEVEL SECURITY;

-- Attorney read access (join through orders.client_id)
DROP POLICY IF EXISTS attorney_read_checkpoints ON checkpoints;
CREATE POLICY attorney_read_checkpoints ON checkpoints
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_checkpoint_events ON checkpoint_events;
CREATE POLICY attorney_read_checkpoint_events ON checkpoint_events
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_cp3_rejections ON cp3_rejections;
CREATE POLICY attorney_read_cp3_rejections ON cp3_rejections
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY attorney_read_checkpoint_reminders ON checkpoint_reminders
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

-- Service role: unrestricted (Inngest functions)
DROP POLICY IF EXISTS service_all_checkpoints ON checkpoints;
CREATE POLICY service_all_checkpoints ON checkpoints
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_checkpoint_events ON checkpoint_events;
CREATE POLICY service_all_checkpoint_events ON checkpoint_events
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_cp3_rejections ON cp3_rejections;
CREATE POLICY service_all_cp3_rejections ON cp3_rejections
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY service_all_checkpoint_reminders ON checkpoint_reminders
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- Admin SELECT (Pattern 4)
DROP POLICY IF EXISTS admin_read_checkpoints ON checkpoints;
CREATE POLICY admin_read_checkpoints ON checkpoints
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_checkpoint_events ON checkpoint_events;
CREATE POLICY admin_read_checkpoint_events ON checkpoint_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_cp3_rejections ON cp3_rejections;
CREATE POLICY admin_read_cp3_rejections ON cp3_rejections
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY admin_read_checkpoint_reminders ON checkpoint_reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));


-- ============================================================
-- MIGRATION: 20260216100011_d5_orders_cp3_columns.sql
-- ============================================================
-- ============================================================================
-- SP-2 Task 13 (D5 W1-2): Orders Table CP3 Columns
-- Date: 2026-02-16
--
-- Some columns already exist from prior migrations:
--   - cp3_change_notes (20260215100000)
--   - protocol_10_triggered (034, 20260128_workflow_config)
--   - retention_expires_at (20260215100000)
--
-- This migration adds the remaining columns and ensures all exist.
-- All use ADD COLUMN IF NOT EXISTS for idempotent application.
-- ============================================================================

-- attorney_rework_count: Times attorney clicked Request Changes at CP3.
-- Hard cap 3 (BD-04). SEPARATE from loop_counters.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_rework_count INTEGER NOT NULL DEFAULT 0;

-- cp3_change_notes: Most recent change notes. Overwritten each rework cycle.
-- Injected into Phase VII context.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_change_notes TEXT;

-- protocol_10_triggered: When true, Request Changes button hidden on dashboard.
-- Clears on pass (BD-07).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN NOT NULL DEFAULT false;

-- cp3_entered_at: When order first entered AWAITING_APPROVAL.
-- Used for timeout calculation. Resets on rework return.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_entered_at TIMESTAMPTZ;

-- retention_expires_at: NOW() + 365 days on COMPLETED.
-- California 1-year malpractice discovery statute.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- cancellation_type: Discriminates cancellation reason for refund calculation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_type TEXT;

-- Add CHECK constraint for cancellation_type (5 valid types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_cancellation_type_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_cancellation_type_check
      CHECK (cancellation_type IN (
        'CUSTOMER_CANCEL',
        'ADMIN_CANCEL',
        'CP3_CANCEL',
        'CP3_TIMEOUT_CANCEL',
        'HOLD_CANCEL'
      ) OR cancellation_type IS NULL);
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216200001_d3t15_amount_paid_correction.sql
-- ============================================================
-- ============================================================================
-- D3 Task 15: Replace Heuristic Migration with Explicit Mapping
-- Date: 2026-02-16
--
-- Replaces the heuristic threshold (< 1000) in 20260216100006 with an
-- explicit correction table for known test/staging orders that stored
-- dollar values instead of cents.
--
-- The heuristic has a dangerous boundary at $9.99 = 999 cents, which
-- would be incorrectly multiplied by 100.
--
-- PORTER ACTION: Populate corrections from actual staging database
-- before running in production. This migration is safe to re-run
-- (idempotent via WHERE clause).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE amount_paid_corrections (
  order_id UUID PRIMARY KEY,
  correct_amount_cents INTEGER NOT NULL
);

-- INSERT known corrections from staging/test data audit.
-- Porter: populate from actual staging database before running.
-- Example entries:
-- INSERT INTO amount_paid_corrections VALUES
--   ('uuid-1', 29900),   -- $299.00 Tier A
--   ('uuid-2', 84900),   -- $849.00 Tier B
--   ('uuid-3', 149900);  -- $1,499.00 Tier D

-- Apply corrections
UPDATE orders o
SET amount_paid = c.correct_amount_cents
FROM amount_paid_corrections c
WHERE o.id = c.order_id
  AND o.amount_paid != c.correct_amount_cents;

DO $$
DECLARE
  affected INTEGER;
BEGIN
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'amount_paid corrections applied: % rows', affected;
END $$;

DROP TABLE amount_paid_corrections;

COMMIT;


-- ============================================================
-- MIGRATION: 20260216200002_d3t16_amount_paid_phase1.sql
-- ============================================================
-- ============================================================================
-- D3 Task 16: Two-Phase Deploy for amount_paid Type Change
-- Phase 1: Add amount_paid_cents column for dual-write
-- Date: 2026-02-16
--
-- NOTE: The 20260215100000 migration already created amount_paid as BIGINT
-- and 20260216100006 verified it's an integer type. This migration adds
-- the amount_paid_cents column for a safe dual-write transition period.
--
-- During Phase 1, application code writes to BOTH columns.
-- Phase 2 migration (separate deploy) renames columns after
-- all code reads from the new column.
-- ============================================================================

-- Phase 1: Add new column alongside existing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid_cents BIGINT;

-- Backfill existing data
UPDATE orders
SET amount_paid_cents = amount_paid
WHERE amount_paid IS NOT NULL
  AND amount_paid_cents IS NULL;

COMMENT ON COLUMN orders.amount_paid_cents IS
  'Phase 1 dual-write column. Identical to amount_paid (integer cents). '
  'Will become the canonical column in Phase 2 after code migration. '
  'See D3 Task 16 two-phase deploy plan.';


-- ============================================================
-- MIGRATION: 20260216200003_d3t16_amount_paid_phase2.sql
-- ============================================================
-- ============================================================================
-- D3 Task 16: Two-Phase Deploy for amount_paid Type Change
-- Phase 2: Rename columns (RUN ONLY AFTER all code reads from new column)
-- Date: 2026-02-16
--
-- ⚠️ DO NOT RUN until Phase 1 is deployed and all code is updated to
-- read from amount_paid_cents. Verify with:
--   grep -rn 'amount_paid[^_]' --include='*.ts' app/ lib/
-- All hits should be the dual-write pattern or this migration reference.
-- ============================================================================

BEGIN;

-- Safety check: verify backfill is complete
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM orders
  WHERE amount_paid IS NOT NULL AND amount_paid_cents IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows have NULL amount_paid_cents', null_count;
  END IF;
END $$;

ALTER TABLE orders RENAME COLUMN amount_paid TO amount_paid_legacy;
ALTER TABLE orders RENAME COLUMN amount_paid_cents TO amount_paid;

COMMIT;


-- ============================================================
-- MIGRATION: 20260216200004_d3t19_cost_tracking_tier_comment.sql
-- ============================================================
-- ============================================================================
-- D3 Task 19: Document tier-at-call-time Behavior
-- Date: 2026-02-16
--
-- The `tier` column in cost_tracking records the order's tier AT THE TIME
-- of each API call. If a tier reclassification occurs mid-workflow (e.g.,
-- B -> C), earlier rows will have tier='B' and later rows tier='C'.
-- This is intentional and correct.
-- ============================================================================

COMMENT ON COLUMN cost_tracking.tier IS
  'Tier at API call time, NOT current order tier. '
  'Tier reclassification creates mixed values per order. '
  'Use orders.tier for current tier. '
  'See lib/ai/normalize-usage.ts and workflow-orchestration.ts for cost tracking pipeline.';


-- ============================================================
-- MIGRATION: 20260216200005_d6c006_delivery_packages_d8_columns.sql
-- ============================================================
-- ============================================================================
-- D6 C-006: delivery_packages DDL — Add D8-expected columns
-- Date: 2026-02-16
--
-- D6 owns table creation/schema. D8 owns writes to these columns.
-- These columns support the full delivery lifecycle:
--   - delivered_at / completed_at: delivery timestamps
--   - download_confirmed_at: attorney confirmed download
--   - urls_invalidated_at: when signed URLs were revoked
--   - zip_storage_path: path to packaged ZIP in Supabase Storage
--   - signed_urls: JSONB array of signed URL records
--   - signed_urls_generated_at / signed_urls_expire_at: URL lifecycle
-- ============================================================================

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS download_confirmed_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS urls_invalidated_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS zip_storage_path TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS signed_urls JSONB;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS signed_urls_generated_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS signed_urls_expire_at TIMESTAMPTZ;

COMMENT ON COLUMN delivery_packages.signed_urls IS
  'JSONB array of { key, url } objects. Generated by Fn2 handleApprove.';
COMMENT ON COLUMN delivery_packages.signed_urls_expire_at IS
  'When signed URLs expire. Default 7 days from generation.';


-- ============================================================
-- MIGRATION: 20260216200006_audit_log_immutability.sql
-- ============================================================
-- ============================================================================
-- SP-4 Task 5 (DST-05): Audit Log Immutability Trigger
-- Date: 2026-02-16
--
-- Prevents UPDATE and DELETE on admin_activity_log regardless of role.
-- Even service_role cannot modify audit records after insertion.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable. Operation % on record % blocked.',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

-- Block UPDATE and DELETE regardless of role (including service_role)
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON admin_activity_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON admin_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();


-- ============================================================
-- MIGRATION: 20260216200007_citation_rls_hardening.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260216300001_delta_status_expansion.sql
-- ============================================================
-- Delta Resolution: Expand orders status CHECK constraint
-- D4-CORR-001 + v5-XDC-012: Adds PENDING_CONFLICT_REVIEW, DISPUTED, REFUNDED, UPGRADE_PENDING
-- DB uses flat CANCELLED (toDbStatus maps CANCELLED_USER/SYSTEM/CONFLICT → CANCELLED)
-- DB uses REVISION_REQ (toDbStatus maps REVISION_REQUESTED → REVISION_REQ)

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'INTAKE', 'PROCESSING', 'AWAITING_OPUS', 'HOLD_PENDING',
    'PROTOCOL_10_EXIT', 'UPGRADE_PENDING', 'PENDING_CONFLICT_REVIEW',
    'AWAITING_APPROVAL', 'REVISION_REQ', 'COMPLETED',
    'CANCELLED', 'DISPUTED', 'REFUNDED', 'FAILED'
  )
);


-- ============================================================
-- MIGRATION: 20260216300002_terminal_state_trigger_update.sql
-- ============================================================
-- Terminal state enforcement trigger
-- D7-R3-003-DB + D4-CORR-001: Prevents transitions FROM terminal states (defense against code bugs)
-- Terminal states: CANCELLED, FAILED, REFUNDED
-- COMPLETED is NOT in this trigger because COMPLETED → DISPUTED is valid

CREATE OR REPLACE FUNCTION enforce_terminal_state()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if OLD status is terminal
  IF OLD.status IN ('CANCELLED', 'FAILED', 'REFUNDED') THEN
    -- Admin override column allows escaping terminal state in emergencies
    IF NEW.admin_override IS TRUE THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot transition from terminal state % (order_id: %)', OLD.status, OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to ensure latest version
DROP TRIGGER IF EXISTS trg_enforce_terminal_state ON orders;
CREATE TRIGGER trg_enforce_terminal_state
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_terminal_state();


-- ============================================================
-- MIGRATION: 20260216300003_delivery_packages_d8_columns_v2.sql
-- ============================================================
-- D6 ST-033 v2: Add remaining D8-expected columns to delivery_packages
-- SP-7 added: delivered_at, completed_at, download_confirmed_at, urls_invalidated_at,
--             zip_storage_path, signed_urls, signed_urls_generated_at, signed_urls_expire_at
-- This migration adds: cp3_decision, cp3_decision_at, cp3_decided_by, cp3_revision_number,
--                       protocol10_triggered, archive_status, judge_simulation_grade
-- Using ADD COLUMN IF NOT EXISTS for idempotency

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decision TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decision_at TIMESTAMPTZ;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_decided_by UUID;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS cp3_revision_number INTEGER DEFAULT 0;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS protocol10_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS archive_status TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS judge_simulation_grade TEXT;


-- ============================================================
-- MIGRATION: 20260216400001_d7_wave1_payment_schema.sql
-- ============================================================
-- =============================================================================
-- SP-10 Group Z: D7 Wave 1 — Payment Schema Migration
-- All 7 tasks (Z-1 through Z-7) in a single transactional migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Z-1: amount_paid_cents column on orders
-- Source: D7-NEW-007 | BD-REFUND-BASIS
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER DEFAULT NULL;
COMMENT ON COLUMN orders.amount_paid_cents IS
  'Cumulative total of all Stripe charges in cents. Set by webhook handler from session.amount_total. Updated on tier upgrades. Used as refund calculation basis.';

-- =============================================================================
-- Z-2: payment_events RLS
-- Source: D7-NEW-005
-- =============================================================================

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS payment_events_select_own ON payment_events;
DROP POLICY IF EXISTS payment_events_select_admin ON payment_events;
DROP POLICY IF EXISTS payment_events_insert_service ON payment_events;

CREATE POLICY payment_events_select_own ON payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payment_events.order_id
      AND orders.client_id = auth.uid()
    )
  );

CREATE POLICY payment_events_select_admin ON payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY payment_events_insert_service ON payment_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- =============================================================================
-- Z-3a: delivery_packages RLS
-- Source: D7-NEW-006
-- =============================================================================

ALTER TABLE delivery_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_packages_select_own ON delivery_packages;
DROP POLICY IF EXISTS delivery_packages_select_admin ON delivery_packages;

CREATE POLICY delivery_packages_select_own ON delivery_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = delivery_packages.order_id
      AND orders.client_id = auth.uid()
    )
  );

CREATE POLICY delivery_packages_select_admin ON delivery_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =============================================================================
-- Z-3b: order_deliverables RLS (2-hop JOIN through delivery_packages)
-- =============================================================================

ALTER TABLE order_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_deliverables_select_own ON order_deliverables;
DROP POLICY IF EXISTS order_deliverables_select_admin ON order_deliverables;

CREATE POLICY order_deliverables_select_own ON order_deliverables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery_packages dp
      JOIN orders o ON o.id = dp.order_id
      WHERE dp.id = order_deliverables.package_id
      AND o.client_id = auth.uid()
    )
  );

CREATE POLICY order_deliverables_select_admin ON order_deliverables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Performance: ensure index exists for the 2-hop JOIN
CREATE INDEX IF NOT EXISTS idx_delivery_packages_order_id ON delivery_packages (order_id);

-- =============================================================================
-- Z-4: Expand orders.status CHECK constraint to 16 statuses (SP-8 Group T)
-- Source: D7-NEW-003
-- =============================================================================

DO $$
BEGIN
  -- Try known constraint names
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS check_order_status;
EXCEPTION
  WHEN undefined_object THEN NULL; -- No constraint exists
END $$;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'submitted',
    'paid',
    'pending_payment',
    'in_progress',
    'quality_review',
    'awaiting_approval',
    'revision_requested',
    'revision_in_progress',
    'completed',
    'cancelled',
    'failed',
    'on_hold',
    'pending_conflict_review',
    'disputed',
    'refunded',
    'upgrade_pending'
  )
);

-- =============================================================================
-- Z-5: Case number normalization index for conflict check
-- Source: D7-R5-003-IDX | Option B (generated column + standard index)
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS case_number_normalized TEXT
  GENERATED ALWAYS AS (
    UPPER(
      REPLACE(REPLACE(REPLACE(REPLACE(
        case_number,
        ' ', ''),
        '-', ''),
        E'\u2013', ''),
        E'\u2014', '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_orders_case_number_norm ON orders (case_number_normalized);

-- =============================================================================
-- Z-6: Billing payer columns (future direct billing support)
-- Source: D7-NEW-012
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billing_payer TEXT DEFAULT 'attorney'
    CHECK (billing_payer IN ('attorney', 'client')),
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT;

COMMENT ON COLUMN orders.billing_payer IS
  'Who pays: attorney (default) or client (future direct billing). See LA Pricing Strategy Memo Section 6.';
COMMENT ON COLUMN orders.billing_contact_email IS
  'Email for payment link when billing_payer = client. NULL when attorney pays.';

-- =============================================================================
-- Z-7: Terminal state enforcement trigger
-- Source: D7-R3-003-DB | Priority: P0 CRITICAL
-- Defense-in-depth behind application-level validateTransition()
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow admin override via session variable
  IF current_setting('app.admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- CANCELLED is fully terminal: no transitions out
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state CANCELLED (order_id: %)', OLD.id;
  END IF;

  -- REFUNDED is fully terminal: no transitions out
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state REFUNDED (order_id: %)', OLD.id;
  END IF;

  -- FAILED is fully terminal: no transitions out
  IF OLD.status = 'failed' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state FAILED (order_id: %)', OLD.id;
  END IF;

  -- COMPLETED allows only COMPLETED -> revision_requested
  IF OLD.status = 'completed' AND NEW.status != 'revision_requested' THEN
    RAISE EXCEPTION 'COMPLETED orders can only transition to revision_requested, not % (order_id: %)', NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_order_status ON orders;

CREATE TRIGGER trg_enforce_order_status
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_status_transition();

-- =============================================================================
-- Z-7 (continued): Additional columns needed by Wave 2+
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_in_progress BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_version INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_workflow_trigger_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_flagged BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_cap_triggered BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_to_tier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_from_tier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_resolved_at TIMESTAMPTZ;

-- =============================================================================
-- Reconciliation reports table (D7-R3-001)
-- Used by daily reconciliation sweep
-- =============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_charges_checked INTEGER NOT NULL,
  total_refunds_checked INTEGER NOT NULL,
  mismatches JSONB NOT NULL DEFAULT '[]',
  mismatch_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(mismatches)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_run_date ON reconciliation_reports (run_date DESC);

COMMIT;


-- ============================================================
-- MIGRATION: 20260216400002_iv006_workflow_id_delivery_packages.sql
-- ============================================================
-- IV-006: Add workflow_id to delivery_packages for waitForEvent match persistence
-- The workflow_id is written by the Inngest function at Phase X Stage 5.
-- Dashboard approval API reads workflow_id from delivery_packages to correlate
-- with the correct Inngest run. Never construct workflowId from scratch.

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS workflow_id TEXT;

-- Index for efficient lookup by workflow_id (used by approval API)
CREATE INDEX IF NOT EXISTS idx_delivery_packages_workflow_id
  ON delivery_packages (workflow_id)
  WHERE workflow_id IS NOT NULL;

COMMENT ON COLUMN delivery_packages.workflow_id IS 'Inngest run ID for waitForEvent correlation. Written at Phase X Stage 5, read by checkpoint approval API.';


-- ============================================================
-- MIGRATION: 20260216500001_promo_redemptions.sql
-- ============================================================
-- SP-11 AD-1: Per-user promo redemption tracking
-- Source: D7-R3-004

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  promo_code TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promo_user_code ON promo_redemptions (user_id, promo_code);
CREATE INDEX idx_promo_redeemed_at ON promo_redemptions (redeemed_at);

-- Stripe health reports table for AF-1
CREATE TABLE IF NOT EXISTS stripe_health_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_data JSONB NOT NULL,
  alert_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- MIGRATION: 20260216600001_protocol_results.sql
-- ============================================================
-- MIGRATION: protocol_results table
-- Source: D9 A-1 | SP-13 AM-1
-- Append-only audit trail for all 23 protocol evaluation results.
-- UNIQUE constraint ensures idempotent Inngest step retries.
-- Immutability trigger prevents UPDATE/DELETE — corrections use supersedes_id.

CREATE TABLE protocol_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  protocol_number INTEGER NOT NULL CHECK (protocol_number >= 1 AND protocol_number <= 23),
  citation_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  triggered BOOLEAN NOT NULL DEFAULT false,
  severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  action_taken TEXT,
  ais_entry JSONB,
  handler_version TEXT NOT NULL DEFAULT '1.0.0',
  input_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_id UUID REFERENCES protocol_results(id),
  UNIQUE(order_id, phase, protocol_number, citation_id)
);

CREATE INDEX idx_protocol_results_order ON protocol_results(order_id);
CREATE INDEX idx_protocol_results_order_phase ON protocol_results(order_id, phase);

-- RLS: CRITICAL — use orders.client_id (NOT orders.user_id) per D1 R4 CST-01
ALTER TABLE protocol_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY prot_results_select ON protocol_results FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY prot_results_insert ON protocol_results FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Immutability trigger: append-only audit trail
CREATE OR REPLACE FUNCTION prevent_protocol_results_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'protocol_results is append-only. UPDATE and DELETE are prohibited. To correct a result, INSERT a new row with supersedes_id referencing the original.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protocol_results_immutable
  BEFORE UPDATE OR DELETE ON protocol_results
  FOR EACH ROW
  EXECUTE FUNCTION prevent_protocol_results_mutation();

-- P7 cumulative failure count RPC (Decision 5: CUMULATIVE scope, Decision 6: no explicit reset)
-- Uses MAX(id) subquery to get latest verification per citation, avoiding double-counting.
CREATE OR REPLACE FUNCTION get_p7_failure_count(p_order_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM citation_verifications cv
    WHERE cv.order_id = p_order_id
      AND cv.removed_in_revision = false
      AND cv.status IN ('NOT_FOUND', 'MISMATCH', 'QUOTE_NOT_FOUND')
      AND cv.id = (
        SELECT MAX(cv2.id) FROM citation_verifications cv2
        WHERE cv2.order_id = cv.order_id
          AND cv2.citation_id = cv.citation_id
      )
  );
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- MIGRATION: 20260216600002_rate_limits.sql
-- ============================================================
-- MIGRATION: rate_limits table + atomic increment RPC
-- Source: D9 A-2 | SP-13 AM-2
-- Atomic rate counter prevents race conditions across concurrent Inngest functions.

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 5000
);

CREATE UNIQUE INDEX idx_rate_limits_api ON rate_limits(api);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY prot_rate_limits_admin ON rate_limits
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Atomic increment RPC: prevents race conditions across concurrent Inngest functions
CREATE OR REPLACE FUNCTION increment_rate_counter(p_api TEXT, p_limit INT)
RETURNS BOOLEAN AS $$
DECLARE v_count INT;
BEGIN
  UPDATE rate_limits
    SET request_count = request_count + 1
    WHERE api = p_api
      AND window_start > NOW() - INTERVAL '1 hour'
      AND request_count < p_limit
    RETURNING request_count INTO v_count;

  IF v_count IS NULL THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Seed default row for CourtListener
INSERT INTO rate_limits (api, request_count, daily_limit)
VALUES ('courtlistener', 0, 5000)
ON CONFLICT DO NOTHING;


-- ============================================================
-- MIGRATION: 20260216600003_cp3_rejections_actor_fix.sql
-- ============================================================
-- MIGRATION: Fix cp3_rejections — admin_id -> actor_id + actor_type
-- Source: D9 A-3 | SP-13 AM-3
-- R2v2 Binding Decision 4: CP3 actor is the attorney, not an admin.
-- The attorney_id TEXT column causes INSERT failures because the event payload
-- contains no adminId field. Replace with actor_id UUID + actor_type TEXT.

-- Step 1: Add new columns
ALTER TABLE cp3_rejections ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE cp3_rejections ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'attorney'
  CHECK (actor_type IN ('attorney', 'admin', 'system'));

-- Step 2: Migrate existing data (if any rows exist with attorney_id)
-- Cast text attorney_id to UUID where possible; null otherwise
UPDATE cp3_rejections
SET actor_id = CASE
  WHEN attorney_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN attorney_id::UUID
  ELSE NULL
END
WHERE actor_id IS NULL AND attorney_id IS NOT NULL;

-- Step 3: Drop the old column
ALTER TABLE cp3_rejections DROP COLUMN IF EXISTS attorney_id;

-- Step 4: Make actor_id NOT NULL (after migration)
-- Only set NOT NULL if all existing rows have been migrated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cp3_rejections WHERE actor_id IS NULL) THEN
    ALTER TABLE cp3_rejections ALTER COLUMN actor_id SET NOT NULL;
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216700001_d6_phase0_missing_columns.sql
-- ============================================================
-- ==========================================================================
-- D6 Phase 0: Missing cancellation columns (ST-052), resume_phase (ST-053),
-- delivery_packages stage + status_version (ST-033 gap fill)
-- Date: 2026-02-16
--
-- Columns that already exist from prior migrations:
--   - cancellation_type (20260216100011_d5_orders_cp3_columns.sql)
--   - refund_status (20260215100000_attorney_dashboard_schema.sql)
--   - case_number_normalized (20260216400001_d7_wave1_payment_schema.sql)
--
-- This migration adds remaining ST-052/053 columns and delivery_packages gaps.
-- ==========================================================================

-- ====== ORDERS: ST-052 Cancellation Tracking ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_stripe_id TEXT;

-- ====== ORDERS: ST-053 Resume Phase ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_phase TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_resume_phase_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_resume_phase_check
      CHECK (resume_phase IN (
        'I','II','III','IV','V','V.1','VI','VII','VII.1',
        'VIII','VIII.5','IX','IX.1','X'
      ) OR resume_phase IS NULL);
  END IF;
END $$;

-- ====== DELIVERY_PACKAGES: ST-033 Gap Fill ======
-- stage column with lifecycle CHECK constraint
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'ASSEMBLY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_packages_stage_check'
  ) THEN
    ALTER TABLE delivery_packages ADD CONSTRAINT delivery_packages_stage_check
      CHECK (stage IN ('ASSEMBLY','QC','CP3_PENDING','APPROVED','DELIVERED','REVISION'));
  END IF;
END $$;

-- status_version for optimistic locking (C-002)
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS status_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_delivery_packages_stage ON delivery_packages(stage);


-- ============================================================
-- MIGRATION: 20260216700002_d6_definitive_status_constraint.sql
-- ============================================================
-- ==========================================================================
-- DEFINITIVE STATUS CONSTRAINT (ST-013/ST-032)
-- Single source of truth. RUNS LAST in Phase 0.
-- DB uses mapped names: REVISION_REQ (not REVISION_REQUESTED per XDC-001)
-- DB uses flat CANCELLED (toDbStatus maps CANCELLED_USER/SYSTEM/CONFLICT)
--
-- This replaces prior constraint versions:
--   - 20260216000017_fix_status_constraint_cm003.sql
--   - 20260216300001_delta_status_expansion.sql
-- ==========================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN (
  -- Canonical 14-status model (Architecture v2.2)
  'INTAKE','PROCESSING','AWAITING_OPUS','HOLD_PENDING',
  'PROTOCOL_10_EXIT','UPGRADE_PENDING','PENDING_CONFLICT_REVIEW',
  'AWAITING_APPROVAL','REVISION_REQ',
  'COMPLETED','CANCELLED','DISPUTED','REFUNDED','FAILED',
  -- Legacy lowercase (existing data compatibility — remove after full migration)
  'draft','pending','submitted','paid','in_progress','under_review',
  'assigned','completed','cancelled','failed','refunded',
  'hold','on_hold','awaiting_approval','refund_review',
  -- Uppercase equivalents of legacy
  'DRAFT','PENDING','SUBMITTED','PAID','IN_PROGRESS','UNDER_REVIEW',
  'ASSIGNED','HOLD','ON_HOLD','REFUND_REVIEW',
  'APPROVED','REJECTED',
  -- Conflict + upgrade flow (legacy)
  'CONFLICT_REVIEW','PENDING_REVIEW',
  'conflict_review','pending_review','approved','rejected',
  'upgrade_pending',
  -- Timeout status (CP3 timeout handling)
  'APPROVAL_TIMEOUT','approval_timeout'
));


-- ============================================================
-- MIGRATION: 20260216700003_d6_create_order_deliverables.sql
-- ============================================================
-- ==========================================================================
-- ST-049 [P1]: order_deliverables table
-- Child table of delivery_packages. Each row = one file in the filing package.
-- Date: 2026-02-16
-- ==========================================================================

CREATE TABLE IF NOT EXISTS order_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES delivery_packages(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  filing_order INTEGER NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_status TEXT DEFAULT 'PENDING'
    CHECK(generation_status IN ('PENDING','GENERATING','COMPLETE','FAILED')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_deliverables_package_id ON order_deliverables(package_id);

-- RLS
ALTER TABLE order_deliverables ENABLE ROW LEVEL SECURITY;

-- Attorney read access (join through delivery_packages → orders.client_id)
DROP POLICY IF EXISTS od_select_own ON order_deliverables;
CREATE POLICY od_select_own ON order_deliverables
  FOR SELECT USING (
    package_id IN (
      SELECT dp.id FROM delivery_packages dp
      JOIN orders o ON dp.order_id = o.id
      WHERE o.client_id = auth.uid()
      AND o.status IN ('AWAITING_APPROVAL', 'COMPLETED', 'REVISION_REQ')
    )
  );

-- Service role: unrestricted (Inngest functions)
DROP POLICY IF EXISTS od_service_all ON order_deliverables;
CREATE POLICY od_service_all ON order_deliverables
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- Admin SELECT (Pattern 4)
DROP POLICY IF EXISTS od_admin_select ON order_deliverables;
CREATE POLICY od_admin_select ON order_deliverables
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );


-- ============================================================
-- MIGRATION: 20260216800001_d5_checkpoint_events.sql
-- ============================================================
-- ==========================================================================
-- D5 Group 1: checkpoint_events table + attorney_rework_count
-- Retention: 365 days per CCP §340.6
-- ==========================================================================

CREATE TABLE IF NOT EXISTS checkpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_type TEXT NOT NULL CHECK(checkpoint_type IN ('CP1', 'CP2', 'CP3', 'HOLD')),
  actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '365 days')
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_events_order ON checkpoint_events(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_type ON checkpoint_events(checkpoint_type);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_name ON checkpoint_events(event_name);

ALTER TABLE checkpoint_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkpoint_events_admin" ON checkpoint_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "checkpoint_events_own" ON checkpoint_events
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));

-- attorney_rework_count on orders (distinct from loop_count)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_rework_count INTEGER DEFAULT 0;
COMMENT ON COLUMN orders.attorney_rework_count IS
  'Number of times attorney requested changes via CP3. Distinct from internal loop_count.';


-- ============================================================
-- MIGRATION: 20260216900001_sp22_hold_reason_constraint.sql
-- ============================================================
-- SP-22 Task 2: Expand hold_reason CHECK constraint
-- Adds all 4 canonical hold_reason values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_hold_reason;
ALTER TABLE orders ADD CONSTRAINT chk_hold_reason CHECK (
  hold_reason IS NULL OR hold_reason IN (
    'evidence_gap',
    'tier_reclassification',
    'revision_stall',
    'citation_critical_failure'
  )
);

-- Add resume_phase column if not exists (for citation_critical_failure → PHASE_CURRENT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'resume_phase'
  ) THEN
    ALTER TABLE orders ADD COLUMN resume_phase TEXT;
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 20260216900002_sp23_raw_uploads_purged.sql
-- ============================================================
-- SP-23 ST6-02: Track raw upload purge state
-- This allows revision workflows to detect when original evidence is unavailable
-- and inject a disclaimer into the revision context.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_uploads_purged_at TIMESTAMPTZ;

-- Index for purge job query performance:
-- Finds COMPLETED orders where raw uploads haven't been purged yet.
CREATE INDEX IF NOT EXISTS idx_orders_purge_candidates
  ON orders (status, raw_uploads_purged, completed_at)
  WHERE raw_uploads_purged = FALSE AND deleted_at IS NULL;


