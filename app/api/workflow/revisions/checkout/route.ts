/**
 * Revision Checkout API Endpoint
 *
 * v6.3: Creates Stripe checkout session for paid revisions.
 *
 * POST /api/workflow/revisions/checkout
 *   Body: { workflowId }
 *   Returns: { success, checkoutUrl }
 *
 * REVISION PRICING (SACRED NUMBERS):
 * - Tier A: $75
 * - Tier B: $125
 * - Tier C: $200
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

// Initialize Stripe only if configured
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    })
  : null;

/**
 * POST: Create Stripe checkout session for paid revision
 */
export async function POST(request: NextRequest) {
  // Check if Stripe is configured
  if (!stripe) {
    return NextResponse.json(
      { error: 'Payment processing is not configured' },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Parse request body
  let body: { workflowId: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { workflowId } = body;

  if (!workflowId) {
    return NextResponse.json(
      { error: 'workflowId is required' },
      { status: 400 }
    );
  }

  // Get workflow with order and motion type info
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select(`
      id,
      order_id,
      orders(id, order_number, case_caption, client_id),
      motion_types(name, tier, revision_price)
    `)
    .eq('id', workflowId)
    .single();

  if (wfError || !workflow) {
    return NextResponse.json(
      { error: 'Workflow not found' },
      { status: 404 }
    );
  }

  // Verify user owns this order
  const orders = workflow.orders as { id: string; order_number: string; case_caption: string; client_id: string };
  if (orders.client_id !== user.id) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  // Get pending revision
  const { data: revision, error: revError } = await supabase
    .from('workflow_revisions')
    .select('*')
    .eq('order_workflow_id', workflowId)
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (revError || !revision) {
    return NextResponse.json(
      { error: 'No pending revision found for this workflow' },
      { status: 400 }
    );
  }

  const motionType = workflow.motion_types as { name: string; tier: string; revision_price: number };

  try {
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Revision #${revision.revision_number} - ${motionType.name}`,
              description: `Order #${orders.order_number} - ${orders.case_caption || 'Motion'}`,
              metadata: {
                tier: motionType.tier,
                revision_number: revision.revision_number.toString(),
              },
            },
            unit_amount: Math.round(revision.charge_amount * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${orders.id}?revision=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders/${orders.id}?revision=cancelled`,
      metadata: {
        type: 'revision',
        workflow_id: workflowId,
        revision_id: revision.id,
        order_id: orders.id,
        order_number: orders.order_number,
        tier: motionType.tier,
      },
      customer_email: user.email || undefined,
    });

    // Update revision with checkout session ID
    await supabase
      .from('workflow_revisions')
      .update({
        stripe_checkout_session_id: session.id,
      })
      .eq('id', revision.id);

    console.log(`[REVISION CHECKOUT] Created session ${session.id} for workflow ${workflowId}, revision ${revision.id}, amount $${revision.charge_amount}`);

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: revision.charge_amount,
    });
  } catch (error) {
    console.error('[REVISION CHECKOUT] Stripe error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
