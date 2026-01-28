/**
 * Checkpoint API Endpoint
 *
 * v6.3: Handles checkpoint interactions for the three customer checkpoints.
 *
 * GET /api/workflow/checkpoint?workflowId=xxx
 *   Returns checkpoint data for display
 *
 * POST /api/workflow/checkpoint
 *   Processes customer response to checkpoint
 *   Body: { workflowId, checkpoint, action, notes? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCheckpointData,
  processCheckpointResponse,
  type CheckpointType,
} from '@/lib/workflow/checkpoint-service';

// Supported checkpoint types for this endpoint (HOLD is handled separately)
type SupportedCheckpoint = 'CP1' | 'CP2' | 'CP3';

// Valid actions for each checkpoint type
const VALID_ACTIONS: Record<SupportedCheckpoint, string[]> = {
  CP1: ['continue', 'request_changes'],
  CP2: ['approve', 'request_revisions'],
  CP3: ['confirm_receipt'],
};

/**
 * GET: Get checkpoint data for a workflow
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get workflowId from query params
  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get('workflowId');

  if (!workflowId) {
    return NextResponse.json(
      { error: 'workflowId is required' },
      { status: 400 }
    );
  }

  // Verify user has access to this workflow
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select('id, orders(client_id)')
    .eq('id', workflowId)
    .single();

  if (wfError || !workflow) {
    return NextResponse.json(
      { error: 'Workflow not found' },
      { status: 404 }
    );
  }

  // Check if user owns this order (or is admin)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const orders = workflow.orders as { client_id: string } | null;
  const isOwner = orders?.client_id === user.id;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  // Get checkpoint data
  const result = await getCheckpointData(workflowId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    hasCheckpoint: !!result.data,
    checkpoint: result.data,
  });
}

/**
 * POST: Process checkpoint response
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Parse request body
  let body: {
    workflowId: string;
    checkpoint: CheckpointType;
    action: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { workflowId, checkpoint, action, notes } = body;

  // Validate required fields
  if (!workflowId || !checkpoint || !action) {
    return NextResponse.json(
      { error: 'Missing required fields: workflowId, checkpoint, action' },
      { status: 400 }
    );
  }

  // Validate checkpoint type
  if (!['CP1', 'CP2', 'CP3', 'HOLD'].includes(checkpoint)) {
    return NextResponse.json(
      { error: 'Invalid checkpoint type. Must be CP1, CP2, CP3, or HOLD' },
      { status: 400 }
    );
  }

  // Validate action for checkpoint type
  const validActions = VALID_ACTIONS[checkpoint as SupportedCheckpoint];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action for ${checkpoint}. Valid actions: ${validActions.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify user has access to this workflow
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select('id, orders(client_id)')
    .eq('id', workflowId)
    .single();

  if (wfError || !workflow) {
    return NextResponse.json(
      { error: 'Workflow not found' },
      { status: 404 }
    );
  }

  // Check if user owns this order (or is admin)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const orders = workflow.orders as { client_id: string } | null;
  const isOwner = orders?.client_id === user.id;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  // Process the checkpoint response
  const result = await processCheckpointResponse(workflowId, {
    checkpoint,
    action: action as 'continue' | 'request_changes' | 'approve' | 'request_revisions' | 'confirm_receipt',
    notes,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    nextPhase: result.data?.nextPhase,
    requiresPayment: result.data?.requiresPayment,
    paymentUrl: result.data?.paymentUrl,
    revisionId: result.data?.revisionId,
  });
}
