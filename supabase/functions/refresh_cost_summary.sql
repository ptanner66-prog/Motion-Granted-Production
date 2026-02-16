-- refresh_cost_summary.sql — D3 Task 3
-- Supabase RPC to refresh the order_cost_summary materialized view.
-- Called by Inngest cron every 5 minutes.
-- Uses CONCURRENTLY to avoid locking reads during refresh.

CREATE OR REPLACE FUNCTION refresh_cost_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY order_cost_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
