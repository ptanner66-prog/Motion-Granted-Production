-- ==========================================================================
-- MIGRATION: Fix DR-002 -- Resolve retention period conflict
-- AUDIT REF: DR-002 (P1 HIGH)
-- DATE: 2026-02-16 CST
--
-- BINDING: 180 days from delivery (DB trigger default).
-- Fn2 APPROVE path sets retention_expires_at = now() + 365 days in app code.
-- ==========================================================================

DROP TRIGGER IF EXISTS set_retention_expiry ON orders;
DROP FUNCTION IF EXISTS calculate_retention_expiry();

CREATE OR REPLACE FUNCTION set_initial_retention()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('COMPLETED', 'completed') AND OLD.status NOT IN ('COMPLETED', 'completed') THEN
    IF NEW.retention_expires_at IS NULL THEN
      NEW.retention_expires_at := now() + INTERVAL '180 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_set_retention' AND event_object_table = 'orders'
  ) THEN
    CREATE TRIGGER trigger_set_retention
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION set_initial_retention();
  END IF;
END $$;
