-- MIGRATION: rate_limits table + atomic increment RPC
-- Source: D9 A-2 | SP-13 AM-2
-- Atomic rate counter prevents race conditions across concurrent Inngest functions.

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 5000
);

CREATE UNIQUE INDEX idx_rate_limits_api ON rate_limits(api);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY prot_rate_limits_admin ON rate_limits
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    OR auth.jwt()->>'role' = 'service_role'
  );

-- Atomic increment RPC: prevents race conditions across concurrent Inngest functions
CREATE OR REPLACE FUNCTION increment_rate_counter(p_api TEXT, p_limit INT)
RETURNS BOOLEAN AS $$
DECLARE v_count INT;
BEGIN
  UPDATE rate_limits
    SET request_count = request_count + 1
    WHERE api = p_api
      AND window_start > NOW() - INTERVAL '1 hour'
      AND request_count < p_limit
    RETURNING request_count INTO v_count;

  IF v_count IS NULL THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Seed default row for CourtListener
INSERT INTO rate_limits (api, request_count, daily_limit)
VALUES ('courtlistener', 0, 5000)
ON CONFLICT DO NOTHING;
