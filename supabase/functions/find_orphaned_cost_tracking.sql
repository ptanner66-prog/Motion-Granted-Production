-- find_orphaned_cost_tracking.sql — D3 Task 21
-- Detects cost_tracking rows where the parent order no longer exists.
-- Returns orphaned rows for admin investigation. Does NOT auto-delete.
--
-- Called via supabase.rpc('find_orphaned_cost_tracking')
-- from lib/inngest/functions/reconcile-cost-tracking.ts

CREATE OR REPLACE FUNCTION find_orphaned_cost_tracking()
RETURNS TABLE(order_id UUID, total_cost DECIMAL, created_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT ct.order_id, ct.total_cost, ct.created_at
  FROM cost_tracking ct
  LEFT JOIN orders o ON o.id = ct.order_id
  WHERE o.id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
