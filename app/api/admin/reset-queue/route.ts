/**
 * Admin endpoint to reset order statuses
 *
 * POST /api/admin/reset-queue
 * Resets stuck orders to 'submitted' status and clears all workflow data
 * so they can be completely restarted from Phase 1
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-reset-queue');

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  try {
    // SP-08: Use user-scoped client instead of service_role (admin verified above).
    // Requires admin RLS policies on orders/workflows tables (see Task 10 migration).

    // Statuses that indicate stuck/failed orders needing reset
    const stuckStatuses = [
      'UNDER_REVIEW',
      'PROCESSING', 'IN_PROGRESS',
      'GENERATION_FAILED',
      'PENDING_REVIEW',
      'IN_REVIEW',
      'BLOCKED',
    ];

    // Get orders that need to be reset
    const { data: stuckOrders, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .in('status', stuckStatuses);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!stuckOrders || stuckOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stuck orders found to reset',
        orders_updated: [],
        workflows_cleared: 0,
      });
    }

    const orderIds = stuckOrders.map((o: { id: string }) => o.id);

    // Count by status before update
    const statusCounts: Record<string, number> = {};
    for (const order of stuckOrders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    // Track workflows that were cleared
    const workflowIds: string[] = [];

    // Reset each order's workflow properly
    for (const order of stuckOrders) {
      // Get workflow ID
      const { data: workflow } = await supabase
        .from('order_workflows')
        .select('id, workflow_path')
        .eq('order_id', order.id)
        .single();

      if (workflow) {
        workflowIds.push(workflow.id);
        // Delete phase executions and judge results
        await supabase
          .from('workflow_phase_executions')
          .delete()
          .eq('order_workflow_id', workflow.id);

        try {
          await supabase
            .from('judge_simulation_results')
            .delete()
            .eq('order_workflow_id', workflow.id);
        } catch {
          // Table might not exist
        }

        // Reset workflow state
        await supabase
          .from('order_workflows')
          .update({
            status: 'pending',
            current_phase: 1,
            last_error: null,
            started_at: null,
            completed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workflow.id);

        // Recreate phase execution records
        const { data: phases } = await supabase
          .from('workflow_phase_definitions')
          .select('id, phase_number')
          .eq('workflow_path', workflow.workflow_path)
          .order('phase_number', { ascending: true });

        if (phases && phases.length > 0) {
          const phaseExecutions = phases.map((phase: { id: string; phase_number: number }) => ({
            order_workflow_id: workflow.id,
            phase_definition_id: phase.id,
            phase_number: phase.phase_number,
            status: 'pending',
          }));

          await supabase
            .from('workflow_phase_executions')
            .insert(phaseExecutions);
        }
      }
    }

    // Cancel running Inngest workflows for these orders before DB reset
    try {
      const cancellationEvents = orderIds.map((oid: string) => ({
        name: 'workflow/order.reset' as const,
        data: { orderId: oid, resetBy: user.id, resetAt: new Date().toISOString() },
      }));
      if (cancellationEvents.length > 0) {
        await inngest.send(cancellationEvents);
      }
    } catch (inngestError) {
      log.error('Failed to cancel Inngest workflows (non-fatal)', {
        error: inngestError instanceof Error ? inngestError.message : inngestError,
      });
    }

    // Update order statuses to 'submitted' (ready to restart)
    const { data: updatedOrders, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'SUBMITTED',
        generation_error: null,
        updated_at: new Date().toISOString()
      })
      .in('id', orderIds)
      .select('id, order_number');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log the action
    await supabase.from('automation_logs').insert({
      action_type: 'queue_reset',
      action_details: {
        change_type: 'complete_reset',
        updated_by: user.id,
        orders_reset: updatedOrders?.length || 0,
        workflows_cleared: workflowIds.length,
        previous_statuses: statusCounts,
        new_status: 'SUBMITTED',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Reset ${updatedOrders?.length || 0} stuck orders - workflows cleared, ready to regenerate`,
      previous_statuses: statusCounts,
      orders_updated: updatedOrders?.map((o: { order_number: string }) => o.order_number) || [],
      workflows_cleared: workflowIds.length,
    });
  } catch (error) {
    log.error('Reset queue error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to reset queue',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  try {
    // SP-08: Reuse user-scoped client (admin verified above).
    // Get current order statuses
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at')
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Count by status
    const statusCounts: Record<string, number> = {};
    const ordersList: Array<{ order_number: string; status: string }> = [];

    for (const order of orders || []) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      ordersList.push({ order_number: order.order_number, status: order.status });
    }

    return NextResponse.json({
      total_orders: orders?.length || 0,
      status_counts: statusCounts,
      orders: ordersList,
    });
  } catch (error) {
    log.error('Get queue status error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get queue status',
    }, { status: 500 });
  }
}
