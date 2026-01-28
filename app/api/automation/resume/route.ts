/**
 * Resume Workflow API
 *
 * POST: Resume a paused or failed workflow for an order
 *
 * Source: CMS 20.3
 * Requires admin or clerk role
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resumeOrderAutomation } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.warn('[Resume API] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin/clerk role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
    console.warn(`[Resume API] Forbidden access attempt by user ${user.id} with role ${profile?.role}`);
    return NextResponse.json({ error: 'Forbidden - requires admin or clerk role' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Validate orderId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return NextResponse.json({ error: 'Invalid orderId format' }, { status: 400 });
    }

    // Verify order exists and get current status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Log the resume attempt
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_resume_attempt',
      action_details: {
        initiatedBy: user.id,
        previousStatus: order.status,
        timestamp: new Date().toISOString(),
      },
    });

    // Call the resume function
    const result = await resumeOrderAutomation(orderId);

    if (!result.success) {
      // Log the failure
      await supabase.from('automation_logs').insert({
        order_id: orderId,
        action_type: 'workflow_resume_failed',
        action_details: {
          error: result.error,
          timestamp: new Date().toISOString(),
        },
      });

      return NextResponse.json(
        { error: result.error || 'Failed to resume workflow' },
        { status: 400 }
      );
    }

    // Log the success
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'workflow_resumed',
      action_details: {
        initiatedBy: user.id,
        result: result.data,
        timestamp: new Date().toISOString(),
      },
      was_auto_approved: false,
    });

    console.log(`[Resume API] Workflow resumed for order ${order.order_number} by user ${user.id}`);

    return NextResponse.json({
      success: true,
      message: `Workflow resumed for order ${order.order_number}`,
      data: result.data,
    });
  } catch (error) {
    console.error('[Resume API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to resume workflow. Please try again.' },
      { status: 500 }
    );
  }
}
