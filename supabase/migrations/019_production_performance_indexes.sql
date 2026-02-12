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
