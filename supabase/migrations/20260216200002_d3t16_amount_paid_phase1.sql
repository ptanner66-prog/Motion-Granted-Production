-- ============================================================================
-- D3 Task 16: Two-Phase Deploy for amount_paid Type Change
-- Phase 1: Add amount_paid_cents column for dual-write
-- Date: 2026-02-16
--
-- NOTE: The 20260215100000 migration already created amount_paid as BIGINT
-- and 20260216100006 verified it's an integer type. This migration adds
-- the amount_paid_cents column for a safe dual-write transition period.
--
-- During Phase 1, application code writes to BOTH columns.
-- Phase 2 migration (separate deploy) renames columns after
-- all code reads from the new column.
-- ============================================================================

-- Phase 1: Add new column alongside existing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid_cents BIGINT;

-- Backfill existing data
UPDATE orders
SET amount_paid_cents = amount_paid
WHERE amount_paid IS NOT NULL
  AND amount_paid_cents IS NULL;

COMMENT ON COLUMN orders.amount_paid_cents IS
  'Phase 1 dual-write column. Identical to amount_paid (integer cents). '
  'Will become the canonical column in Phase 2 after code migration. '
  'See D3 Task 16 two-phase deploy plan.';
