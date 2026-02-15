import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/orders/[id]/cancel
 *
 * Cancel an order. Refund amount depends on current status:
 *   - PAID / submitted: 100% refund
 *   - HOLD_PENDING / on_hold: 100% refund
 *   - AWAITING_APPROVAL / draft_delivered / pending_review: 50% refund
 *
 * Auth: Must be the order owner.
 * Body: { status_version: number, reason?: string }
 *
 * NOTE: This endpoint does NOT call Stripe. It records refund fields
 * so a background job or admin action can process the actual refund.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    let body: { status_version?: unknown; reason?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate status_version
    const statusVersion =
      typeof body.status_version === 'number' ? body.status_version : undefined;
    if (statusVersion === undefined) {
      return NextResponse.json(
        { error: 'status_version is required' },
        { status: 400 }
      );
    }

    const cancelReason =
      typeof body.reason === 'string' ? body.reason.trim() : '';

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, client_id, status, order_number, amount_paid, total_price, status_version'
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify ownership
    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Determine cancellation eligibility and refund percentage
    const fullRefundStatuses = [
      'PAID',
      'submitted',
      'HOLD_PENDING',
      'on_hold',
    ];
    const halfRefundStatuses = [
      'AWAITING_APPROVAL',
      'draft_delivered',
      'pending_review',
    ];
    const allCancellableStatuses = [
      ...fullRefundStatuses,
      ...halfRefundStatuses,
    ];

    if (!allCancellableStatuses.includes(order.status)) {
      return NextResponse.json(
        {
          error: `This order cannot be cancelled in its current status: ${order.status}`,
        },
        { status: 400 }
      );
    }

    // Optimistic concurrency check
    const currentVersion = order.status_version ?? 0;
    if (statusVersion !== currentVersion) {
      return NextResponse.json(
        {
          error:
            'Version conflict. The order has been modified by another request.',
          current_version: currentVersion,
        },
        { status: 409 }
      );
    }

    // Calculate refund (amount_paid is in cents from Stripe, total_price is in dollars)
    const orderAmountCents = order.amount_paid || Math.round((order.total_price || 0) * 100);
    const refundPercentage = fullRefundStatuses.includes(order.status)
      ? 1.0
      : 0.5;
    const refundAmount = Math.round(orderAmountCents * refundPercentage);

    const now = new Date().toISOString();

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: cancelReason || null,
        refund_amount: refundAmount,
        refund_status: 'pending',
        cancelled_at: now,
        status_version: currentVersion + 1,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('status_version', currentVersion)
      .select('id')
      .single();

    if (updateError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            'Failed to cancel order. It may have been modified concurrently.',
        },
        { status: 409 }
      );
    }

    // Log to automation_logs
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'order_cancelled',
      action_details: {
        cancelledBy: user.id,
        previousStatus: order.status,
        refundAmount,
        refundPercentage: refundPercentage * 100,
        reason: cancelReason || null,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      refund_amount: refundAmount,
      refund_percentage: refundPercentage * 100,
      refund_status: 'pending',
      status_version: currentVersion + 1,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
