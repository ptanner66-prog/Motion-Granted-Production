/**
 * Workflow Request Changes API
 *
 * Requests changes at a checkpoint in the v7.2 workflow system.
 * Triggers revision loop (max 3 iterations).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAX_REVISION_LOOPS } from '@/types/workflow';

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
    const { workflowId, phaseCode, feedback, revisionInstructions } = body;

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    if (!feedback && !revisionInstructions) {
      return NextResponse.json({ error: 'Feedback or revision instructions required' }, { status: 400 });
    }

    // Get current workflow state
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('id, order_id, current_phase, revision_loop, status')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const currentLoop = workflow.revision_loop || 0;

    if (currentLoop >= MAX_REVISION_LOOPS) {
      return NextResponse.json({
        error: 'Maximum revision loops reached (3)',
        maxReached: true,
      }, { status: 400 });
    }

    // Record the change request in workflow_checkpoints
    await supabase.from('workflow_checkpoints').insert({
      workflow_id: workflowId,
      phase_code: phaseCode || 'VII',
      checkpoint_type: 'notification',
      status: 'changes_requested',
      feedback,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      notes: revisionInstructions,
    });

    // Update workflow to trigger revision loop
    const { error: updateError } = await supabase
      .from('order_workflows')
      .update({
        revision_loop: currentLoop + 1,
        current_phase: 8, // Back to Phase VII for revision
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflow.order_id);

    return NextResponse.json({
      success: true,
      message: 'Changes requested - revision loop initiated',
      workflowId,
      newLoop: currentLoop + 1,
      maxLoops: MAX_REVISION_LOOPS,
    });
  } catch (error) {
    console.error('[Workflow Request Changes] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
