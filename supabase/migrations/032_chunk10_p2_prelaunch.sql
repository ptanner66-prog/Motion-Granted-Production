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
