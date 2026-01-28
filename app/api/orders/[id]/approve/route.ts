/**
 * Workflow Checkpoint Approval API
 *
 * POST /api/orders/[id]/approve
 * Handle admin approval/rejection of workflow checkpoints
 *
 * Actions:
 * - APPROVE: Continue workflow to next phase
 * - REQUEST_CHANGES: Route back to Phase VIII for revisions
 * - CANCEL: Cancel the workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

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

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  // Parse request body
  let body: { action: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
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
    console.error('Approval error:', error);
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
    console.error('Checkpoint status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get checkpoint status' },
      { status: 500 }
    );
  }
}
