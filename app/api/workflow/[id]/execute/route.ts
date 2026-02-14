/**
 * Workflow Execute API
 *
 * POST: Trigger workflow execution for an order via Inngest pipeline.
 *
 * Previously called executeCurrentPhase/runWorkflow directly (dead orchestrator path).
 * Now sends an Inngest event to trigger the live 14-phase pipeline.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWorkflowProgress } from '@/lib/workflow';
import { inngest } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-workflow-execute');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  const supabase = await createClient();

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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get workflow to find orderId
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('order_id, status')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Get order for filing deadline (needed for priority calculation)
    const { data: order } = await supabase
      .from('orders')
      .select('filing_deadline')
      .eq('id', workflow.order_id)
      .single();

    const filingDeadline = order?.filing_deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const hoursUntilDeadline = (new Date(filingDeadline).getTime() - Date.now()) / (1000 * 60 * 60);
    const priority = Math.max(0, Math.floor(10000 - hoursUntilDeadline));

    // Trigger the Inngest pipeline instead of calling the dead orchestrator directly
    await inngest.send({
      name: 'order/submitted',
      data: {
        orderId: workflow.order_id,
        priority,
        filingDeadline,
      },
    });

    // Get current progress for response
    const progress = await getWorkflowProgress(workflowId);

    return NextResponse.json({
      result: { status: 'triggered', message: 'Workflow execution triggered via Inngest pipeline' },
      progress: progress.success ? progress.data : null,
    });
  } catch (error) {
    log.error('Workflow execute error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Workflow execution failed. Please try again.' },
      { status: 500 }
    );
  }
}
