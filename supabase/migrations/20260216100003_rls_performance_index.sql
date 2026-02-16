-- ============================================================================
-- SP-2 Task 3 (DST-01): RLS Subquery Performance Index
-- Date: 2026-02-16
--
-- Every RLS policy on child tables uses:
--   order_id IN (SELECT id FROM orders WHERE client_id = auth.uid())
--
-- Without a composite index on (client_id, id), this is a sequential scan.
-- The composite index enables index-only scans for the RLS subquery.
-- ============================================================================

-- Composite index: covers the IN (SELECT id FROM orders WHERE client_id = ?) pattern
-- Existing idx_orders_client_id (single column) still serves direct client_id lookups.
CREATE INDEX IF NOT EXISTS idx_orders_client_id_id
  ON orders (client_id, id);
