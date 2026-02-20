/**
 * Admin Deliver Route — POST /api/admin/orders/[id]/deliver
 *
 * Called by ApproveDeliverButton.tsx to deliver a completed motion
 * to the hiring attorney. This route:
 *
 * 1. Validates admin auth
 * 2. Loads documents for the order
 * 3. Generates signed download URLs (7-day expiry)
 * 4. Updates order status to COMPLETED
 * 5. Queues delivery notification email
 * 6. Writes server-side audit log (fixes A16-P0-005)
 *
 * Fixes: A16-P0-001, CONFLICT-F09, A16-P0-005
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/security/logger';

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

  const serviceSupabase = getServiceSupabase();

  try {
    // 2. Load order
    const { data: order, error: orderError } = await serviceSupabase
      .from('orders')
      .select('id, order_number, status, client_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 3. Load documents for this order
    const { data: documents, error: docError } = await serviceSupabase
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

    // 4. Generate signed download URLs for each document
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

    // 5. Update order status to COMPLETED
    await serviceSupabase
      .from('orders')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // 6. Queue delivery notification email
    await serviceSupabase.from('email_queue').insert({
      order_id: orderId,
      template: 'draft-ready',
      data: {
        orderNumber: order.order_number,
        documentCount: successCount,
      },
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    // 7. Write server-side audit log (fixes A16-P0-005)
    await serviceSupabase.from('admin_audit_log').insert({
      order_id: orderId,
      action: auditAction,
      metadata: {
        ...auditMetadata,
        documentCount: documents.length,
        signedUrlsGenerated: successCount,
        previousStatus: order.status,
      },
      admin_id: user.id,
      created_at: new Date().toISOString(),
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
