-- ============================================================================
-- SP-2 Task 13 (D5 W1-2): Orders Table CP3 Columns
-- Date: 2026-02-16
--
-- Some columns already exist from prior migrations:
--   - cp3_change_notes (20260215100000)
--   - protocol_10_triggered (034, 20260128_workflow_config)
--   - retention_expires_at (20260215100000)
--
-- This migration adds the remaining columns and ensures all exist.
-- All use ADD COLUMN IF NOT EXISTS for idempotent application.
-- ============================================================================

-- attorney_rework_count: Times attorney clicked Request Changes at CP3.
-- Hard cap 3 (BD-04). SEPARATE from loop_counters.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attorney_rework_count INTEGER NOT NULL DEFAULT 0;

-- cp3_change_notes: Most recent change notes. Overwritten each rework cycle.
-- Injected into Phase VII context.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_change_notes TEXT;

-- protocol_10_triggered: When true, Request Changes button hidden on dashboard.
-- Clears on pass (BD-07).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protocol_10_triggered BOOLEAN NOT NULL DEFAULT false;

-- cp3_entered_at: When order first entered AWAITING_APPROVAL.
-- Used for timeout calculation. Resets on rework return.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_entered_at TIMESTAMPTZ;

-- retention_expires_at: NOW() + 365 days on COMPLETED.
-- California 1-year malpractice discovery statute.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- cancellation_type: Discriminates cancellation reason for refund calculation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_type TEXT;

-- Add CHECK constraint for cancellation_type (5 valid types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_cancellation_type_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_cancellation_type_check
      CHECK (cancellation_type IN (
        'CUSTOMER_CANCEL',
        'ADMIN_CANCEL',
        'CP3_CANCEL',
        'CP3_TIMEOUT_CANCEL',
        'HOLD_CANCEL'
      ) OR cancellation_type IS NULL);
  END IF;
END $$;
