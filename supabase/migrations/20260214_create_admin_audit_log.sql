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
