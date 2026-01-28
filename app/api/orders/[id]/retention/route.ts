// app/api/orders/[id]/retention/route.ts
// Retention status and management API
// Task 45 | Version 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRetentionStatus, extendRetention } from '@/lib/retention';
import { deleteOrderData } from '@/lib/retention';
import { logActivity } from '@/lib/activity/activity-logger';

/**
 * GET /api/orders/[id]/retention
 * Get retention status for an order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns this order (or is admin)
    const { data: order } = await supabase
      .from('orders')
      .select('user_id')
      .eq('id', id)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    if (!order || (order.user_id !== user.id && !isAdmin)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const status = await getRetentionStatus(id);

    if (!status) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('[API] Retention GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/orders/[id]/retention
 * Extend or delete retention
 *
 * Body: { action: 'extend' | 'delete', new_expiration_date?: string, confirm?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns this order (or is admin)
    const { data: order } = await supabase
      .from('orders')
      .select('user_id')
      .eq('id', id)
      .single();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    if (!order || (order.user_id !== user.id && !isAdmin)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, new_expiration_date, confirm } = body;

    // EXTEND RETENTION
    if (action === 'extend') {
      if (!new_expiration_date) {
        return NextResponse.json(
          { error: 'new_expiration_date required for extend action' },
          { status: 400 }
        );
      }

      const expirationDate = new Date(new_expiration_date);
      if (isNaN(expirationDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format' },
          { status: 400 }
        );
      }

      const result = await extendRetention(id, expirationDate);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      await logActivity({
        user_id: user.id,
        action: 'retention.extended',
        resource_type: 'order',
        resource_id: id,
        details: { new_expiration_date: result.retention_expires_at },
      });

      return NextResponse.json({
        success: true,
        retention_expires_at: result.retention_expires_at,
        days_remaining: result.days_remaining,
      });
    }

    // DELETE NOW
    if (action === 'delete') {
      if (confirm !== true) {
        return NextResponse.json(
          { error: 'Must confirm deletion with confirm: true' },
          { status: 400 }
        );
      }

      const deletionType = isAdmin ? 'ADMIN' : 'CUSTOMER_REQUESTED';
      const result = await deleteOrderData(id, deletionType, user.id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        deleted_at: result.deleted_at,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "extend" or "delete"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Retention POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
