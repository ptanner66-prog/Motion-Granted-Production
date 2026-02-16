-- ============================================================================
-- SP-2 Task 12 (D5 W1-1): Checkpoint System Tables Migration
-- Date: 2026-02-16
--
-- Creates 4 tables: checkpoints, checkpoint_events (immutable), cp3_rejections,
-- checkpoint_reminders. Adds refund_in_progress + pending_inngest_jobs to orders.
--
-- All RLS uses orders.client_id per CST-01.
-- Admin SELECT uses Pattern 4 (EXISTS admin_users).
-- checkpoint_events is truly immutable (UPDATE/DELETE revoked).
-- cp3_rejections FK points to delivery_packages(id), NOT checkpoints(id).
-- ============================================================================

-- ====== TABLE 1: checkpoints (HOLD checkpoints only) ======
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('HOLD', 'CP1', 'CP2')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'CANCELLED', 'ESCALATED')),
  phase TEXT NOT NULL,
  hold_reason TEXT,
  actor TEXT NOT NULL CHECK (actor IN ('customer', 'system')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_order_id ON checkpoints(order_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_checkpoints_type_status ON checkpoints(type, status);

-- ====== TABLE 2: checkpoint_events (IMMUTABLE audit log) ======
-- checkpoint_events table may already exist from 20260128_workflow_config.sql.
-- Add missing columns/constraints if needed, then apply immutability.

-- Add checkpoint_id and package_id columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'checkpoint_id'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN checkpoint_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN package_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'actor'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN actor TEXT NOT NULL DEFAULT 'system';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkpoint_events' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE checkpoint_events ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- IMMUTABLE: Prevent updates and deletes for ALL roles
-- This makes the audit trail tamper-proof.
REVOKE UPDATE, DELETE ON checkpoint_events FROM authenticated;
REVOKE UPDATE, DELETE ON checkpoint_events FROM service_role;

-- ====== TABLE 3: cp3_rejections ======
-- NOTE: FK points to delivery_packages(id), NOT checkpoints(id) per R2v2 ST5-08
CREATE TABLE IF NOT EXISTS cp3_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES delivery_packages(id),
  attorney_id TEXT NOT NULL,
  change_notes TEXT,
  rejection_number INTEGER NOT NULL DEFAULT 1,
  removed_in_revision BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp3_rejections_order ON cp3_rejections(order_id);
CREATE INDEX IF NOT EXISTS idx_cp3_rejections_removed ON cp3_rejections(order_id) WHERE removed_in_revision = false;

-- ====== TABLE 4: checkpoint_reminders ======
CREATE TABLE IF NOT EXISTS checkpoint_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('HOLD', 'CP3')),
  job_ids TEXT[] NOT NULL DEFAULT '{}',
  cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_reminders_order ON checkpoint_reminders(order_id) WHERE cancelled = false;

-- ====== ORDERS TABLE: Add refund lock + pending jobs ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_in_progress BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_inngest_jobs JSONB DEFAULT '[]';

-- ====== RLS for all 4 tables ======
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
-- checkpoint_events RLS already enabled from 20260128_workflow_config.sql
ALTER TABLE cp3_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoint_reminders ENABLE ROW LEVEL SECURITY;

-- Attorney read access (join through orders.client_id)
DROP POLICY IF EXISTS attorney_read_checkpoints ON checkpoints;
CREATE POLICY attorney_read_checkpoints ON checkpoints
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_checkpoint_events ON checkpoint_events;
CREATE POLICY attorney_read_checkpoint_events ON checkpoint_events
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_cp3_rejections ON cp3_rejections;
CREATE POLICY attorney_read_cp3_rejections ON cp3_rejections
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

DROP POLICY IF EXISTS attorney_read_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY attorney_read_checkpoint_reminders ON checkpoint_reminders
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
  );

-- Service role: unrestricted (Inngest functions)
DROP POLICY IF EXISTS service_all_checkpoints ON checkpoints;
CREATE POLICY service_all_checkpoints ON checkpoints
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_checkpoint_events ON checkpoint_events;
CREATE POLICY service_all_checkpoint_events ON checkpoint_events
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_cp3_rejections ON cp3_rejections;
CREATE POLICY service_all_cp3_rejections ON cp3_rejections
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

DROP POLICY IF EXISTS service_all_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY service_all_checkpoint_reminders ON checkpoint_reminders
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- Admin SELECT (Pattern 4)
DROP POLICY IF EXISTS admin_read_checkpoints ON checkpoints;
CREATE POLICY admin_read_checkpoints ON checkpoints
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_checkpoint_events ON checkpoint_events;
CREATE POLICY admin_read_checkpoint_events ON checkpoint_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_cp3_rejections ON cp3_rejections;
CREATE POLICY admin_read_cp3_rejections ON cp3_rejections
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_read_checkpoint_reminders ON checkpoint_reminders;
CREATE POLICY admin_read_checkpoint_reminders ON checkpoint_reminders
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
