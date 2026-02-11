/**
 * Admin Revision Request Management API
 *
 * Allows admins to update revision request status and add responses.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { queueOrderNotification } from '@/lib/automation/notification-sender';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: requestId } = await params;

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    const { status, admin_response } = await request.json();

    if (!status || !['in_progress', 'completed', 'rejected'].includes(status)) {
      return NextResponse.json({
        error: 'Invalid status. Must be: in_progress, completed, or rejected',
      }, { status: 400 });
    }

    // Get the revision request
    const { data: revisionRequest, error: fetchError } = await supabase
      .from('revision_requests')
      .select('*, orders(id, order_number, client_id, profiles(full_name, email))')
      .eq('id', requestId)
      .single();

    if (fetchError || !revisionRequest) {
      return NextResponse.json({ error: 'Revision request not found' }, { status: 404 });
    }

    // Update the revision request
    const updateData: Record<string, unknown> = { status };

    if (status === 'completed' || status === 'rejected') {
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = user.id;
    }

    if (admin_response) {
      updateData.admin_response = admin_response;
    }

    const { error: updateError } = await supabase
      .from('revision_requests')
      .update(updateData)
      .eq('id', requestId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update revision request' }, { status: 500 });
    }

    // If completed, update order status and notify client
    if (status === 'completed') {
      // Update order status
      await supabase
        .from('orders')
        .update({
          status: 'revision_delivered',
          updated_at: new Date().toISOString(),
        })
        .eq('id', revisionRequest.orders.id);

      // Log the event
      await supabase.from('automation_logs').insert({
        order_id: revisionRequest.orders.id,
        action_type: 'revision_completed',
        action_details: {
          requestId,
          completedBy: user.id,
          completedByName: profile.full_name,
          adminResponse: admin_response,
        },
      });

      // Notify the client
      const orderData = revisionRequest.orders as {
        id: string;
        profiles: { full_name: string; email: string } | null;
      };

      if (orderData.profiles?.email) {
        await queueOrderNotification(revisionRequest.orders.id, 'revision_ready', {
          clientName: orderData.profiles.full_name || 'Client',
          clientEmail: orderData.profiles.email,
          adminResponse: admin_response,
        }).catch(err => {
          console.error('Failed to queue notification:', err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: status === 'completed' ? 'Revision completed and client notified' : 'Status updated',
    });
  } catch (error) {
    console.error('Update revision request error:', error);
    return NextResponse.json({
      error: 'Failed to update revision request. Please try again.',
    }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: requestId } = await params;

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
    return NextResponse.json({ error: 'Forbidden - Admin/Clerk only' }, { status: 403 });
  }

  try {
    const { data: revisionRequest, error } = await supabase
      .from('revision_requests')
      .select('*, orders(id, order_number)')
      .eq('id', requestId)
      .single();

    if (error || !revisionRequest) {
      return NextResponse.json({ error: 'Revision request not found' }, { status: 404 });
    }

    return NextResponse.json({ request: revisionRequest });
  } catch (error) {
    console.error('Get revision request error:', error);
    return NextResponse.json({
      error: 'Failed to get revision request. Please try again.',
    }, { status: 500 });
  }
}
