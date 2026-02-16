/**
 * Delivery Signed URL Generator
 *
 * Generates time-limited signed URLs for order deliverable files
 * stored in Supabase Storage. Used by Fn2 handleApprove to create
 * download links for the attorney.
 *
 * SERVICE_ROLE_ALLOWLIST entry: lib/delivery/signed-urls.ts (#6)
 *
 * Two-tier URL expiry model (D6 C-010 resolution):
 * - Preview URLs (AWAITING_APPROVAL): 1 hour — attorney is actively reviewing
 * - Download URLs (COMPLETED/approved): 7 days — delivery window
 */

import { getServiceSupabase } from '@/lib/supabase/admin';

/**
 * Two-tier URL expiry model (C-010 resolution):
 * - Preview URLs (AWAITING_APPROVAL): 1 hour — attorney is actively reviewing
 * - Download URLs (COMPLETED/approved): 7 days — delivery window
 */
export const URL_EXPIRY = {
  PREVIEW: 3600,         // 1 hour in seconds
  DOWNLOAD: 604800,      // 7 days in seconds
} as const;

const STORAGE_BUCKET = 'deliverables';

export interface SignedUrlResult {
  fileKey: string;
  signedUrl: string | null;
  error: string | null;
}

export interface GenerateSignedUrlsResult {
  urls: SignedUrlResult[];
  allSucceeded: boolean;
}

// Alias for spec compliance
export type SignedUrlBatchResult = GenerateSignedUrlsResult;

/**
 * Generate signed download URLs for all files in a delivery package.
 *
 * @param orderId - The order ID (for logging)
 * @param packageId - The delivery_packages.id
 * @param fileKeys - Array of storage file keys to generate URLs for
 * @param mode - 'PREVIEW' (1h) or 'DOWNLOAD' (7d). Defaults to DOWNLOAD.
 * @returns Object with urls array and allSucceeded flag
 */
export async function generateSignedUrls(
  orderId: string,
  packageId: string,
  fileKeys: string[],
  mode: 'PREVIEW' | 'DOWNLOAD' = 'DOWNLOAD'
): Promise<GenerateSignedUrlsResult> {
  const supabase = getServiceSupabase();
  const expirySeconds = URL_EXPIRY[mode];
  const results: SignedUrlResult[] = [];

  for (const fileKey of fileKeys) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(fileKey, expirySeconds);

      if (error || !data?.signedUrl) {
        console.error(`[signed-urls] Failed for ${fileKey}:`, error?.message);
        results.push({ fileKey, signedUrl: null, error: error?.message ?? 'No URL returned' });
      } else {
        results.push({ fileKey, signedUrl: data.signedUrl, error: null });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[signed-urls] Exception for ${fileKey}:`, message);
      results.push({ fileKey, signedUrl: null, error: message });
    }
  }

  return {
    urls: results,
    allSucceeded: results.every((r) => r.signedUrl !== null),
  };
}
