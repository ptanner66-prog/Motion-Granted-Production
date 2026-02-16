/**
 * HOLD Resume Handler — SP-22 Task 2
 *
 * Maps hold_reason to the phase where workflow should resume after HOLD resolution.
 * Source of truth for resume phase routing.
 *
 * HOLD_RESUME_MAP:
 *   evidence_gap              → PHASE_IV (re-run research with new evidence)
 *   tier_reclassification     → PHASE_II (re-run legal framework with new tier)
 *   revision_stall            → PHASE_VIII (re-run final draft)
 *   citation_critical_failure → PHASE_CURRENT (resume at whatever phase was active)
 */

import { createLogger } from '@/lib/security/logger';

const logger = createLogger('hold-resume-handler');

export type HoldReason =
  | 'evidence_gap'
  | 'tier_reclassification'
  | 'revision_stall'
  | 'citation_critical_failure';

export const HOLD_RESUME_MAP: Record<HoldReason, string> = {
  'evidence_gap': 'PHASE_IV',
  'tier_reclassification': 'PHASE_II',
  'revision_stall': 'PHASE_VIII',
  'citation_critical_failure': 'PHASE_CURRENT',
};

/**
 * Determine the phase to resume workflow execution after a HOLD is resolved.
 *
 * @param holdReason - The reason for the HOLD
 * @param currentResumePhase - The phase stored in orders.resume_phase (for PHASE_CURRENT)
 * @returns The phase code to resume at
 * @throws Error if holdReason is unknown
 */
export function getResumePhase(holdReason: string, currentResumePhase: string | null): string {
  const mapped = HOLD_RESUME_MAP[holdReason as HoldReason];
  if (!mapped) {
    logger.error('Unknown hold_reason — escalating to admin', { holdReason });
    throw new Error(`Unknown hold_reason: ${holdReason}`);
  }
  if (mapped === 'PHASE_CURRENT') {
    if (!currentResumePhase) {
      logger.error('PHASE_CURRENT with no resume_phase — defaulting to PHASE_V1', { holdReason });
      return 'PHASE_V1';
    }
    return currentResumePhase;
  }
  return mapped;
}
