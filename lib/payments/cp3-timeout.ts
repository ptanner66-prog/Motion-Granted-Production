/**
 * CP3 Timeout Auto-Cancel
 *
 * Handles the 21-day CP3 timeout: auto-cancels the order
 * and issues a 50% refund via Stripe.
 *
 * Called from the CP3 timeout cascade in cp3-timeouts.ts
 * (Inngest context — uses service-role Supabase client).
 *
 * @module lib/payments/cp3-timeout
 */

import Stripe from 'stripe';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';
import { cancelCP3Timeouts } from '@/lib/workflow/cp3-timeouts';

const log = createLogger('payments-cp3-timeout');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion })
  : null;

/**
 * Execute 21-day CP3 timeout: cancel order + 50% refund.
 *
 * Uses service-role Supabase (safe for Inngest context).
 * Stripe refund is 50% per cancellation policy (work was attempted).
 */
export async function executeCP3Timeout(orderId: string): Promise<void> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  log.info('[CP3] 21d auto-cancel triggered', { orderId });

  // 1. Get order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, total_price, status, stripe_payment_intent_id, client_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    log.error('[CP3] Order not found', { orderId, error: orderError?.message });
    return;
  }

  // Guard: only act on orders still awaiting approval
  if (order.status !== 'AWAITING_APPROVAL' && order.status !== 'awaiting_approval') {
    log.info('[CP3] Order not in AWAITING_APPROVAL, skipping', { orderId, status: order.status });
    return;
  }

  // 2. Cancel remaining CP3 timeout reminders
  await cancelCP3Timeouts(supabase, orderId);

  // 3. Process 50% refund via Stripe
  let stripeRefundId: string | undefined;
  const refundAmountCents = Math.round(order.total_price * 100 * 0.5);

  if (stripe && order.stripe_payment_intent_id && refundAmountCents > 0) {
    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        amount: refundAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          order_id: orderId,
          order_number: order.order_number,
          reason: 'CP3_TIMEOUT_21D',
        },
      });
      stripeRefundId = stripeRefund.id;
      log.info('[CP3] Stripe refund processed', { orderId, stripeRefundId, amountCents: refundAmountCents });
    } catch (stripeError) {
      log.error('[CP3] Stripe refund failed', {
        orderId,
        error: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });
      // Record failure but still cancel the order
    }
  } else if (!stripe) {
    log.warn('[CP3] Stripe not configured, refund requires manual processing', { orderId });
  }

  // 4. Create refund record
  await supabase.from('refunds').insert({
    order_id: orderId,
    amount_cents: refundAmountCents,
    reason: 'AUTO_CANCEL',
    refund_type: 'PARTIAL',
    status: stripeRefundId ? 'completed' : 'pending',
    stripe_refund_id: stripeRefundId,
    notes: 'Automatic 50% refund: CP3 21-day timeout (no admin action)',
    processed_at: stripeRefundId ? now : null,
  });

  // 5. Update order status to CANCELLED
  await supabase
    .from('orders')
    .update({
      status: 'CANCELLED',
      stripe_payment_status: stripeRefundId ? 'partially_refunded' : order.status,
      cancelled_at: now,
      cancellation_reason: 'CP3_TIMEOUT_21D',
      updated_at: now,
    })
    .eq('id', orderId);

  // 6. Log to automation trail
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'cp3_timeout_cancel',
    action_details: {
      refundAmountCents,
      stripeRefundId,
      reason: 'CP3 21-day timeout — no admin action taken',
      refundPercentage: 50,
    },
    created_at: now,
  });

  // 7. Queue email notification to client
  await supabase.from('email_queue').insert({
    order_id: orderId,
    template: 'cp3-timeout-cancellation',
    data: {
      orderNumber: order.order_number,
      refundAmount: (refundAmountCents / 100).toFixed(2),
      reason: 'Your order was automatically cancelled after 21 days without admin review.',
    },
    status: 'pending',
    created_at: now,
  });

  // 8. Queue admin alert
  await supabase.from('email_queue').insert({
    order_id: orderId,
    template: 'cp3-timeout-admin-alert',
    data: {
      orderNumber: order.order_number,
      orderId,
      refundAmount: (refundAmountCents / 100).toFixed(2),
    },
    status: 'pending',
    created_at: now,
  });

  log.info('[CP3] 21d auto-cancel complete', {
    orderId,
    orderNumber: order.order_number,
    refundAmountCents,
    stripeRefundId,
  });
}
