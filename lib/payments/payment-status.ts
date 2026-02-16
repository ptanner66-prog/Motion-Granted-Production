/**
 * Payment Status Validation (SP-10 AA-2)
 *
 * Source: D7-R3-003 | Priority: P0 CRITICAL
 *
 * Terminal state enforcement at the application level.
 * Defense-in-depth: DB trigger (Z-7) provides second layer.
 *
 * BINDING DECISIONS:
 * - Terminal states: CANCELLED, COMPLETED, FAILED, REFUNDED — D4-CORR-001
 * - COMPLETED escape: COMPLETED → REVISION_REQUESTED only — D7-R3-003
 * - CANCELLED escape: NONE — fully terminal — D7-R3-003
 *
 * CRITICAL: validateTransition() THROWS on invalid transitions (not returns false).
 * All callers must catch:
 * - Webhook handlers: catch → return 200 (idempotent) + log TERMINAL_STATE_VIOLATION
 * - API routes: catch → return 409 'Order status has changed'
 * - Inngest functions: catch → log + exit gracefully (do NOT retry)
 *
 * @module payments/payment-status
 */

import {
  VALID_TRANSITIONS,
  type OrderStatus,
  isValidStatus,
} from '@/lib/config/status-transitions';

// ============================================================
// TERMINAL STATES
// ============================================================

const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'cancelled',
  'completed', // escape: completed → revision_requested ONLY
  'failed',
  'refunded',
  // Uppercase variants for D4/D6 status model compatibility
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
]);

const TERMINAL_ESCAPES: Record<string, string[]> = {
  completed: ['revision_requested'],
  COMPLETED: ['REVISION_REQ', 'DISPUTED'],
  // cancelled, failed, refunded: NO escapes
};

// ============================================================
// PUBLIC API
// ============================================================

export function isTerminalState(status: string): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Validate a status transition.
 *
 * THROWS on invalid transitions. All callers must catch.
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid
 * @throws Error if transition is invalid or from a terminal state
 */
export function validateTransition(from: string, to: string): boolean {
  // --- Terminal state check FIRST (before VALID_TRANSITIONS map) ---
  if (isTerminalState(from)) {
    const escapes = TERMINAL_ESCAPES[from];
    if (!escapes || !escapes.includes(to)) {
      throw new Error(
        `Cannot transition from terminal state '${from}' to '${to}'. ` +
        (escapes?.length ? `Allowed escapes: [${escapes.join(', ')}]` : 'No escapes permitted.'),
      );
    }
    return true; // Permitted escape
  }

  // --- Try D6 canonical VALID_TRANSITIONS (uppercase model) ---
  if (isValidStatus(from as OrderStatus) && isValidStatus(to as OrderStatus)) {
    const allowed = VALID_TRANSITIONS[from as OrderStatus];
    if (allowed && allowed.has(to as OrderStatus)) {
      return true;
    }
  }

  // --- Fallback: lowercase DB status validation ---
  const lowercaseTransitions: Record<string, string[]> = {
    submitted: ['paid', 'pending_payment', 'cancelled', 'pending_conflict_review'],
    paid: ['in_progress', 'cancelled', 'on_hold', 'pending_conflict_review'],
    pending_payment: ['paid', 'cancelled'],
    in_progress: ['quality_review', 'awaiting_approval', 'on_hold', 'cancelled', 'failed'],
    quality_review: ['awaiting_approval', 'revision_requested', 'cancelled', 'failed'],
    awaiting_approval: ['completed', 'revision_requested', 'cancelled'],
    revision_requested: ['revision_in_progress', 'cancelled'],
    revision_in_progress: ['quality_review', 'awaiting_approval', 'cancelled', 'failed'],
    on_hold: ['in_progress', 'cancelled'],
    pending_conflict_review: ['cancelled', 'paid', 'submitted'],
    disputed: ['completed', 'refunded', 'awaiting_approval'],
    upgrade_pending: ['in_progress', 'cancelled'],
  };

  const allowed = lowercaseTransitions[from];
  if (allowed && allowed.includes(to)) {
    return true;
  }

  throw new Error(
    `Invalid transition: '${from}' → '${to}'. Allowed: [${(allowed || []).join(', ')}]`,
  );
}
