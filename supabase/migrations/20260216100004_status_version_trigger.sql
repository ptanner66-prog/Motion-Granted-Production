-- ============================================================================
-- SP-2 Task 5 (D1-021): status_version Optimistic Locking Trigger
-- Date: 2026-02-16
--
-- status_version column already exists (migration 20260215100000).
-- This migration adds the auto-increment trigger that fires on status changes.
--
-- Usage pattern for all status-changing operations:
--   .update({ status: 'NEW_STATUS' })
--   .match({ id: orderId, status_version: expectedVersion })
-- If concurrent modification occurred, the match fails (0 rows affected).
-- ============================================================================

-- Ensure column exists (idempotent)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_version INTEGER NOT NULL DEFAULT 1;

-- Auto-increment on every UPDATE that changes status
CREATE OR REPLACE FUNCTION increment_status_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_version := OLD.status_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_status_version ON orders;
CREATE TRIGGER trg_increment_status_version
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_status_version();
