/**
 * Admin endpoint to reset order statuses
 *
 * POST /api/admin/reset-queue
 * Updates orders to pending_review status
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

    // Get current order statuses
    const { data: orders, error: fetchError } = await adminClient
      .from('orders')
      .select('id, order_number, status')
      .order('created_at', { ascending: false });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Count by status before update
    const statusCounts: Record<string, number> = {};
    for (const order of orders || []) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    // Update orders that are stuck (submitted, under_review, in_progress) to pending_review
    // This assumes they have generated motions ready for review
    const stuckStatuses = ['submitted', 'under_review', 'in_progress', 'generation_failed'];

    const { data: updatedOrders, error: updateError } = await adminClient
      .from('orders')
      .update({
        status: 'pending_review',
        updated_at: new Date().toISOString()
      })
      .in('status', stuckStatuses)
      .select('id, order_number');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log the action
    await adminClient.from('automation_logs').insert({
      action_type: 'status_changed',
      action_details: {
        change_type: 'queue_reset',
        updated_by: user.id,
        orders_updated: updatedOrders?.length || 0,
        previous_statuses: statusCounts,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedOrders?.length || 0} orders to pending_review`,
      previous_statuses: statusCounts,
      orders_updated: updatedOrders?.map(o => o.order_number) || [],
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
