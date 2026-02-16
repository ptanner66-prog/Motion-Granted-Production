/**
 * Canonical Order Status Transitions
 *
 * D6 C-007: Single source of truth for valid order status transitions.
 * Uses 'REVISION_REQ' (never 'REVISION_REQUESTED') per binding rule.
 *
 * 16-status model (D4-CORR-001 + v5-XDC-012 + Delta Resolution):
 *   INTAKE → PROCESSING → AWAITING_OPUS → ... → AWAITING_APPROVAL → COMPLETED
 *                                              → REVISION_REQ → (re-enter workflow)
 *   CANCELLED (terminal), FAILED (terminal), REFUNDED (terminal)
 *   DISPUTED (non-terminal: can revert to pre-dispute or → REFUNDED)
 *   PENDING_CONFLICT_REVIEW → CANCELLED only
 *   UPGRADE_PENDING → PROCESSING or CANCELLED
 *
 * DB stores: CANCELLED (flat), REVISION_REQ. TypeScript uses expanded variants.
 * toDbStatus() in lib/workflow/order-status.ts bridges the gap.
 *
 * Binding authority: 02/15/26 binding line 8:
 *   'Use REVISION_REQ (not REVISION_REQUESTED) everywhere.'
 */

// ============================================================================
// STATUS ENUM
// ============================================================================

/**
 * All valid order statuses — 16 members (D4-CORR-001 + v5-XDC-012 + Delta).
 * DB uses compact variants (CANCELLED, REVISION_REQ); TypeScript uses expanded.
 * IMPORTANT: 'REVISION_REQ' is the ONLY valid revision status in DB.
 */
export const ORDER_STATUSES = [
  'INTAKE',
  'PROCESSING',
  'AWAITING_OPUS',
  'HOLD_PENDING',
  'PROTOCOL_10_EXIT',
  'UPGRADE_PENDING',
  'PENDING_CONFLICT_REVIEW',
  'AWAITING_APPROVAL',
  'REVISION_REQ',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'REFUNDED',
  'FAILED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Terminal statuses — no further transitions allowed (DISPUTED is NOT terminal) */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
]);

// ============================================================================
// TRANSITION MAP
// ============================================================================

/**
 * VALID_TRANSITIONS[currentStatus] → Set of statuses it can transition to.
 *
 * Rules:
 * - INTAKE → PROCESSING, PENDING_CONFLICT_REVIEW, CANCELLED
 * - PROCESSING → AWAITING_OPUS, CANCELLED
 * - AWAITING_OPUS → HOLD_PENDING, PROTOCOL_10_EXIT, CANCELLED
 * - HOLD_PENDING → PROCESSING, CANCELLED
 * - PROTOCOL_10_EXIT → PROCESSING, CANCELLED
 * - UPGRADE_PENDING → PROCESSING, CANCELLED (D4 v5 XDC-012)
 * - PENDING_CONFLICT_REVIEW → CANCELLED only (Delta D4-CORR-001)
 * - AWAITING_APPROVAL → COMPLETED, REVISION_REQ, CANCELLED
 * - REVISION_REQ → PROCESSING, CANCELLED
 * - COMPLETED → DISPUTED (Stripe dispute received)
 * - CANCELLED, FAILED, REFUNDED → terminal (empty sets)
 * - DISPUTED → COMPLETED (won), AWAITING_APPROVAL (restored), REFUNDED (lost)
 */
export const VALID_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  INTAKE: new Set<OrderStatus>(['PROCESSING', 'PENDING_CONFLICT_REVIEW', 'CANCELLED']),
  PROCESSING: new Set<OrderStatus>(['AWAITING_OPUS', 'CANCELLED']),
  AWAITING_OPUS: new Set<OrderStatus>(['HOLD_PENDING', 'PROTOCOL_10_EXIT', 'AWAITING_APPROVAL', 'CANCELLED']),
  HOLD_PENDING: new Set<OrderStatus>(['PROCESSING', 'CANCELLED']),
  PROTOCOL_10_EXIT: new Set<OrderStatus>(['PROCESSING', 'CANCELLED']),
  UPGRADE_PENDING: new Set<OrderStatus>(['PROCESSING', 'CANCELLED']),
  PENDING_CONFLICT_REVIEW: new Set<OrderStatus>(['CANCELLED']),
  AWAITING_APPROVAL: new Set<OrderStatus>(['COMPLETED', 'REVISION_REQ', 'CANCELLED']),
  REVISION_REQ: new Set<OrderStatus>(['PROCESSING', 'CANCELLED']),
  COMPLETED: new Set<OrderStatus>(['DISPUTED']),
  CANCELLED: new Set<OrderStatus>(),
  DISPUTED: new Set<OrderStatus>(['COMPLETED', 'AWAITING_APPROVAL', 'REFUNDED']),
  REFUNDED: new Set<OrderStatus>(),
  FAILED: new Set<OrderStatus>(),
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a string is a valid OrderStatus.
 */
export function isValidStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}

/**
 * Check if a transition from `from` to `to` is allowed.
 */
export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/**
 * Get all statuses an order can transition to from its current status.
 */
export function getAllowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return [...VALID_TRANSITIONS[from]];
}

/**
 * Check if a status is terminal (no further transitions).
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
