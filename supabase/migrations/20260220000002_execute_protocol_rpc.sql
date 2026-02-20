-- T-11: Create execute_protocol_rpc for atomic protocol execution tracking
-- Source: R8 T-11, Wave 1
--
-- Provides atomic protocol dispatch tracking: records when a protocol dispatch
-- cycle starts, and returns current order state so the dispatcher doesn't need
-- separate queries. Works alongside the existing protocol_results audit trail.

-- Protocol execution tracking table (lightweight — distinct from protocol_results audit trail)
CREATE TABLE IF NOT EXISTS protocol_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  protocol_code TEXT NOT NULL,
  phase TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protocol_exec_log_order
  ON protocol_execution_log(order_id);
CREATE INDEX IF NOT EXISTS idx_protocol_exec_log_phase
  ON protocol_execution_log(order_id, phase);

ALTER TABLE protocol_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_protocol_exec_log"
  ON protocol_execution_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read_protocol_exec_log"
  ON protocol_execution_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RPC: Atomically log protocol execution and return current order context
CREATE OR REPLACE FUNCTION public.execute_protocol_rpc(
  p_order_id UUID,
  p_protocol_code TEXT,
  p_phase TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Verify order exists and get current state
  SELECT id, status, tier, order_number
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Log protocol execution
  INSERT INTO protocol_execution_log (order_id, protocol_code, phase, payload, executed_at)
  VALUES (p_order_id, p_protocol_code, p_phase, p_payload, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'protocol_code', p_protocol_code,
    'phase', p_phase,
    'order_status', v_order.status,
    'tier', v_order.tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_protocol_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_protocol_rpc TO service_role;

COMMENT ON FUNCTION public.execute_protocol_rpc IS 'T-11: Atomic protocol execution tracking — logs dispatch and returns order context';
COMMENT ON TABLE protocol_execution_log IS 'Lightweight protocol execution tracking (complements protocol_results audit trail)';
