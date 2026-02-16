/**
 * GET /api/orders/[id]/download
 *
 * Phase 4: Secure download proxy with signed URLs.
 * Status-dependent expiry: AWAITING_APPROVAL=1hr, COMPLETED=7days, default=5min.
 * Never exposes raw Supabase storage URLs (DEL-NEW-001).
 *
 * Query params:
 *   ?fileId=<document-id>  — Download a specific document (signed URL)
 *   (no fileId)            — List all downloadable documents for the order
 *
 * SP-17 D6 Phase 4
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';
import { STORAGE_BUCKETS } from '@/lib/config/storage';

const log = createLogger('api-orders-download');

const EXPIRY_BY_STATUS: Record<string, number> = {
  AWAITING_APPROVAL: 3600, // 1 hour during review
  COMPLETED: 604800, // 7 days after completion
};
const DEFAULT_EXPIRY = 300; // 5 minutes

const DOWNLOAD_ALLOWED_STATUSES = [
  'AWAITING_APPROVAL',
  'COMPLETED',
  'DISPUTED', // D8-CORR-001: attorney needs files during Stripe dispute
  'REVISION_REQ', // attorney may need files during revision
];

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await props.params;

    // Check role for admin access
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    const { data: order } = await supabase
      .from('orders')
      .select('id, client_id, status')
      .eq('id', orderId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify access: owner or admin
    if (!isAdmin && order.client_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!DOWNLOAD_ALLOWED_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: 'Downloads not available for this order status' },
        { status: 403 }
      );
    }

    const fileId = request.nextUrl.searchParams.get('fileId');

    // Status-dependent expiry
    const expiry = EXPIRY_BY_STATUS[order.status] || DEFAULT_EXPIRY;

    // If fileId provided, return a signed URL for that specific document
    if (fileId) {
      const { data: doc } = await supabase
        .from('documents')
        .select('id, file_name, file_url, file_type, file_size, order_id')
        .eq('id', fileId)
        .single();

      if (!doc || doc.order_id !== orderId) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }

      // Determine bucket and path from file_url
      const { bucket, path } = parseBucketPath(doc.file_url);

      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiry);

      if (urlErr || !urlData?.signedUrl) {
        log.error('Signed URL generation failed', {
          orderId,
          fileId,
          error: urlErr?.message,
        });
        return NextResponse.json(
          { error: 'Failed to generate download URL' },
          { status: 500 }
        );
      }

      // Track download on delivery_packages if one exists
      const { data: pkg } = await supabase
        .from('delivery_packages')
        .select('id, download_confirmed_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (pkg && !pkg.download_confirmed_at) {
        await supabase
          .from('delivery_packages')
          .update({ download_confirmed_at: new Date().toISOString() })
          .eq('id', pkg.id)
          .is('download_confirmed_at', null);
      }

      return NextResponse.json({
        url: urlData.signedUrl,
        expiresIn: expiry,
        fileName: doc.file_name,
      });
    }

    // No fileId: list all downloadable documents for this order
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select(
        'id, file_name, file_type, file_size, document_type, is_deliverable, created_at'
      )
      .eq('order_id', orderId)
      .eq('is_deliverable', true)
      .order('created_at', { ascending: true });

    if (docsError) {
      log.error('Failed to fetch documents', {
        orderId,
        error: docsError.message,
      });
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderStatus: order.status,
      expirySeconds: expiry,
      deliverables: (documents ?? []).map(
        (doc: {
          id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          document_type: string;
          created_at: string;
        }) => ({
          id: doc.id,
          fileName: doc.file_name,
          fileType: doc.file_type,
          fileSizeBytes: doc.file_size,
          documentType: doc.document_type,
          createdAt: doc.created_at,
          downloadUrl: `/api/orders/${orderId}/download?fileId=${doc.id}`,
        })
      ),
    });
  } catch (error) {
    log.error('Download error', {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}

/**
 * Parse a stored file_url into bucket name and path.
 * file_url may be stored as:
 *   "client-uploads/orderId/file.pdf"
 *   "order-documents/orderId/file.pdf"
 *   "orders/orderId/timestamp-file.pdf" (legacy from documents bucket)
 */
function parseBucketPath(fileUrl: string): { bucket: string; path: string } {
  if (fileUrl.startsWith(`${STORAGE_BUCKETS.CLIENT_UPLOADS}/`)) {
    return {
      bucket: STORAGE_BUCKETS.CLIENT_UPLOADS,
      path: fileUrl.replace(`${STORAGE_BUCKETS.CLIENT_UPLOADS}/`, ''),
    };
  }
  if (fileUrl.startsWith(`${STORAGE_BUCKETS.ORDER_DOCUMENTS}/`)) {
    return {
      bucket: STORAGE_BUCKETS.ORDER_DOCUMENTS,
      path: fileUrl.replace(`${STORAGE_BUCKETS.ORDER_DOCUMENTS}/`, ''),
    };
  }
  // Legacy: stored as "orders/..." in documents bucket
  return { bucket: 'documents', path: fileUrl };
}
