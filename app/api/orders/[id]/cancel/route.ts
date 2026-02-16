/**
 * CP3 Cancel Route — D6 C-008
 *
 * POST /api/orders/[id]/cancel
 *
 * Attorney-initiated cancellation at CP3 checkpoint.
 * Emits workflow/checkpoint-approved with action=CANCEL.
 * Fn2 handles 50% refund via Stripe + status transition.
 *
 * Also handles pre-CP3 cancellations (PAID, HOLD_PENDING) with
 * different refund logic (recorded for admin processing).
 *
 * D6 C-001: NO order_workflows table
 * D6 C-002: status_version optimistic lock
 * D6 C-003: workflowId from database only
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { CANONICAL_EVENTS } from '@/lib/workflow/checkpoint-types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  // Gate 1: Auth
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate 2: Parse
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

  // Gate 3: Ownership + status
  const serviceClient = getServiceSupabase();
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id, status, status_version, workflow_id, client_id, amount_paid, total_price, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (order.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Cancellable statuses
  const cancellableStatuses = [
    'PAID', 'submitted', 'HOLD_PENDING', 'on_hold',
    'AWAITING_APPROVAL', 'draft_delivered', 'pending_review',
  ];
  if (!cancellableStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: `Order cannot be cancelled in status: ${order.status}` },
      { status: 409 }
    );
  }

  // Optimistic lock
  if (order.status_version !== status_version) {
    return NextResponse.json({ error: 'Concurrent modification' }, { status: 409 });
  }

  // === CP3 PATH: AWAITING_APPROVAL — route through Fn2 ===
  if (order.status === 'AWAITING_APPROVAL') {
    try {
      await inngest.send({
        name: CANONICAL_EVENTS.WORKFLOW_CHECKPOINT_APPROVED,
        data: {
          orderId,
          workflowId: order.workflow_id, // FROM DATABASE
          action: 'CANCEL' as const,
          notes: reason ?? null,
          attorneyId: user.id,
        },
      });

      await logCheckpointEvent(serviceClient, {
        orderId,
        eventType: 'CP3_CANCEL_REQUESTED',
        actor: user.id,
        metadata: { reason: reason ?? null },
      });

      return NextResponse.json({
        success: true,
        message: 'Cancellation processing. A 50% refund will be issued.',
      });
    } catch (error) {
      console.error('[cancel] Failed:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  }

  // === PRE-CP3 PATH: Direct cancellation (PAID, HOLD_PENDING, etc.) ===
  try {
    const fullRefundStatuses = ['PAID', 'submitted', 'HOLD_PENDING', 'on_hold'];
    const orderAmountCents = order.amount_paid || Math.round((order.total_price || 0) * 100);
    const refundPercentage = fullRefundStatuses.includes(order.status) ? 1.0 : 0.5;
    const refundAmount = Math.round(orderAmountCents * refundPercentage);
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await serviceClient
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: reason ?? null,
        refund_amount: refundAmount,
        refund_status: 'pending',
        cancelled_at: now,
        status_version: (order.status_version ?? 0) + 1,
        updated_at: now,
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
        refundAmount,
        refundPercentage: refundPercentage * 100,
        reason: reason ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      refund_amount: refundAmount,
      refund_percentage: refundPercentage * 100,
      refund_status: 'pending',
      status_version: (order.status_version ?? 0) + 1,
    });
  } catch (err) {
    console.error('[cancel] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
