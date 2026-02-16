/**
 * Canonical Order Status Transitions
 *
 * D6 C-007 + SP-4 R4-06: Single source of truth for valid order status transitions.
 * Uses 'REVISION_REQ' (never 'REVISION_REQUESTED') per binding rule.
 * Uses 'AWAITING_APPROVAL' for CP3 attorney review state.
 *
 * 7-state model:
 *   SUBMITTED → PAID → IN_PROGRESS → AWAITING_APPROVAL → REVISION_REQ → IN_PROGRESS (loop)
 *                                                       → COMPLETED
 *                                                       → CANCELLED (from any non-terminal)
 *                                   → CANCELLED
 *            → CANCELLED
 *   SUBMITTED → CANCELLED
 *
 * COMPLETED and CANCELLED are terminal states — no transitions out.
 *
 * Binding authority: 02/15/26 binding line 8:
 *   'Use REVISION_REQ (not REVISION_REQUESTED) everywhere.'
 */

// ============================================================================
// STATUS ENUM
// ============================================================================

/**
 * All valid order statuses. Uses string literals for DB compatibility.
 * IMPORTANT: 'REVISION_REQ' is the ONLY valid revision status.
 */
export const ORDER_STATUSES = [
  'SUBMITTED',
  'PAID',
  'IN_PROGRESS',
  'AWAITING_APPROVAL',
  'REVISION_REQ',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Terminal statuses — no further transitions allowed */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'COMPLETED',
  'CANCELLED',
]);

// ============================================================================
// TRANSITION MAP
// ============================================================================

/**
 * VALID_TRANSITIONS[currentStatus] → Set of statuses it can transition to.
 *
 * Rules:
 * - SUBMITTED can go to PAID or CANCELLED (payment failed / user cancel)
 * - PAID can go to IN_PROGRESS or CANCELLED (refund before work starts)
 * - IN_PROGRESS can go to AWAITING_APPROVAL or CANCELLED
 * - AWAITING_APPROVAL can go to COMPLETED, REVISION_REQ, or CANCELLED
 * - REVISION_REQ can go to IN_PROGRESS or CANCELLED
 * - COMPLETED and CANCELLED are terminal (empty sets)
 */
export const VALID_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  SUBMITTED: new Set(['PAID', 'CANCELLED']),
  PAID: new Set(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set(['AWAITING_APPROVAL', 'CANCELLED']),
  AWAITING_APPROVAL: new Set(['COMPLETED', 'REVISION_REQ', 'CANCELLED']),
  REVISION_REQ: new Set(['IN_PROGRESS', 'CANCELLED']),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
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
