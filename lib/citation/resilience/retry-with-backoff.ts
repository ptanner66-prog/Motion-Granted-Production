/**
 * Exponential Backoff with Jitter (SP-19 Block 3)
 *
 * Citation-pipeline-specific retry helper.
 * Base: 1 s, Max: 32 s, Jitter: ±20 %.
 *
 * Complements the generic lib/utils/retry.ts — this module is tailored
 * for tight citation API loops where the jitter bounds and defaults
 * differ from the application-wide retry utility.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default: 1000 */
  baseDelay?: number;
  /** Ceiling for any single delay in ms. Default: 32000 */
  maxDelay?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute `fn`, retrying on failure with exponential backoff + ±20 % jitter.
 *
 * @throws The last error encountered after all attempts are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 32000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = delay * (0.8 + Math.random() * 0.4); // ±20 %
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  // TypeScript requires an explicit throw; the loop above always returns or throws.
  throw new Error('retryWithBackoff: unreachable');
}
