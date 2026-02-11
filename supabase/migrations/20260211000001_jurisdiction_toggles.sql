-- Jurisdiction toggle system
-- TypeScript static config = source of truth for state metadata
-- Database stores ONLY toggle flags and audit trail

CREATE TABLE IF NOT EXISTS jurisdiction_toggles (
  state_code VARCHAR(2) PRIMARY KEY,
  state_name VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  accepting_orders BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  supported_motion_types TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE jurisdiction_toggles ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write toggles
CREATE POLICY "Admin read toggles" ON jurisdiction_toggles
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin write toggles" ON jurisdiction_toggles
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Intake form needs to read which states are enabled (public read for enabled states only)
CREATE POLICY "Public read enabled states" ON jurisdiction_toggles
  FOR SELECT
  USING (enabled = TRUE);

-- Seed Louisiana as enabled
INSERT INTO jurisdiction_toggles (state_code, state_name, enabled, accepting_orders, supported_motion_types, enabled_at)
VALUES ('LA', 'Louisiana', TRUE, TRUE, ARRAY['MCOMPEL', 'MTD_12B6', 'MTC', 'MSJ', 'MIL', 'MTL', 'MSEAL'], NOW())
ON CONFLICT (state_code) DO NOTHING;

-- Audit log table (if not exists)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for audit log -- admin only, append only
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read audit" ON audit_log
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "System insert audit" ON audit_log
  FOR INSERT
  WITH CHECK (TRUE);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
