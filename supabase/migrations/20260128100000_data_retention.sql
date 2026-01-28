-- ============================================================================
-- DATA RETENTION SYSTEM
-- Tasks 43-44 | January 28, 2026
-- ============================================================================

-- 1. ADD RETENTION COLUMNS TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extended_by_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_extension_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_type VARCHAR(20);

COMMENT ON COLUMN orders.retention_expires_at IS 'Auto-delete date. Default: delivery + 180 days';
COMMENT ON COLUMN orders.deletion_type IS 'How deleted: AUTO | CUSTOMER_REQUESTED | ADMIN';

-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_retention_expires
ON orders (retention_expires_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_reminder_due
ON orders (retention_expires_at, deletion_reminder_sent)
WHERE deleted_at IS NULL AND deletion_reminder_sent = FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_deleted
ON orders (deleted_at)
WHERE deleted_at IS NOT NULL;

-- 3. ANONYMIZED ANALYTICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order reference (NOT FK - order will be deleted)
  original_order_id UUID NOT NULL,

  -- Timestamps
  order_created_at TIMESTAMPTZ NOT NULL,
  order_delivered_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ DEFAULT NOW(),

  -- Motion characteristics (NO PII)
  motion_type VARCHAR(100),
  motion_tier VARCHAR(1) CHECK (motion_tier IN ('A', 'B', 'C')),
  motion_path VARCHAR(1) CHECK (motion_path IN ('A', 'B')),
  jurisdiction_type VARCHAR(50),
  court_type VARCHAR(50),
  state VARCHAR(2),

  -- Quality metrics
  judge_simulation_grade VARCHAR(5),
  judge_simulation_grade_numeric DECIMAL(3,2),
  revision_loop_count INTEGER DEFAULT 0,

  -- Citation metrics
  total_citations INTEGER DEFAULT 0,
  citations_verified INTEGER DEFAULT 0,
  citations_failed INTEGER DEFAULT 0,
  citations_flagged INTEGER DEFAULT 0,

  -- Operational metrics
  turnaround_hours INTEGER,
  phases_completed INTEGER DEFAULT 0,
  workflow_version VARCHAR(20),

  CONSTRAINT analytics_no_pii CHECK (original_order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_analytics_motion_type ON anonymized_analytics (motion_type, motion_tier);
CREATE INDEX IF NOT EXISTS idx_analytics_jurisdiction ON anonymized_analytics (jurisdiction_type, state);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON anonymized_analytics (order_created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_grade ON anonymized_analytics (judge_simulation_grade_numeric DESC);

-- 4. ACTIVITY LOG TABLE (Tasks 61-62)
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor
  user_id UUID REFERENCES auth.users(id),
  user_email VARCHAR(255),
  user_role VARCHAR(50), -- 'admin' | 'attorney' | 'system'

  -- Action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- 'order' | 'user' | 'workflow' | 'retention'
  resource_id UUID,

  -- Details
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs (created_at DESC);

-- 5. TRIGGER: AUTO-SET RETENTION ON DELIVERY
-- ============================================================================

CREATE OR REPLACE FUNCTION set_initial_retention()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, NOW());
    NEW.retention_expires_at := NEW.delivered_at + INTERVAL '180 days';
    NEW.deletion_reminder_sent := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_retention ON orders;
CREATE TRIGGER trigger_set_retention
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_initial_retention();

-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE anonymized_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Analytics: Only admins can read
DROP POLICY IF EXISTS "Admins can read analytics" ON anonymized_analytics;
CREATE POLICY "Admins can read analytics" ON anonymized_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Activity logs: Only admins can read
DROP POLICY IF EXISTS "Admins can read activity logs" ON activity_logs;
CREATE POLICY "Admins can read activity logs" ON activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can insert activity logs
DROP POLICY IF EXISTS "System can insert activity logs" ON activity_logs;
CREATE POLICY "System can insert activity logs" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);
