// /lib/services/stripe.ts
// Stripe service utilities for Motion Granted
// VERSION: 1.0 — January 28, 2026

import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Only initialize Stripe if key is available and valid
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2026-01-28.clover',
    })
  : null;

/**
 * Ensures a Stripe customer exists for the user
 * Creates one if it doesn't exist
 */
export async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const supabase = await createClient();

  // Check if user already has Stripe customer ID
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[Stripe] Error fetching profile:', error);
    throw new Error('Failed to fetch user profile');
  }

  // Return existing customer ID if present
  if (profile?.stripe_customer_id) {
    try {
      await stripe.customers.retrieve(profile.stripe_customer_id);
      return profile.stripe_customer_id;
    } catch (e) {
      console.warn('[Stripe] Customer not found in Stripe, creating new one');
    }
  }

  // Create new Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email,
    metadata: {
      supabase_user_id: userId,
      created_by: 'motion_granted_api',
    },
  });

  // Update profile with new customer ID
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: stripeCustomer.id })
    .eq('id', userId);

  if (updateError) {
    console.error('[Stripe] Error updating profile with customer ID:', updateError);
  }

  console.log(`[Stripe] Created new customer ${stripeCustomer.id} for user ${userId}`);
  return stripeCustomer.id;
}

/**
 * Get or create a Stripe customer for a user
 * Wrapper that handles common error cases
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    const customerId = await ensureStripeCustomer(userId, email);
    return { success: true, customerId };
  } catch (error) {
    console.error('[Stripe] getOrCreateStripeCustomer error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Stripe customer',
    };
  }
}

/**
 * Create a checkout session for an order
 */
export async function createCheckoutSession(
  orderId: string,
  customerId: string,
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  metadata: Record<string, string> = {}
): Promise<{ success: boolean; sessionId?: string; url?: string; error?: string }> {
  if (!stripe) {
    return { success: false, error: 'Stripe is not configured' };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${orderId}/payment`,
      metadata: {
        order_id: orderId,
        ...metadata,
      },
    });

    return {
      success: true,
      sessionId: session.id,
      url: session.url || undefined,
    };
  } catch (error) {
    console.error('[Stripe] createCheckoutSession error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    };
  }
}

/**
 * Create a payment intent directly
 */
export async function createPaymentIntent(
  amount: number,
  customerId: string,
  metadata: Record<string, string> = {}
): Promise<{ success: boolean; clientSecret?: string; paymentIntentId?: string; error?: string }> {
  if (!stripe) {
    return { success: false, error: 'Stripe is not configured' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret || undefined,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('[Stripe] createPaymentIntent error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent',
    };
  }
}

/**
 * Refund a payment
 */
export async function refundPayment(
  paymentIntentId: string,
  amount?: number,
  reason?: Stripe.RefundCreateParams.Reason
): Promise<{ success: boolean; refundId?: string; error?: string }> {
  if (!stripe) {
    return { success: false, error: 'Stripe is not configured' };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount,
      reason,
    });

    return {
      success: true,
      refundId: refund.id,
    };
  } catch (error) {
    console.error('[Stripe] refundPayment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund',
    };
  }
}
