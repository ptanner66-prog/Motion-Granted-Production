// /app/api/orders/[id]/download/route.ts
// Secure deliverable download endpoint with signed URLs
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateOrderDeliverableUrls } from '@/lib/storage/signed-url';
import { logAdminActivity } from '@/lib/services/admin-activity-log';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-orders-download');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await params;

    // Check if admin or order owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    // SP12-05 FIX: Changed user_id to client_id — orders table uses client_id, not user_id.
    // Without this fix, the query returned null for user_id and non-admin downloads always failed.
    const { data: order } = await supabase
      .from('orders')
      .select('client_id, status')
      .eq('id', orderId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify access
    if (!isAdmin && order.client_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check order status — D8-CORR-001: DISPUTED added (attorney needs files during Stripe dispute)
    const DOWNLOAD_ALLOWED_STATUSES = [
      'AWAITING_APPROVAL',
      'COMPLETED',
      'DISPUTED',       // D8-CORR-001: attorney needs files during Stripe dispute
      'REVISION_REQ',   // attorney may need files during revision
      'delivered',       // Legacy status
      'completed',       // Legacy lowercase
    ];
    if (!DOWNLOAD_ALLOWED_STATUSES.includes(order.status)) {
      return NextResponse.json({
        error: 'Deliverables not yet available'
      }, { status: 400 });
    }

    // Generate signed URLs
    const result = await generateOrderDeliverableUrls(orderId, order.client_id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log admin access
    if (isAdmin && order.client_id !== user.id) {
      await logAdminActivity({
        adminUserId: user.id,
        action: 'DOWNLOAD_DELIVERABLE',
        targetType: 'order',
        targetId: orderId,
        details: { deliverable_count: result.urls.length },
      });
    }

    return NextResponse.json({
      success: true,
      orderId,
      deliverables: result.urls,
    });
  } catch (error) {
    log.error('Download error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
