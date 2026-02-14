/**
 * Workflow Checkpoint Approval API
 *
 * POST /api/orders/[id]/approve
 *
 * Two modes:
 * 1. Customer CP3 approval — order owner approves, no action field in body.
 *    Resolves CP3 checkpoint, updates order status to 'completed', returns download URLs.
 * 2. Admin checkpoint approval — admin/clerk sends { action: 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL' }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-approve');

// ---------------------------------------------------------------------------
// Customer CP3 Approval
// ---------------------------------------------------------------------------
async function handleCustomerApproval(orderId: string, userId: string) {
  const supabase = await createClient();

  // Fetch order and verify ownership
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, status, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.client_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the order is in a reviewable state
  const reviewableStatuses = ['draft_delivered', 'pending_review'];
  if (!reviewableStatuses.includes(order.status)) {
    return NextResponse.json(
      {
        error:
          order.status === 'completed'
            ? 'This order has already been approved.'
            : 'This order is not ready for review.',
      },
      { status: 400 }
    );
  }

  // Update order status to completed (atomic: only if in expected state)
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'draft_delivered');

  if (updateError) {
    return NextResponse.json({ error: 'Failed to approve order' }, { status: 500 });
  }

  // Fetch deliverable documents with download URLs
  const { data: documents } = await supabase
    .from('documents')
    .select('id, file_name, file_url, document_type, file_type, file_size')
    .eq('order_id', orderId)
    .eq('is_deliverable', true)
    .order('created_at', { ascending: true });

  const downloadUrls: Record<string, string> = {};
  for (const doc of documents ?? []) {
    if (doc.file_url) {
      downloadUrls[doc.file_name] = doc.file_url;
    }
  }

  return NextResponse.json({
    success: true,
    orderNumber: order.order_number,
    downloadUrls,
    documents: (documents ?? []).map((doc: { id: string; file_name: string; document_type: string; file_type: string; file_url: string; file_size: number }) => ({
      id: doc.id,
      filename: doc.file_name,
      type: doc.document_type,
      fileType: doc.file_type,
      downloadUrl: doc.file_url,
      fileSizeBytes: doc.file_size,
    })),
  });
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body (may be empty for customer approval)
  let body: { action?: string; notes?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is valid for customer CP3 approval
  }

  // Route: if no action field, treat as customer CP3 approval
  if (!body.action) {
    return handleCustomerApproval(orderId, user.id);
  }

  // ---------- Admin checkpoint approval flow ----------

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  const { action, notes } = body;

  // Validate action
  if (!['APPROVE', 'REQUEST_CHANGES', 'CANCEL'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be APPROVE, REQUEST_CHANGES, or CANCEL' },
      { status: 400 }
    );
  }

  try {
    // Get workflow state
    const { data: workflow, error: workflowError } = await supabase
      .from('workflow_state')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (!workflow.checkpoint_pending) {
      return NextResponse.json({ error: 'No checkpoint pending for this workflow' }, { status: 400 });
    }

    // Handle different actions
    if (action === 'APPROVE') {
      // Clear checkpoint and mark as complete
      await supabase
        .from('workflow_state')
        .update({
          checkpoint_pending: false,
          checkpoint_type: null,
          checkpoint_data: null,
          phase_status: 'COMPLETE',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      // Update order status to ready for delivery
      await supabase
        .from('orders')
        .update({
          status: 'draft_delivered',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Log approval
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'checkpoint_approved',
        action_details: {
          workflowId: workflow.id,
          phase: workflow.current_phase,
          approvedBy: user.id,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        action: 'APPROVE',
        message: 'Workflow approved and marked complete',
      });

    } else if (action === 'REQUEST_CHANGES') {
      // Route back to Phase VIII for revisions
      await supabase
        .from('workflow_state')
        .update({
          checkpoint_pending: false,
          checkpoint_type: null,
          checkpoint_data: null,
          current_phase: 'VIII',
          phase_status: 'PENDING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      // Trigger Phase VIII via Inngest
      await inngest.send({
        name: 'workflow/execute-phase',
        data: {
          orderId,
          workflowId: workflow.id,
          phase: 'VIII',
        },
      });

      // Log request
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'checkpoint_changes_requested',
        action_details: {
          workflowId: workflow.id,
          phase: workflow.current_phase,
          requestedBy: user.id,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        action: 'REQUEST_CHANGES',
        message: 'Changes requested. Workflow routed to Phase VIII for revisions.',
      });

    } else if (action === 'CANCEL') {
      // Cancel the workflow
      await supabase
        .from('workflow_state')
        .update({
          checkpoint_pending: false,
          phase_status: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      // Update order status
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Log cancellation
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_cancelled',
        action_details: {
          workflowId: workflow.id,
          phase: workflow.current_phase,
          cancelledBy: user.id,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        action: 'CANCEL',
        message: 'Workflow cancelled',
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    log.error('Approval error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process approval' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders/[id]/approve
 * Get checkpoint status for an order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
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

  try {
    const { data: workflow, error } = await supabase
      .from('workflow_state')
      .select('id, current_phase, phase_status, checkpoint_pending, checkpoint_type, checkpoint_data')
      .eq('order_id', orderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ checkpointPending: false, message: 'No workflow found' });
      }
      throw error;
    }

    return NextResponse.json({
      checkpointPending: workflow.checkpoint_pending,
      checkpointType: workflow.checkpoint_type,
      checkpointData: workflow.checkpoint_data,
      currentPhase: workflow.current_phase,
      phaseStatus: workflow.phase_status,
    });
  } catch (error) {
    log.error('Checkpoint status error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get checkpoint status' },
      { status: 500 }
    );
  }
}
