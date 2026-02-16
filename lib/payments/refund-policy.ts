/**
 * Refund Policy Calculator (SP-10 AA-1)
 *
 * Source: D7-NEW-001 | Priority: P0 CRITICAL
 *
 * BINDING DECISIONS:
 * - Refund basis: amount_paid_cents column on orders (NOT total_price) — BD-REFUND-BASIS
 * - Admin fee: $0 ALWAYS — Binding R2v2 §6.1 (ADMIN_FEE_CENTS MUST NOT EXIST)
 * - CP3 refund: 50% of amount_paid_cents — BD-REFUND-PCR
 * - Terminal states: CANCELLED, COMPLETED, FAILED, REFUNDED — D4-CORR-001
 *
 * @module payments/refund-policy
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// TYPES
// ============================================================

export type CancellationType =
  | 'CUSTOMER'
  | 'ADMIN'
  | 'HOLD_CANCEL'
  | 'DISPUTE_LOSS'
  | 'CP3_CANCEL'
  | 'CP3_TIMEOUT_CANCEL'
  | 'COST_CAP_EXIT';

export interface RefundCalculation {
  refundAmountCents: number;
  refundPercentage: number;
  adminFeeCents: number; // ALWAYS 0 per Binding R2v2 §6.1
  skipStripeCall: boolean;
  reason: string;
  adminOverrideRequired?: boolean;
}

type PaymentStatus =
  | 'submitted'
  | 'paid'
  | 'pending_payment'
  | 'in_progress'
  | 'quality_review'
  | 'awaiting_approval'
  | 'revision_requested'
  | 'revision_in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'on_hold'
  | 'pending_conflict_review'
  | 'disputed'
  | 'refunded'
  | 'upgrade_pending';

// ============================================================
// REFUND LOCK (D7-R3-002)
// ============================================================

export async function acquireRefundLock(
  orderId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('orders')
    .update({ refund_in_progress: true })
    .eq('id', orderId)
    .eq('refund_in_progress', false)
    .select('id')
    .single();

  if (error || !data) {
    // 0 rows affected = already locked by another code path
    return false;
  }
  return true;
}

export async function releaseRefundLock(
  orderId: string,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase
    .from('orders')
    .update({ refund_in_progress: false })
    .eq('id', orderId);
}

// ============================================================
// PRIOR REFUND CALCULATION
// ============================================================

export async function getPriorRefundsCents(
  orderId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from('payment_events')
    .select('metadata')
    .eq('order_id', orderId)
    .eq('event_type', 'REFUND_PROCESSED');

  if (error || !data || data.length === 0) return 0;

  return data.reduce((sum: number, event: { metadata: Record<string, unknown> | null }) => {
    const amount = (event.metadata?.refund_amount_cents as number) ?? 0;
    return sum + amount;
  }, 0);
}

// ============================================================
// MAIN REFUND CALCULATOR
// ============================================================

export function calculateRefundAmount(
  amountPaidCents: number,
  orderStatus: PaymentStatus,
  currentPhase: string | null,
  cancellationType: CancellationType,
  priorRefundsCents: number = 0,
): RefundCalculation {
  // --- Input validation ---
  if (isNaN(amountPaidCents) || amountPaidCents < 0) {
    throw new Error(`Invalid amountPaidCents: must be non-negative integer, got ${amountPaidCents}`);
  }

  // --- $0 order fast path ---
  if (amountPaidCents === 0) {
    return {
      refundAmountCents: 0,
      refundPercentage: 0,
      adminFeeCents: 0, // ALWAYS 0
      skipStripeCall: true,
      reason: '$0 order — no Stripe refund needed',
    };
  }

  // --- Determine refund percentage by cancellation type + status ---
  let refundPercentage: number;
  let reason: string;
  let adminOverrideRequired = false;

  switch (cancellationType) {
    case 'CUSTOMER':
      // Customer self-cancel: 100% if pre-work, blocked if in-progress
      if (orderStatus === 'paid' || orderStatus === 'submitted' || orderStatus === 'pending_payment') {
        refundPercentage = 100;
        reason = 'Customer cancel before work started — full refund';
      } else if (orderStatus === 'in_progress') {
        throw new Error('IN_PROGRESS orders cannot be self-cancelled. Contact support.');
      } else {
        refundPercentage = 100;
        reason = `Customer cancel at status ${orderStatus} — full refund`;
      }
      break;

    case 'ADMIN':
      // Admin cancel: percentage depends on phase
      refundPercentage = getAdminRefundPercentage(currentPhase);
      reason = `Admin cancel at phase ${currentPhase ?? 'unknown'} — ${refundPercentage}% refund`;
      adminOverrideRequired = true;
      break;

    case 'HOLD_CANCEL':
      // HOLD timeout cancel (evidence gap): 100% refund
      refundPercentage = 100;
      reason = 'HOLD cancel (evidence gap) — full refund';
      break;

    case 'DISPUTE_LOSS':
      // Stripe already debited the funds — no additional refund
      refundPercentage = 0;
      reason = 'Dispute lost — Stripe has already debited funds';
      break;

    case 'CP3_CANCEL':
      // Attorney cancels at CP3: 50% of amount_paid_cents
      refundPercentage = 50;
      reason = 'CP3 attorney cancel — 50% refund per TOS';
      break;

    case 'CP3_TIMEOUT_CANCEL':
      // 21-day auto-cancel: 50% of amount_paid_cents
      refundPercentage = 50;
      reason = 'CP3 21-day timeout — 50% refund per TOS';
      break;

    case 'COST_CAP_EXIT':
      // Cost cap before deliverable: 100%. With deliverable: routed to CP3
      if (!currentPhase || phaseNumber(currentPhase) < 5) {
        refundPercentage = 100;
        reason = 'Cost cap reached before deliverable produced — full refund';
      } else {
        // Has deliverable — routed to CP3, refund handled there
        refundPercentage = 50;
        reason = 'Cost cap with deliverable — routed to CP3, 50% refund applies';
      }
      break;

    default:
      throw new Error(`Unrecognized cancellationType: ${cancellationType}`);
  }

  // --- Calculate amount ---
  const availableForRefund = amountPaidCents - priorRefundsCents;
  let refundAmountCents = Math.round((availableForRefund * refundPercentage) / 100);

  // --- Guard: cap at amount actually available (D7-R5-007-GUARD) ---
  if (refundAmountCents > availableForRefund) {
    refundAmountCents = availableForRefund;
  }

  // --- Guard: never negative ---
  if (refundAmountCents < 0) {
    refundAmountCents = 0;
  }

  return {
    refundAmountCents,
    refundPercentage,
    adminFeeCents: 0, // BINDING: always 0, no admin fee
    skipStripeCall: refundAmountCents === 0,
    reason,
    adminOverrideRequired,
  };
}

// ============================================================
// HELPERS
// ============================================================

function getAdminRefundPercentage(currentPhase: string | null): number {
  if (!currentPhase) return 100;
  const num = phaseNumber(currentPhase);
  if (num <= 3) return 85;
  if (num === 4) return 65;
  if (num <= 6) return 40;
  if (num <= 9) return 20;
  return 20; // Phase X+ defaults to 20%
}

function phaseNumber(phase: string): number {
  // Extract phase number from strings like 'PHASE_IV', 'phase_v', 'V', '4', etc.
  const roman: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  };
  const cleaned = phase.toUpperCase().replace('PHASE_', '').replace('PHASE', '').trim();
  if (roman[cleaned]) return roman[cleaned];
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

export function calculateAdminRefundSuggestion(
  amountPaidCents: number,
  currentPhase: string | null,
): { suggestedPercentage: number; suggestedAmountCents: number; phaseLabel: string } {
  const suggestedPercentage = getAdminRefundPercentage(currentPhase);
  const suggestedAmountCents = Math.round((amountPaidCents * suggestedPercentage) / 100);
  const phaseLabel = currentPhase ?? 'Unknown';
  return { suggestedPercentage, suggestedAmountCents, phaseLabel };
}
