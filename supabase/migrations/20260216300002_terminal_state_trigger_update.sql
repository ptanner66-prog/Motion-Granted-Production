-- Terminal state enforcement trigger
-- D7-R3-003-DB + D4-CORR-001: Prevents transitions FROM terminal states (defense against code bugs)
-- Terminal states: CANCELLED, FAILED, REFUNDED
-- COMPLETED is NOT in this trigger because COMPLETED → DISPUTED is valid

CREATE OR REPLACE FUNCTION enforce_terminal_state()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if OLD status is terminal
  IF OLD.status IN ('CANCELLED', 'FAILED', 'REFUNDED') THEN
    -- Admin override column allows escaping terminal state in emergencies
    IF NEW.admin_override IS TRUE THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot transition from terminal state % (order_id: %)', OLD.status, OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to ensure latest version
DROP TRIGGER IF EXISTS trg_enforce_terminal_state ON orders;
CREATE TRIGGER trg_enforce_terminal_state
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION enforce_terminal_state();
