/**
 * HOLD Response Handler API
 *
 * POST: Handle customer response when Protocol 8 (HOLD) is triggered
 *
 * Options:
 * - PROVIDE_EVIDENCE: Customer uploads additional documents
 * - PROCEED_WITH_ACKNOWLEDGMENT: Customer acknowledges weakness and proceeds
 * - CANCEL: Customer cancels the order
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resumeOrderAutomation } from '@/lib/workflow/automation-service';

type HoldResponse = 'PROVIDE_EVIDENCE' | 'PROCEED_WITH_ACKNOWLEDGMENT' | 'CANCEL';

interface HoldResponsePayload {
  orderId: string;
  response: HoldResponse;
  acknowledgmentText?: string;
  newDocumentIds?: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: HoldResponsePayload = await request.json();

    // Validate required fields
    if (!body.orderId || !body.response) {
      return NextResponse.json(
        { error: 'orderId and response are required' },
        { status: 400 }
      );
    }

    // Validate response type
    const validResponses: HoldResponse[] = ['PROVIDE_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'CANCEL'];
    if (!validResponses.includes(body.response)) {
      return NextResponse.json(
        { error: `Invalid response. Must be one of: ${validResponses.join(', ')}` },
        { status: 400 }
      );
    }

    // Get order and verify ownership or admin status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number')
      .eq('id', body.orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check authorization
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
    const isOwner = order.client_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if order has an active HOLD
    const { data: workflow, error: wfError } = await supabase
      .from('order_workflows')
      .select('id, hold_checkpoint_triggered, hold_reason, metadata')
      .eq('order_id', body.orderId)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'No active workflow found' }, { status: 404 });
    }

    if (!workflow.hold_checkpoint_triggered) {
      return NextResponse.json(
        { error: 'Order does not have an active HOLD checkpoint' },
        { status: 400 }
      );
    }

    // Handle based on response type
    switch (body.response) {
      case 'PROVIDE_EVIDENCE':
        return await handleProvideEvidence(
          supabase,
          body.orderId,
          workflow.id,
          body.newDocumentIds || [],
          user.id
        );

      case 'PROCEED_WITH_ACKNOWLEDGMENT':
        if (!body.acknowledgmentText) {
          return NextResponse.json(
            { error: 'acknowledgmentText is required for PROCEED_WITH_ACKNOWLEDGMENT' },
            { status: 400 }
          );
        }
        return await handleProceedWithAcknowledgment(
          supabase,
          body.orderId,
          workflow.id,
          body.acknowledgmentText,
          user.id
        );

      case 'CANCEL':
        return await handleCancel(supabase, body.orderId, workflow.id, user.id, order.order_number);

      default:
        return NextResponse.json({ error: 'Invalid response type' }, { status: 400 });
    }
  } catch (error) {
    console.error('HOLD response error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process HOLD response' },
      { status: 500 }
    );
  }
}

async function handleProvideEvidence(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orderId: string,
  workflowId: string,
  newDocumentIds: string[],
  userId: string
) {
  // Validate documents exist
  if (newDocumentIds.length === 0) {
    return NextResponse.json(
      { error: 'At least one document must be provided' },
      { status: 400 }
    );
  }

  // Update workflow to clear HOLD and restart at Phase III
  const { error: updateError } = await supabase
    .from('order_workflows')
    .update({
      hold_checkpoint_triggered: false,
      hold_response: 'PROVIDE_EVIDENCE',
      hold_response_at: new Date().toISOString(),
      current_phase: 2, // Restart at Phase II to process new documents
      status: 'in_progress',
      metadata: supabase.rpc('jsonb_set', {
        target: 'metadata',
        path: '{hold_response_data}',
        value: JSON.stringify({
          response: 'PROVIDE_EVIDENCE',
          newDocumentIds,
          respondedAt: new Date().toISOString(),
          respondedBy: userId,
        }),
      }),
    })
    .eq('id', workflowId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Update order status
  await supabase
    .from('orders')
    .update({ status: 'in_progress' })
    .eq('id', orderId);

  // Log the response
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'hold_response_provide_evidence',
    action_details: {
      newDocumentIds,
      respondedBy: userId,
      respondedAt: new Date().toISOString(),
    },
  });

  // Resume workflow
  const resumeResult = await resumeOrderAutomation(orderId);

  return NextResponse.json({
    success: true,
    message: 'Additional evidence received. Workflow restarting at document processing phase.',
    workflowStatus: resumeResult.data?.status,
  });
}

async function handleProceedWithAcknowledgment(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orderId: string,
  workflowId: string,
  acknowledgmentText: string,
  userId: string
) {
  // Update workflow to clear HOLD and continue
  const { error: updateError } = await supabase
    .from('order_workflows')
    .update({
      hold_checkpoint_triggered: false,
      hold_response: 'PROCEED_WITH_ACKNOWLEDGMENT',
      hold_response_at: new Date().toISOString(),
      hold_acknowledgment_text: acknowledgmentText,
      status: 'in_progress',
    })
    .eq('id', workflowId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Update order status
  await supabase
    .from('orders')
    .update({ status: 'in_progress' })
    .eq('id', orderId);

  // Log the response
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'hold_response_proceed_acknowledged',
    action_details: {
      acknowledgmentText,
      respondedBy: userId,
      respondedAt: new Date().toISOString(),
    },
  });

  // Resume workflow
  const resumeResult = await resumeOrderAutomation(orderId);

  return NextResponse.json({
    success: true,
    message: 'Acknowledgment recorded. Workflow continuing with enhanced disclosure in Attorney Instruction Sheet.',
    workflowStatus: resumeResult.data?.status,
    note: 'The acknowledged weakness will be documented in the final deliverables.',
  });
}

async function handleCancel(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  orderId: string,
  workflowId: string,
  userId: string,
  orderNumber: string
) {
  // Update workflow
  const { error: wfUpdateError } = await supabase
    .from('order_workflows')
    .update({
      hold_response: 'CANCEL',
      hold_response_at: new Date().toISOString(),
      status: 'failed',
    })
    .eq('id', workflowId);

  if (wfUpdateError) {
    return NextResponse.json({ error: wfUpdateError.message }, { status: 500 });
  }

  // Update order status
  await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Log the cancellation
  await supabase.from('automation_logs').insert({
    order_id: orderId,
    action_type: 'hold_response_cancelled',
    action_details: {
      respondedBy: userId,
      respondedAt: new Date().toISOString(),
      reason: 'Customer cancelled due to HOLD checkpoint',
    },
  });

  // TODO: Trigger refund process

  return NextResponse.json({
    success: true,
    message: `Order ${orderNumber} has been cancelled. Refund will be processed per cancellation policy.`,
    status: 'cancelled',
  });
}

/**
 * GET: Check HOLD status for an order
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get order and verify access
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
  const isOwner = order.client_id === user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get workflow HOLD status
  const { data: workflow, error: wfError } = await supabase
    .from('order_workflows')
    .select(`
      id,
      hold_checkpoint_triggered,
      hold_reason,
      hold_response,
      hold_response_at,
      hold_acknowledgment_text,
      current_phase,
      status
    `)
    .eq('order_id', orderId)
    .single();

  if (wfError) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    holdStatus: {
      isOnHold: workflow?.hold_checkpoint_triggered || false,
      reason: workflow?.hold_reason,
      response: workflow?.hold_response,
      responseAt: workflow?.hold_response_at,
      acknowledgment: workflow?.hold_acknowledgment_text,
      currentPhase: workflow?.current_phase,
      workflowStatus: workflow?.status,
    },
  });
}
