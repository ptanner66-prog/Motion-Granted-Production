/**
 * POST /api/orders/[id]/convert-pdf — On-Demand DOCX → PDF Conversion (ST11-ACTION-2)
 *
 * Takes a document path from order_documents, fetches the DOCX from Supabase Storage,
 * converts via CloudConvert, uploads the PDF back, and returns the signed URL.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceSupabase } from '@/lib/supabase/admin';
import { convertDocxToPdf } from '@/lib/documents/pdf-converter';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Parse body
  let body: { documentPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { documentPath } = body;
  if (!documentPath || typeof documentPath !== 'string') {
    return NextResponse.json({ error: 'documentPath is required' }, { status: 400 });
  }

  // Ownership check
  const serviceSupabase = getServiceSupabase();
  const { data: order, error: orderError } = await serviceSupabase
    .from('orders')
    .select('id, client_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.client_id !== user.id) {
    // Check if admin
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
  }

  try {
    // Download DOCX from storage
    const { data: fileData, error: downloadError } = await serviceSupabase.storage
      .from('documents')
      .download(documentPath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: 'Failed to download source document' },
        { status: 404 }
      );
    }

    const docxBuffer = Buffer.from(await fileData.arrayBuffer());

    // Convert to PDF
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    // Upload PDF to storage
    const pdfPath = documentPath.replace(/\.docx$/i, '.pdf');
    const { error: uploadError } = await serviceSupabase.storage
      .from('documents')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: 'Failed to upload converted PDF' },
        { status: 500 }
      );
    }

    // Generate signed URL (7-day expiry)
    const { data: signedUrlData } = await serviceSupabase.storage
      .from('documents')
      .createSignedUrl(pdfPath, 7 * 24 * 60 * 60);

    return NextResponse.json({
      pdfPath,
      signedUrl: signedUrlData?.signedUrl || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[convert-pdf] Conversion failed:', { orderId, error: message });
    return NextResponse.json(
      { error: 'PDF conversion failed. Please try again later.' },
      { status: 502 }
    );
  }
}
