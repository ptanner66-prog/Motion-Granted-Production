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
