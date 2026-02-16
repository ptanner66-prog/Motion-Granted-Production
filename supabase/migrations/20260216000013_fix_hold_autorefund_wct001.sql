-- ==========================================================================
-- MIGRATION: Fix WCT-001 -- Standardize HOLD auto-refund to 14 days
-- AUDIT REF: WCT-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

DROP FUNCTION IF EXISTS auto_refund_expired_holds();

CREATE OR REPLACE FUNCTION auto_refund_expired_holds()
RETURNS void AS $$
BEGIN
  UPDATE orders
  SET status = 'REFUND_REVIEW'
  WHERE status IN ('HOLD', 'hold', 'ON_HOLD', 'HOLD_PENDING')
    AND updated_at < now() - INTERVAL '14 days'
    AND retention_expires_at IS NULL;
END;
$$ LANGUAGE plpgsql SET search_path = '';
