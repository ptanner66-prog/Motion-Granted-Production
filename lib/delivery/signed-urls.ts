/**
 * Signed URL Generation for Fn2 Delivery — R4-08
 *
 * Fn2 runs as an Inngest background function with no user session.
 * Signed URLs require service_role (ALLOWLIST entry #6).
 *
 * - Individual file URL failures do NOT block other files
 * - If ALL files fail, allSucceeded: false signals Fn2 to retry the step
 * - Partial failure: Fn2 proceeds with available URLs, logs warning
 */

import { getServiceSupabase } from '@/lib/supabase/admin';

interface SignedUrlResult {
  fileKey: string;
  signedUrl: string | null;
  error: string | null;
}

interface SignedUrlBatchResult {
  urls: SignedUrlResult[];
  allSucceeded: boolean;
  partialFailure: boolean;
  failedCount: number;
}

const SIGNED_URL_EXPIRY_SECONDS = 604800; // 7 days

export async function generateSignedUrls(
  orderId: string,
  packageId: string,
  fileKeys: string[]
): Promise<SignedUrlBatchResult> {
  const supabase = getServiceSupabase(); // ALLOWLIST entry #6

  const results: SignedUrlResult[] = [];

  for (const fileKey of fileKeys) {
    try {
      const { data, error } = await supabase.storage
        .from('order-documents') // Canonical bucket name per D6
        .createSignedUrl(fileKey, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        results.push({ fileKey, signedUrl: null, error: error.message });
      } else {
        results.push({ fileKey, signedUrl: data.signedUrl, error: null });
      }
    } catch (err) {
      results.push({
        fileKey,
        signedUrl: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failedCount = results.filter((r) => r.error !== null).length;

  return {
    urls: results,
    allSucceeded: failedCount === 0,
    partialFailure: failedCount > 0 && failedCount < results.length,
    failedCount,
  };
}
