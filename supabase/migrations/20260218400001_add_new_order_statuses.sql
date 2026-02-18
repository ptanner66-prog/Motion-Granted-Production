-- SP-GOD-2: Add new order statuses for API recovery, circuit breaker, and deferred verification
--
-- New statuses:
--   AWAITING_API_RECOVERY — order paused while waiting for external API to recover
--   PAUSED_CB             — order paused by circuit breaker (shared state)
--   VERIFICATION_DEFERRED — citation verification deferred due to API unavailability

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'INTAKE', 'PROCESSING', 'AWAITING_OPUS', 'HOLD_PENDING',
    'PROTOCOL_10_EXIT', 'UPGRADE_PENDING', 'PENDING_CONFLICT_REVIEW',
    'AWAITING_APPROVAL', 'REVISION_REQ', 'COMPLETED',
    'CANCELLED', 'DISPUTED', 'REFUNDED', 'FAILED',
    'AWAITING_API_RECOVERY', 'PAUSED_CB', 'VERIFICATION_DEFERRED'
  )
);
