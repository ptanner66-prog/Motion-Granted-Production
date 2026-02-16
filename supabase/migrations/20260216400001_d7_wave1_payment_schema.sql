-- =============================================================================
-- SP-10 Group Z: D7 Wave 1 — Payment Schema Migration
-- All 7 tasks (Z-1 through Z-7) in a single transactional migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Z-1: amount_paid_cents column on orders
-- Source: D7-NEW-007 | BD-REFUND-BASIS
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER DEFAULT NULL;
COMMENT ON COLUMN orders.amount_paid_cents IS
  'Cumulative total of all Stripe charges in cents. Set by webhook handler from session.amount_total. Updated on tier upgrades. Used as refund calculation basis.';

-- =============================================================================
-- Z-2: payment_events RLS
-- Source: D7-NEW-005
-- =============================================================================

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS payment_events_select_own ON payment_events;
DROP POLICY IF EXISTS payment_events_select_admin ON payment_events;
DROP POLICY IF EXISTS payment_events_insert_service ON payment_events;

CREATE POLICY payment_events_select_own ON payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payment_events.order_id
      AND orders.client_id = auth.uid()
    )
  );

CREATE POLICY payment_events_select_admin ON payment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY payment_events_insert_service ON payment_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- =============================================================================
-- Z-3a: delivery_packages RLS
-- Source: D7-NEW-006
-- =============================================================================

ALTER TABLE delivery_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_packages_select_own ON delivery_packages;
DROP POLICY IF EXISTS delivery_packages_select_admin ON delivery_packages;

CREATE POLICY delivery_packages_select_own ON delivery_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = delivery_packages.order_id
      AND orders.client_id = auth.uid()
    )
  );

CREATE POLICY delivery_packages_select_admin ON delivery_packages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =============================================================================
-- Z-3b: order_deliverables RLS (2-hop JOIN through delivery_packages)
-- =============================================================================

ALTER TABLE order_deliverables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_deliverables_select_own ON order_deliverables;
DROP POLICY IF EXISTS order_deliverables_select_admin ON order_deliverables;

CREATE POLICY order_deliverables_select_own ON order_deliverables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery_packages dp
      JOIN orders o ON o.id = dp.order_id
      WHERE dp.id = order_deliverables.package_id
      AND o.client_id = auth.uid()
    )
  );

CREATE POLICY order_deliverables_select_admin ON order_deliverables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Performance: ensure index exists for the 2-hop JOIN
CREATE INDEX IF NOT EXISTS idx_delivery_packages_order_id ON delivery_packages (order_id);

-- =============================================================================
-- Z-4: Expand orders.status CHECK constraint to 16 statuses (SP-8 Group T)
-- Source: D7-NEW-003
-- =============================================================================

DO $$
BEGIN
  -- Try known constraint names
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS check_order_status;
EXCEPTION
  WHEN undefined_object THEN NULL; -- No constraint exists
END $$;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'submitted',
    'paid',
    'pending_payment',
    'in_progress',
    'quality_review',
    'awaiting_approval',
    'revision_requested',
    'revision_in_progress',
    'completed',
    'cancelled',
    'failed',
    'on_hold',
    'pending_conflict_review',
    'disputed',
    'refunded',
    'upgrade_pending'
  )
);

-- =============================================================================
-- Z-5: Case number normalization index for conflict check
-- Source: D7-R5-003-IDX | Option B (generated column + standard index)
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS case_number_normalized TEXT
  GENERATED ALWAYS AS (
    UPPER(
      REPLACE(REPLACE(REPLACE(REPLACE(
        case_number,
        ' ', ''),
        '-', ''),
        E'\u2013', ''),
        E'\u2014', '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_orders_case_number_norm ON orders (case_number_normalized);

-- =============================================================================
-- Z-6: Billing payer columns (future direct billing support)
-- Source: D7-NEW-012
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billing_payer TEXT DEFAULT 'attorney'
    CHECK (billing_payer IN ('attorney', 'client')),
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT;

COMMENT ON COLUMN orders.billing_payer IS
  'Who pays: attorney (default) or client (future direct billing). See LA Pricing Strategy Memo Section 6.';
COMMENT ON COLUMN orders.billing_contact_email IS
  'Email for payment link when billing_payer = client. NULL when attorney pays.';

-- =============================================================================
-- Z-7: Terminal state enforcement trigger
-- Source: D7-R3-003-DB | Priority: P0 CRITICAL
-- Defense-in-depth behind application-level validateTransition()
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow admin override via session variable
  IF current_setting('app.admin_override', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- CANCELLED is fully terminal: no transitions out
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state CANCELLED (order_id: %)', OLD.id;
  END IF;

  -- REFUNDED is fully terminal: no transitions out
  IF OLD.status = 'refunded' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state REFUNDED (order_id: %)', OLD.id;
  END IF;

  -- FAILED is fully terminal: no transitions out
  IF OLD.status = 'failed' THEN
    RAISE EXCEPTION 'Cannot transition from terminal state FAILED (order_id: %)', OLD.id;
  END IF;

  -- COMPLETED allows only COMPLETED -> revision_requested
  IF OLD.status = 'completed' AND NEW.status != 'revision_requested' THEN
    RAISE EXCEPTION 'COMPLETED orders can only transition to revision_requested, not % (order_id: %)', NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_order_status ON orders;

CREATE TRIGGER trg_enforce_order_status
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_status_transition();

-- =============================================================================
-- Z-7 (continued): Additional columns needed by Wave 2+
-- =============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_in_progress BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_version INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_workflow_trigger_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_flagged BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_cap_triggered BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_to_tier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_from_tier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upgrade_resolved_at TIMESTAMPTZ;

-- =============================================================================
-- Reconciliation reports table (D7-R3-001)
-- Used by daily reconciliation sweep
-- =============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_charges_checked INTEGER NOT NULL,
  total_refunds_checked INTEGER NOT NULL,
  mismatches JSONB NOT NULL DEFAULT '[]',
  mismatch_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(mismatches)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_run_date ON reconciliation_reports (run_date DESC);

COMMIT;
