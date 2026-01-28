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
