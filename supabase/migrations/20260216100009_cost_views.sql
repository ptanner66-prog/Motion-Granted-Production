-- ============================================================================
-- SP-2 Tasks 10+11 (D3 Tasks 1+2): Materialized View + Bootstrap Refresh
-- Date: 2026-02-16
--
-- Creates order_cost_summary materialized view excluding soft-deleted orders.
-- Includes unique index for CONCURRENTLY refresh + bootstrap non-concurrent refresh.
-- ============================================================================

-- Drop existing if it exists (to rebuild with WHERE clause)
DROP MATERIALIZED VIEW IF EXISTS order_cost_summary;

CREATE MATERIALIZED VIEW order_cost_summary AS
SELECT
  o.id AS order_id,
  o.tier,
  CAST(o.amount_paid AS DECIMAL) / 100.0 AS revenue_usd,
  COALESCE(SUM(ct.total_cost), 0) AS total_api_cost,
  ROUND((CAST(o.amount_paid AS DECIMAL) / 100.0) - COALESCE(SUM(ct.total_cost), 0), 2) AS gross_margin,
  ROUND(
    ((CAST(o.amount_paid AS DECIMAL) / 100.0) - COALESCE(SUM(ct.total_cost), 0))
    / NULLIF(CAST(o.amount_paid AS DECIMAL) / 100.0, 0) * 100, 1
  ) AS margin_pct
FROM orders o
LEFT JOIN cost_tracking ct ON ct.order_id = o.id
WHERE o.deleted_at IS NULL  -- Exclude soft-deleted orders
GROUP BY o.id, o.tier, o.amount_paid;

-- Required unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cost_summary_order_id
  ON order_cost_summary (order_id);

-- Bootstrap: first refresh must be non-concurrent (PostgreSQL requirement)
-- All subsequent refreshes (via Inngest cron, SP-6) use CONCURRENTLY.
REFRESH MATERIALIZED VIEW order_cost_summary;
