/**
 * Tier Upgrade Service (SP-C Task 26 + SP-11 AE-1)
 *
 * Source: D7-R5-005-UPGRADE | Priority: P1
 *
 * Generates Stripe upgrade invoices when order complexity exceeds
 * the originally paid tier. Uses async calculatePrice() with stateCode.
 *
 * SP-11 additions:
 * - processUpgradePayment(): Full upgrade payment processing with optimistic locking
 * - createUpgradeCheckoutSession(): Standalone D7-compliant upgrade session creation
 *
 * BINDING DECISIONS:
 * - BD-XD-004: allow_promotion_codes: false for upgrade sessions
 * - D7-R5-005-UPGRADE: amount_paid_cents += upgrade_session.amount_total (cumulative)
 *
 * @module payments/tier-upgrade
 */

import Stripe from 'stripe';
import { calculatePrice } from './price-calculator';
import type { RushType } from './price-calculator-core';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('payments-tier-upgrade');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    })
  : null;

// ============================================================
// TYPES
// ============================================================

export interface TierUpgradeRequest {
  orderId: string;
  originalMotionType: string;
  newMotionType: string;
  rushType: RushType;
  stateCode: string;
  reason: string;
}

export interface TierUpgradeResult {
  success: boolean;
  checkoutUrl?: string;
  amountDue?: number;
  originalAmount?: number;
  newAmount?: number;
  error?: string;
}

export interface UpgradePaymentResult {
  success: boolean;
  orderId: string;
  previousTier: string;
  newTier: string;
  previousAmountPaidCents: number;
  newAmountPaidCents: number;
  paymentEventId?: string;
}

// Flat pricing per Intake Supp R2
const TIER_PRICES: Record<string, number> = {
  A: 29900, B: 59900, C: 99900, D: 149900,
};

// ============================================================
// LEGACY: generateUpgradeInvoice (SP-C Task 26)
// ============================================================

/**
 * Generate a Stripe checkout session for a tier upgrade.
 *
 * Calculates the price difference between the original and new motion types,
 * and creates a checkout session for the difference amount.
 */
export async function generateUpgradeInvoice(
  request: TierUpgradeRequest,
): Promise<TierUpgradeResult> {
  const { orderId, originalMotionType, newMotionType, rushType, stateCode, reason } = request;

  try {
    // Calculate both prices using async calculator with DB multiplier
    const [originalPrice, newPrice] = await Promise.all([
      calculatePrice(originalMotionType, rushType, stateCode),
      calculatePrice(newMotionType, rushType, stateCode),
    ]);

    const amountDue = newPrice.subtotal - originalPrice.subtotal;

    if (amountDue <= 0) {
      return {
        success: true,
        amountDue: 0,
        originalAmount: originalPrice.subtotal,
        newAmount: newPrice.subtotal,
      };
    }

    // Get order details for Stripe metadata
    const supabase = await createClient();
    const { data: order } = await supabase
      .from('orders')
      .select('order_number, client_id')
      .eq('id', orderId)
      .single();

    // Create Stripe checkout session for the difference
    const session = await stripe!.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: false, // BD-XD-004
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountDue * 100, // Stripe uses cents
            product_data: {
              name: `Tier Upgrade: ${originalPrice.tier} → ${newPrice.tier}`,
              description: `Order ${order?.order_number || orderId}: ${reason}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        orderId,
        orderNumber: order?.order_number || '',
        upgradeType: 'tier_upgrade',
        originalTier: originalPrice.tier,
        newTier: newPrice.tier,
        stateCode,
        amountDue: String(amountDue),
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/orders/${orderId}?upgrade=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/orders/${orderId}?upgrade=cancelled`,
    });

    log.info(`Tier upgrade session created for order ${orderId}`, {
      originalTier: originalPrice.tier,
      newTier: newPrice.tier,
      amountDue,
      sessionId: session.id,
    });

    return {
      success: true,
      checkoutUrl: session.url || undefined,
      amountDue,
      originalAmount: originalPrice.subtotal,
      newAmount: newPrice.subtotal,
    };
  } catch (error) {
    log.error(`Tier upgrade failed for order ${orderId}`, {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upgrade failed',
    };
  }
}

// ============================================================
// SP-11 AE-1: processUpgradePayment (D7-R5-005-UPGRADE)
// ============================================================

/**
 * Process a completed tier upgrade payment from Stripe webhook.
 *
 * Key behaviors:
 * - Cumulative amount_paid_cents (D7-R5-005-UPGRADE)
 * - Optimistic locking via status_version
 * - Race condition handling (cancelled order, already upgraded)
 * - Emits order/upgrade-completed Inngest event to resume workflow
 */
