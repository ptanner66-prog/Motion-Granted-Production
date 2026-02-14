/**
 * HOLD Checkpoint Response API
 *
 * POST: Process customer response to HOLD checkpoint (Protocol 8)
 *
 * Source: CMS 22
 * Customer options:
 * - PROVIDE_ADDITIONAL_EVIDENCE: Upload more docs
 * - PROCEED_WITH_ACKNOWLEDGMENT: Confirm risk understood
 * - CANCEL_ORDER: Full refund
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processHoldResponse, type HoldResponse } from '@/lib/workflow/checkpoint-service';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-workflow-hold-response');

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    log.warn('Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      orderId,
      workflowId,
      responseType,
      acknowledgmentText,
      newDocumentIds,
    } = body;

    // Validate required fields
    if (!orderId && !workflowId) {
      return NextResponse.json(
        { error: 'Either orderId or workflowId is required' },
        { status: 400 }
      );
    }

    if (!responseType) {
      return NextResponse.json(
        { error: 'responseType is required' },
        { status: 400 }
      );
    }

    // Validate responseType
    const validResponses = ['PROVIDE_ADDITIONAL_EVIDENCE', 'PROCEED_WITH_ACKNOWLEDGMENT', 'CANCEL_ORDER'];
    if (!validResponses.includes(responseType)) {
      return NextResponse.json(
        { error: `Invalid responseType. Must be one of: ${validResponses.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate response-specific requirements
    if (responseType === 'PROCEED_WITH_ACKNOWLEDGMENT' && !acknowledgmentText) {
      return NextResponse.json(
        { error: 'acknowledgmentText is required for PROCEED_WITH_ACKNOWLEDGMENT' },
        { status: 400 }
      );
    }

    if (responseType === 'PROVIDE_ADDITIONAL_EVIDENCE' && (!newDocumentIds || newDocumentIds.length === 0)) {
      return NextResponse.json(
        { error: 'newDocumentIds are required for PROVIDE_ADDITIONAL_EVIDENCE' },
        { status: 400 }
      );
    }

    // Get workflow ID if only orderId provided
    let resolvedWorkflowId = workflowId;
    if (!resolvedWorkflowId && orderId) {
      const { data: workflow, error: wfError } = await supabase
        .from('order_workflows')
        .select('id')
        .eq('order_id', orderId)
        .eq('checkpoint_pending', 'HOLD')
        .single();

      if (wfError || !workflow) {
        return NextResponse.json(
          { error: 'No HOLD checkpoint found for this order' },
          { status: 404 }
        );
      }

      resolvedWorkflowId = workflow.id;
    }

    // Verify the workflow belongs to this user's order (or user is admin)
    const { data: workflow, error: wfCheckError } = await supabase
      .from('order_workflows')
      .select('order_id, orders(client_id)')
      .eq('id', resolvedWorkflowId)
      .single();

    if (wfCheckError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const order = workflow.orders as { client_id: string };

    // Check authorization - must be order owner or admin/clerk
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
    const isOwner = order.client_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'You do not have permission to respond to this HOLD' },
        { status: 403 }
      );
    }

    // Build the response object
    const holdResponse: HoldResponse = {
      responseType: responseType as HoldResponse['responseType'],
      acknowledgmentText,
      newDocumentIds,
    };

    // Process the HOLD response
    const result = await processHoldResponse(resolvedWorkflowId, holdResponse);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process HOLD response' },
        { status: 400 }
      );
    }

    // Log the response
    await supabase.from('automation_logs').insert({
      order_id: workflow.order_id,
      action_type: 'hold_response_api_processed',
      action_details: {
        workflowId: resolvedWorkflowId,
        responseType,
        initiatedBy: user.id,
        result: result.data,
      },
    });

    return NextResponse.json({
      success: true,
      message: `HOLD response processed: ${responseType}`,
      data: result.data,
    });
  } catch (error) {
    log.error('Hold response error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Failed to process HOLD response. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET: Check HOLD status for an order/workflow
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');
  const workflowId = searchParams.get('workflowId');

  if (!orderId && !workflowId) {
    return NextResponse.json(
      { error: 'Either orderId or workflowId is required' },
      { status: 400 }
    );
  }

  try {
    let query = supabase
      .from('order_workflows')
      .select(`
        id,
        status,
        checkpoint_pending,
        checkpoint_data,
        hold_triggered_at,
        hold_reason,
        hold_response,
        hold_response_at,
        hold_acknowledgment_text,
        orders(id, order_number, client_id)
      `);

    if (workflowId) {
      query = query.eq('id', workflowId);
    } else if (orderId) {
      query = query.eq('order_id', orderId);
    }

    const { data: workflow, error } = await query.single();

    if (error || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const order = workflow.orders as { id: string; order_number: string; client_id: string };

    // Check authorization
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'clerk';
    const isOwner = order.client_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'You do not have permission to view this workflow' },
        { status: 403 }
      );
    }

    const isOnHold = workflow.checkpoint_pending === 'HOLD';

    return NextResponse.json({
      isOnHold,
      workflowId: workflow.id,
      orderNumber: order.order_number,
      status: workflow.status,
      holdDetails: isOnHold ? {
        triggeredAt: workflow.hold_triggered_at,
        reason: workflow.hold_reason,
        checkpointData: workflow.checkpoint_data,
        response: workflow.hold_response,
        respondedAt: workflow.hold_response_at,
        acknowledgmentText: workflow.hold_acknowledgment_text,
      } : null,
    });
  } catch (error) {
    log.error('Hold response GET error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      { error: 'Failed to get HOLD status' },
      { status: 500 }
    );
  }
}
