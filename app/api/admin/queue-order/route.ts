/**
 * Admin endpoint to manually queue an order for generation
 *
 * POST /api/admin/queue-order
 * Triggers the Inngest queue for a specific order
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest, calculatePriority } from '@/lib/inngest/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-queue-order');

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }

  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, filing_deadline, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Reset order status to submitted so it can be processed
    await supabase
      .from('orders')
      .update({
        status: 'submitted',
        generation_error: null,
        generation_started_at: null,
        generation_completed_at: null,
      })
      .eq('id', orderId);

    // Calculate priority based on filing deadline
    const priority = calculatePriority(order.filing_deadline);

    // Send event to Inngest queue
    await inngest.send({
      name: 'order/submitted',
      data: {
        orderId,
        priority,
        filingDeadline: order.filing_deadline,
        manual: true,
      },
    });

    // Log the queue event
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'queued_for_generation',
      action_details: {
        priority,
        triggeredBy: user.id,
        manual: true,
        previousStatus: order.status,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Order ${order.order_number} queued for generation`,
      orderId,
      orderNumber: order.order_number,
      priority,
    });
  } catch (error) {
    log.error('Queue order error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to queue order',
    }, { status: 500 });
  }
}
