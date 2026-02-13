-- ============================================================================
-- Migration: 20260213000004_create_hold_escalations.sql
-- SP19 CGA6-010: Create hold_escalations table
--
-- Tracks the HOLD checkpoint escalation system. When the workflow engine
-- triggers a hold (Phase III HOLD, or any admin/quality hold), an escalation
-- record is created with tiered notification thresholds:
--   Tier 1 (24hr): Email notification to assigned clerk/admin
--   Tier 2 (72hr): Email + admin dashboard alert
--   Tier 3 (7-day): Escalate to principal (Clay)
--
-- The Inngest job checks hold_escalations on a schedule and fires
-- escalation events when tier thresholds are crossed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hold_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Hold classification
  hold_type TEXT NOT NULL CHECK (hold_type IN (
    'CITATION_HOLD',    -- CIV flagged unverifiable citations
    'QUALITY_HOLD',     -- Quality gate failure
    'CLIENT_HOLD',      -- Waiting on client input/documents
    'ADMIN_HOLD',       -- Manual admin hold (Phase X checkpoint, etc.)
    'COMPLIANCE_HOLD'   -- Professional responsibility or compliance issue
  )),

  -- Escalation state
  hold_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_tier INTEGER NOT NULL DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 3),
  tier_1_at TIMESTAMPTZ,  -- When Tier 1 threshold crossed (24hr mark)
  tier_2_at TIMESTAMPTZ,  -- When Tier 2 threshold crossed (72hr mark)
  tier_3_at TIMESTAMPTZ,  -- When Tier 3 threshold crossed (7-day mark)

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_action TEXT CHECK (
    resolution_action IS NULL
    OR resolution_action IN (
      'RESOLVED',       -- Issue addressed, hold lifted
      'OVERRIDDEN',     -- Admin override, proceed despite issue
      'CANCELLED',      -- Order cancelled, hold moot
      'AUTO_EXPIRED'    -- System auto-resolved after timeout
    )
  ),

  -- Context
  admin_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hold_escalations_order_id
  ON hold_escalations(order_id);

-- Partial index for active (unresolved) holds — most common query pattern
CREATE INDEX IF NOT EXISTS idx_hold_escalations_unresolved
  ON hold_escalations(order_id)
  WHERE resolved_at IS NULL;

-- Index for escalation tier checks (Inngest job queries by tier + age)
CREATE INDEX IF NOT EXISTS idx_hold_escalations_tier_check
  ON hold_escalations(current_tier, hold_started_at)
  WHERE resolved_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE hold_escalations ENABLE ROW LEVEL SECURITY;

-- 1. Clients can see holds on their own orders
CREATE POLICY "hold_escalations_select_own" ON hold_escalations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = hold_escalations.order_id
      AND orders.client_id = (SELECT auth.uid())
    )
    OR public.is_admin()
  );

-- 2. Admin full management (view, create, resolve holds)
CREATE POLICY "hold_escalations_admin_policy" ON hold_escalations
  FOR ALL
  TO authenticated
  USING (public.is_admin());

-- 3. Service role bypass for Inngest escalation jobs
CREATE POLICY "hold_escalations_service_role_policy" ON hold_escalations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- Uses existing update_updated_at_column() from migration 006.
-- Migration 20260213000006 will consolidate this to set_updated_at().
-- ============================================================================

DROP TRIGGER IF EXISTS update_hold_escalations_updated_at ON hold_escalations;
CREATE TRIGGER update_hold_escalations_updated_at
  BEFORE UPDATE ON hold_escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE hold_escalations IS
  'Tracks workflow hold escalations with tiered notification thresholds (24hr/72hr/7-day).';
COMMENT ON COLUMN hold_escalations.hold_type IS
  'Category of hold: CITATION_HOLD, QUALITY_HOLD, CLIENT_HOLD, ADMIN_HOLD, COMPLIANCE_HOLD';
COMMENT ON COLUMN hold_escalations.current_tier IS
  'Current escalation tier (1-3). Inngest job checks and advances tiers.';
COMMENT ON COLUMN hold_escalations.metadata IS
  'Flexible JSON for hold-specific context (e.g., failing citation IDs, quality scores)';
COMMENT ON COLUMN hold_escalations.tier_1_at IS
  'Timestamp when Tier 1 threshold was crossed (24hr after hold_started_at)';
COMMENT ON COLUMN hold_escalations.tier_2_at IS
  'Timestamp when Tier 2 threshold was crossed (72hr after hold_started_at)';
COMMENT ON COLUMN hold_escalations.tier_3_at IS
  'Timestamp when Tier 3 threshold was crossed (7 days after hold_started_at)';
COMMENT ON COLUMN hold_escalations.resolution_action IS
  'How the hold was resolved: RESOLVED, OVERRIDDEN, CANCELLED, AUTO_EXPIRED';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename = 'hold_escalations';
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE tablename = 'hold_escalations' ORDER BY policyname;
-- Expected: 3 policies (select_own, admin_policy, service_role_policy)
-- ============================================================================
