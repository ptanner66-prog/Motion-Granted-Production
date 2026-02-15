/**
 * Document Storage Service
 *
 * Uploads generated documents to Supabase Storage and stores
 * references on the order record.
 *
 * SP-12: Added encrypt-on-upload / decrypt-on-download wrappers.
 * All documents are AES-256-GCM encrypted before reaching Supabase Storage.
 *
 * Bucket: order-documents (created via migration)
 */

import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { createLogger } from '@/lib/security/logger';

const BUCKET = 'order-documents';
const log = createLogger('storage-service');

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
    log.error('Failed to update order with document URL', { orderId, error: updateError.message });
    // Don't throw — the document is uploaded, just the order record wasn't updated
  }

  log.info('Document uploaded', { filename, orderId, path: filePath });
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

/**
 * Upload a document encrypted with AES-256-GCM.
 * The file is encrypted in-memory before being sent to Supabase Storage.
 *
 * SP-12: Encrypt-on-upload for documents at rest.
 */
export async function uploadEncryptedFile(
  orderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const encryptedBuffer = encrypt(buffer);

  // Store with .enc extension so downstream knows to decrypt
  const encFilename = `${filename}.enc`;

  log.info('Uploading encrypted document', { orderId, filename: encFilename });

  return uploadDocument(orderId, encFilename, encryptedBuffer, 'application/octet-stream');
}

/**
 * Download and decrypt an encrypted document from Supabase Storage.
 *
 * SP-12: Decrypt-on-download for documents at rest.
 */
export async function downloadDecryptedFile(
  orderId: string,
  filename: string
): Promise<Buffer | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const filePath = `${orderId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(filePath);

  if (error || !data) {
    log.error('Failed to download encrypted document', { orderId, filename, error: error?.message });
    return null;
  }

  const encryptedBuffer = Buffer.from(await data.arrayBuffer());

  return decrypt(encryptedBuffer);
}
