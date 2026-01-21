/**
 * Automation Processing API
 *
 * Endpoints for triggering and managing the automated motion drafting workflow.
 *
 * POST: Start automation for a specific order or process pending orders
 * GET: Get automation progress for an order
 */

// Vercel serverless function configuration
export const maxDuration = 300; // 5 minutes for workflow automation
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  startOrderAutomation,
  resumeOrderAutomation,
  getOrderProgress,
  processPendingOrders,
  retryFailedWorkflows,
} from '@/lib/workflow';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for admin/clerk role OR cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const isValidCron = cronSecret === process.env.CRON_SECRET;

  if (!isValidCron) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'clerk') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const body = await request.json();
    const { action, orderId, config } = body;

    switch (action) {
      case 'start': {
        // Start automation for a specific order
        if (!orderId) {
          return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
        }

        const result = await startOrderAutomation(orderId, config);

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          ...result.data,
        });
      }

      case 'resume': {
        // Resume automation for a paused/failed order
        if (!orderId) {
          return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
        }

        const result = await resumeOrderAutomation(orderId, config);

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          ...result.data,
        });
      }

      case 'process_pending': {
        // Process all pending orders (for cron job)
        const limit = body.limit || 10;
        const result = await processPendingOrders(limit);

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          ...result.data,
        });
      }

      case 'retry_failed': {
        // Retry failed workflows
        const limit = body.limit || 5;
        const result = await retryFailedWorkflows(limit);

        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          ...result.data,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: start, resume, process_pending, or retry_failed' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Automation process error:', error);
    return NextResponse.json(
      { error: 'Automation failed. Please try again.' },
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

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  try {
    // Verify user has access to this order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check ownership or admin/clerk role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isOwner = order.client_id === user.id;
    const isStaff = profile?.role === 'admin' || profile?.role === 'clerk';

    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get progress
    const result = await getOrderProgress(orderId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Get progress error:', error);
    return NextResponse.json(
      { error: 'Failed to get progress. Please try again.' },
      { status: 500 }
    );
  }
}
