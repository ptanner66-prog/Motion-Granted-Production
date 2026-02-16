-- ============================================================================
-- D3 Task 15: Replace Heuristic Migration with Explicit Mapping
-- Date: 2026-02-16
--
-- Replaces the heuristic threshold (< 1000) in 20260216100006 with an
-- explicit correction table for known test/staging orders that stored
-- dollar values instead of cents.
--
-- The heuristic has a dangerous boundary at $9.99 = 999 cents, which
-- would be incorrectly multiplied by 100.
--
-- PORTER ACTION: Populate corrections from actual staging database
-- before running in production. This migration is safe to re-run
-- (idempotent via WHERE clause).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE amount_paid_corrections (
  order_id UUID PRIMARY KEY,
  correct_amount_cents INTEGER NOT NULL
);

-- INSERT known corrections from staging/test data audit.
-- Porter: populate from actual staging database before running.
-- Example entries:
-- INSERT INTO amount_paid_corrections VALUES
--   ('uuid-1', 29900),   -- $299.00 Tier A
--   ('uuid-2', 84900),   -- $849.00 Tier B
--   ('uuid-3', 149900);  -- $1,499.00 Tier D

-- Apply corrections
UPDATE orders o
SET amount_paid = c.correct_amount_cents
FROM amount_paid_corrections c
WHERE o.id = c.order_id
  AND o.amount_paid != c.correct_amount_cents;

DO $$
DECLARE
  affected INTEGER;
BEGIN
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'amount_paid corrections applied: % rows', affected;
END $$;

DROP TABLE amount_paid_corrections;

COMMIT;
