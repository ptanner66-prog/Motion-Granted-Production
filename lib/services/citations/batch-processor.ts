// /lib/services/citations/batch-processor.ts
// Citation batch processing with HARD STOP protocol
// VERSION: 1.0 — January 28, 2026

/**
 * Get citation batch size for a given phase
 * Per v6.3: Default 4, Phases V.1/VII.1 use 2 (prevents memory loops)
 */
export function getCitationBatchSize(phase: string): number {
  if (phase === 'V.1' || phase === 'VII.1') {
    return 2;
  }
  return 4;
}

/**
 * Process citations in batches with HARD STOP protocol
 */
export async function processCitationsInBatches<T>(
  citations: T[],
  phase: string,
  processor: (batch: T[]) => Promise<void>
): Promise<void> {
  const batchSize = getCitationBatchSize(phase);
  const totalBatches = Math.ceil(citations.length / batchSize);

  for (let i = 0; i < citations.length; i += batchSize) {
    const batch = citations.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(`[${phase}] Processing citation batch ${batchNumber}/${totalBatches}`);

    await processor(batch);
  }
}

/**
 * Process citations in batches with progress callback
 */
export async function processCitationsInBatchesWithProgress<T, R>(
  citations: T[],
  phase: string,
  processor: (batch: T[], batchNumber: number, totalBatches: number) => Promise<R[]>,
  onProgress?: (progress: { batchNumber: number; totalBatches: number; completed: number; total: number }) => void
): Promise<R[]> {
  const batchSize = getCitationBatchSize(phase);
  const totalBatches = Math.ceil(citations.length / batchSize);
  const results: R[] = [];

  for (let i = 0; i < citations.length; i += batchSize) {
    const batch = citations.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(`[${phase}] Processing citation batch ${batchNumber}/${totalBatches}`);

    const batchResults = await processor(batch, batchNumber, totalBatches);
    results.push(...batchResults);

    if (onProgress) {
      onProgress({
        batchNumber,
        totalBatches,
        completed: Math.min(i + batchSize, citations.length),
        total: citations.length,
      });
    }
  }

  return results;
}

/**
 * Citation verification result status
 */
export type CitationVerificationStatus =
  | 'VERIFIED'
  | 'FLAGGED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'PENDING';

/**
 * HARD STOP check - determines if workflow should halt
 */
export function shouldHardStop(
  verificationResults: Array<{ status: CitationVerificationStatus }>,
  tier: 'A' | 'B' | 'C'
): { halt: boolean; reason?: string; failedCount: number; totalCount: number } {
  const failedCitations = verificationResults.filter(
    r => r.status === 'REJECTED' || r.status === 'BLOCKED'
  );

  const failedCount = failedCitations.length;
  const totalCount = verificationResults.length;

  if (totalCount === 0) {
    return { halt: false, failedCount: 0, totalCount: 0 };
  }

  const failureRate = failedCount / totalCount;

  // Tier-specific failure thresholds
  const thresholds = {
    A: 0.20, // 20% citation failure allowed (procedural)
    B: 0.15, // 15% citation failure allowed (intermediate)
    C: 0.10, // 10% citation failure allowed (dispositive)
  };

  const threshold = thresholds[tier];

  if (failureRate > threshold) {
    return {
      halt: true,
      reason: `Citation failure rate ${(failureRate * 100).toFixed(1)}% exceeds ${tier} threshold of ${(threshold * 100)}%`,
      failedCount,
      totalCount,
    };
  }

  // Also halt if ANY citation is BLOCKED (critical issues)
  const blockedCount = verificationResults.filter(r => r.status === 'BLOCKED').length;
  if (blockedCount > 0) {
    return {
      halt: true,
      reason: `${blockedCount} citation(s) have BLOCKED status (critical verification failures)`,
      failedCount,
      totalCount,
    };
  }

  return { halt: false, failedCount, totalCount };
}

/**
 * Calculate delay between batches with exponential backoff
 * Base 1s, max 32s, jitter ±20%
 */
export function calculateBatchDelay(attemptNumber: number): number {
  const baseDelayMs = 1000;
  const maxDelayMs = 32000;
  const jitterPercent = 0.2;

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attemptNumber - 1),
    maxDelayMs
  );

  // Add jitter ±20%
  const jitter = exponentialDelay * jitterPercent * (Math.random() * 2 - 1);

  return Math.round(exponentialDelay + jitter);
}

/**
 * Delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
