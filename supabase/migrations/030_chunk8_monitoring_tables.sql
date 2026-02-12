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
