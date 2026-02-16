/**
 * Order Cancel API
 *
 * POST /api/orders/[id]/cancel
 *
 * Cancel an order from three possible source statuses with DIFFERENT behavior:
 *   - AWAITING_APPROVAL: CP3 cancel — 50% refund, wake Fn2
 *   - PAID: Customer cancel pre-work — 100% refund, no event
 *   - IN_PROGRESS: Customer cancel mid-work — 50% refund, no event
 *
 * Uses refund lock to prevent double-refund race condition.
 * Three-gate auth: authenticate → verify ownership → validate status.
 *
 * SP-4 Task 2 (R4-06)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAndLoadOrder, validateOptimisticLock } from '@/lib/orders/status-guards';
import { updateOrderStatus } from '@/lib/orders/status-machine';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { cancelCP3Timeouts } from '@/lib/workflow/cp3-timeouts';
import { acquireRefundLock, releaseRefundLock } from '@/lib/payments/refund-lock';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { CP3_REFUND_PERCENTAGE } from '@/lib/workflow/checkpoint-types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  let body: { status_version?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const statusVersion = typeof body.status_version === 'number' ? body.status_version : undefined;
  if (statusVersion === undefined) {
    return NextResponse.json({ error: 'status_version is required' }, { status: 400 });
  }

  // Cancel allowed from three statuses (also legacy equivalents)
  const result = await authenticateAndLoadOrder(orderId, [
    'AWAITING_APPROVAL', 'PAID', 'IN_PROGRESS',
    // Legacy equivalents
    'draft_delivered', 'pending_review', 'submitted', 'in_progress',
    'HOLD_PENDING', 'on_hold',
  ]);
  if (result instanceof NextResponse) return result;
  const { order, userId } = result;

  // Optimistic lock
  const lockError = validateOptimisticLock(order, statusVersion);
  if (lockError) return lockError;

  const adminClient = getServiceSupabase();

  // Determine cancellation type and refund based on source status
  let cancellationType: string;
  let refundPercentage: number;
  let needsEventEmission = false;

  const awaitingStatuses = ['AWAITING_APPROVAL', 'draft_delivered', 'pending_review'];
  const fullRefundStatuses = ['PAID', 'submitted', 'HOLD_PENDING', 'on_hold'];

  if (awaitingStatuses.includes(order.status)) {
    cancellationType = 'CP3_CANCEL';
    refundPercentage = CP3_REFUND_PERCENTAGE; // 50%
    needsEventEmission = true; // Wake Fn2
  } else if (fullRefundStatuses.includes(order.status)) {
    cancellationType = 'CUSTOMER_CANCEL';
    refundPercentage = 100;
  } else {
    // IN_PROGRESS or in_progress
    cancellationType = 'CUSTOMER_CANCEL';
    refundPercentage = CP3_REFUND_PERCENTAGE; // 50%
  }

  // Acquire refund lock (prevents double-refund race)
  const lock = await acquireRefundLock(adminClient, orderId);
  if (!lock.acquired) {
    return NextResponse.json(
      { error: 'Cancellation already in progress', current_status: lock.currentStatus },
      { status: 409 }
    );
  }

  try {
    // Update status
    const statusResult = await updateOrderStatus(
      adminClient, orderId, 'CANCELLED', order.status_version,
      {
        cancellation_type: cancellationType,
        cancelled_at: new Date().toISOString(),
        cancel_reason: typeof body.reason === 'string' ? (body.reason as string).trim() : null,
        refund_status: 'pending',
      }
    );

    if (!statusResult.success) {
      return NextResponse.json({ error: statusResult.error }, { status: 409 });
    }

    // Cancel CP3 timeouts if applicable
    if (awaitingStatuses.includes(order.status)) {
      await cancelCP3Timeouts(adminClient, orderId);
    }

    // Log event (immutable audit)
    await logCheckpointEvent(adminClient, {
      orderId,
      eventType: 'ORDER_CANCELLED',
      actor: 'attorney',
      metadata: { cancellationType, refundPercentage, source: order.status },
    });

    // Emit event to wake Fn2 ONLY if cancelling from AWAITING_APPROVAL
    // Separate from DB ops per D5 W3-2 durability rule
    if (needsEventEmission) {
      await inngest.send({
        name: 'workflow/checkpoint-approved',
        data: {
          orderId,
          workflowId: order.workflow_id,
          action: 'CANCEL',
          approvedBy: userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      status: 'cancelled',
      cancellation_type: cancellationType,
      refund_percentage: refundPercentage,
      status_version: statusResult.statusVersion,
    });
  } finally {
    await releaseRefundLock(adminClient, orderId);
  }
}
