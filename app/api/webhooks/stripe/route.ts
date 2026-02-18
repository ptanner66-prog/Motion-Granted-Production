import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import {
  queueOrderNotification,
  scheduleTask,
} from '@/lib/automation';
import { processRevisionPayment } from '@/lib/workflow/checkpoint-service';
import { inngest, calculatePriority } from '@/lib/inngest/client';
import { logWebhookFailure } from '@/lib/services/webhook-logger';
import { populateOrderFromCheckoutMetadata } from '@/lib/payments/order-creation';
import { validateCheckoutMetadata } from '@/lib/payments/checkout-validation';
import { createOrderFromCheckout, processUpgradePayment } from '@/lib/payments/order-creation-v2';
import {
  handleDisputeCreated,
  handleDisputeUpdated,
  handleDisputeClosed,
} from '@/lib/payments/dispute-handler';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Only initialize Stripe if keys are available and valid
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2026-01-28.clover',
    })
  : null;

// Track invalid webhook attempts for security monitoring
const INVALID_ATTEMPT_THRESHOLD = 5; // Alert after 5 invalid attempts in 1 hour

/**
 * Log invalid webhook attempts for security monitoring
 * Alerts if threshold exceeded (potential attack)
 */
async function logInvalidWebhookAttempt(
  req: Request,
  reason: 'missing_signature' | 'invalid_signature',
  signature: string | null
): Promise<void> {
  try {
    const supabase = await createClient();
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     req.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Log the invalid attempt
    await supabase.from('automation_logs').insert({
      action_type: 'webhook_invalid_attempt',
      action_details: {
        source: 'stripe',
        reason,
        clientIP,
        userAgent,
        signaturePrefix: signature ? signature.substring(0, 20) + '...' : null,
        timestamp: new Date().toISOString(),
      },
    });

    // Check for repeated invalid attempts (potential attack)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('automation_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action_type', 'webhook_invalid_attempt')
      .gte('created_at', oneHourAgo);

    if (count && count >= INVALID_ATTEMPT_THRESHOLD) {
      console.error(`[SECURITY ALERT] ${count} invalid Stripe webhook attempts in the last hour from IP: ${clientIP}`);

      // Log the security alert
      await supabase.from('automation_logs').insert({
        action_type: 'security_alert',
        action_details: {
          alertType: 'webhook_attack_suspected',
          source: 'stripe',
          invalidAttempts: count,
          timeWindow: '1 hour',
          clientIP,
          timestamp: new Date().toISOString(),
        },
      });

      // Send security alert to admin
      try {
        const { sendAlertEmail } = await import('@/lib/monitoring/alert-sender');
        const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'admin@motiongranted.com';
        await sendAlertEmail({
          to: adminEmail,
          subject: `[SECURITY] Suspected Stripe webhook attack — ${count} invalid attempts`,
          level: 'FATAL',
          category: 'SYSTEM_ERROR',
          message: `${count} invalid Stripe webhook attempts detected in the last hour. Possible webhook replay/tampering attack.`,
          metadata: {
            invalidAttempts: count,
            timeWindow: '1 hour',
            clientIP,
            source: 'stripe',
          },
        });
      } catch (alertError) {
        console.error('[Stripe Webhook] Failed to send security alert:', alertError);
      }
    }
  } catch (error) {
    console.error('[Stripe Webhook] Failed to log invalid attempt:', error);
    // Don't throw - logging failure shouldn't affect response
  }
}

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
    // Log missing signature attempt
    await logInvalidWebhookAttempt(req, 'missing_signature', null);
    // Also log to webhook_failures table for Task 13 tracking
    await logWebhookFailure({
      failure_type: 'MISSING_SIGNATURE',
      details: 'No stripe-signature header present in webhook request',
    });
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    // Log invalid signature attempt and check for potential attack
    await logInvalidWebhookAttempt(req, 'invalid_signature', signature);
    // Also log to webhook_failures table for Task 13 tracking
    await logWebhookFailure({
      failure_type: 'INVALID_SIGNATURE',
      error_message: err instanceof Error ? err.message : String(err),
      details: 'Stripe signature verification failed',
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createClient();

  // SECURITY FIX: Use database-level upsert for idempotency to prevent race conditions
  // If two identical webhooks arrive simultaneously, only one will be processed
  const { data: webhookEvent, error: insertError } = await supabase
    .from('webhook_events')
    .upsert({
      event_id: event.id,
      event_type: event.type,
      source: 'stripe',
      // Only store necessary fields to avoid PII in database
      payload: {
        id: (event.data.object as unknown as Record<string, unknown>).id,
        amount: (event.data.object as unknown as Record<string, unknown>).amount,
        status: (event.data.object as unknown as Record<string, unknown>).status,
        currency: (event.data.object as unknown as Record<string, unknown>).currency,
      } as Record<string, unknown>,
    }, {
      onConflict: 'event_id',
      ignoreDuplicates: true,
    })
    .select('id, processed')
    .single();

  // Check if already processed
  if (webhookEvent?.processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // If insert failed due to constraint, it's a duplicate
  if (insertError && insertError.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // AF-2: Staleness detection — reject events older than 72 hours
  const eventAgeSeconds = Math.floor(Date.now() / 1000) - event.created;
  if (event.created && eventAgeSeconds > 259200) {
    console.warn(`[WEBHOOK] Stale event detected: ${event.id}, type: ${event.type}, age: ${eventAgeSeconds}s`);
    // Return 200 — do not trigger Stripe retry for stale events
    return NextResponse.json({ received: true, stale: true });
  }

  // NULL CHECK 2: Event data object
  if (!event.data?.object) {
    console.error('[Stripe Webhook] Missing event.data.object');
    await logWebhookFailure({
      failure_type: 'MISSING_DATA',
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      details: 'Event received but event.data.object is missing',
    });
    return NextResponse.json({ error: 'Invalid event structure' }, { status: 400 });
  }

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

      // SP-11 AE-3: Dispute lifecycle handlers
      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      case 'charge.dispute.updated':
        await handleDisputeUpdated(event.data.object as Stripe.Dispute);
        break;

      case 'charge.dispute.closed':
        await handleDisputeClosed(event.data.object as Stripe.Dispute);
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

    // Log to webhook_failures table for Task 13 tracking
    await logWebhookFailure({
      failure_type: 'HANDLER_ERROR',
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      error_message: error instanceof Error ? error.message : String(error),
      details: `Error occurred while processing ${event.type} event`,
    });

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
  let orderId = paymentIntent.metadata?.order_id;

  // PRIMARY: Look up order by stripe_payment_intent_id (reliable — set at order creation)
  // FALLBACK: Use metadata order_id only as secondary confirmation
  const { data: existingOrder, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_number, client_id, total_price, status, stripe_payment_status')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .single();

  if (fetchError || !existingOrder) {
    console.error(`[Stripe Webhook] No order found for PaymentIntent ${paymentIntent.id}`);
    await logWebhookFailure({
      failure_type: 'MISSING_ORDER_ID',
      stripe_event_id: paymentIntent.id,
      stripe_event_type: 'payment_intent.succeeded',
      details: `Payment succeeded but no order found for PaymentIntent ${paymentIntent.id}`,
    });
    return;
  }

  // Use the DB-resolved order ID as the canonical source
  orderId = existingOrder.id;

  if (fetchError || !existingOrder) {
    console.warn('[Stripe Webhook] Order not found for payment intent:', paymentIntent.id);
    return;
  }

  // CRITICAL SECURITY: Verify payment amount matches order total exactly
  // Rejects both underpayment (fraud) and overpayment (customer error)
  const expectedAmount = Math.round(existingOrder.total_price * 100);
  if (paymentIntent.amount !== expectedAmount) {
    const isUnderpayment = paymentIntent.amount < expectedAmount;
    console.error(`[Stripe Webhook] SECURITY ALERT: Payment amount mismatch! Expected: ${expectedAmount}, Received: ${paymentIntent.amount}, Order: ${orderId}`);
    // Log the security alert
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'payment_failed',
      action_details: {
        paymentIntentId: paymentIntent.id,
        error: isUnderpayment
          ? 'Underpayment - potential fraud attempt'
          : 'Overpayment - amount exceeds expected total',
        expectedAmount: expectedAmount / 100,
        receivedAmount: paymentIntent.amount / 100,
      },
    });
    throw new Error(`Payment amount mismatch: expected ${expectedAmount}, received ${paymentIntent.amount}`);
  }

  // SECURITY: Validate order is in correct state for payment
  const validStatesForPayment = ['submitted', 'pending'];
  if (existingOrder.stripe_payment_status === 'succeeded') {
    console.warn('[Stripe Webhook] Order already paid, skipping:', orderId);
    return;
  }

  // Update order status and payment info (atomic: only if still pending)
  const { data: order, error: updateError } = await supabase
    .from('orders')
    .update({
      stripe_payment_status: 'succeeded',
      status: 'UNDER_REVIEW',
    })
    .eq('id', orderId)
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .neq('stripe_payment_status', 'succeeded')
    .select('id, order_number, client_id, filing_deadline')
    .single();

  if (updateError) {
    console.error('[Stripe Webhook] Failed to update order:', updateError);
    await logWebhookFailure({
      failure_type: 'DB_UPDATE_FAILED',
      stripe_event_id: paymentIntent.id,
      stripe_event_type: 'payment_intent.succeeded',
      order_id: orderId,
      error_message: updateError.message,
      details: 'Failed to update order status after successful payment',
    });
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

  // Send order confirmation email directly via email triggers
  try {
    const { sendOrderConfirmation } = await import('@/lib/email/email-triggers');
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', existingOrder.client_id)
      .single();

    if (profile?.email) {
      await sendOrderConfirmation({
        orderId,
        orderNumber: order.order_number,
        customerEmail: profile.email,
        tier: existingOrder.tier || undefined,
        totalPrice: existingOrder.total_price,
      });
    }
  } catch (emailError) {
    console.error('[Stripe Webhook] Order confirmation email failed (non-blocking):', emailError);
  }

  // Schedule conflict check (runs immediately with priority)
  await scheduleTask('conflict_check', {
    orderId,
    priority: 8,
    payload: { triggeredBy: 'payment_success' },
  });

  // Auto-generation defaults to enabled. Set ENABLE_AUTO_GENERATION=false to disable.
  const autoGenerationEnabled = process.env.ENABLE_AUTO_GENERATION !== 'false';
  if (!autoGenerationEnabled) {
    console.warn('[Stripe Webhook] Auto-generation is DISABLED via ENABLE_AUTO_GENERATION=false');
  }

  // Queue order for draft generation via Inngest
  if (autoGenerationEnabled) {
    try {
      await inngest.send({
        name: "order/submitted",
        data: {
          orderId,
          priority: order.filing_deadline
            ? calculatePriority(order.filing_deadline)
            : 5000,
          filingDeadline: order.filing_deadline || null,
        },
      });

      console.log(`[Stripe Webhook] Order ${order.order_number} queued for draft generation`);
    } catch (inngestError) {
      // CRITICAL: Inngest failed - queue to automation_tasks as fallback
      console.error(`[Stripe Webhook] Inngest send failed, using fallback queue:`, inngestError);

      await supabase.from('automation_tasks').insert({
        task_type: 'generate_draft',
        order_id: orderId,
        priority: 10,
        status: 'pending',
        payload: {
          source: 'webhook_fallback',
          filingDeadline: order.filing_deadline || null,
          error: inngestError instanceof Error ? inngestError.message : 'Inngest send failed',
        },
      });

      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'inngest_fallback',
        action_details: {
          error: inngestError instanceof Error ? inngestError.message : 'Unknown error',
          fallbackQueue: 'automation_tasks',
        },
      });
    }
  }

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

  // Also log to webhook_failures table for Task 13 tracking
  await logWebhookFailure({
    failure_type: 'PAYMENT_FAILED',
    stripe_event_id: paymentIntent.id,
    stripe_event_type: 'payment_intent.payment_failed',
    order_id: orderId,
    error_message: paymentIntent.last_payment_error?.message || 'Unknown payment error',
    details: `Payment failed with code: ${paymentIntent.last_payment_error?.code || 'unknown'}`,
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
        status: 'CANCELLED',
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
 * v6.3 + SP-10 AB-4: Handle checkout session completed
 *
 * Routes by session_type (D7-R5-005-WEBHOOK):
 * - 'initial' → createOrderFromCheckout()
 * - 'tier_upgrade' → processUpgradePayment()
 * - 'revision' (legacy: metadata.type === 'revision') → processRevisionPayment()
 */
async function handleCheckoutSessionCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: Stripe.Checkout.Session
) {
  // Legacy revision payment path (metadata.type === 'revision')
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

    const result = await processRevisionPayment(workflowId, revisionId, paymentIntentId);

    if (!result.success) {
      console.error('[Stripe Webhook] Failed to process revision payment:', result.error);
      throw new Error(result.error);
    }

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

  // NULL CHECK 5: Payment status — accept both 'paid' and 'no_payment_required' (100% coupon)
  const validPaymentStatuses = ['paid', 'no_payment_required'];
  if (!validPaymentStatuses.includes(session.payment_status)) {
    console.log(`[Stripe Webhook] Checkout session status '${session.payment_status}' not valid, skipping`);
    return;
  }

  if (session.payment_status === 'no_payment_required') {
    console.log(`[Stripe Webhook] Processing fully-discounted order (100% coupon applied)`);
  }

  // SP-10 AB-4: Validate metadata (D7-R5-004-VALID)
  const validation = validateCheckoutMetadata(session);
  if (!validation.valid) {
    console.error('[WEBHOOK] Invalid checkout metadata:', {
      sessionId: session.id,
      errors: validation.errors,
      format: validation.format,
    });

    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Invalid checkout metadata: ${validation.errors.join('; ')}`, 'error');
    } catch {
      // Sentry not available
    }

    // Log to payment_events
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await serviceSupabase.from('payment_events').insert({
      order_id: session.metadata?.orderId || session.metadata?.order_id || null,
      event_type: 'ORDER_CREATION_FAILED',
      metadata: {
        session_id: session.id,
        validation_errors: validation.errors,
        session_metadata: session.metadata,
      },
    });
    return; // 200 response — do not retry permanently broken payload
  }

  // SP-10 AB-4: Route by session_type (D7-R5-005)
  const sessionType = session.metadata?.session_type || 'initial';

  switch (sessionType) {
    case 'tier_upgrade':
      await processUpgradePayment(session);
      return;

    case 'initial':
    default: {
      // Fall through to v2 order creation, with legacy fallback
      const orderId = session.metadata?.orderId || session.metadata?.order_id;
      if (!orderId) {
        console.error('[WEBHOOK] No orderId in session metadata:', session.id);
        return;
      }

      // Try v2 createOrderFromCheckout first
      try {
        await createOrderFromCheckout(session);
      } catch (v2Error) {
        console.error('[WEBHOOK] v2 createOrderFromCheckout failed, using legacy path:', v2Error);

        // Legacy fallback path
        const { data: order, error: updateError } = await supabase
          .from('orders')
          .update({
            stripe_payment_status: 'succeeded',
            status: 'UNDER_REVIEW',
            amount_paid_cents: session.amount_total ?? 0,
          })
          .eq('id', orderId)
          .select('id, order_number, filing_deadline')
          .single();

        if (updateError) {
          console.error('[Stripe Webhook] Failed to update order from checkout:', updateError);
          return;
        }

        if (order) {
          if (session.metadata) {
            await populateOrderFromCheckoutMetadata(
              supabase,
              orderId,
              session.metadata as Record<string, string>,
            );
          }

          await queueOrderNotification(orderId, 'payment_received');
          await scheduleTask('conflict_check', {
            orderId,
            priority: 8,
            payload: { triggeredBy: 'checkout_success' },
          });

          const checkoutAutoGen = process.env.ENABLE_AUTO_GENERATION !== 'false';

          if (checkoutAutoGen) {
            try {
              await inngest.send({
                name: "order/submitted",
                data: {
                  orderId,
                  priority: calculatePriority(order?.filing_deadline || null),
                  filingDeadline: order?.filing_deadline || null,
                },
              });
              console.log(`[Stripe Webhook] Order ${order.order_number} queued for draft generation via checkout`);
            } catch (inngestError) {
              console.error(`[Stripe Webhook] Inngest send failed (checkout), using fallback:`, inngestError);
              await supabase.from('automation_tasks').insert({
                task_type: 'generate_draft',
                order_id: orderId,
                priority: 10,
                status: 'pending',
                payload: {
                  source: 'checkout_webhook_fallback',
                  filingDeadline: order?.filing_deadline || null,
                  error: inngestError instanceof Error ? inngestError.message : 'Inngest send failed',
                },
              });
            }
          }
        }
      }
      break;
    }
  }
}
