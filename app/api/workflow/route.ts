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

      if (error && error.code === '42P01') {
        // Table doesn't exist
        return NextResponse.json({ error: 'Workflow tables do not exist. Run migration first.' }, { status: 503 });
      }

      if (error) {
        // No workflow found, but that's ok
        return NextResponse.json({
          exists: false,
          orderId,
        });
      }

      // Get current phase definition
      const { data: phaseDef } = await supabase
        .from('workflow_phase_definitions')
        .select('phase_name, estimated_duration_minutes')
        .eq('workflow_path', workflow.workflow_path)
        .eq('phase_number', workflow.current_phase)
        .single();

      // Find if current phase requires review
      const currentPhaseExec = workflow.workflow_phase_executions?.find(
        (p: { phase_number: number }) => p.phase_number === workflow.current_phase
      );

      // Calculate remaining minutes
      const { data: remainingPhases } = await supabase
        .from('workflow_phase_definitions')
        .select('estimated_duration_minutes')
        .eq('workflow_path', workflow.workflow_path)
        .gte('phase_number', workflow.current_phase);

      const estimatedMinutes = (remainingPhases || []).reduce(
        (sum: number, p: { estimated_duration_minutes: number | null }) =>
          sum + (p.estimated_duration_minutes || 30),
        0
      );

      return NextResponse.json({
        exists: true,
        workflowId: workflow.id,
        orderId: workflow.order_id,
        currentPhase: workflow.current_phase,
        totalPhases: 9,
        status: workflow.status,
        citationCount: workflow.citation_count || 0,
        qualityScore: workflow.quality_score,
        currentPhaseName: phaseDef?.phase_name || `Phase ${workflow.current_phase}`,
        currentPhaseStatus: currentPhaseExec?.status,
        requiresReview: currentPhaseExec?.requires_review || currentPhaseExec?.status === 'requires_review',
        estimatedMinutes,
      });
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
    const { orderId, motionType, motionTypeId, workflowPath = 'path_a' } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
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

    // If motionTypeId provided, use it. Otherwise look up by motionType code
    let resolvedMotionTypeId = motionTypeId;

    if (!resolvedMotionTypeId && motionType) {
      // Try to find motion type in database by code
      const { data: motionTypeData, error: mtError } = await supabase
        .from('motion_types')
        .select('id')
        .eq('code', motionType.toUpperCase())
        .single();

      if (mtError && mtError.code === '42P01') {
        return NextResponse.json(
          { error: 'Workflow tables do not exist. Run migration first.' },
          { status: 503 }
        );
      }

      if (mtError) {
        // If not found by code, use a default motion type based on tier
        // For now, just get the first motion type as a fallback
        const { data: fallback } = await supabase
          .from('motion_types')
          .select('id')
          .limit(1)
          .single();

        if (fallback) {
          resolvedMotionTypeId = fallback.id;
        } else {
          return NextResponse.json(
            { error: 'No motion types configured. Run migration first.' },
            { status: 503 }
          );
        }
      } else {
        resolvedMotionTypeId = motionTypeData.id;
      }
    }

    if (!resolvedMotionTypeId) {
      return NextResponse.json(
        { error: 'Could not determine motion type for workflow' },
        { status: 400 }
      );
    }

    const result = await startWorkflow({
      orderId,
      motionTypeId: resolvedMotionTypeId,
      workflowPath: workflowPath as WorkflowPath,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Check if this is a table not found error
    if (errorMessage.includes('42P01') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Workflow tables do not exist. Run migration first.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
