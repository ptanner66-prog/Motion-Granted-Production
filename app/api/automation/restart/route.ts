/**
 * Restart Automation API
 *
 * POST: Completely restart a workflow from scratch.
 *       Deletes all existing workflow data and starts fresh from Phase 1.
 *
 * This is different from resume, which continues from the last checkpoint.
 * Use this when:
 * - Order is stuck and needs a clean restart
 * - Previous workflow data is corrupted
 * - You need to regenerate from the beginning
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest, calculatePriority } from '@/lib/inngest/client';

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

  try {
    // SP-08: Use user-scoped client instead of service_role (admin/clerk verified above).
    // Requires admin RLS policies on workflow tables (see Task 10 migration).

    // Log the restart attempt
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_restart_requested',
      action_details: {
        previousStatus: order.status,
        requestedAt: new Date().toISOString(),
        requestedBy: user.id,
      },
    });

    // ============================================================================
    // STEP 1: Clear all existing workflow data
    // ============================================================================

    // Get existing workflow(s) for this order
    const { data: workflows } = await supabase
      .from('order_workflows')
      .select('id')
      .eq('order_id', orderId);

    const workflowIds = workflows?.map(w => w.id) || [];

    if (workflowIds.length > 0) {
      // Delete workflow phase executions
      await supabase
        .from('workflow_phase_executions')
        .delete()
        .in('workflow_id', workflowIds);

      // Delete the workflow records
      await supabase
        .from('order_workflows')
        .delete()
        .eq('order_id', orderId);
    }

    // Clear citation banks for this order
    await supabase
      .from('citation_banks')
      .delete()
      .eq('order_id', orderId);

    // Clear citation verifications for this order
    await supabase
      .from('citation_verifications')
      .delete()
      .eq('order_id', orderId);

    // Clear verified citations for this order
    await supabase
      .from('verified_citations')
      .delete()
      .eq('order_id', orderId);

    // ============================================================================
    // STEP 2: Reset order status and error fields
    // ============================================================================

    await supabase
      .from('orders')
      .update({
        status: 'submitted',
        generation_error: null,
        generation_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Log successful cleanup
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_data_cleared',
      action_details: {
        workflowsDeleted: workflowIds.length,
        clearedAt: new Date().toISOString(),
        clearedBy: user.id,
      },
    });

    // ============================================================================
    // STEP 3: Fire Inngest event to start fresh workflow
    // ============================================================================

    // Get filing deadline for priority calculation
    const { data: freshOrder } = await supabase
      .from('orders')
      .select('filing_deadline')
      .eq('id', orderId)
      .single();

    const priority = freshOrder?.filing_deadline
      ? calculatePriority(freshOrder.filing_deadline)
      : 5000;

    try {
      await inngest.send({
        name: 'order/submitted',
        data: {
          orderId,
          priority,
          filingDeadline: freshOrder?.filing_deadline
            || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (inngestError) {
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_restart_failed',
        action_details: {
          error: inngestError instanceof Error ? inngestError.message : 'Inngest send failed',
          failedAt: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: false,
        error: 'Failed to start new workflow via Inngest',
        dataCleared: true,
      }, { status: 500 });
    }

    // Log success
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_restarted',
      action_details: {
        source: 'inngest',
        event: 'order/submitted',
        priority,
        restartedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      status: 'in_progress',
      currentPhase: 1,
      totalPhases: 14,
      message: `Workflow completely restarted from Phase 1. Previous data cleared.`,
    });
  } catch (error) {
    console.error('Restart automation error:', error);

    // Log error
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_restart_error',
      action_details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to restart workflow',
    }, { status: 500 });
  }
}
