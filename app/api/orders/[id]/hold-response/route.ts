import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/orders/[id]/hold-response
 *
 * Submit a response to a hold placed on an order (e.g., evidence gap hold at CP1).
 * Auth: Must be the order owner.
 * Body: { response: string, status_version: number }
 *
 * Transitions: HOLD_PENDING/on_hold -> IN_PROGRESS/in_progress
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
    let body: { response?: unknown; status_version?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate response
    const response =
      typeof body.response === 'string' ? body.response.trim() : '';
    if (response.length === 0) {
      return NextResponse.json(
        { error: 'A response is required.' },
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

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number, status_version')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify ownership
    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the order is on hold
    const holdStatuses = ['HOLD_PENDING', 'on_hold'];
    if (!holdStatuses.includes(order.status)) {
      return NextResponse.json(
        {
          error: `This order is not on hold. Current status: ${order.status}`,
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

    const now = new Date().toISOString();

    // Update order: move back to in_progress and store hold response
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        hold_response: response,
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
            'Failed to submit hold response. The order may have been modified concurrently.',
        },
        { status: 409 }
      );
    }

    // Log to automation_logs
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'hold_response_submitted',
      action_details: {
        respondedBy: user.id,
        previousStatus: order.status,
        response: response.substring(0, 500), // Truncate for log
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      status_version: currentVersion + 1,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
