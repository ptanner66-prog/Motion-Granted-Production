import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/orders/stats
 *
 * Returns aggregated order counts for the authenticated user:
 *   - active: orders currently being worked on
 *   - pending_review: orders awaiting user action (approval, hold response)
 *   - completed: finished orders
 *
 * CANCELLED orders are excluded from all counts.
 */
export async function GET() {
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

    // Define status groups
    const activeStatuses = [
      'PAID',
      'PROCESSING',
      'REVISION_REQ',
      'SUBMITTED',
      'REVISION_REQUESTED',
      'ASSIGNED',
    ];

    const pendingReviewStatuses = [
      'AWAITING_APPROVAL',
      'HOLD_PENDING',
      'DRAFT_DELIVERED',
      'PENDING_REVIEW',
      'ON_HOLD',
    ];

    const completedStatuses = ['COMPLETED'];

    // Run all three counts in parallel
    const [activeResult, pendingResult, completedResult] = await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .in('status', activeStatuses),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .in('status', pendingReviewStatuses),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .in('status', completedStatuses),
    ]);

    return NextResponse.json(
      {
        active: activeResult.count ?? 0,
        pending_review: pendingResult.count ?? 0,
        completed: completedResult.count ?? 0,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
