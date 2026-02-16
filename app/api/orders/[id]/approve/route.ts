/**
 * CP3 Approval API
 *
 * POST /api/orders/[id]/approve
 *
 * Two modes:
 * 1. Attorney CP3 approval — order owner approves delivery.
 *    Uses three-gate auth pattern. Transitions AWAITING_APPROVAL → COMPLETED.
 * 2. Admin checkpoint approval — admin/clerk sends { action: 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL' }.
 *
 * SP-4 Task 2 (R4-06): Rewritten with three-gate pattern, optimistic locking,
 * checkpoint logger, CP3 timeout cancellation, and durability-safe Inngest emit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateAndLoadOrder, validateOptimisticLock } from '@/lib/orders/status-guards';
import { updateOrderStatus } from '@/lib/orders/status-machine';
import { logCheckpointEvent } from '@/lib/workflow/checkpoint-logger';
import { cancelCP3Timeouts } from '@/lib/workflow/cp3-timeouts';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';
import { RETENTION_DAYS } from '@/lib/workflow/checkpoint-types';

const log = createLogger('api-orders-approve');

// ---------------------------------------------------------------------------
// Attorney CP3 Approval (three-gate pattern)
// ---------------------------------------------------------------------------
async function handleAttorneyApproval(
  orderId: string,
  body: { status_version?: number }
) {
  if (body.status_version === undefined || body.status_version === null) {
    return NextResponse.json({ error: 'status_version is required' }, { status: 400 });
  }

  // Three-gate auth: authenticate, load order, verify AWAITING_APPROVAL
  // Also accepts legacy statuses for backwards compatibility
  const result = await authenticateAndLoadOrder(orderId, [
    'AWAITING_APPROVAL', 'draft_delivered', 'pending_review',
  ]);
  if (result instanceof NextResponse) return result;
  const { order, userId } = result;

  // Optimistic lock
  const lockError = validateOptimisticLock(order, body.status_version);
  if (lockError) return lockError;

  const adminClient = getServiceSupabase();

  // Update status to COMPLETED with retention expiry
  const statusResult = await updateOrderStatus(
    adminClient, orderId, 'COMPLETED', order.status_version,
    {
      completed_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      retention_expires_at: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }
  );

  if (!statusResult.success) {
    return NextResponse.json({ error: statusResult.error }, { status: 409 });
  }

  // Cancel CP3 timeouts
  await cancelCP3Timeouts(adminClient, orderId);

  // Log checkpoint event (immutable audit)
  await logCheckpointEvent(adminClient, {
    orderId,
    eventType: 'CP3_APPROVED',
    actor: 'attorney',
    metadata: { attorneyId: userId },
  });

  // Emit event to wake Fn2 — MUST be separate from DB ops (D5 W3-2 durability rule)
  await inngest.send({
    name: 'workflow/checkpoint-approved',
    data: { orderId, workflowId: order.workflow_id, action: 'APPROVE', approvedBy: userId },
  });

  // Fetch deliverable documents
  const supabase = await createClient();
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
    status: 'approved',
    status_version: statusResult.statusVersion,
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

  // Parse request body (may be empty for attorney approval)
  let body: { action?: string; notes?: string; status_version?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is valid for attorney CP3 approval
  }

  // Route: if no action field, treat as attorney CP3 approval
  if (!body.action) {
    return handleAttorneyApproval(orderId, body);
  }

  // ---------- Admin checkpoint approval flow ----------
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  const { action, notes } = body;

  if (!['APPROVE', 'REQUEST_CHANGES', 'CANCEL'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be APPROVE, REQUEST_CHANGES, or CANCEL' },
      { status: 400 }
    );
  }

  try {
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

    // Send Inngest event — separate step per durability rule (D5 W3-2)
    try {
      await inngest.send({
        name: 'workflow/checkpoint-approved',
        data: {
          orderId,
          action: action as 'APPROVE' | 'REQUEST_CHANGES' | 'CANCEL',
          notes: notes || undefined,
          approvedBy: user.id,
          approvedAt: new Date().toISOString(),
        },
      });
      log.info(`[CP3] Sent Inngest approval event: ${action} for order ${orderId}`);
    } catch (inngestError) {
      log.error('[CP3] Failed to send Inngest approval event', {
        error: inngestError instanceof Error ? inngestError.message : inngestError,
        orderId,
        action,
      });
    }

    if (action === 'APPROVE') {
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

      await supabase
        .from('orders')
        .update({ status: 'draft_delivered', updated_at: new Date().toISOString() })
        .eq('id', orderId);

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

      return NextResponse.json({ success: true, action: 'APPROVE', message: 'Workflow approved and marked complete' });
    } else if (action === 'REQUEST_CHANGES') {
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

      return NextResponse.json({ success: true, action: 'REQUEST_CHANGES', message: 'Changes requested. Workflow routed to Phase VIII for revisions.' });
    } else if (action === 'CANCEL') {
      await supabase
        .from('workflow_state')
        .update({
          checkpoint_pending: false,
          phase_status: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflow.id);

      await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderId);

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

      return NextResponse.json({ success: true, action: 'CANCEL', message: 'Workflow cancelled' });
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
