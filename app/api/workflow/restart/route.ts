/**
 * Workflow Restart API
 *
 * Restarts a workflow from the beginning without creating a new order.
 * Preserves all order details but resets workflow state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    console.log(`[Workflow Restart] Starting restart for order ${orderId}`);

    // Get current workflow
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Delete all phase executions (fresh start)
    const { error: deletePhaseError } = await supabase
      .from('workflow_phase_executions')
      .delete()
      .eq('order_workflow_id', workflow.id);

    if (deletePhaseError) {
      console.error('[Workflow Restart] Error deleting phase executions:', deletePhaseError);
    }

    // Delete judge simulation results
    const { error: deleteJudgeError } = await supabase
      .from('judge_simulation_results')
      .delete()
      .eq('workflow_id', workflow.id);

    if (deleteJudgeError) {
      console.error('[Workflow Restart] Error deleting judge results:', deleteJudgeError);
    }

    // Reset workflow to initial state
    const { error: updateWfError } = await supabase
      .from('order_workflows')
      .update({
        status: 'pending',
        current_phase: 1,
        revision_loop: 0,
        error_message: null,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflow.id);

    if (updateWfError) {
      console.error('[Workflow Restart] Error updating workflow:', updateWfError);
      return NextResponse.json({ error: 'Failed to reset workflow' }, { status: 500 });
    }

    // Reset order status to submitted (ready to start)
    const { error: updateOrderError } = await supabase
      .from('orders')
      .update({
        status: 'submitted',
        generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateOrderError) {
      console.error('[Workflow Restart] Error updating order:', updateOrderError);
      return NextResponse.json({ error: 'Failed to reset order' }, { status: 500 });
    }

    // Log the restart action
    await supabase
      .from('automation_logs')
      .insert({
        order_id: orderId,
        action_type: 'workflow_restart',
        status: 'success',
        details: { workflow_id: workflow.id, restarted_by: user.id },
      });

    console.log(`[Workflow Restart] Successfully restarted workflow ${workflow.id} for order ${orderId}`);

    return NextResponse.json({
      success: true,
      message: 'Workflow restarted successfully',
      orderId,
      workflowId: workflow.id,
    });
  } catch (error) {
    console.error('[Workflow Restart] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
