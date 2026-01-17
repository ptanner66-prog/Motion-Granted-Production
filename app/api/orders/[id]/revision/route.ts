import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queueOrderNotification } from '@/lib/automation/notification-sender';
import { scheduleTask } from '@/lib/automation/task-processor';

interface RevisionRequestBody {
  revisionDetails: string;
}

/**
 * POST /api/orders/[id]/revision
 * Submit a revision request for a delivered order
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: RevisionRequestBody = await request.json();

    if (!body.revisionDetails || body.revisionDetails.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please provide detailed revision instructions (at least 10 characters)' },
        { status: 400 }
      );
    }

    // Fetch the order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Verify user owns this order
    if (order.client_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - you do not own this order' },
        { status: 403 }
      );
    }

    // Check if order is in a state that allows revisions
    const allowedStatuses = ['draft_delivered', 'revision_delivered', 'completed'];
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Revisions can only be requested for delivered orders. Current status: ${order.status}` },
        { status: 400 }
      );
    }

    // Check revision count (max 2 free revisions per order)
    const currentRevisions = order.revision_count || 0;
    const maxFreeRevisions = 2;

    if (currentRevisions >= maxFreeRevisions) {
      return NextResponse.json(
        {
          error: 'Maximum free revisions reached',
          message: 'You have used all 2 free revisions for this order. Please contact support for additional revisions.',
          revisionsUsed: currentRevisions,
          maxRevisions: maxFreeRevisions,
        },
        { status: 400 }
      );
    }

    // Update order status and store revision details
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'revision_requested',
        revision_count: currentRevisions + 1,
        revision_notes: body.revisionDetails,
        revision_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Revision] Failed to update order:', updateError);
      return NextResponse.json(
        { error: 'Failed to submit revision request' },
        { status: 500 }
      );
    }

    // Log the automation action
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'revision_requested',
      action_details: {
        revisionNumber: currentRevisions + 1,
        revisionDetails: body.revisionDetails.substring(0, 500), // Truncate for log
        requestedBy: user.email,
      },
    });

    // Queue notification to admin/clerk about revision request
    await queueOrderNotification(orderId, 'revision_requested', {
      revisionDetails: body.revisionDetails,
      revisionNumber: currentRevisions + 1,
    });

    // Schedule clerk assignment for the revision (similar to new orders)
    await scheduleTask('clerk_assignment', {
      orderId,
      scheduledFor: new Date(), // Immediate
      priority: 7, // High priority for revisions
      payload: {
        isRevision: true,
        revisionNumber: currentRevisions + 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Revision request submitted successfully',
      revisionNumber: currentRevisions + 1,
      remainingRevisions: maxFreeRevisions - (currentRevisions + 1),
    });
  } catch (error) {
    console.error('[Revision API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders/[id]/revision
 * Get revision history for an order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, revision_count, revision_notes, revision_requested_at')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Verify user owns this order
    if (order.client_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Fetch revision-related automation logs
    const { data: revisionLogs } = await supabase
      .from('automation_logs')
      .select('action_type, action_details, created_at')
      .eq('order_id', orderId)
      .in('action_type', ['revision_requested', 'revision_completed'])
      .order('created_at', { ascending: false });

    return NextResponse.json({
      revisionCount: order.revision_count || 0,
      maxFreeRevisions: 2,
      remainingRevisions: Math.max(0, 2 - (order.revision_count || 0)),
      currentRevisionNotes: order.revision_notes,
      lastRevisionRequestedAt: order.revision_requested_at,
      history: revisionLogs || [],
    });
  } catch (error) {
    console.error('[Revision API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
