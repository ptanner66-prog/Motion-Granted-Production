-- ==========================================================================
-- D6 Phase 0: Missing cancellation columns (ST-052), resume_phase (ST-053),
-- delivery_packages stage + status_version (ST-033 gap fill)
-- Date: 2026-02-16
--
-- Columns that already exist from prior migrations:
--   - cancellation_type (20260216100011_d5_orders_cp3_columns.sql)
--   - refund_status (20260215100000_attorney_dashboard_schema.sql)
--   - case_number_normalized (20260216400001_d7_wave1_payment_schema.sql)
--
-- This migration adds remaining ST-052/053 columns and delivery_packages gaps.
-- ==========================================================================

-- ====== ORDERS: ST-052 Cancellation Tracking ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_stripe_id TEXT;

-- ====== ORDERS: ST-053 Resume Phase ======
ALTER TABLE orders ADD COLUMN IF NOT EXISTS resume_phase TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_resume_phase_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_resume_phase_check
      CHECK (resume_phase IN (
        'I','II','III','IV','V','V.1','VI','VII','VII.1',
        'VIII','VIII.5','IX','IX.1','X'
      ) OR resume_phase IS NULL);
  END IF;
END $$;

-- ====== DELIVERY_PACKAGES: ST-033 Gap Fill ======
-- stage column with lifecycle CHECK constraint
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'ASSEMBLY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_packages_stage_check'
  ) THEN
    ALTER TABLE delivery_packages ADD CONSTRAINT delivery_packages_stage_check
      CHECK (stage IN ('ASSEMBLY','QC','CP3_PENDING','APPROVED','DELIVERED','REVISION'));
  END IF;
END $$;

-- status_version for optimistic locking (C-002)
ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS status_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_delivery_packages_stage ON delivery_packages(stage);
