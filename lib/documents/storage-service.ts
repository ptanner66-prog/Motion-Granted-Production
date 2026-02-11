/**
 * Document Storage Service
 *
 * Uploads generated documents to Supabase Storage and stores
 * references on the order record.
 *
 * Bucket: order-documents (created via migration)
 */

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'order-documents';

/**
 * Upload a generated document to Supabase Storage.
 *
 * @param orderId - The order this document belongs to
 * @param filename - Name of the file (e.g., "motion.docx")
 * @param buffer - File contents as Buffer
 * @param mimeType - MIME type of the file
 * @returns The storage path and public URL
 */
export async function uploadDocument(
  orderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[STORAGE] Supabase credentials not configured');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const filePath = `${orderId}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true, // Allow re-upload on revision
    });

  if (error) {
    throw new Error(`[STORAGE] Upload failed for ${filePath}: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  // Update the order record with the document URL
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      document_url: publicUrl,
      document_generated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    console.error(`[STORAGE] Failed to update order ${orderId} with document URL:`, updateError.message);
    // Don't throw — the document is uploaded, just the order record wasn't updated
  }

  console.log(`[STORAGE] Uploaded ${filename} for order ${orderId} → ${filePath}`);
  return { path: filePath, publicUrl };
}

/**
 * Get the download URL for a document.
 */
export async function getDocumentUrl(orderId: string, filename: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(`${orderId}/${filename}`);

  return publicUrl || null;
}
