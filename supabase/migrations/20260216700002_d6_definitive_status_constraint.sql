-- ==========================================================================
-- DEFINITIVE STATUS CONSTRAINT (ST-013/ST-032)
-- Single source of truth. RUNS LAST in Phase 0.
-- DB uses mapped names: REVISION_REQ (not REVISION_REQUESTED per XDC-001)
-- DB uses flat CANCELLED (toDbStatus maps CANCELLED_USER/SYSTEM/CONFLICT)
--
-- This replaces prior constraint versions:
--   - 20260216000017_fix_status_constraint_cm003.sql
--   - 20260216300001_delta_status_expansion.sql
-- ==========================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN (
  -- Canonical 14-status model (Architecture v2.2)
  'INTAKE','PROCESSING','AWAITING_OPUS','HOLD_PENDING',
  'PROTOCOL_10_EXIT','UPGRADE_PENDING','PENDING_CONFLICT_REVIEW',
  'AWAITING_APPROVAL','REVISION_REQ',
  'COMPLETED','CANCELLED','DISPUTED','REFUNDED','FAILED',
  -- Legacy lowercase (existing data compatibility — remove after full migration)
  'draft','pending','submitted','paid','in_progress','under_review',
  'assigned','completed','cancelled','failed','refunded',
  'hold','on_hold','awaiting_approval','refund_review',
  -- Uppercase equivalents of legacy
  'DRAFT','PENDING','SUBMITTED','PAID','IN_PROGRESS','UNDER_REVIEW',
  'ASSIGNED','HOLD','ON_HOLD','REFUND_REVIEW',
  'APPROVED','REJECTED',
  -- Conflict + upgrade flow (legacy)
  'CONFLICT_REVIEW','PENDING_REVIEW',
  'conflict_review','pending_review','approved','rejected',
  'upgrade_pending',
  -- Timeout status (CP3 timeout handling)
  'APPROVAL_TIMEOUT','approval_timeout'
));
