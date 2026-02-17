-- ============================================================================
-- MASTER SCHEMA SYNC — Complete Database Audit Fix
-- Date: 2026-02-17
-- Purpose: Add ALL missing columns, tables, and views identified by
--          cross-referencing 105 migration files against codebase queries.
--
-- SAFE TO RE-RUN: Every statement uses IF NOT EXISTS / IF EXISTS guards.
--
-- CATEGORIES OF FIXES:
--   A. Missing tables (code references, no CREATE TABLE in migrations)
--   B. Missing columns on orders table
--   C. Missing columns on checkpoint_events table
--   D. Missing columns on delivery_packages table
--   E. Table name aliases (webhook_log → webhook_logs)
--   F. Missing indexes
--   G. RLS policies for new tables
-- ============================================================================

BEGIN;

-- ============================================================================
-- A. MISSING TABLES
-- ============================================================================

-- A-1: loop_counters — Revision loop tracking (lib/workflow/loop-counter.ts)
-- Columns: id, order_id, current_count, max_loops, cost_cap_exceeded, created_at, updated_at
CREATE TABLE IF NOT EXISTS loop_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  current_count INTEGER NOT NULL DEFAULT 0,
  max_loops INTEGER NOT NULL DEFAULT 3,
  revision_loop_count INTEGER DEFAULT 0,
  cost_cap_exceeded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_loop_counters_order ON loop_counters(order_id);

