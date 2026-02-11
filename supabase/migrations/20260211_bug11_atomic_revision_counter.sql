-- BUG-11 FIX: Atomic revision counter increment
-- Prevents race condition where concurrent requests could lose increments.
--
-- Usage from Supabase client:
--   const { data } = await supabase.rpc('increment_revision_count', { p_order_id: orderId });
--   // data = new revision_count value (integer)

CREATE OR REPLACE FUNCTION increment_revision_count(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE orders
  SET revision_count = COALESCE(revision_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING revision_count INTO v_new_count;

  IF v_new_count IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  RETURN v_new_count;
END;
$$;

-- Grant execute to authenticated users (RLS still protects the underlying table)
GRANT EXECUTE ON FUNCTION increment_revision_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_revision_count(UUID) TO service_role;
