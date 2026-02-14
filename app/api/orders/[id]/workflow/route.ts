/**
 * Workflow State API
 *
 * GET /api/orders/[id]/workflow
 * Returns the current workflow state for an order including:
 * - Current phase and status
 * - Phase outputs
 * - Checkpoint state
 * - Revision loop count
 * - Phase execution history
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-workflow');

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

  // Check if user has access to this order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Check authorization (client owner or admin/clerk)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
  const isOwner = order.client_id === user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get workflow state
    const { data: workflow, error: workflowError } = await supabase
      .from('workflow_state')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (workflowError) {
      // No workflow yet - return empty state
      if (workflowError.code === 'PGRST116') {
        return NextResponse.json({
          exists: false,
          message: 'No workflow state found for this order',
        });
      }
      throw workflowError;
    }

    // Get phase executions
    const { data: executions, error: execError } = await supabase
      .from('phase_executions')
      .select('id, phase, status, model_used, input_tokens, output_tokens, duration_ms, started_at, completed_at, error_message')
      .eq('workflow_id', workflow.id)
      .order('started_at', { ascending: true });

    if (execError) {
      log.error('Failed to fetch phase executions', { error: execError });
    }

    // Get judge simulation results
    const { data: judgeResults } = await supabase
      .from('judge_simulation_results')
      .select('*')
      .eq('workflow_id', workflow.id)
      .order('created_at', { ascending: false });

    // Get citation banks
    const { data: citationBanks } = await supabase
      .from('citation_banks')
      .select('id, bank_type, total_citations, verified_count, failed_count')
      .eq('order_id', orderId);

    return NextResponse.json({
      exists: true,
      workflow: {
        id: workflow.id,
        orderId: workflow.order_id,
        currentPhase: workflow.current_phase,
        phaseStatus: workflow.phase_status,
        tier: workflow.tier,
        path: workflow.path,
        revisionLoopCount: workflow.revision_loop_count,
        checkpointPending: workflow.checkpoint_pending,
        checkpointType: workflow.checkpoint_type,
        checkpointData: workflow.checkpoint_data,
        holdTriggered: workflow.hold_triggered,
        holdReason: workflow.hold_reason,
        loop3ExitTriggered: workflow.loop_3_exit_triggered,
        startedAt: workflow.started_at,
        completedAt: workflow.completed_at,
        updatedAt: workflow.updated_at,
      },
      executions: executions || [],
      judgeResults: judgeResults || [],
      citationBanks: citationBanks || [],
    });
  } catch (error) {
    log.error('Workflow state fetch error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch workflow state' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orders/[id]/workflow
 * Start a new v7.2 workflow for an order
 */
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

  try {
    // Check if workflow already exists
    const { data: existing } = await supabase
      .from('workflow_state')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Workflow already exists for this order', workflowId: existing.id },
        { status: 409 }
      );
    }

    // Create new workflow state
    const workflowId = crypto.randomUUID();

    const { error: insertError } = await supabase.from('workflow_state').insert({
      id: workflowId,
      order_id: orderId,
      current_phase: 'I',
      phase_status: 'PENDING',
    });

    if (insertError) {
      throw insertError;
    }

    // Trigger workflow via Inngest
    const { inngest } = await import('@/lib/inngest/client');
    await inngest.send({
      name: 'workflow/execute-phase',
      data: {
        orderId,
        workflowId,
        phase: 'I',
      },
    });

    // Update order status
    await supabase
      .from('orders')
      .update({ status: 'in_progress' })
      .eq('id', orderId);

    // Log automation event
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_started',
      action_details: {
        workflowId,
        startedBy: user.id,
        version: '7.2',
      },
    });

    return NextResponse.json({
      success: true,
      workflowId,
      message: 'Workflow started successfully',
    });
  } catch (error) {
    log.error('Workflow start error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start workflow' },
      { status: 500 }
    );
  }
}