export async function processUpgradePaymentFull(
  session: Stripe.Checkout.Session,
): Promise<UpgradePaymentResult> {
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const meta = session.metadata!;
  const orderId = meta.orderId || meta.order_id;

  if (!orderId) {
    throw new Error('[UPGRADE] No orderId in session metadata');
  }

  // Step 1: Load order with optimistic lock fields
  const { data: order, error: loadError } = await supabase
    .from('orders')
    .select('id, status, tier, total_price, amount_paid_cents, status_version, upgrade_to_tier, upgrade_from_tier')
    .eq('id', orderId)
    .single();

  if (loadError || !order) {
    throw new Error(`Order ${orderId} not found for upgrade payment`);
  }

  // Step 2: Verify UPGRADE_PENDING status
  if (order.status !== 'upgrade_pending') {
    // Race condition: order was cancelled while customer was on upgrade checkout
    if (order.status === 'cancelled') {
      console.error(`[UPGRADE] Payment received for cancelled order ${orderId}. Issuing refund.`);
      if (session.payment_intent) {
        await stripe!.refunds.create({
          payment_intent: session.payment_intent as string,
          amount: session.amount_total!,
        });
      }
      await supabase.from('payment_events').insert({
        order_id: orderId,
        event_type: 'UPGRADE_PAYMENT_AFTER_CANCEL',
        metadata: {
          session_id: session.id,
          refunded_amount: session.amount_total,
          reason: 'Order cancelled before upgrade payment processed',
        },
      });
      return {
        success: false,
        orderId,
        previousTier: order.tier,
        newTier: order.upgrade_to_tier || order.tier,
        previousAmountPaidCents: order.amount_paid_cents || 0,
        newAmountPaidCents: order.amount_paid_cents || 0,
      };
    }

    // Already upgraded (admin manual or duplicate webhook)
    if (order.tier === order.upgrade_to_tier) {
      console.warn(`[UPGRADE] Order ${orderId} already at target tier. Refunding differential.`);
      if (session.payment_intent) {
        await stripe!.refunds.create({
          payment_intent: session.payment_intent as string,
          amount: session.amount_total!,
        });
      }
      return {
        success: false,
        orderId,
        previousTier: order.tier,
        newTier: order.tier,
        previousAmountPaidCents: order.amount_paid_cents || 0,
        newAmountPaidCents: order.amount_paid_cents || 0,
      };
    }

    // Accept payment but flag for admin review — money taken, must deliver
    console.error(`[UPGRADE] Order ${orderId} in unexpected status ${order.status} for upgrade`);
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Upgrade payment for order ${orderId} in status ${order.status}`, 'error');
    } catch {
      // Sentry not available
    }
  }

  // Step 3: Calculate new values (CUMULATIVE per D7-R5-005-UPGRADE)
  const previousTier = order.upgrade_from_tier || order.tier;
  const newTier = order.upgrade_to_tier || meta.tier || order.tier;
  const previousAmountPaid = order.amount_paid_cents || 0;
  const upgradeDifferential = session.amount_total || 0;
  const newAmountPaid = previousAmountPaid + upgradeDifferential;

  // Step 4: Update order (optimistic lock via status_version)
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({
      tier: newTier,
      total_price: TIER_PRICES[newTier] || order.total_price,
      status: 'in_progress',
      amount_paid_cents: newAmountPaid,
      upgrade_resolved_at: new Date().toISOString(),
      status_version: (order.status_version || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status_version', order.status_version || 1)
    .select('id')
    .single();

  if (updateError || !updated) {
    // Retry once with fresh version
    const { data: refreshed } = await supabase
      .from('orders')
      .select('status_version')
      .eq('id', orderId)
      .single();

    if (refreshed) {
      const { error: retryError } = await supabase
        .from('orders')
        .update({
          tier: newTier,
          total_price: TIER_PRICES[newTier] || order.total_price,
          status: 'in_progress',
          amount_paid_cents: newAmountPaid,
          upgrade_resolved_at: new Date().toISOString(),
          status_version: (refreshed.status_version || 1) + 1,
        })
        .eq('id', orderId)
        .eq('status_version', refreshed.status_version || 1);

      if (retryError) {
        try {
          const Sentry = await import('@sentry/nextjs');
          Sentry.captureMessage(`Upgrade lock failure for order ${orderId} after retry`, 'error');
        } catch {
          // Sentry not available
        }
        throw retryError;
      }
    }
  }

  // Step 5: Log payment event
  const { data: eventData } = await supabase.from('payment_events').insert({
    order_id: orderId,
    event_type: 'UPGRADE_PAYMENT_COMPLETED',
    metadata: {
      session_id: session.id,
      previous_tier: previousTier,
      new_tier: newTier,
      differential_cents: upgradeDifferential,
      previous_amount_paid: previousAmountPaid,
      new_amount_paid: newAmountPaid,
    },
  }).select('id').single();

  // Step 6: Resume workflow via Inngest
  try {
    const { inngest } = await import('@/lib/inngest/client');
    await inngest.send({
      name: 'order/upgrade-completed',
      data: {
        orderId,
        previousTier,
        newTier,
        differentialCents: upgradeDifferential,
      },
    });
  } catch (inngestErr) {
    console.error('[UPGRADE] Inngest order/upgrade-completed send failed:', inngestErr);
  }

  return {
    success: true,
    orderId,
    previousTier,
    newTier,
    previousAmountPaidCents: previousAmountPaid,
    newAmountPaidCents: newAmountPaid,
    paymentEventId: eventData?.id,
  };
}

// ============================================================
// SP-11 AE-1: createUpgradeCheckoutSession (D7-R5-005-META)
// ============================================================

/**
 * Create a Stripe checkout session for a tier upgrade with D7 12-field metadata.
 *
 * BD-XD-004: allow_promotion_codes: false on upgrade sessions.
 */
export async function createUpgradeCheckoutSession(
  orderId: string,
  currentTier: string,
  newTier: string,
  differentialCents: number,
  orderNumber: string,
  clientId: string,
  stateCode: string,
): Promise<{ url: string }> {
  const session = await stripe!.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Tier Upgrade: ${currentTier} → ${newTier}`,
            description: `Order #${orderNumber} — Tier upgrade differential`,
          },
          unit_amount: differentialCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orderId,
      motionType: '', // Not changing
      tier: newTier,
      jurisdiction: stateCode,
      rushType: 'STANDARD',
      motionPath: 'A',
      stateCode,
      courtType: '',
      federalDistrict: '',
      pricingMultiplier: '1.0',
      clientId,
      orderNumber,
      session_type: 'tier_upgrade', // D7-R5-005-META
    },
    allow_promotion_codes: false, // BD-XD-004: promos on initial only
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/orders/${orderId}?upgrade=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/orders/${orderId}?upgrade=cancelled`,
  });

  return { url: session.url! };
}
