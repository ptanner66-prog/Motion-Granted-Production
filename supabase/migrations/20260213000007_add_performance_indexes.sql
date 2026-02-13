-- ============================================================================
-- Migration: 20260213000007_add_performance_indexes.sql
-- SP19 CGA6-011: Add missing performance indexes
--
-- Adds indexes for common query patterns that are not yet covered.
--
-- ALREADY EXISTING (verified — NOT re-added):
--   orders: idx_orders_client_id, idx_orders_clerk_id, idx_orders_client_status,
--           idx_orders_active (partial), idx_orders_search, idx_orders_motion_tier,
--           idx_orders_status_deadline, idx_orders_queue_position,
--           idx_orders_hold_status, idx_orders_current_phase
--   order_citations: idx_order_citations_order_id, idx_order_citations_unique,
--           idx_order_citations_type, idx_order_citations_verification,
--           idx_order_citations_cl_opinion_id, idx_order_citations_cl_cluster_id
--   workflow_violations: idx_violations_order, idx_violations_severity,
--           idx_violations_unresolved, idx_violations_timestamp
--   workflow_state: idx_workflow_state_order, idx_workflow_state_phase,
--           idx_workflow_state_checkpoint
-- ============================================================================

-- 1. Full status index on orders (non-partial).
--    idx_orders_active is partial (excludes cancelled/completed/refunded).
--    Admin dashboard queries need to filter by ANY status value.
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

-- 2. Orders by creation time (reverse-chronological).
--    Used by admin order listing and recent activity dashboards.
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON orders(created_at DESC);

-- 3. Composite: client's recent orders.
--    Dashboard "My Orders" page sorts client's orders by newest first.
CREATE INDEX IF NOT EXISTS idx_orders_client_recent
  ON orders(client_id, created_at DESC);

-- 4. Order citations: authority level for filtering in citation viewer.
CREATE INDEX IF NOT EXISTS idx_order_citations_authority_level
  ON order_citations(authority_level)
  WHERE authority_level IS NOT NULL;

-- 5. Workflow state: order_id + phase status for workflow engine lookups.
CREATE INDEX IF NOT EXISTS idx_workflow_state_order_status
  ON workflow_state(order_id, phase_status);

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename IN ('orders', 'order_citations', 'workflow_state')
--   AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;
-- ============================================================================
