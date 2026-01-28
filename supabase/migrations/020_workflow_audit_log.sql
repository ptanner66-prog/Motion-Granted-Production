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
