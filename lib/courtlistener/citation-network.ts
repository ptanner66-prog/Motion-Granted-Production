/**
 * Unified Citation Network Module
 *
 * V1 Features (Current):
 * - Forward citations (what cites this case)
 * - Strength scoring with pre-2000 caveat (ST-013)
 * - Negative treatment detection
 *
 * V2 Features (TODO):
 * - Backward citations for Tier D (what this case cites)
 *   See Build Guide ST-014 for future implementation
 *
 * @version BATCH_16 — ST-013, ST-014
 */

import type { CourtListenerCitingOpinion } from './types';
import { TREATMENT_CLASSIFICATION, type NormalizedTreatment } from './types';
import { getCitingOpinions } from './client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-network');

// ============================================================================
// TYPES
// ============================================================================

export interface CitingOpinion {
  id: number;
  citingOpinionId: number;
  treatment: NormalizedTreatment;
  rawTreatment: string;
  depth: number;
}

export interface StrengthScore {
  rating: 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT_DATA';
  citingOpinionCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  /** True when INSUFFICIENT_DATA for a case decided before 2000-01-01. ST-013 */
  pre2000Caveat: boolean;
}

// ============================================================================
// STRENGTH SCORING
// ============================================================================

/**
 * Calculate base strength score from citing opinions.
 * Does NOT include pre-2000 caveat — use calculateStrengthScore for that.
 */
function calculateBaseStrengthScore(
  citingOpinions: CitingOpinion[],
  totalCount: number
): Omit<StrengthScore, 'pre2000Caveat'> {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  for (const op of citingOpinions) {
    switch (op.treatment) {
      case 'POSITIVE':
        positiveCount++;
        break;
      case 'NEGATIVE':
      case 'CAUTION':
        negativeCount++;
        break;
      case 'NEUTRAL':
      default:
        neutralCount++;
        break;
    }
  }

  const citingOpinionCount = totalCount || citingOpinions.length;

  // Determine rating
  let rating: StrengthScore['rating'];
  if (citingOpinionCount < 5) {
    rating = 'INSUFFICIENT_DATA';
  } else if (negativeCount > positiveCount) {
    rating = 'WEAK';
  } else if (citingOpinionCount >= 50 && positiveCount > negativeCount) {
    rating = 'STRONG';
  } else if (citingOpinionCount >= 10) {
    rating = 'MODERATE';
  } else {
    rating = 'INSUFFICIENT_DATA';
  }

  return {
    rating,
    citingOpinionCount,
    positiveCount,
    negativeCount,
    neutralCount,
  };
}

/**
 * Calculate citation strength with pre-2000 caveat.
 *
 * ST-013: When INSUFFICIENT_DATA is returned for a case filed before
 * 2000-01-01, sets pre2000Caveat=true to indicate that the rating reflects
 * data availability (CL backfill gaps), not case quality.
 *
 * @param citingOpinions - Classified citing opinions
 * @param totalCount - Total citing opinion count from API
 * @param dateFiled - ISO date string of when the case was decided
 */
export function calculateStrengthScore(
  citingOpinions: CitingOpinion[],
  totalCount: number,
  dateFiled?: string
): StrengthScore {
  const base = calculateBaseStrengthScore(citingOpinions, totalCount);

  // ST-013: Check for pre-2000 caveat
  let pre2000Caveat = false;
  if (base.rating === 'INSUFFICIENT_DATA' && dateFiled) {
    try {
      const filed = new Date(dateFiled);
      const cutoff = new Date('2000-01-01');
      pre2000Caveat = filed < cutoff;
    } catch {
      // Invalid date — don't apply caveat
    }
  }

  return { ...base, pre2000Caveat };
}

// ============================================================================
// CITING OPINION CLASSIFICATION
// ============================================================================

/**
 * Classify raw CL citing opinions into normalized treatment categories.
 */
export function classifyCitingOpinions(
  rawOpinions: CourtListenerCitingOpinion[]
): CitingOpinion[] {
  return rawOpinions.map((raw) => {
    const rawTreatment = (raw.treatment || 'cited').toLowerCase();
    const treatment: NormalizedTreatment =
      TREATMENT_CLASSIFICATION[rawTreatment as keyof typeof TREATMENT_CLASSIFICATION] || 'NEUTRAL';

    return {
      id: raw.id,
      citingOpinionId: raw.citing_opinion,
      treatment,
      rawTreatment,
      depth: raw.depth,
    };
  });
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Fetch and score citation network strength for an opinion.
 *
 * @param opinionId - CourtListener opinion ID
 * @param dateFiled - ISO date string for pre-2000 caveat (ST-013)
 */
export async function getCitationStrength(
  opinionId: string,
  dateFiled?: string
): Promise<{
  success: boolean;
  data?: StrengthScore;
  error?: string;
}> {
  try {
    const result = await getCitingOpinions(opinionId, 200);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const classified = classifyCitingOpinions(result.data || []);
    const score = calculateStrengthScore(classified, classified.length, dateFiled);

    log.info(
      `[getCitationStrength] Opinion ${opinionId}: ${score.rating} ` +
      `(${score.citingOpinionCount} citing, +${score.positiveCount}/-${score.negativeCount})` +
      (score.pre2000Caveat ? ' [PRE-2000 CAVEAT]' : '')
    );

    return { success: true, data: score };
  } catch (error) {
    log.error(`[getCitationStrength] Error for opinion ${opinionId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Citation strength check failed',
    };
  }
}

// ============================================================================
// V2: BACKWARD CITATIONS (NOT IMPLEMENTED)
// ============================================================================

/**
 * V2: Get backward citations (what the cited opinion itself cites)
 * Useful for understanding an opinion's analytical foundation
 *
 * NOT IMPLEMENTED at launch. Tier D currently uses same behavior as Tier C.
 *
 * TODO: Implement for Tier D orders
 * - Query: /v4/opinions/?citing_opinion={id}
 * - Returns: Opinions cited by the target opinion
 * - Use case: Understanding opinion's legal reasoning chain
 *
 * @see Build Guide ST-014
 */
// export async function getBackwardCitations(opinionId: number): Promise<BackwardCitationResult>
