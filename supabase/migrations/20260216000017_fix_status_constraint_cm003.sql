-- ==========================================================================
-- MIGRATION: Fix CM-003 -- Reconcile orders status constraint
-- AUDIT REF: CM-003 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    -- Architecture v2.2 canonical statuses (UPPERCASE)
    'INTAKE', 'PROCESSING', 'AWAITING_OPUS', 'HOLD_PENDING',
    'PROTOCOL_10_EXIT', 'UPGRADE_PENDING', 'PENDING_CONFLICT_REVIEW',
    'AWAITING_APPROVAL', 'REVISION_REQ', 'COMPLETED',
    'CANCELLED_USER', 'CANCELLED_SYSTEM', 'CANCELLED_CONFLICT',
    'DISPUTED', 'REFUNDED', 'FAILED',
    -- Legacy lowercase (existing data compatibility)
    'draft', 'pending', 'submitted', 'paid', 'in_progress', 'under_review',
    'assigned', 'completed', 'cancelled', 'failed', 'refunded',
    'hold', 'on_hold', 'awaiting_approval', 'refund_review',
    -- Uppercase equivalents of legacy
    'DRAFT', 'PENDING', 'SUBMITTED', 'PAID', 'IN_PROGRESS', 'UNDER_REVIEW',
    'ASSIGNED', 'HOLD', 'ON_HOLD', 'REFUND_REVIEW',
    'CANCELLED', 'APPROVED', 'REJECTED',
    -- Conflict + upgrade flow
    'CONFLICT_REVIEW', 'PENDING_REVIEW',
    'conflict_review', 'pending_review', 'approved', 'rejected',
    'UPGRADE_PENDING', 'upgrade_pending'
  )
);
