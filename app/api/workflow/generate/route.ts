/**
 * Workflow Generation API - 14-Phase Workflow
 *
 * POST /api/workflow/generate
 *
 * Alternative endpoint to trigger the 14-phase workflow orchestrator.
 * Can be called with { orderId } in the request body.
 *
 * v7.2: Uses workflow-orchestration.ts for proper phase execution.
 */

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-workflow-generate');

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

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
    const blockedStatuses = ['generating', 'pending_review', 'draft_delivered', 'completed'];
    if (blockedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Order already in status: ${order.status}. Cannot restart workflow.` },
        { status: 400 }
      );
    }

    // Update status to generating
    await supabase
      .from('orders')
      .update({
        status: 'generating',
        generation_started_at: new Date().toISOString(),
        generation_error: null,
      })
      .eq('id', orderId);

    // Trigger 14-phase workflow (now uses order/submitted event)
    await inngest.send({
      name: 'order/submitted',
      data: {
        orderId,
        priority: 1000, // High priority for manual triggers
        filingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      },
    });

    // Log the workflow trigger
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_triggered',
      action_details: {
        triggeredBy: user.id,
        method: 'api_workflow_generate',
        orderNumber: order.order_number,
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
    log.error('Workflow generate error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Failed to start workflow' },
      { status: 500 }
    );
  }
}

/**
 * GET: Get available placeholders for superprompt templates (legacy support)
 */
export async function GET() {
  return NextResponse.json({
    message: 'This endpoint now uses the 14-phase workflow orchestrator.',
    workflow: '14-phase-v72',
    phases: [
      'I - Intake & Classification',
      'II - Legal Standards / Motion Deconstruction',
      'III - Evidence Strategy / Issue Identification',
      'IV - Authority Research (Checkpoint: Notification)',
      'V - Draft Motion',
      'V.1 - Citation Accuracy Check',
      'VI - Opposition Anticipation (Extended Thinking)',
      'VII - Judge Simulation (Checkpoint: Notification, Extended Thinking)',
      'VII.1 - Post-Revision Citation Check (if needed)',
      'VIII - Revisions (if grade < A-)',
      'VIII.5 - Caption Validation',
      'IX - Supporting Documents',
      'IX.1 - Separate Statement Check (MSJ/MSA only)',
      'X - Final Assembly (Checkpoint: BLOCKING)',
    ],
    checkpoints: {
      HOLD: 'Critical evidence gaps - blocks until customer responds',
      CP1: 'Research Complete - continues automatically',
      CP2: 'Judge Simulation grade - continues automatically',
      CP3: 'Requires admin Approve/Request Changes/Cancel',
    },
    instructions: `
To trigger the workflow:
POST to this endpoint with { orderId } in the request body.
The system will execute all 14 phases via Inngest background processing.
Admin/Clerk role required.
    `.trim(),
  });
}
