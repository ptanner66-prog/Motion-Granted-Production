/**
 * Workflow API - Main Endpoint
 *
 * GET: List workflows or get workflow by order ID
 * POST: Start a new workflow
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startWorkflow, getWorkflowProgress } from '@/lib/workflow';
import type { WorkflowPath } from '@/types/workflow';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const workflowId = searchParams.get('workflowId');

  try {
    if (workflowId) {
      // Get specific workflow progress
      const result = await getWorkflowProgress(workflowId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(result.data);
    }

    if (orderId) {
      // Get workflow for specific order
      const { data: workflow, error } = await supabase
        .from('order_workflows')
        .select(`
          *,
          motion_types(*),
          workflow_phase_executions(*)
        `)
        .eq('order_id', orderId)
        .single();

      if (error) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }

      return NextResponse.json(workflow);
    }

    // List all workflows (admin only)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: workflows, error: listError } = await supabase
      .from('order_workflows')
      .select(`
        *,
        motion_types(code, name, tier),
        orders(order_number, client_id)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    return NextResponse.json(workflows);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const body = await request.json();
    const { orderId, motionTypeId, workflowPath = 'path_a' } = body;

    if (!orderId || !motionTypeId) {
      return NextResponse.json(
        { error: 'orderId and motionTypeId are required' },
        { status: 400 }
      );
    }

    // Validate workflow path
    if (workflowPath !== 'path_a' && workflowPath !== 'path_b') {
      return NextResponse.json(
        { error: 'Invalid workflow path' },
        { status: 400 }
      );
    }

    const result = await startWorkflow({
      orderId,
      motionTypeId,
      workflowPath: workflowPath as WorkflowPath,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
