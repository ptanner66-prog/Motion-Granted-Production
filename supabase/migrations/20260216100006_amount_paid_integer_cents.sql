-- ============================================================================
-- SP-2 Task 7 (D3 Task 9): amount_paid INTEGER Cents Verification
-- Date: 2026-02-16
--
-- Stripe returns session.amount_total as integer cents.
-- All downstream code divides by 100 at UI layer.
-- Ensures amount_paid, stripe_fee, net_revenue are integer types.
--
-- NOTE: amount_paid was added as bigint in 20260215100000. bigint is an
-- integer type (8 bytes vs 4 bytes for integer). Both store whole numbers.
-- We keep bigint as it's a safe superset — no data loss possible.
-- The key requirement is NOT NUMERIC/DECIMAL (which would imply fractional dollars).
-- ============================================================================

-- Verify amount_paid is an integer type. Fix if NUMERIC/DECIMAL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_paid'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    -- If stored as decimal dollars, convert to cents
    IF EXISTS (SELECT 1 FROM orders WHERE amount_paid IS NOT NULL LIMIT 1) THEN
      ALTER TABLE orders ALTER COLUMN amount_paid TYPE BIGINT
        USING CASE
          WHEN amount_paid < 1000 THEN (amount_paid * 100)::BIGINT  -- Was dollars
          ELSE amount_paid::BIGINT  -- Already cents
        END;
    ELSE
      ALTER TABLE orders ALTER COLUMN amount_paid TYPE BIGINT;
    END IF;
  END IF;
END $$;

-- Fix stripe_fee if it exists as non-integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_fee'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    ALTER TABLE orders ALTER COLUMN stripe_fee TYPE BIGINT USING stripe_fee::BIGINT;
  END IF;
END $$;

-- Fix net_revenue if it exists as non-integer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'net_revenue'
    AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
  ) THEN
    ALTER TABLE orders ALTER COLUMN net_revenue TYPE BIGINT USING net_revenue::BIGINT;
  END IF;
END $$;
