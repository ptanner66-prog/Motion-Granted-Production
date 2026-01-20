/**
 * Start Automation API
 *
 * POST: Start the workflow automation for an order
 *       Called by client after documents are uploaded
 *       Or by admin via workflow control panel
 *
 * This ensures documents are uploaded BEFORE automation starts,
 * preventing the race condition where AI generates without documents.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startOrderAutomation } from '@/lib/workflow/automation-service';

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
    .select('id, client_id, status, order_number')
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
  const validStatuses = ['submitted', 'under_review', 'assigned'];
  if (!validStatuses.includes(order.status)) {
    return NextResponse.json({
      error: `Order is already in '${order.status}' status. Automation can only be started for new orders.`,
      orderStatus: order.status,
    }, { status: 400 });
  }

  // Check if order has documents (optional warning, not blocking)
  const { count: documentCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .neq('document_type', 'deliverable');

  try {
    // Start the automation
    const result = await startOrderAutomation(orderId, {
      autoRun: true,
      generatePDF: true,
      sendNotifications: true,
    });

    if (!result.success) {
      return NextResponse.json({
        error: result.error || 'Failed to start automation',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order.order_number,
      workflowId: result.data?.workflowId,
      documentsFound: documentCount || 0,
      message: documentCount && documentCount > 0
        ? `Automation started with ${documentCount} document(s).`
        : 'Automation started. Note: No documents were found - motion will be generated from checkout data only.',
    });
  } catch (error) {
    console.error('Start automation error:', error);
    return NextResponse.json({
      error: 'Failed to start automation. Please try again or contact support.',
    }, { status: 500 });
  }
}
