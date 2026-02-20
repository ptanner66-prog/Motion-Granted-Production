/**
 * Admin Deliver Route — POST /api/admin/orders/[id]/deliver
 *
 * Called by ApproveDeliverButton.tsx to deliver a completed motion
 * to the hiring attorney. This route:
 *
 * 1. Validates admin auth
 * 2. Loads documents for the order
 * 3. Generates signed download URLs (7-day expiry)
 * 4. Updates order status via status machine (A16-DEC-4)
 * 5. Queues delivery notification via notification_queue (A16-DEC-1)
 * 6. Writes audit log to automation_logs
 *
 * Fixes: A16-P0-001, CONFLICT-F09, A16-P0-005, A16-NEW-001/002/003
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';
import { updateOrderStatus } from '@/lib/orders/status-machine';

const log = createLogger('api-admin-deliver');

const STORAGE_BUCKET = 'order-documents';
const SIGNED_URL_EXPIRY = 604800; // 7 days

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();

  // 1. Validate admin auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  // Parse optional audit metadata from body
  let auditAction = 'STANDARD_DELIVERY';
  let auditMetadata: Record<string, unknown> = {};
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action) auditAction = body.action;
    if (body.metadata) auditMetadata = body.metadata;
  } catch {
    // Empty body is fine
  }

  // Service-role client only for storage (signed URLs) and automation_logs
  const serviceSupabase = getServiceSupabase();

  try {
    // 2. Load order (user-scoped client — RLS enforced)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, client_id, status_version, profiles:client_id(email)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 3. Load documents for this order (user-scoped client — RLS enforced)
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('id, file_path, file_name, document_type, mime_type')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (docError) {
      log.error('Failed to load documents', { orderId, error: docError.message });
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents found for this order' }, { status: 404 });
    }

    // 4. Generate signed download URLs (service_role needed for storage)
    const downloadUrls: Array<{
      documentId: string;
      fileName: string;
      documentType: string;
      signedUrl: string | null;
      error: string | null;
    }> = [];

    for (const doc of documents) {
      if (!doc.file_path) {
        downloadUrls.push({
          documentId: doc.id,
          fileName: doc.file_name,
          documentType: doc.document_type,
          signedUrl: null,
          error: 'No file path',
        });
        continue;
      }

      const { data: signedData, error: signedError } = await serviceSupabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(doc.file_path, SIGNED_URL_EXPIRY);

      downloadUrls.push({
        documentId: doc.id,
        fileName: doc.file_name,
        documentType: doc.document_type,
        signedUrl: signedData?.signedUrl ?? null,
        error: signedError?.message ?? null,
      });
    }

    const successCount = downloadUrls.filter(u => u.signedUrl).length;
    if (successCount === 0) {
      log.error('Failed to generate any signed URLs', { orderId });
      return NextResponse.json({ error: 'Failed to generate download URLs' }, { status: 500 });
    }

    // 5. Update order status via status machine (A16-DEC-4)
    const statusResult = await updateOrderStatus(
      supabase,
      orderId,
      'COMPLETED',
      order.status_version ?? 1,
      { completed_at: new Date().toISOString() }
    );

    if (!statusResult.success) {
      log.error('Status update failed', { orderId, error: statusResult.error });
      return NextResponse.json(
        { error: statusResult.error || 'Status update failed' },
        { status: 409 }
      );
    }

    // 6. Queue delivery notification via notification_queue (A16-DEC-1)
    const clientProfile = order.profiles as { email: string } | null;
    await supabase.from('notification_queue').insert({
      notification_type: 'order_completed',
      recipient_id: order.client_id,
      recipient_email: clientProfile?.email || '',
      order_id: orderId,
      subject: `Filing Package Delivered — ${order.order_number}`,
      template_data: {
        orderNumber: order.order_number,
        documentCount: successCount,
      },
      status: 'pending',
      priority: 1,
    });

    // 7. Write audit log to automation_logs (service_role for system writes)
    await serviceSupabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'status_changed',
      action_details: {
        ...auditMetadata,
        audit_action: auditAction,
        documentCount: documents.length,
        signedUrlsGenerated: successCount,
        previousStatus: order.status,
        newStatus: 'COMPLETED',
      },
      triggered_by: user.id,
    });

    log.info('Order delivered', {
      orderId,
      orderNumber: order.order_number,
      documents: documents.length,
      signedUrls: successCount,
    });

    return NextResponse.json({
      success: true,
      downloadUrls,
      orderNumber: order.order_number,
    });
  } catch (error) {
    log.error('Deliver route error', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Delivery failed',
    }, { status: 500 });
  }
}
