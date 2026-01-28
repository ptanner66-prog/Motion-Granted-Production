/**
 * Workflow Cancel API
 *
 * Cancels a workflow and marks the order accordingly.
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
    const { workflowId, reason } = body;

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    // Get current workflow state
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('id, order_id, current_phase, status')
      .eq('id', workflowId)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Update workflow to cancelled
    const { error: updateError } = await supabase
      .from('order_workflows')
      .update({
        status: 'cancelled',
        error_message: reason || 'Cancelled by admin',
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
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflow.order_id);

    return NextResponse.json({
      success: true,
      message: 'Workflow cancelled',
      workflowId,
    });
  } catch (error) {
    console.error('[Workflow Cancel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
