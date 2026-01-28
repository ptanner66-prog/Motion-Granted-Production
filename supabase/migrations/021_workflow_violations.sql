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
