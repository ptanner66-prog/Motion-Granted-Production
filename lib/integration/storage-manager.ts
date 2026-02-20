/**
 * Storage Manager for Filing Package Documents
 *
 * Handles uploading generated documents to Supabase Storage and creating
 * signed download URLs. Uses a dedicated 'filing-packages' bucket separate
 * from the raw 'order-documents' upload bucket.
 *
 * Path pattern: {order_id}/{document_type}_{date}.{ext}
 * Supports both .docx and .pdf for each document.
 *
 * Security: Uses Supabase admin client (service role) for uploads.
 * Downloads use time-limited signed URLs — never expose raw storage paths.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('integration-storage-manager');
// FIX-B FIX-4: Use canonical bucket 'order-documents' so files are reachable
// by the download page and Fn2 handleApprove (which both read from order-documents).
// Previously used 'filing-packages' which was a dead-end bucket.
const BUCKET_NAME = 'order-documents';
const SIGNED_URL_EXPIRY = 60 * 60 * 24; // 24 hours
const MAX_UPLOAD_RETRIES = 1;

// ============================================================================
// TYPES
// ============================================================================

export interface StorageResult {
  success: boolean;
  path?: string;
  signedUrl?: string;
  error?: string;
}

export interface DocumentListItem {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

// ============================================================================
// ADMIN CLIENT
// ============================================================================

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ============================================================================
// BUCKET MANAGEMENT
// ============================================================================

/**
 * Ensure the filing-packages bucket exists. Creates it if missing.
 * Safe to call multiple times — idempotent.
 */
export async function ensureBucketExists(
  supabase?: SupabaseClient
): Promise<void> {
  const client = supabase || getAdminClient();
  if (!client) {
    log.warn('[storage-manager] No Supabase client available — skipping bucket check');
    return;
  }

  try {
    const { data: buckets, error: listError } = await client.storage.listBuckets();
    if (listError) {
      log.error('[storage-manager] Failed to list buckets:', listError.message);
      return;
    }

    const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
    if (exists) return;

    const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB max per file
    });

    if (createError) {
      // Bucket may have been created concurrently — check for "already exists"
      if (createError.message?.includes('already exists')) return;
      log.error('[storage-manager] Failed to create bucket:', createError.message);
    } else {
      log.info(`[storage-manager] Created bucket: ${BUCKET_NAME}`);
    }
  } catch (err) {
    log.error('[storage-manager] ensureBucketExists error:', err instanceof Error ? err.message : err);
  }
}

// ============================================================================
// UPLOAD
// ============================================================================

/**
 * Upload a document to Supabase Storage.
 * Retries once on failure, then logs error and returns failure result.
 */
export async function uploadDocument(
  supabase: SupabaseClient | undefined,
  orderId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<StorageResult> {
  const client = supabase || getAdminClient();
  if (!client) {
    return { success: false, error: 'Supabase client not available' };
  }

  // A-008: DOCX buffer validation — verify ZIP magic bytes (PK\x03\x04)
  // DOCX files are ZIP archives; corrupt or empty buffers caught early.
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (!buffer || buffer.length < 4) {
      return { success: false, error: 'DOCX buffer is empty or too small to be valid' };
    }
    // ZIP magic bytes: 0x50 0x4B 0x03 0x04
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      log.error(`[storage-manager] DOCX magic bytes check failed for ${filename}. Got: ${buffer.slice(0, 4).toString('hex')}`);
      return { success: false, error: 'DOCX buffer failed magic bytes validation — file may be corrupt' };
    }
  }

  const filePath = `${orderId}/${filename}`;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      const { error: uploadError } = await client.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType,
          upsert: true, // Allow re-upload on revision
        });

      if (uploadError) {
        if (attempt < MAX_UPLOAD_RETRIES) {
          log.warn(`[storage-manager] Upload attempt ${attempt + 1} failed, retrying:`, uploadError.message);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        return { success: false, error: `Upload failed: ${uploadError.message}` };
      }

      // Generate signed URL for download
      const { data: signedData, error: signedError } = await client.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

      if (signedError || !signedData?.signedUrl) {
        log.warn('[storage-manager] Signed URL generation failed:', signedError?.message);
        // Upload succeeded even if signed URL fails — return path
        return { success: true, path: filePath };
      }

      log.info(`[storage-manager] Uploaded ${filename} for order ${orderId}`);
      return {
        success: true,
        path: filePath,
        signedUrl: signedData.signedUrl,
      };
    } catch (err) {
      if (attempt < MAX_UPLOAD_RETRIES) {
        log.warn(`[storage-manager] Upload attempt ${attempt + 1} threw, retrying:`, err instanceof Error ? err.message : err);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      return {
        success: false,
        error: `Upload exception: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  return { success: false, error: 'Upload failed after retries' };
}

// ============================================================================
// DOWNLOAD URL
// ============================================================================

/**
 * Generate a time-limited signed download URL for a stored document.
 */
export async function getSignedDownloadUrl(
  supabase: SupabaseClient | undefined,
  path: string,
  expiresIn: number = SIGNED_URL_EXPIRY
): Promise<StorageResult> {
  const client = supabase || getAdminClient();
  if (!client) {
    return { success: false, error: 'Supabase client not available' };
  }

  try {
    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || 'No signed URL returned' };
    }

    return { success: true, path, signedUrl: data.signedUrl };
  } catch (err) {
    return {
      success: false,
      error: `Signed URL error: ${err instanceof Error ? err.message : 'Unknown'}`,
    };
  }
}

// ============================================================================
// LIST DOCUMENTS
// ============================================================================

/**
 * List all documents for a given order.
 */
export async function listOrderDocuments(
  supabase: SupabaseClient | undefined,
  orderId: string
): Promise<DocumentListItem[]> {
  const client = supabase || getAdminClient();
  if (!client) return [];

  try {
    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .list(orderId, { sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !data) {
      log.error('[storage-manager] List failed:', error?.message);
      return [];
    }

    return data.map((file: { name: string; metadata?: { size?: number }; created_at?: string }) => ({
      name: file.name,
      path: `${orderId}/${file.name}`,
      size: file.metadata?.size ?? 0,
      createdAt: file.created_at ?? new Date().toISOString(),
    }));
  } catch (err) {
    log.error('[storage-manager] List exception:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================================================
// DELETE DOCUMENTS
// ============================================================================

/**
 * Delete all documents for an order (used when order is cancelled/refunded).
 */
export async function deleteOrderDocuments(
  supabase: SupabaseClient | undefined,
  orderId: string
): Promise<{ success: boolean; deletedCount: number }> {
  const client = supabase || getAdminClient();
  if (!client) return { success: false, deletedCount: 0 };

  try {
    const files = await listOrderDocuments(client, orderId);
    if (files.length === 0) return { success: true, deletedCount: 0 };

    const paths = files.map(f => f.path);
    const { error } = await client.storage
      .from(BUCKET_NAME)
      .remove(paths);

    if (error) {
      log.error('[storage-manager] Delete failed:', error.message);
      return { success: false, deletedCount: 0 };
    }

    log.info(`[storage-manager] Deleted ${paths.length} documents for order ${orderId}`);
    return { success: true, deletedCount: paths.length };
  } catch (err) {
    log.error('[storage-manager] Delete exception:', err instanceof Error ? err.message : err);
    return { success: false, deletedCount: 0 };
  }
}
