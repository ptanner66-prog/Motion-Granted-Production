/**
 * POST /api/orders/[id]/uploads
 *
 * Phase 3: Secure upload endpoint for attorney evidence files.
 * Validates file type, size, and order status before uploading
 * to the client-uploads bucket.
 *
 * SP-17 D6 Phase 3
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';
import { STORAGE_BUCKETS } from '@/lib/config/storage';

const log = createLogger('api-orders-uploads');

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const UPLOAD_ALLOWED_STATUSES = ['PROCESSING', 'AWAITING_APPROVAL', 'INTAKE'];

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orderId } = await props.params;

  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, status')
    .eq('id', orderId)
    .single();

  if (!order || order.client_id !== user.id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (!UPLOAD_ALLOWED_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: 'Order status does not allow uploads' },
      { status: 409 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json(
      { error: 'No file provided or file is empty' },
      { status: 400 }
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed` },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File exceeds 50MB limit' },
      { status: 413 }
    );
  }

  // Sanitize filename, prevent path traversal
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const filePath = `${orderId}/${timestamp}_${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKETS.CLIENT_UPLOADS)
    .upload(filePath, file);

  if (uploadErr) {
    log.error('Storage upload failed', { orderId, error: uploadErr.message });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  // Record in documents table
  await supabase.from('documents').insert({
    order_id: orderId,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_url: `${STORAGE_BUCKETS.CLIENT_UPLOADS}/${filePath}`,
    document_type: 'CLIENT_UPLOAD',
    uploaded_by: user.id,
    is_deliverable: false,
  });

  log.info('Client upload success', {
    orderId,
    filePath,
    fileSize: file.size,
  });

  return NextResponse.json({
    success: true,
    filePath,
    fileSize: file.size,
  });
}
