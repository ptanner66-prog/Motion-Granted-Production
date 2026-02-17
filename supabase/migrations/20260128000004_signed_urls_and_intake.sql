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
