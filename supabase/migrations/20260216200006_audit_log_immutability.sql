-- ============================================================================
-- SP-4 Task 5 (DST-05): Audit Log Immutability Trigger
-- Date: 2026-02-16
--
-- Prevents UPDATE and DELETE on admin_activity_log regardless of role.
-- Even service_role cannot modify audit records after insertion.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable. Operation % on record % blocked.',
    TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

-- Block UPDATE and DELETE regardless of role (including service_role)
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON admin_activity_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON admin_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
