/**
 * Order Creation v2 — Dual Spec Reconciliation (SP-10 AB-5)
 *
 * Source: D7-R5-011 | Priority: P2
 *
 * Handles order creation from Stripe checkout session completion.
 * Supports both 7-field (legacy) and 12-field metadata formats.
 * Sets amount_paid_cents from session.amount_total (BD-REFUND-BASIS).
 *
 * @module payments/order-creation-v2
 */

import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function createOrderFromCheckout(
  session: Stripe.Checkout.Session,
): Promise<{ orderId: string; status: string }> {
  const supabase = getServiceSupabase();

  const meta = session.metadata!;
  const orderId = meta.orderId || meta.order_id;

  if (!orderId) {
    throw new Error('[ORDER_CREATION_V2] No orderId in session metadata');
  }

  // Detect metadata format
  const is12Field = 'stateCode' in meta && meta.stateCode !== '';

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    stripe_payment_status: 'succeeded',
    stripe_checkout_session_id: session.id,
    status: 'PAID',
    status_version: 1, // Reset on payment
    amount_paid_cents: session.amount_total ?? 0,
    updated_at: new Date().toISOString(),
  };

  // $0 coupon orders
  if (session.payment_status === 'no_payment_required') {
    updatePayload.amount_paid_cents = 0;
    updatePayload.stripe_payment_status = 'no_payment_required';
  }

  // 12-field R1 columns
  if (is12Field) {
    updatePayload.state_code = meta.stateCode;
    updatePayload.court_type = meta.courtType || null;
    updatePayload.federal_district = meta.federalDistrict || null;
    updatePayload.pricing_multiplier_applied = parseFloat(meta.pricingMultiplier) || 1.0;
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select('id, status')
      .single();

    if (error) {
      // Check for unique constraint (duplicate webhook)
      if (error.code === '23505') {
        console.log(`[ORDER_CREATION_V2] Idempotent: order ${orderId} already processed`);
        return { orderId, status: 'paid' };
      }
      throw error; // Recoverable — webhook handler returns 500, Stripe retries
    }

    // Log payment event
    await supabase.from('payment_events').insert({
      order_id: orderId,
      event_type: 'CHARGE_COMPLETED',
      metadata: {
        session_id: session.id,
        amount_total: session.amount_total,
        session_type: meta.session_type || 'initial',
        metadata_format: is12Field ? '12-field' : '7-field',
        discount_amount: session.total_details?.amount_discount ?? 0,
        tax_amount: session.total_details?.amount_tax ?? 0,
      },
    });

    // Emit order/submitted Inngest event to start workflow
    try {
      const { inngest } = await import('@/lib/inngest/client');
      await inngest.send({
        name: 'order/submitted',
        data: {
          orderId,
          tier: meta.tier,
          motionType: meta.motionType || meta.motion_type || '',
        },
      });
    } catch (inngestError) {
      console.error('[ORDER_CREATION_V2] Inngest send failed (non-fatal):', inngestError);
    }

    return { orderId, status: data?.status || 'paid' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Unrecoverable: corrupted data
    if (errorMessage.includes('invalid input syntax') ||
        errorMessage.includes('violates check constraint')) {
      console.error('[ORDER_CREATION_V2] Unrecoverable error:', {
        orderId,
        sessionId: session.id,
        error: errorMessage,
      });

      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error);
      } catch {
        // Sentry not available
      }

      await supabase.from('payment_events').insert({
        order_id: orderId,
        event_type: 'ORDER_CREATION_FAILED',
        metadata: { session_id: session.id, error: errorMessage },
      });

      // Return without throwing — webhook returns 200 to stop retries
      return { orderId, status: 'failed' };
    }

    // Recoverable: DB timeout, connection issue — throw to trigger Stripe retry
    throw error;
  }
}

/**
 * Process a tier upgrade payment (session_type = 'tier_upgrade').
 *
 * On tier upgrade: amount_paid_cents += upgrade_session.amount_total (cumulative).
 */
export async function processUpgradePayment(
  session: Stripe.Checkout.Session,
): Promise<{ orderId: string; status: string }> {
  const supabase = getServiceSupabase();

  const meta = session.metadata!;
  const orderId = meta.orderId || meta.order_id;

  if (!orderId) {
    throw new Error('[UPGRADE_PAYMENT] No orderId in session metadata');
  }

  // Get current order
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('id, status, amount_paid_cents, tier, upgrade_to_tier')
    .eq('id', orderId)
    .single();

  if (!currentOrder) {
    throw new Error(`[UPGRADE_PAYMENT] Order not found: ${orderId}`);
  }

  // Cumulative: add upgrade amount to existing amount_paid_cents
  const priorAmount = currentOrder.amount_paid_cents ?? 0;
  const upgradeAmount = session.amount_total ?? 0;
  const newAmountPaidCents = priorAmount + upgradeAmount;

  const updatePayload: Record<string, unknown> = {
    amount_paid_cents: newAmountPaidCents,
    tier: currentOrder.upgrade_to_tier || meta.tier || currentOrder.tier,
    upgrade_resolved_at: new Date().toISOString(),
    status: 'PROCESSING', // Resume processing after upgrade
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);

  if (error) {
    throw error;
  }

  // Log payment event
  await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'UPGRADE_PAYMENT_COMPLETED',
    metadata: {
      session_id: session.id,
      upgrade_amount: upgradeAmount,
      prior_amount: priorAmount,
      new_total: newAmountPaidCents,
      from_tier: currentOrder.tier,
      to_tier: currentOrder.upgrade_to_tier || meta.tier,
      session_type: 'tier_upgrade',
    },
  });

  console.log(`[UPGRADE_PAYMENT] Processed for order ${orderId}: ${priorAmount} + ${upgradeAmount} = ${newAmountPaidCents}`);

  return { orderId, status: 'in_progress' };
}
