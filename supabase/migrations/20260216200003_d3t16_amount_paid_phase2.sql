-- ============================================================================
-- D3 Task 16: Two-Phase Deploy for amount_paid Type Change
-- Phase 2: Rename columns (RUN ONLY AFTER all code reads from new column)
-- Date: 2026-02-16
--
-- ⚠️ DO NOT RUN until Phase 1 is deployed and all code is updated to
-- read from amount_paid_cents. Verify with:
--   grep -rn 'amount_paid[^_]' --include='*.ts' app/ lib/
-- All hits should be the dual-write pattern or this migration reference.
-- ============================================================================

BEGIN;

-- Safety check: verify backfill is complete
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM orders
  WHERE amount_paid IS NOT NULL AND amount_paid_cents IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows have NULL amount_paid_cents', null_count;
  END IF;
END $$;

ALTER TABLE orders RENAME COLUMN amount_paid TO amount_paid_legacy;
ALTER TABLE orders RENAME COLUMN amount_paid_cents TO amount_paid;

COMMIT;
