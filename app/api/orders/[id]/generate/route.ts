/**
 * Motion Generation API - 14-Phase Workflow
 *
 * POST /api/orders/[id]/generate
 *
 * Triggers the new 14-phase workflow orchestrator via Inngest.
 * This replaces the old single-call superprompt system.
 *
 * v7.2: Uses workflow-orchestration.ts for proper phase execution,
 * checkpoints, and revision loops.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

export const maxDuration = 30; // Just enough to trigger the workflow

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
    // Verify order exists and get current state
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, motion_type, motion_tier, order_number')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Don't re-generate if already processing or complete
    // BUT allow restarting if workflow is blocked or failed
    const { data: workflow } = await supabase
      .from('order_workflows')
      .select('status')
      .eq('order_id', orderId)
      .single();

    const workflowIsStuck = workflow && ['blocked', 'failed'].includes(workflow.status);
    const blockedStatuses = ['pending_review', 'draft_delivered', 'completed'];

    // Block if order is in a final/review state, unless workflow is stuck
    if (blockedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Order already in status: ${order.status}. Cannot restart workflow.` },
        { status: 400 }
      );
    }

    // Block if currently generating AND workflow is not stuck
    if (order.status === 'generating' && !workflowIsStuck) {
      return NextResponse.json(
        { error: `Workflow is currently running. Please wait or use the restart button.` },
        { status: 400 }
      );
    }

    // Update status to generating
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'generating',
        generation_started_at: new Date().toISOString(),
        generation_error: null,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('[Generate] Failed to update order status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // Trigger the 14-phase workflow via Inngest
    // If INNGEST_EVENT_KEY is not configured, fall back to direct execution
    const inngestConfigured = process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY;

    if (inngestConfigured) {
      await inngest.send({
        name: 'workflow/orchestration.start',
        data: {
          orderId,
          triggeredBy: 'admin_generate_now',
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      // Fallback: Execute workflow directly without Inngest
      console.log('[Generate] Inngest not configured, executing workflow directly');

      // Import and execute workflow engine directly
      const { executeCurrentPhase } = await import('@/lib/workflow/workflow-engine');

      // Execute phases in background (non-blocking)
      (async () => {
        try {
          // Get workflow ID
          const { data: workflow } = await supabase
            .from('order_workflows')
            .select('id')
            .eq('order_id', orderId)
            .single();

          if (!workflow) {
            throw new Error('Workflow not found');
          }

          // Execute phases sequentially
          for (let i = 0; i < 14; i++) {
            const result = await executeCurrentPhase(workflow.id);

            if (!result.success) {
              console.error(`[Generate] Phase execution failed:`, result.error);
              break;
            }

            // Check if workflow is blocked (requires review)
            const { data: wf } = await supabase
              .from('order_workflows')
              .select('status')
              .eq('id', workflow.id)
              .single();

            if (wf?.status === 'blocked') {
              console.log('[Generate] Workflow blocked, stopping execution');
              break;
            }
          }
        } catch (error) {
          console.error('[Generate] Direct workflow execution error:', error);
        }
      })();
    }

    // Log the workflow trigger
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_triggered',
      action_details: {
        triggeredBy: user.id,
        method: 'admin_generate_now',
        orderNumber: order.order_number,
        motionType: order.motion_type,
        tier: order.motion_tier,
        workflow: '14-phase-v72',
      },
    });

    return NextResponse.json({
      success: true,
      message: '14-phase workflow started',
      orderId,
      orderNumber: order.order_number,
      workflow: '14-phase-v72',
      status: 'generating',
    });

  } catch (error) {
    console.error('[Generate] Failed to start workflow:', error);

    // Revert status on error
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        generation_error: error instanceof Error ? error.message : 'Failed to start workflow',
      })
      .eq('id', orderId);

    return NextResponse.json(
      { error: 'Failed to start workflow' },
      { status: 500 }
    );
  }
}