ALTER TABLE loop_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loop_counters_service_all ON loop_counters;
CREATE POLICY loop_counters_service_all ON loop_counters
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS loop_counters_admin_select ON loop_counters;
CREATE POLICY loop_counters_admin_select ON loop_counters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- A-2: payment_events — Payment lifecycle tracking (lib/payments/*.ts)
-- RLS policies exist in d7_wave1 migration but CREATE TABLE is missing
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  status TEXT,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_stripe ON payment_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Re-apply RLS policies (safe — DROP IF EXISTS first)
DROP POLICY IF EXISTS payment_events_select_own ON payment_events;
CREATE POLICY payment_events_select_own ON payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payment_events.order_id
      AND orders.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payment_events_select_admin ON payment_events;
CREATE POLICY payment_events_select_admin ON payment_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS payment_events_insert_service ON payment_events;
CREATE POLICY payment_events_insert_service ON payment_events
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- A-3: order_workflow_state — Workflow state tracking (lib/monitoring/metrics-collector.ts)
-- Referenced in ALTER TABLE in migration 028, but no CREATE TABLE
CREATE TABLE IF NOT EXISTS order_workflow_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  current_phase TEXT,
  current_tier TEXT,
  workflow_status TEXT,
  phase_started_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  total_tokens_used INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,
  ss_citation_check_status TEXT,
  ss_citation_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_workflow_state_order ON order_workflow_state(order_id);

ALTER TABLE order_workflow_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ows_service_all ON order_workflow_state;
CREATE POLICY ows_service_all ON order_workflow_state
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS ows_admin_select ON order_workflow_state;
CREATE POLICY ows_admin_select ON order_workflow_state
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- A-4: archive_log — Archive tracking (lib/storage/archive-service.ts)
CREATE TABLE IF NOT EXISTS archive_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archive_log_order ON archive_log(order_id);

ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_log_service_all ON archive_log;
CREATE POLICY archive_log_service_all ON archive_log
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- A-5: user_roles — Referenced by RLS policies in multiple tables
-- Used in payment_events, delivery_packages, order_deliverables RLS
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'clerk', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_service_all ON user_roles;
CREATE POLICY user_roles_service_all ON user_roles
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS user_roles_select_own ON user_roles;
CREATE POLICY user_roles_select_own ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- A-6: webhook_log — Code uses singular, migration created plural
-- Create a VIEW alias so both names work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'webhook_log' AND table_schema = 'public'
  ) THEN
    -- Check if webhook_logs exists and create view
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'webhook_logs' AND table_schema = 'public'
    ) THEN
      CREATE VIEW webhook_log AS SELECT * FROM webhook_logs;
    ELSE
      -- Neither exists, create the table with the name code expects
      CREATE TABLE webhook_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('stripe', 'inngest', 'other')),
        payload JSONB NOT NULL DEFAULT '{}',
        status TEXT DEFAULT 'received',
        error_message TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_webhook_log_event_type ON webhook_log(event_type);
      CREATE INDEX idx_webhook_log_source ON webhook_log(source);
      CREATE INDEX idx_webhook_log_status ON webhook_log(status) WHERE status != 'processed';

      ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

      CREATE POLICY webhook_log_service_all ON webhook_log
        FOR ALL USING (
          current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        );
    END IF;
  END IF;
END $$;

-- A-7: citation_approvals — Referenced in code (lib/citation/*.ts)
CREATE TABLE IF NOT EXISTS citation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  citation_id UUID,
  approval_status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_approvals_order ON citation_approvals(order_id);

ALTER TABLE citation_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS citation_approvals_service_all ON citation_approvals;
CREATE POLICY citation_approvals_service_all ON citation_approvals
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- ============================================================================
-- B. MISSING COLUMNS ON orders TABLE
-- ============================================================================

-- B-1: deliverable_urls — JSONB with URLs for generated deliverables
-- Source: lib/inngest/workflow-orchestration.ts:1196
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliverable_urls JSONB;

-- B-2: deliverables_generated_at — When deliverables were generated
-- Source: lib/inngest/workflow-orchestration.ts:1197
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliverables_generated_at TIMESTAMPTZ;

-- B-3: judge_grade — Judge simulation result grade
-- Source: lib/workflow/revision-loop.ts:160
ALTER TABLE orders ADD COLUMN IF NOT EXISTS judge_grade TEXT;

-- B-4: phase_outputs — JSONB storing outputs from each workflow phase
-- Source: lib/civ/citation-bank.ts:88 (selected), used heavily in workflow
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phase_outputs JSONB DEFAULT '{}';

-- B-5: workflow_id — FK to order_workflows for quick lookup
-- Source: lib/orders/status-guards.ts:50, lib/api/cp3-auth.ts:49
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workflow_id UUID;

-- B-6: conflict_status — Status of conflict check
-- Source: lib/intake/conflict-integration.ts:53
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_status TEXT;

-- B-7: conflict_check_completed_at — When conflict check finished
-- Source: Used in admin analytics selects
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_check_completed_at TIMESTAMPTZ;

-- B-8: opposing_party_name — Name of opposing party
-- Source: lib/inngest/conflict-check-job.ts:30
ALTER TABLE orders ADD COLUMN IF NOT EXISTS opposing_party_name TEXT;

-- B-9: stripe_dispute_active — Whether a Stripe dispute is active
-- Source: lib/payments/dispute-handler.ts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_dispute_active BOOLEAN DEFAULT false;

-- B-10: dispute_id — Stripe dispute identifier
-- Source: lib/payments/dispute-handler.ts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_id TEXT;

-- B-11: attorney_email — Cached attorney email for notifications
-- Source: lib/api/cp3-auth.ts:49, app/api/orders/[id]/cancel/route.ts:54
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_email TEXT;

-- B-12: state_code — 2-letter state code for jurisdiction
-- Source: lib/payments/order-creation-v2.ts:56, used in pricing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS state_code CHAR(2);

-- B-13: revision_requested_at — When revision was requested
-- Source: Used in order status tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- B-14: deadline_warned — Whether deadline warning was sent
-- Source: lib/inngest deadline monitoring
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deadline_warned BOOLEAN DEFAULT false;

-- B-15: failure_type — Classification of workflow failure
-- Source: lib/inngest workflow error handling
ALTER TABLE orders ADD COLUMN IF NOT EXISTS failure_type TEXT;

-- B-16: rush_level — Rush tier level
-- Source: Used in pricing/turnaround logic
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rush_level TEXT;

-- B-17: court_name — Full court name
-- Source: Used in motion generation context
ALTER TABLE orders ADD COLUMN IF NOT EXISTS court_name TEXT;

-- ============================================================================
-- C. MISSING COLUMNS ON checkpoint_events TABLE
-- Code uses event_type/phase/data; migration has event_name/event_data/checkpoint_type.
-- Add the columns code expects (keeps both naming conventions working).
-- ============================================================================

ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE checkpoint_events ADD COLUMN IF NOT EXISTS data JSONB;

-- ============================================================================
-- D. MISSING COLUMNS ON delivery_packages TABLE
-- (Some may already exist from later migrations — IF NOT EXISTS handles this)
-- ============================================================================

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS workflow_id UUID;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS motion_pdf_path TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS instruction_sheet_path TEXT;
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS citation_report_path TEXT;

-- ============================================================================
-- E. MISSING COLUMNS ON order_workflows TABLE
-- Additional columns referenced in code
-- ============================================================================

ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS checkpoint_pending TEXT;
ALTER TABLE order_workflows ADD COLUMN IF NOT EXISTS protocol_10_disclosure TEXT;

-- ============================================================================
-- F. ADDITIONAL INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_workflow_id ON orders(workflow_id);
CREATE INDEX IF NOT EXISTS idx_orders_state_code ON orders(state_code);
CREATE INDEX IF NOT EXISTS idx_orders_conflict_status ON orders(conflict_status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_dispute ON orders(stripe_dispute_active) WHERE stripe_dispute_active = true;
CREATE INDEX IF NOT EXISTS idx_orders_deadline_warned ON orders(deadline_warned) WHERE deadline_warned = false;
CREATE INDEX IF NOT EXISTS idx_orders_judge_grade ON orders(judge_grade);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at);
CREATE INDEX IF NOT EXISTS idx_checkpoint_events_event_type ON checkpoint_events(event_type);

-- ============================================================================
-- G. SYNC user_roles FROM profiles (backfill view data)
-- ============================================================================

-- Ensure user_roles has entries matching profiles.role for existing users
INSERT INTO user_roles (user_id, role)
SELECT id, role FROM profiles
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================================
-- VERIFY
-- ============================================================================

COMMIT;

-- Post-commit verification (separate transaction)
SELECT 'MASTER SCHEMA SYNC COMPLETE' AS status;

SELECT table_name, COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
