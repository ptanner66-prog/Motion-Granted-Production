import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/notifications
 *
 * Fetch notifications for the authenticated user, derived from automation_logs
 * for orders they own.
 *
 * Query params:
 *   - unread=true: filter to unread notifications only (stub: returns all for now)
 *
 * Returns: { notifications: Array<{ id, message, created_at, read, type }> }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const _unreadOnly = searchParams.get('unread') === 'true';

    // Fetch the user's order IDs first
    const { data: userOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('client_id', user.id);

    if (ordersError) {
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    const orderIds = (userOrders ?? []).map(
      (o: { id: string }) => o.id
    );

    if (orderIds.length === 0) {
      return NextResponse.json(
        { notifications: [] },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    // Fetch automation logs for user's orders
    const { data: logs, error: logsError } = await supabase
      .from('automation_logs')
      .select('id, order_id, action_type, action_details, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })
      .limit(20);

    if (logsError) {
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Map action_type to human-readable messages and notification types
    const actionTypeMap: Record<string, { message: string; type: string }> = {
      order_cancelled: {
        message: 'Your order has been cancelled.',
        type: 'cancellation',
      },
      hold_response_submitted: {
        message: 'Your hold response has been submitted.',
        type: 'hold',
      },
      revision_requested: {
        message: 'A revision has been requested for your order.',
        type: 'revision',
      },
      revision_completed: {
        message: 'Your revision has been completed.',
        type: 'revision',
      },
      checkpoint_approved: {
        message: 'Your order has been approved and is moving forward.',
        type: 'approval',
      },
      checkpoint_changes_requested: {
        message: 'Changes have been requested for your order.',
        type: 'revision',
      },
      workflow_cancelled: {
        message: 'The workflow for your order has been cancelled.',
        type: 'cancellation',
      },
      draft_delivered: {
        message: 'Your draft is ready for review.',
        type: 'delivery',
      },
      order_completed: {
        message: 'Your order has been completed.',
        type: 'completion',
      },
    };

    const notifications = (logs ?? []).map(
      (log: {
        id: string;
        order_id: string;
        action_type: string;
        action_details: Record<string, unknown> | null;
        created_at: string;
      }) => {
        const mapped = actionTypeMap[log.action_type];
        return {
          id: log.id,
          order_id: log.order_id,
          message: mapped?.message ?? `Order update: ${log.action_type.replace(/_/g, ' ')}`,
          created_at: log.created_at,
          read: false, // Stub: no dedicated read tracking yet
          type: mapped?.type ?? 'info',
        };
      }
    );

    return NextResponse.json(
      { notifications },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
