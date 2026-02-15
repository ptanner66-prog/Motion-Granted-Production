/**
 * Motion Approval API
 *
 * POST: Approve or reject a motion that's pending review
 *       - Approve: Releases the draft to the client
 *       - Reject: Marks for re-generation with feedback
 *       - Request Revision: Sends back for manual revision
 *
 * This is the gate between automated generation and client delivery.
 * Only admins/clerks can approve motions.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queueOrderNotification } from '@/lib/automation/notification-sender';
import type { NotificationType } from '@/types/automation';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-workflow-approve');

type ApprovalAction = 'approve' | 'reject' | 'request_revision';

interface ApprovalRequest {
  orderId: string;
  action: ApprovalAction;
  feedback?: string; // Required for reject/request_revision
  internalNotes?: string; // Optional internal notes
}

interface PendingOrderRecord {
  id: string;
  order_number: string;
  motion_type: string;
  case_number: string;
  jurisdiction: string;
  status: string;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string; email: string } | null;
}

interface DeliverableRecord {
  order_id: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    const body: ApprovalRequest = await request.json();
    const { orderId, action, feedback, internalNotes } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    if (!action || !['approve', 'reject', 'request_revision'].includes(action)) {
      return NextResponse.json({
        error: 'action must be one of: approve, reject, request_revision',
      }, { status: 400 });
    }

    if ((action === 'reject' || action === 'request_revision') && !feedback) {
      return NextResponse.json({
        error: 'feedback is required for reject/request_revision actions',
      }, { status: 400 });
    }

    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, profiles(full_name, email)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify order is in pending_review status
    if (order.status !== 'pending_review') {
      return NextResponse.json({
        error: `Order cannot be ${action}d - current status is ${order.status}. Only orders with status 'pending_review' can be processed.`,
      }, { status: 400 });
    }

    // Determine new status based on action
    let newStatus: string;
    let notificationType: NotificationType | null = null;

    switch (action) {
      case 'approve':
        newStatus = 'draft_delivered';
        notificationType = 'draft_ready';
        break;
      case 'reject':
        newStatus = 'in_progress'; // Back to generation queue
        break;
      case 'request_revision':
        newStatus = 'revision_requested';
        break;
      default:
        newStatus = order.status;
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
    }

    // Log the approval action
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: `motion_${action}d`,
      action_details: {
        previousStatus: order.status,
        newStatus,
        feedback: feedback || null,
        internalNotes: internalNotes || null,
        reviewedBy: user.id,
        reviewerName: profile.full_name,
        reviewedAt: new Date().toISOString(),
      },
    });

    // Store feedback for reject/revision actions
    if (feedback && (action === 'reject' || action === 'request_revision')) {
      await supabase.from('order_feedback').insert({
        order_id: orderId,
        feedback_type: action,
        feedback_content: feedback,
        created_by: user.id,
        created_at: new Date().toISOString(),
      }).catch(() => {
        // Table might not exist yet - that's ok, log covers it
        log.info('order_feedback table not available, feedback logged in automation_logs');
      });
    }

    // If approved, notify the client
    if (action === 'approve' && notificationType) {
      queueOrderNotification(orderId, notificationType, {
        deliverableReady: true,
        clientName: order.profiles?.full_name || 'Client',
        clientEmail: order.profiles?.email,
      }).catch(err => {
        log.error('Failed to queue client notification', { error: err instanceof Error ? err.message : err });
      });
    }

    // Get deliverable count for response
    const { count: deliverableCount } = await supabase
      .from('order_documents')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('document_type', 'deliverable');

    return NextResponse.json({
      success: true,
      action,
      orderId,
      previousStatus: order.status,
      newStatus,
      deliverableCount: deliverableCount || 0,
      message: getActionMessage(action, order.profiles?.full_name),
    });
  } catch (error) {
    log.error('Approval error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: 'Approval failed. Please try again.',
    }, { status: 500 });
  }
}

function getActionMessage(action: ApprovalAction, clientName?: string): string {
  switch (action) {
    case 'approve':
      return `Draft approved and delivered to ${clientName || 'client'}. They will receive a notification.`;
    case 'reject':
      return 'Draft rejected. Order has been queued for re-generation with your feedback.';
    case 'request_revision':
      return 'Revision requested. The draft will be updated based on your feedback.';
    default:
      return 'Action completed.';
  }
}

/**
 * GET: Get all orders pending review
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending_review';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    // Get orders pending review
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        motion_type,
        case_number,
        jurisdiction,
        status,
        created_at,
        updated_at,
        profiles(full_name, email)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    // Get deliverable counts
    const orderIds = orders?.map((o: PendingOrderRecord) => o.id) || [];
    const { data: deliverableCounts } = await supabase
      .from('order_documents')
      .select('order_id')
      .in('order_id', orderIds)
      .eq('document_type', 'deliverable');

    // Count deliverables per order
    const countMap: Record<string, number> = {};
    deliverableCounts?.forEach((d: DeliverableRecord) => {
      countMap[d.order_id] = (countMap[d.order_id] || 0) + 1;
    });

    const ordersWithCounts = orders?.map((o: PendingOrderRecord) => ({
      ...o,
      deliverableCount: countMap[o.id] || 0,
    })) || [];

    return NextResponse.json({
      orders: ordersWithCounts,
      total: ordersWithCounts.length,
      status,
    });
  } catch (error) {
    log.error('Get pending orders error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: 'Failed to fetch orders. Please try again.',
    }, { status: 500 });
  }
}
