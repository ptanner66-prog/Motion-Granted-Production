import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  queueOrderNotification,
  scheduleTask,
} from '@/lib/automation';
import { processRevisionPayment } from '@/lib/workflow/checkpoint-service';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Only initialize Stripe if keys are available and valid
// Use the API version that matches the installed Stripe package
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      // @ts-expect-error - Using latest stable API version compatible with package
      apiVersion: '2024-12-18.acacia',
    })
  : null;

/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events for payment processing and automation triggers.
 * Events handled:
 * - payment_intent.succeeded: Update order, send confirmation, trigger conflict check
 * - payment_intent.payment_failed: Notify user, update order status
 * - charge.refunded: Update order status, send confirmation
 */
export async function POST(req: Request) {
  // Return early if Stripe is not configured
  if (!stripe || !webhookSecret || webhookSecret.includes('xxxxx')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createClient();

  // Check for duplicate webhook (idempotency)
  const { data: existingEvent } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', event.id)
    .single();

  if (existingEvent) {
    // Already processed this event
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Store the webhook event
  await supabase.from('webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    source: 'stripe',
    payload: event.data.object as unknown as Record<string, unknown>,
  });

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(supabase, event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(supabase, event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(supabase, event.data.object as Stripe.Charge);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(supabase, event.data.object as Stripe.PaymentIntent);
        break;

      // v6.3: Handle revision checkout session completion
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(supabase, event.data.object as Stripe.Checkout.Session);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('event_id', event.id);

  } catch (error) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, error);

    // Store error but don't fail the webhook
    await supabase
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('event_id', event.id);
  }

  return NextResponse.json({ received: true });
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata?.order_id;

  if (!orderId) {
    console.warn('[Stripe Webhook] No order_id in payment intent metadata');
    return;
  }

  // Update order status and payment info
  const { data: order, error: updateError } = await supabase
    .from('orders')
    .update({
      stripe_payment_status: 'succeeded',
      status: 'under_review',
    })
    .eq('id', orderId)
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .select('id, order_number, client_id')
    .single();

  if (updateError) {
    console.error('[Stripe Webhook] Failed to update order:', updateError);
    throw updateError;
  }

  if (!order) {
    console.warn('[Stripe Webhook] Order not found for payment intent:', paymentIntent.id);
    return;
  }

  // Log the payment processing
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'payment_processed',
    action_details: {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    },
    was_auto_approved: true,
  });

  // Queue payment confirmation notification
  await queueOrderNotification(orderId, 'payment_received');

  // Schedule conflict check (runs immediately with priority)
  await scheduleTask('conflict_check', {
    orderId,
    priority: 8,
    payload: { triggeredBy: 'payment_success' },
  });

  console.log(`[Stripe Webhook] Payment succeeded for order ${order.order_number}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata?.order_id;

  if (!orderId) {
    return;
  }

  // Update order payment status
  await supabase
    .from('orders')
    .update({
      stripe_payment_status: 'failed',
    })
    .eq('id', orderId)
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Log the failure
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'payment_failed',
    action_details: {
      paymentIntentId: paymentIntent.id,
      error: paymentIntent.last_payment_error?.message || 'Unknown error',
      errorCode: paymentIntent.last_payment_error?.code,
    },
  });

  // Queue payment failure notification
  await queueOrderNotification(orderId, 'payment_failed', {
    error: paymentIntent.last_payment_error?.message,
  });

  console.log(`[Stripe Webhook] Payment failed for order ${orderId}`);
}

/**
 * Handle refund
 */
async function handleChargeRefunded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  charge: Stripe.Charge
) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) {
    return;
  }

  // Find order by payment intent
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (!order) {
    console.warn('[Stripe Webhook] Order not found for refunded charge');
    return;
  }

  // Determine if full or partial refund
  const isFullRefund = charge.amount_refunded === charge.amount;

  // Update order status if full refund and not already completed
  if (isFullRefund && order.status !== 'completed') {
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        stripe_payment_status: 'refunded',
      })
      .eq('id', order.id);
  } else {
    await supabase
      .from('orders')
      .update({
        stripe_payment_status: 'partially_refunded',
      })
      .eq('id', order.id);
  }

  // Log the refund
  await supabase.from('automation_logs').insert({
    order_id: order.id,
    action_type: 'refund_processed',
    action_details: {
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded / 100,
      totalAmount: charge.amount / 100,
      isFullRefund,
      currency: charge.currency,
    },
  });

  console.log(`[Stripe Webhook] Refund processed for order ${order.order_number}`);
}

/**
 * Handle canceled payment
 */
async function handlePaymentCanceled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata?.order_id;

  if (!orderId) {
    return;
  }

  // Update order payment status
  await supabase
    .from('orders')
    .update({
      stripe_payment_status: 'canceled',
    })
    .eq('id', orderId)
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Log the cancellation
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'payment_failed',
    action_details: {
      paymentIntentId: paymentIntent.id,
      reason: 'Payment intent canceled',
    },
  });

  console.log(`[Stripe Webhook] Payment canceled for order ${orderId}`);
}

/**
 * v6.3: Handle checkout session completed (used for revision payments)
 */
async function handleCheckoutSessionCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: Stripe.Checkout.Session
) {
  // Check if this is a revision payment
  if (session.metadata?.type === 'revision') {
    const workflowId = session.metadata.workflow_id;
    const revisionId = session.metadata.revision_id;
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || '';

    if (!workflowId || !revisionId) {
      console.warn('[Stripe Webhook] Revision checkout missing workflow_id or revision_id');
      return;
    }

    // Process the revision payment
    const result = await processRevisionPayment(workflowId, revisionId, paymentIntentId);

    if (!result.success) {
      console.error('[Stripe Webhook] Failed to process revision payment:', result.error);
      throw new Error(result.error);
    }

    // Log the revision payment
    await supabase.from('automation_logs').insert({
      order_id: session.metadata.order_id || null,
      action_type: 'revision_payment_processed',
      action_details: {
        checkoutSessionId: session.id,
        paymentIntentId,
        workflowId,
        revisionId,
        amount: session.amount_total ? session.amount_total / 100 : 0,
        tier: session.metadata.tier,
      },
      was_auto_approved: true,
    });

    console.log(`[Stripe Webhook] Revision payment processed: workflow=${workflowId}, revision=${revisionId}`);
    return;
  }

  // Handle other checkout sessions (e.g., order payments)
  const orderId = session.metadata?.order_id;
  if (orderId) {
    // Similar to payment_intent.succeeded but for checkout sessions
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update({
        stripe_payment_status: 'succeeded',
        status: 'under_review',
      })
      .eq('id', orderId)
      .select('id, order_number')
      .single();

    if (updateError) {
      console.error('[Stripe Webhook] Failed to update order from checkout:', updateError);
      return;
    }

    if (order) {
      await queueOrderNotification(orderId, 'payment_received');
      await scheduleTask('conflict_check', {
        orderId,
        priority: 8,
        payload: { triggeredBy: 'checkout_success' },
      });
      console.log(`[Stripe Webhook] Checkout completed for order ${order.order_number}`);
    }
  }
}
