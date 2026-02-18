// /lib/storage/signed-url.ts
// Centralized signed URL generation for secure file downloads
// Per Task 77 — PORTER_TASK_LIST_ADDENDUM_SIGNED_URLS_01282026.md
// VERSION: 1.0 — January 28, 2026

import { createClient } from '@/lib/supabase/server';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('storage-signed-url');
export interface SignedUrlOptions {
  /** Expiration in seconds. Default: 7 days (604800) */
  expiresIn?: number;
  /** Download filename override */
  download?: string;
}

export interface DeliverableUrl {
  deliverableId: string;
  filename: string;
  url: string;
  expiresAt: Date;
}

const DEFAULT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a signed URL for secure file download
 */
export async function generateSignedUrl(
  bucket: string,
  path: string,
  options: SignedUrlOptions = {}
): Promise<{ url: string; expiresAt: Date } | { error: string }> {
  const supabase = await createClient();

  const expiresIn = options.expiresIn || DEFAULT_EXPIRY;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, {
      download: options.download,
    });

  if (error) {
    log.error('[SignedUrl] Error generating URL:', error);
    return { error: error.message };
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  return { url: data.signedUrl, expiresAt };
}

/**
 * Generate signed URLs for all deliverables in an order
 */
export async function generateOrderDeliverableUrls(
  orderId: string,
  userId: string
): Promise<{ urls: DeliverableUrl[]; error?: string }> {
  const supabase = await createClient();

  // SP12-06 FIX: Changed user_id to client_id — orders table uses client_id, not user_id.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { urls: [], error: 'Order not found' };
  }

  if (order.client_id !== userId) {
    return { urls: [], error: 'Unauthorized' };
  }

  // Get deliverables
  const { data: deliverables, error: delError } = await supabase
    .from('order_deliverables')
    .select('id, filename, storage_path')
    .eq('order_id', orderId);

  if (delError || !deliverables) {
    return { urls: [], error: 'No deliverables found' };
  }

  const urls: DeliverableUrl[] = [];

  for (const deliverable of deliverables) {
    const result = await generateSignedUrl('order-documents', deliverable.storage_path, {
      download: deliverable.filename,
    });

    if ('url' in result) {
      urls.push({
        deliverableId: deliverable.id,
        filename: deliverable.filename,
        url: result.url,
        expiresAt: result.expiresAt,
      });
    }
  }

  // Log download event
  await supabase.from('download_events').insert({
    order_id: orderId,
    user_id: userId,
    deliverable_count: urls.length,
    created_at: new Date().toISOString(),
  });

  log.info(`[SignedUrl] Generated ${urls.length} URLs for order ${orderId}`);

  return { urls };
}

/**
 * Generate a short-lived signed URL for immediate download
 */
export async function generateImmediateDownloadUrl(
  bucket: string,
  path: string,
  filename: string
): Promise<{ url: string } | { error: string }> {
  const result = await generateSignedUrl(bucket, path, {
    expiresIn: 60 * 60, // 1 hour
    download: filename,
  });

  if ('error' in result) {
    return { error: result.error };
  }

  return { url: result.url };
}
