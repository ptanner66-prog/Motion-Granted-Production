-- ==========================================================================
-- MIGRATION: Fix SPD-001 -- Rename amount_paid -> amount_paid_cents
-- AUDIT REF: SPD-001 (P0) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WARNING: This renames a column. Application code MUST be updated
-- in the SAME deployment. Search for all references:
--   grep -rn 'amount_paid' --include='*.ts' --include='*.tsx'
-- and update each to 'amount_paid_cents'.
--
-- ROLLBACK: ALTER TABLE orders RENAME COLUMN amount_paid_cents TO amount_paid;
-- ==========================================================================

-- Step 1: Rename the column (fails if already renamed -- check first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid_cents'
  ) THEN
    ALTER TABLE orders RENAME COLUMN amount_paid TO amount_paid_cents;
  END IF;
END $$;

-- Step 2: Add comment documenting the unit
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid_cents'
  ) THEN
    COMMENT ON COLUMN orders.amount_paid_cents IS
      'Total amount paid in CENTS (integer). $150.00 = 15000. Per D7 audit SPD-001.';
  END IF;
END $$;

-- Step 3: Also rename base_price if it exists without _cents suffix
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'base_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'base_price_cents'
  ) THEN
    ALTER TABLE orders RENAME COLUMN base_price TO base_price_cents;
    COMMENT ON COLUMN orders.base_price_cents IS
      'Base price in CENTS before modifiers. Per D7 audit MW-003.';
  END IF;
END $$;

-- Verification:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'orders' AND (column_name LIKE '%amount%' OR column_name LIKE '%price%')
-- ORDER BY column_name;
-- Expected: amount_paid_cents (NOT amount_paid), base_price_cents (if base_price existed)
--
-- CODE SEARCH (run in terminal):
-- grep -rn 'amount_paid' --include='*.ts' --include='*.tsx' | grep -v 'amount_paid_cents'
-- Expected: 0 results after code update
