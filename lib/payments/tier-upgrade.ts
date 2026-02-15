/**
 * Tier Upgrade Service
 *
 * SP-C Task 26 (Step 9.5 / Gaps 40, 41)
 *
 * Generates Stripe upgrade invoices when order complexity exceeds
 * the originally paid tier. Uses async calculatePrice() with stateCode.
 *
 * BD-XD-004: allow_promotion_codes: false for upgrade sessions.
 *
 * @module payments/tier-upgrade
 */

import Stripe from 'stripe';
import { calculatePrice } from './price-calculator';
import type { RushType } from './price-calculator-core';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('payments-tier-upgrade');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

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

/**
 * Generate a Stripe checkout session for a tier upgrade.
 *
 * Calculates the price difference between the original and new motion types,
 * and creates a checkout session for the difference amount.
 */
export async function generateUpgradeInvoice(
  request: TierUpgradeRequest
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
    const session = await stripe.checkout.sessions.create({
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
