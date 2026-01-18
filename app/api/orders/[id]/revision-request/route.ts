/**
 * Client Revision Request API
 *
 * Allows clients to request one revision on their delivered motion.
 * The feedback goes to the admin who can then use Claude chat to revise.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: orderId } = await params;

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { feedback } = await request.json();

    if (!feedback || feedback.trim().length < 10) {
      return NextResponse.json({
        error: 'Please provide detailed feedback (at least 10 characters)',
      }, { status: 400 });
    }

    // Get order and verify ownership
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id, status, order_number')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check order is in delivered status
    if (order.status !== 'draft_delivered' && order.status !== 'revision_delivered') {
      return NextResponse.json({
        error: 'Revisions can only be requested on delivered orders',
      }, { status: 400 });
    }

    // Check if client has already used their revision
    const { data: existingRequests, error: requestError } = await supabase
      .from('revision_requests')
      .select('id, status')
      .eq('order_id', orderId);

    if (requestError) {
      return NextResponse.json({ error: 'Failed to check revision history' }, { status: 500 });
    }

    // Count completed revisions
    const completedRevisions = existingRequests?.filter(
      (r: { id: string; status: string }) => r.status === 'completed'
    ).length || 0;

    if (completedRevisions >= 1) {
      return NextResponse.json({
        error: 'You have already used your one free revision for this order',
      }, { status: 400 });
    }

    // Check if there's already a pending revision request
    const pendingRequest = existingRequests?.find(
      (r: { id: string; status: string }) => r.status === 'pending' || r.status === 'in_progress'
    );

    if (pendingRequest) {
      return NextResponse.json({
        error: 'You already have a pending revision request for this order',
      }, { status: 400 });
    }

    // Create revision request
    const { data: revisionRequest, error: createError } = await supabase
      .from('revision_requests')
      .insert({
        order_id: orderId,
        feedback: feedback.trim(),
        status: 'pending',
      })
      .select()
      .single();

    if (createError || !revisionRequest) {
      console.error('Failed to create revision request:', createError);
      return NextResponse.json({ error: 'Failed to submit revision request' }, { status: 500 });
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'revision_requested',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // Log the event
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'revision_requested',
      action_details: {
        requestId: revisionRequest.id,
        clientId: user.id,
        feedbackLength: feedback.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Revision request submitted successfully',
      requestId: revisionRequest.id,
    });
  } catch (error) {
    console.error('Revision request error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to submit revision request',
    }, { status: 500 });
  }
}

/**
 * GET: Check revision request status
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: orderId } = await params;

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if user is client or admin
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

    // Get revision requests
    const { data: requests, error: requestError } = await supabase
      .from('revision_requests')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (requestError) {
      return NextResponse.json({ error: 'Failed to fetch revision requests' }, { status: 500 });
    }

    const completedCount = requests?.filter((r: { status: string }) => r.status === 'completed').length || 0;
    const canRequestRevision = completedCount < 1 && !requests?.some(
      (r: { status: string }) => r.status === 'pending' || r.status === 'in_progress'
    );

    return NextResponse.json({
      requests: requests || [],
      canRequestRevision,
      revisionsUsed: completedCount,
      revisionsAllowed: 1,
    });
  } catch (error) {
    console.error('Get revision requests error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get revision requests',
    }, { status: 500 });
  }
}
