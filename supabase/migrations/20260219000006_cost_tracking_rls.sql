-- A8 Task 5: cost_tracking has ZERO security
-- Enable RLS and add admin/service/user policies

ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;

-- Admin: full access via is_admin() function
DO $$ BEGIN
  CREATE POLICY ct_admin_all ON cost_tracking
    FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role: full access (for Inngest/cron jobs)
DO $$ BEGIN
  CREATE POLICY ct_service_all ON cost_tracking
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users: can only read cost data for their own orders
DO $$ BEGIN
  CREATE POLICY ct_select_own ON cost_tracking
    FOR SELECT TO authenticated
    USING (order_id IN (SELECT id FROM orders WHERE client_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
