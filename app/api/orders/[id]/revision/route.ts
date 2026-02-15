import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queueOrderNotification } from '@/lib/automation/notification-sender';
import { scheduleTask } from '@/lib/automation/task-processor';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-revision');

/**
 * POST /api/orders/[id]/revision
 *
 * Submit a revision request for a completed order.
 * Only allowed if status = COMPLETED/completed AND revision_count = 0.
 * This is the one free post-completion revision.
 *
 * Auth: Must be the order owner.
 * Body: { notes: string, status_version: number }
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
    let body: { notes?: unknown; status_version?: unknown; revisionDetails?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Accept both `notes` and legacy `revisionDetails` field
    const notes =
      typeof body.notes === 'string'
        ? body.notes.trim()
        : typeof body.revisionDetails === 'string'
          ? (body.revisionDetails as string).trim()
          : '';

    if (notes.length < 10) {
      return NextResponse.json(
        { error: 'Please provide detailed revision instructions (at least 10 characters)' },
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

    // Fetch the order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number, revision_count, status_version')
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

    // Check if order is completed
    const completedStatuses = ['COMPLETED', 'completed'];
    if (!completedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Revisions can only be requested for completed orders. Current status: ${order.status}` },
        { status: 400 }
      );
    }

    // Check revision count - only allowed if revision_count = 0
    const currentRevisions = order.revision_count ?? 0;
    if (currentRevisions > 0) {
      return NextResponse.json(
        {
          error: 'Maximum free revision already used',
          message: 'You have already used your free revision for this order. Please contact support for additional revisions.',
          revisionsUsed: currentRevisions,
        },
        { status: 400 }
      );
    }

    // Optimistic concurrency check
    const currentVersion = order.status_version ?? 0;
    if (statusVersion !== currentVersion) {
      return NextResponse.json(
        {
          error: 'Version conflict. The order has been modified by another request.',
          current_version: currentVersion,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // Update order status and store revision details
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'revision_requested',
        revision_count: 1,
        revision_notes: notes,
        revision_requested_at: now,
        status_version: currentVersion + 1,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('status_version', currentVersion)
      .select('id')
      .single();

    if (updateError || !updatedOrder) {
      log.error('Failed to update order for revision', { error: updateError });
      return NextResponse.json(
        { error: 'Failed to submit revision request. The order may have been modified concurrently.' },
        { status: 409 }
      );
    }

    // Log the automation action
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'revision_requested',
      action_details: {
        revisionNumber: 1,
        revisionDetails: notes.substring(0, 500), // Truncate for log
        requestedBy: user.email,
      },
    });

    // Queue notification to admin/clerk about revision request
    await queueOrderNotification(orderId, 'revision_requested', {
      revisionDetails: notes,
      revisionNumber: 1,
    });

    // Schedule clerk assignment for the revision
    await scheduleTask('clerk_assignment', {
      orderId,
      scheduledFor: new Date(),
      priority: 7,
      payload: {
        isRevision: true,
        revisionNumber: 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Revision request submitted successfully',
      revisionNumber: 1,
      remainingRevisions: 0,
      status_version: currentVersion + 1,
    });
  } catch (error) {
    log.error('Revision API error', { error: error instanceof Error ? error.message : error });
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

    return NextResponse.json(
      {
        revisionCount: order.revision_count ?? 0,
        maxFreeRevisions: 1,
        remainingRevisions: Math.max(0, 1 - (order.revision_count ?? 0)),
        currentRevisionNotes: order.revision_notes,
        lastRevisionRequestedAt: order.revision_requested_at,
        history: revisionLogs ?? [],
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    log.error('Revision API error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
