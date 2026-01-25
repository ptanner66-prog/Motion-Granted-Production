/**
 * Resume Automation API
 *
 * POST: Resume a workflow that was interrupted or failed mid-execution.
 *       Uses the resumeOrderAutomation function from automation-service.ts
 *       which picks up from the last checkpoint.
 *
 * Called when:
 * - Order status is 'in_progress' (workflow stopped mid-execution)
 * - Order status is 'generation_failed' (workflow failed and needs retry)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resumeOrderAutomation } from '@/lib/workflow/automation-service';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get orderId from body
  let orderId: string | null = null;

  try {
    const body = await request.json();
    orderId = body.orderId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 });
  }

  // Verify auth - admin or clerk only
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check authorization - must be admin or clerk
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';

  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden - admin or clerk access required' }, { status: 403 });
  }

  // Get the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Check if order is in a resumable state
  const resumableStatuses = ['in_progress', 'generation_failed', 'blocked'];
  if (!resumableStatuses.includes(order.status)) {
    return NextResponse.json({
      error: `Order is in '${order.status}' status. Can only resume orders that are in_progress, generation_failed, or blocked.`,
      orderStatus: order.status,
    }, { status: 400 });
  }

  try {
    // Log the resume attempt
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_resume_requested',
      action_details: {
        previousStatus: order.status,
        requestedAt: new Date().toISOString(),
        requestedBy: user.id,
      },
    });

    // Call the resume function from automation-service
    const result = await resumeOrderAutomation(orderId);

    if (!result.success) {
      // Log failure
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_resume_failed',
        action_details: {
          error: result.error,
          failedAt: new Date().toISOString(),
        },
      });

      // Update order status to generation_failed
      await supabase
        .from('orders')
        .update({ status: 'generation_failed' })
        .eq('id', orderId);

      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to resume workflow',
      }, { status: 500 });
    }

    // Log success
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_resumed',
      action_details: {
        workflowId: result.data?.workflowId,
        status: result.data?.status,
        currentPhase: result.data?.currentPhase,
        resumedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      workflowId: result.data?.workflowId,
      status: result.data?.status,
      currentPhase: result.data?.currentPhase,
      totalPhases: result.data?.totalPhases || 14,
      message: `Workflow resumed successfully. Status: ${result.data?.status}`,
    });
  } catch (error) {
    console.error('Resume automation error:', error);

    // Log error
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_resume_error',
      action_details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to resume workflow',
    }, { status: 500 });
  }
}
