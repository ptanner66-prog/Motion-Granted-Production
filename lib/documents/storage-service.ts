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

import { getServiceSupabase } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { createLogger } from '@/lib/security/logger';

const BUCKET = 'order-documents';
const log = createLogger('storage-service');

/**
 * Upload a generated document to Supabase Storage.
 *
 * FIX-B FIX-3: Returns signed URL (1hr) instead of permanent public URL.
 * Legal documents must never be accessible via unauthenticated permanent URLs.
 *
 * @param orderId - The order this document belongs to
 * @param filename - Name of the file (e.g., "motion.docx")
 * @param buffer - File contents as Buffer
 * @param mimeType - MIME type of the file
 * @returns The storage path and a time-limited signed URL
 */
export async function uploadDocument(
  orderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ path: string; publicUrl: string }> {
  const supabase = getServiceSupabase();

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

  // FIX-B FIX-3: Use signed URL instead of permanent public URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour expiry

  const signedUrl = signedData?.signedUrl ?? filePath;
  if (signedError) {
    log.error('Failed to create signed URL, using path as fallback', { orderId, error: signedError.message });
  }

  // Update the order record with the document path (not the signed URL — those expire)
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      document_url: filePath,
      document_generated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    log.error('Failed to update order with document URL', { orderId, error: updateError.message });
  }

  log.info('Document uploaded', { filename, orderId, path: filePath });
  return { path: filePath, publicUrl: signedUrl };
}

/**
 * Get a time-limited download URL for a document.
 *
 * FIX-B FIX-3: Returns signed URL (1hr) instead of permanent public URL.
 */
export async function getDocumentUrl(orderId: string, filename: string): Promise<string | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`${orderId}/${filename}`, 3600); // 1 hour expiry

  if (error || !data?.signedUrl) {
    log.error('Failed to create signed URL', { orderId, filename, error: error?.message });
    return null;
  }

  return data.signedUrl;
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
  const supabase = getServiceSupabase();

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
