/**
 * Workflow Orchestration API
 *
 * POST: Start and optionally run complete workflow for an order
 * GET: Get workflow status and superprompt
 *
 * This endpoint combines checkout data + documents + superprompt
 * and runs the complete 9-phase workflow.
 */

// Vercel serverless function configuration
export const maxDuration = 300; // 5 minutes for orchestration
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  orchestrateWorkflow,
  gatherOrderContext,
  getWorkflowSuperprompt,
  buildSuperprompt,
  getWorkflowProgress,
} from '@/lib/workflow';
import { getTemplateForPath } from '@/lib/workflow/motion-templates';
import type { WorkflowPath, MotionTier } from '@/types/workflow';

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      orderId,
      autoRun = false,
      workflowPath = 'path_a',
      skipDocumentParsing = false,
    } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Validate workflow path
    if (workflowPath !== 'path_a' && workflowPath !== 'path_b') {
      return NextResponse.json({ error: 'Invalid workflow path' }, { status: 400 });
    }

    // Run orchestration
    const result = await orchestrateWorkflow(orderId, {
      autoRun,
      workflowPath: workflowPath as WorkflowPath,
      skipDocumentParsing,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ...result.data,
    });
  } catch (error) {
    console.error('Orchestration error:', error);
    return NextResponse.json(
      { error: 'Orchestration failed. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const workflowId = searchParams.get('workflowId');
  const includeSuperprompt = searchParams.get('includeSuperprompt') === 'true';
  const includeContext = searchParams.get('includeContext') === 'true';

  try {
    // If workflowId provided, get workflow status
    if (workflowId) {
      const progress = await getWorkflowProgress(workflowId);

      if (!progress.success) {
        return NextResponse.json({ error: progress.error }, { status: 404 });
      }

      const response: Record<string, unknown> = {
        ...progress.data,
      };

      if (includeSuperprompt) {
        const superpromptResult = await getWorkflowSuperprompt(workflowId);
        if (superpromptResult.success) {
          response.superprompt = superpromptResult.data;
        }
      }

      return NextResponse.json(response);
    }

    // If orderId provided, get/build context
    if (orderId) {
      const contextResult = await gatherOrderContext(orderId);

      if (!contextResult.success || !contextResult.data) {
        return NextResponse.json({ error: contextResult.error }, { status: 404 });
      }

      const context = contextResult.data;

      // Check if workflow exists
      const { data: existingWorkflow } = await supabase
        .from('order_workflows')
        .select('id, status, current_phase, workflow_path')
        .eq('order_id', orderId)
        .single();

      const response: Record<string, unknown> = {
        orderId,
        orderNumber: context.orderNumber,
        motionType: context.motionType,
        hasWorkflow: !!existingWorkflow,
        workflowId: existingWorkflow?.id || null,
        workflowStatus: existingWorkflow?.status || null,
        currentPhase: existingWorkflow?.current_phase || null,
        documentCount: context.documents.parsed.length,
        hasStatementOfFacts: !!context.statementOfFacts,
        hasProceduralHistory: !!context.proceduralHistory,
        hasInstructions: !!context.instructions,
        partyCount: context.parties.length,
      };

      if (includeContext) {
        response.context = context;
      }

      if (includeSuperprompt) {
        // Build superprompt
        const workflowPath = (existingWorkflow?.workflow_path || 'path_a') as WorkflowPath;
        const motionCode = mapMotionTypeToCode(context.motionType, context.motionTier);
        const motionTemplate = getTemplateForPath(motionCode, workflowPath);

        response.superprompt = buildSuperprompt({
          orderContext: context,
          motionTemplate,
          workflowPath,
        });
      }

      return NextResponse.json(response);
    }

    return NextResponse.json(
      { error: 'Either orderId or workflowId is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Get orchestration status error:', error);
    return NextResponse.json(
      { error: 'Failed to get status. Please try again.' },
      { status: 500 }
    );
  }
}

// Helper function to map motion type to code
function mapMotionTypeToCode(motionType: string, tier: MotionTier): string {
  const normalized = motionType.toUpperCase().replace(/\s+/g, '_');

  const mappings: Record<string, string> = {
    'MOTION_TO_DISMISS': 'MTD_12B6',
    'DISMISS': 'MTD_12B6',
    'SUMMARY_JUDGMENT': 'MSJ',
    'MOTION_TO_COMPEL': 'MCOMPEL',
    'CONTINUE': 'MTC',
    'STRIKE': 'MSTRIKE',
    'EXTENSION': 'MEXT',
    'PRO_HAC_VICE': 'MPRO_HAC',
  };

  if (mappings[normalized]) {
    return mappings[normalized];
  }

  const tierDefaults: Record<MotionTier, string> = {
    'A': 'MTD_12B6',
    'B': 'MTC',
    'C': 'MEXT',
  };

  return tierDefaults[tier] || 'MTC';
}
