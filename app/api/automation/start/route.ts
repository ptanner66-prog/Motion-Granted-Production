/**
 * Start Automation API
 *
 * POST: Start the workflow automation for an order via Inngest queue
 *       Called by client after documents are uploaded
 *       Or by admin via workflow control panel
 *
 * This ensures documents are uploaded BEFORE automation starts,
 * preventing the race condition where AI generates without documents.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest, calculatePriority } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-automation-start');

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get orderId from query string or body
  const { searchParams } = new URL(request.url);
  let orderId = searchParams.get('orderId');

  if (!orderId) {
    try {
      const body = await request.json();
      orderId = body.orderId;
    } catch {
      // No body provided
    }
  }

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 });
  }

  // Verify auth - either the order owner or an admin/clerk
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, status, order_number, filing_deadline, state, court_type, state_code')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Check authorization - must be order owner or admin/clerk
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

  // Check if order is in a valid state to start automation
  const validStatuses = ['submitted', 'under_review', 'assigned', 'SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED'];
  if (!validStatuses.includes(order.status)) {
    return NextResponse.json({
      error: `Order is already in '${order.status}' status. Automation can only be started for new orders.`,
      orderStatus: order.status,
    }, { status: 400 });
  }

  // AC-2: Validate state is enabled (catches bypass-path orders that skipped checkout Step 8)
  if (order.state_code) {
    const { data: stateRow } = await supabase
      .from('states')
      .select('enabled, name')
      .eq('code', order.state_code)
      .single();

    if (stateRow && !stateRow.enabled) {
      return NextResponse.json(
        { error: `Orders from ${stateRow.name} are not currently accepted. Please contact support.` },
        { status: 400 },
      );
    }
  }

  // AC-3: 30-second debounce (prevents rapid duplicate calls — D7-R5-009)
  const { data: orderForDebounce } = await supabase
    .from('orders')
    .select('last_workflow_trigger_at')
    .eq('id', orderId)
    .single();

  if (orderForDebounce?.last_workflow_trigger_at) {
    const lastTrigger = new Date(orderForDebounce.last_workflow_trigger_at).getTime();
    const thirtySecondsAgo = Date.now() - 30000;
    if (lastTrigger > thirtySecondsAgo) {
      return NextResponse.json(
        { error: 'Workflow already triggered. Please wait.' },
        { status: 409 },
      );
    }
  }

  // Check if order has documents (optional warning, not blocking)
  const { count: documentCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .neq('document_type', 'deliverable');

  try {
    // Calculate priority based on filing deadline (closer deadline = higher priority)
    const priority = calculatePriority(order.filing_deadline);

    // AC-3: Set trigger timestamp before sending event (D7-R5-009)
    await supabase
      .from('orders')
      .update({ last_workflow_trigger_at: new Date().toISOString() })
      .eq('id', orderId);

    // Send event to Inngest queue — BD-6: stateCode + courtType, NOT jurisdiction
    await inngest.send({
      name: 'order/submitted',
      data: {
        orderId,
        priority,
        filingDeadline: order.filing_deadline,
        stateCode: order.state || undefined,
        courtType: order.court_type || undefined,
      },
    });

    // Update order status to show it's queued
    await supabase
      .from('orders')
      .update({ status: 'UNDER_REVIEW' })
      .eq('id', orderId);

    // Log the queue event
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'queued_for_generation',
      action_details: {
        priority,
        documentsFound: documentCount || 0,
        queuedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      status: 'queued',
      priority,
      documentsFound: documentCount || 0,
      message: documentCount && documentCount > 0
        ? `Order queued for processing with ${documentCount} document(s). Priority: ${priority}`
        : 'Order queued for processing. Note: No documents were found - motion will be generated from checkout data only.',
    });
  } catch (error) {
    log.error('Queue automation error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to queue automation',
    }, { status: 500 });
  }
}
