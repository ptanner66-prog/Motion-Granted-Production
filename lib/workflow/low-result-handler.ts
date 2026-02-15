/**
 * LOW-RESULT HANDLER
 *
 * TASK-17: Trigger supplemental research when batch returns
 * fewer candidates than the tier threshold.
 *
 * TASK-16 covers retry when batch returns 0 results.
 * This task handles the case where batch returns 1-2 candidates
 * but that's insufficient for a Tier C/D motion.
 *
 * Audit Evidence (Pelican order):
 * Batch 9 (legitimate_business_interest) returned only 1 candidate:
 * USI Insurance Services v. Tappel.
 * One case for a core enforceability argument is insufficient
 * for a Tier C MSJ, but since it wasn't zero, retry didn't trigger.
 *
 * @module low-result-handler
 */

import { retryFailedBatch, generateAlternativeQueries } from './batch-retry-handler';
import { type RawCandidate } from '@/types/citation-research';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-low-result-handler');

// ============================================================================
// TYPES
// ============================================================================

export interface LowResultCheck {
  element: string;
  candidateCount: number;
  threshold: number;
  needsSupplemental: boolean;
}

export interface SupplementalResult {
  element: string;
  originalCandidates: RawCandidate[];
  supplementalCandidates: RawCandidate[];
  totalCandidates: number;
  supplementSuccessful: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum candidate thresholds by tier. */
const LOW_RESULT_THRESHOLDS: Record<string, number> = {
  A: 0,  // Any non-zero is sufficient for Tier A
  B: 2,  // Need at least 2 for Tier B
  C: 3,  // Need at least 3 for Tier C
  D: 3,  // Need at least 3 for Tier D
};

/**
 * Core elements that should trigger supplemental research.
 * Non-core elements (like "summary_judgment_standard") don't need many citations.
 */
const CORE_ELEMENTS_BY_MOTION_TYPE: Record<string, string[]> = {
  'motion_for_summary_judgment': [
    'breach_of_contract',
    'duty_of_loyalty',
    'non_compete_enforceability',
    'non_solicitation',
    'legitimate_business_interest',
    'competing_during_employment',
    'damages',
  ],
  'motion_for_preliminary_injunction': [
    'irreparable_harm',
    'likelihood_of_success',
    'balance_of_hardships',
    'public_interest',
  ],
  'temporary_restraining_order': [
    'irreparable_harm',
    'likelihood_of_success',
  ],
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Check if a batch needs supplemental research based on tier thresholds.
 *
 * @param element - The legal element
 * @param candidateCount - Number of candidates returned
 * @param tier - Motion tier (A/B/C/D)
 * @param motionType - Type of motion for core element check
 * @returns Whether supplemental research is needed
 */
export function checkLowResultThreshold(
  element: string,
  candidateCount: number,
  tier: 'A' | 'B' | 'C' | 'D',
  motionType: string
): LowResultCheck {
  const threshold = LOW_RESULT_THRESHOLDS[tier];

  // For Tier A, any result is sufficient
  if (tier === 'A') {
    return {
      element,
      candidateCount,
      threshold: 0,
      needsSupplemental: false,
    };
  }

  // Check if this is a core element for the motion type
  const coreElements = CORE_ELEMENTS_BY_MOTION_TYPE[motionType.toLowerCase()] || [];
  const isCoreElement = coreElements.some(core =>
    element.toLowerCase().includes(core.toLowerCase()) ||
    core.toLowerCase().includes(element.toLowerCase())
  );

  // For non-core elements, lower the threshold
  const effectiveThreshold = isCoreElement ? threshold : Math.max(1, threshold - 1);

  const needsSupplemental = candidateCount > 0 && candidateCount < effectiveThreshold;

  if (needsSupplemental) {
    log.info('Below threshold, needs supplemental research', {
      element,
      candidateCount,
      threshold: effectiveThreshold,
      tier,
      isCoreElement,
    });
  }

  return {
    element,
    candidateCount,
    threshold: effectiveThreshold,
    needsSupplemental,
  };
}

/**
 * Run supplemental research for a low-result batch.
 *
 * Uses the same retry logic as TASK-16 but with different triggering conditions.
 *
 * @param element - The legal element
 * @param originalQuery - The original search query
 * @param originalCandidates - Candidates already found
 * @param jurisdiction - Filing jurisdiction
 * @returns Combined candidates after supplemental research
 */
export async function runSupplementalResearch(
  element: string,
  originalQuery: string,
  originalCandidates: RawCandidate[],
  jurisdiction: string
): Promise<SupplementalResult> {
  log.info('Running supplemental research', {
    element,
    originalCount: originalCandidates.length,
  });

  // Use the retry mechanism to search with alternatives
  const retryResult = await retryFailedBatch(element, originalQuery, jurisdiction);

  // Combine and deduplicate by candidate id
  const supplementalCandidates = retryResult.candidates.filter(
    supp => !originalCandidates.some(orig => orig.id === supp.id)
  );

  const allCandidates = [...originalCandidates, ...supplementalCandidates];

  log.info('Supplemental research complete', {
    element,
    originalCount: originalCandidates.length,
    supplementalCount: supplementalCandidates.length,
    totalCount: allCandidates.length,
  });

  return {
    element,
    originalCandidates,
    supplementalCandidates,
    totalCandidates: allCandidates.length,
    supplementSuccessful: supplementalCandidates.length > 0,
  };
}

/**
 * Process all batches and run supplemental research where needed.
 */
export async function processLowResultBatches(
  batches: {
    element: string;
    query: string;
    candidates: RawCandidate[];
  }[],
  tier: 'A' | 'B' | 'C' | 'D',
  motionType: string,
  jurisdiction: string
): Promise<{
  element: string;
  candidates: RawCandidate[];
  wasSupplemented: boolean;
}[]> {
  const results: {
    element: string;
    candidates: RawCandidate[];
    wasSupplemented: boolean;
  }[] = [];

  for (const batch of batches) {
    const check = checkLowResultThreshold(
      batch.element,
      batch.candidates.length,
      tier,
      motionType
    );

    if (check.needsSupplemental) {
      const supplemental = await runSupplementalResearch(
        batch.element,
        batch.query,
        batch.candidates,
        jurisdiction
      );

      results.push({
        element: batch.element,
        candidates: [...batch.candidates, ...supplemental.supplementalCandidates],
        wasSupplemented: true,
      });
    } else {
      results.push({
        element: batch.element,
        candidates: batch.candidates,
        wasSupplemented: false,
      });
    }
  }

  return results;
}
