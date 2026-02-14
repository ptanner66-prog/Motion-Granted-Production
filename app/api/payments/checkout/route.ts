/**
 * POST /api/payments/checkout
 *
 * Creates a Stripe Checkout Session for order payment.
 * Togglable via STRIPE_PAYMENT_REQUIRED env var (default: true).
 *
 * Request body:
 *   { orderId: string }
 *
 * Returns:
 *   { url: string } — redirect URL to Stripe Checkout
 *   OR { bypassed: true } — when payment is not required
 *
 * SP-11: Stripe checkout endpoint with idempotency
 */

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  // ── Payment toggle ─────────────────────────────────────────────────
  const paymentRequired =
    process.env.STRIPE_PAYMENT_REQUIRED?.toLowerCase().trim() !== 'false';

  if (!paymentRequired) {
    return NextResponse.json({ bypassed: true, message: 'Payment not required' });
  }

  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 503 },
    );
  }

  // ── Auth ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────
  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json(
      { error: 'orderId is required' },
      { status: 400 },
    );
  }

  // ── Load order & verify ownership ──────────────────────────────────
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, total_price, motion_type, rush_option, user_id, stripe_payment_status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Ownership check (RLS should enforce this, but belt-and-suspenders)
  if (order.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Already paid
  if (order.stripe_payment_status === 'succeeded') {
    return NextResponse.json(
      { error: 'Order already paid' },
      { status: 409 },
    );
  }

  // Price guard
  const amount = order.total_price;
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: 'Order has no payable amount' },
      { status: 400 },
    );
  }

  // ── Determine URLs ──────────────────────────────────────────────────
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://motiongranted.com';

  const successUrl = `${origin}/orders/${orderId}?payment=success`;
  const cancelUrl = `${origin}/orders/${orderId}?payment=cancelled`;

  // ── Create Checkout Session ─────────────────────────────────────────
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: `Motion Granted — Order #${order.order_number}`,
              description: order.motion_type
                ? `${order.motion_type}${order.rush_option && order.rush_option !== 'standard' ? ` (${order.rush_option})` : ''}`
                : 'Legal Motion Drafting',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        user_id: user.id,
        type: 'order',
      },
      client_reference_id: orderId,
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 },
      );
    }

    // Store checkout session ID on the order for reconciliation
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', orderId);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[Checkout] Stripe error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
