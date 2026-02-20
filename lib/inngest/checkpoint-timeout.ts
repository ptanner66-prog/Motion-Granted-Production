/**
 * HOLD Checkpoint Timeout Handler — SP-22 Task 4
 *
 * Rewritten handleHoldTimeout() with:
 * - HOLD-ST-004: Idempotency guard (skip if already cancelled)
 * - HOLD-ST-002: Uses canonical calculateRefundAmount()
 * - HOLD-ST-005: $0 guard (skip Stripe call if no refund)
 * - HOLD-ST-006: Clears resume_phase on cancel
 *
 * This function is called by:
 * - hold-7d-terminal-action (evidence_gap auto-cancel)
 * - Fn1 fallback handler (when waitForEvent times out)
 */

import type Stripe from 'stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { inngest } from './client';
import { calculateRefundAmount } from '@/lib/payments/refund-policy';
import { createLogger } from '@/lib/security/logger';

const logger = createLogger('checkpoint-timeout');

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

export interface HoldTimeoutResult {
  skipped?: boolean;
  reason?: string;
  refundAmountCents?: number;
}

/**
 * Process HOLD timeout: cancel the order and issue refund if applicable.
 *
 * IDEMPOTENCY: Safe to call multiple times — returns early if order is
 * already cancelled or not in HOLD_PENDING/on_hold status.
 */
export async function handleHoldTimeout(
  checkpointId: string,
  orderId: string
): Promise<HoldTimeoutResult> {
  const supabase = getServiceSupabase();

  // HOLD-ST-004: Idempotency guard FIRST
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, hold_reason, amount_paid_cents, total_price, stripe_payment_intent_id, current_phase')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    logger.error('Order not found during HOLD timeout', { orderId, error: orderError?.message });
    return { skipped: true, reason: 'order_not_found' };
  }

  const statusLower = order.status?.toLowerCase();
  if (statusLower === 'cancelled' || order.status === 'CANCELLED_SYSTEM') {
    return { skipped: true, reason: 'already_cancelled' };
  }

  // Accept both 'on_hold' and 'hold_pending' — check both cases (SP12-07 FIX compatibility)
  if (statusLower !== 'on_hold' && statusLower !== 'hold_pending') {
    return { skipped: true, reason: `unexpected_status_${order.status}` };
  }

  // Update checkpoint status to EXPIRED
  if (checkpointId) {
    await supabase
      .from('checkpoint_events')
      .update({ event_type: 'HOLD_EXPIRED' })
      .eq('id', checkpointId);
  }

  // HOLD-ST-002: Use canonical refund calculator
  // Use amount_paid_cents if available, fall back to total_price * 100
  const amountPaidCents = order.amount_paid_cents ?? Math.round((order.total_price ?? 0) * 100);
  const refund = calculateRefundAmount(
    amountPaidCents,
    order.status as 'on_hold',
    order.current_phase ?? 'III',
    'HOLD_CANCEL'
  );

  // HOLD-ST-006: Clear resume_phase on cancel + update order status
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancel_reason: 'hold_timeout',
      resume_phase: null,
      hold_reason: order.hold_reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    logger.error('Failed to update order status during HOLD timeout', { orderId, error: updateError.message });
  }

  // Also update workflow status
  await supabase
    .from('order_workflows')
    .update({
      status: 'cancelled',
      checkpoint_pending: null,
      completed_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .eq('status', 'on_hold');

  // HOLD-ST-005: $0 guard — skip Stripe call if nothing to refund
  if (refund.refundAmountCents > 0 && order.stripe_payment_intent_id && !refund.skipStripeCall) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey && !stripeSecretKey.includes('xxxxx')) {
        const stripe = new Stripe(stripeSecretKey, {
          apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
        });

        await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          amount: refund.refundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            order_id: orderId,
            reason: 'hold_timeout',
            hold_reason: order.hold_reason ?? 'evidence_gap',
          },
        });

        await supabase
          .from('orders')
          .update({ stripe_payment_status: 'refunded' })
          .eq('id', orderId);
      }
    } catch (err) {
      logger.error('Stripe refund failed on HOLD timeout', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
        amountCents: refund.refundAmountCents,
      });

      await supabase
        .from('orders')
        .update({ stripe_payment_status: 'refund_failed' })
        .eq('id', orderId);
    }
  } else if (refund.refundAmountCents === 0) {
    await supabase
      .from('orders')
      .update({ stripe_payment_status: 'not_applicable' })
      .eq('id', orderId);
  }

  // Emit resolution event
  await inngest.send({
    name: 'checkpoint/hold.resolved',
    data: {
      orderId,
      checkpointId,
      action: 'CANCELLED',
      holdReason: order.hold_reason ?? 'evidence_gap',
    },
  });

  // Log to automation_logs
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'hold_timeout_processed',
    action_details: {
      checkpointId,
      refundAmountCents: refund.refundAmountCents,
      holdReason: order.hold_reason,
      refundReason: refund.reason,
    },
  });

  logger.info('HOLD timeout processed', {
    orderId,
    refundAmountCents: refund.refundAmountCents,
    holdReason: order.hold_reason,
  });

  return { refundAmountCents: refund.refundAmountCents };
}
