// app/api/orders/[id]/cancel/route.ts
// D6 Directive 1 v2 — COMPLETE REWRITE (SP-8)
// Resolves: C-004 (correct refund logic), C-008 (separate route)
// Refund: 50% of amount_paid_cents for AWAITING_APPROVAL (BD-REFUND-BASIS)
// Dual-path: CP3 (AWAITING_APPROVAL) routes through Fn2, pre-CP3 direct.

import { NextRequest, NextResponse } from 'next/server';
import { authenticateCP3Request } from '@/lib/api/cp3-auth';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { CANONICAL_EVENTS, CP3_REFUND_PERCENTAGE } from '@/lib/workflow/checkpoint-types';
import { checkRateLimit } from '@/lib/security/rate-limiter';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  // Try to parse body first (needed for both paths)
  let body: { status_version?: number; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status_version, reason } = body;
  if (typeof status_version !== 'number') {
    return NextResponse.json({ error: 'status_version required' }, { status: 400 });
  }

  // Authenticate user
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // CP3 rate limit: 5 decisions per minute per user
  const rl = await checkRateLimit(user.id, 'cp3');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rl.reset },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Fetch order with service client
  const serviceClient = getServiceSupabase();
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id, status, status_version, workflow_id, client_id, tier, amount_paid_cents, current_phase, attorney_email, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Optimistic lock
  if (order.status_version !== status_version) {
    return NextResponse.json({ error: 'Concurrent modification' }, { status: 409 });
  }

  // === CP3 PATH: AWAITING_APPROVAL — route through Fn2 ===
  if (order.status === 'AWAITING_APPROVAL') {
    // Binding R2v2: AWAITING_APPROVAL = 50% refund of amount_paid_cents
    const refundAmountCents = Math.round((order.amount_paid_cents || 0) * (CP3_REFUND_PERCENTAGE / 100));

    // Atomic status transition: AWAITING_APPROVAL → CANCELLED (DB flat)
    const { data: updated, error: updateErr } = await serviceClient
      .from('orders')
      .update({
        status: 'CANCELLED', // DB stores flat CANCELLED (toDbStatus maps)
        status_version: order.status_version + 1,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? 'Attorney cancelled at CP3',
      })
      .eq('id', orderId)
      .eq('status', 'AWAITING_APPROVAL')
      .eq('status_version', status_version)
      .select()
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: 'Concurrent modification. Please refresh.' }, { status: 409 }
      );
    }

    // Audit trail on delivery_packages
    const { data: pkg } = await serviceClient
      .from('delivery_packages')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pkg) {
      await serviceClient.from('delivery_packages').update({
        cp3_decision: 'CANCELLED',
        cp3_decision_at: new Date().toISOString(),
        cp3_decided_by: user.id,
      }).eq('id', pkg.id);
    }

    // Emit event for Fn2 cleanup + refund processing
    await inngest.send({
      name: CANONICAL_EVENTS.WORKFLOW_CHECKPOINT_APPROVED,
      data: {
        orderId,
        workflowId: order.workflow_id,
        packageId: pkg?.id ?? null,
        tier: order.tier,
        attorneyEmail: order.attorney_email,
        action: 'CANCEL',
        refundAmountCents,
      },
    });

    return NextResponse.json({
      success: true,
      orderId,
      status: 'CANCELLED_USER', // TypeScript name for frontend
      refundAmountCents,
      refundPercentage: CP3_REFUND_PERCENTAGE,
    });
  }

  // === PRE-CP3 PATH: Direct cancellation (INTAKE, HOLD_PENDING, etc.) ===
  const cancellableStatuses = ['INTAKE', 'PROCESSING', 'HOLD_PENDING', 'UPGRADE_PENDING'];
  if (!cancellableStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `Order cannot be cancelled in status: ${order.status}` },
      { status: 409 }
    );
  }

  // Pre-CP3: full refund for orders not yet worked on
  const refundAmountCents = order.amount_paid_cents || 0;

  const { data: updated, error: updateError } = await serviceClient
    .from('orders')
    .update({
      status: 'CANCELLED',
      status_version: order.status_version + 1,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason ?? null,
      refund_amount: refundAmountCents,
      refund_status: 'pending',
    })
    .eq('id', orderId)
    .eq('status_version', order.status_version)
    .select('id')
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: 'Failed to cancel. Concurrent modification.' },
      { status: 409 }
    );
  }

  await serviceClient.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'order_cancelled',
    action_details: {
      cancelledBy: user.id,
      previousStatus: order.status,
      refundAmountCents,
      refundPercentage: 100,
      reason: reason ?? null,
    },
  });

  // P2-2: Process Stripe refund (pre-CP3 = 100% refund)
  if (refundAmountCents > 0 && order.stripe_payment_intent_id) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
      });

      await stripeClient.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
      });

      await serviceClient.from('orders').update({
        refund_status: 'completed',
        stripe_payment_status: 'refunded',
      }).eq('id', orderId);
    } catch (refundError) {
      // Non-fatal: refund failed but cancellation stands — admin can retry manually
      console.error(`[Cancel] Stripe refund failed for order ${orderId}:`, refundError);
      await serviceClient.from('orders').update({
        refund_status: 'failed',
      }).eq('id', orderId);
    }
  }

  return NextResponse.json({
    success: true,
    orderId,
    orderNumber: order.order_number,
    refundAmountCents,
    refundPercentage: 100,
    status_version: order.status_version + 1,
  });
}
