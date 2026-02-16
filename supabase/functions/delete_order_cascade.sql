-- delete_order_cascade.sql — DST-04
-- Atomic transactional cascade deletion for order data.
-- Deletes all child records in dependency order, then soft-deletes the order
-- with PII anonymization.
--
-- Called via supabase.rpc('delete_order_cascade', { target_order_id })
-- from lib/retention/retention-manager.ts

CREATE OR REPLACE FUNCTION delete_order_cascade(target_order_id UUID)
RETURNS void AS $$
BEGIN
  -- Delete child records in dependency order
  DELETE FROM checkpoint_reminders WHERE order_id = target_order_id;
  DELETE FROM cp3_rejections WHERE order_id = target_order_id;
  DELETE FROM checkpoint_events WHERE order_id = target_order_id;
  DELETE FROM checkpoints WHERE order_id = target_order_id;
  DELETE FROM cost_tracking WHERE order_id = target_order_id;
  DELETE FROM loop_sources WHERE loop_counter_id IN (
    SELECT id FROM loop_counters WHERE order_id = target_order_id
  );
  DELETE FROM loop_counters WHERE order_id = target_order_id;
  DELETE FROM order_deliverables WHERE order_id = target_order_id;
  DELETE FROM delivery_packages WHERE order_id = target_order_id;

  -- Soft-delete the order itself
  UPDATE orders SET
    deleted_at = NOW(),
    -- Anonymize PII fields
    case_number = 'REDACTED',
    case_title = 'REDACTED',
    cp3_change_notes = NULL
  WHERE id = target_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
