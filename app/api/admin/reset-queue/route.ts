/**
 * Admin endpoint to reset order statuses
 *
 * POST /api/admin/reset-queue
 * Resets stuck orders to 'submitted' status and clears all workflow data
 * so they can be completely restarted from Phase 1
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const adminClient = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    // Statuses that indicate stuck/failed orders needing reset
    const stuckStatuses = ['under_review', 'in_progress', 'generation_failed', 'pending_review', 'in_review', 'blocked'];

    // Get orders that need to be reset
    const { data: stuckOrders, error: fetchError } = await adminClient
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

    const orderIds = stuckOrders.map(o => o.id);

    // Count by status before update
    const statusCounts: Record<string, number> = {};
    for (const order of stuckOrders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    // Reset stuck orders to 'submitted' so they can be regenerated
    // This is NOT marking them as delivered - it's allowing them to be restarted
    const stuckStatuses = ['in_progress', 'generation_failed', 'in_review'];

    // Get orders to reset
    const { data: ordersToReset, error: fetchOrdersError } = await adminClient
      .from('orders')
      .select('id, order_number')
      .in('status', stuckStatuses);

    if (fetchOrdersError) {
      return NextResponse.json({ error: fetchOrdersError.message }, { status: 500 });
    }

    // Reset each order's workflow properly
    for (const order of ordersToReset || []) {
      // Get workflow ID
      const { data: workflow } = await adminClient
        .from('order_workflows')
        .select('id, workflow_path')
        .eq('order_id', order.id)
        .single();

      if (workflow) {
        // Delete phase executions and judge results
        await adminClient
          .from('workflow_phase_executions')
          .delete()
          .eq('order_workflow_id', workflow.id);

        try {
          await adminClient
            .from('judge_simulation_results')
            .delete()
            .eq('order_workflow_id', workflow.id);
        } catch {
          // Table might not exist
        }

        // Reset workflow state
        await adminClient
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
        const { data: phases } = await adminClient
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

          await adminClient
            .from('workflow_phase_executions')
            .insert(phaseExecutions);
        }
      }
    }

    // Update order statuses to 'submitted' (ready to restart)
    const { data: updatedOrders, error: updateError } = await adminClient
      .from('orders')
      .update({
        status: 'submitted',
        generation_error: null,
        updated_at: new Date().toISOString()
      })
      .in('id', orderIds)
      .select('id, order_number');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log the action
    await adminClient.from('automation_logs').insert({
      action_type: 'queue_reset',
      action_details: {
        change_type: 'complete_reset',
        updated_by: user.id,
        orders_reset: updatedOrders?.length || 0,
        workflows_cleared: workflowIds.length,
        previous_statuses: statusCounts,
        new_status: 'submitted',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Reset ${updatedOrders?.length || 0} stuck orders - workflows cleared, ready to regenerate`,
      previous_statuses: statusCounts,
      orders_updated: updatedOrders?.map(o => o.order_number) || [],
      workflows_cleared: workflowIds.length,
    });
  } catch (error) {
    console.error('Reset queue error:', error);
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const adminClient = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    // Get current order statuses
    const { data: orders, error: fetchError } = await adminClient
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
    console.error('Get queue status error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get queue status',
    }, { status: 500 });
  }
}
