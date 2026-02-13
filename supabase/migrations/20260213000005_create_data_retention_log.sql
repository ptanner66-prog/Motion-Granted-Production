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
