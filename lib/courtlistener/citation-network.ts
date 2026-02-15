/**
 * Unified Citation Network Module
 * Combines: Build Guide S3 + EMRG-004 + CIT-08-A
 *
 * Single endpoint query returns both:
 * - Strength scoring (citing opinion count + treatment distribution)
 * - Negative treatment signals (overruled, superseded, etc.)
 *
 * Uses getCitationTreatment() from the main CourtListener client to avoid
 * duplicating auth, rate-limiting, and retry logic. For richer data (case names,
 * dates), callers should use getOpinionById() for individual enrichment.
 *
 * @version BATCH_10 — ST-004
 */

import { getCitationTreatment } from '@/lib/courtlistener/client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-network');

// ============================================================================
// TYPES
// ============================================================================

export interface CitationNetworkResult {
  strength: StrengthScore;
  negativeTreatment: NegativeTreatmentResult;
  rawCitingOpinions: CitingOpinion[];
  totalCount: number;
  pagesRetrieved: number;
}

export interface StrengthScore {
  rating: 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT_DATA';
  citingOpinionCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
}

export interface NegativeTreatmentResult {
  hasNegativeTreatment: boolean;
  signals: TreatmentSignal[];
  mostSevere: TreatmentType | null;
}

export interface TreatmentSignal {
  type: TreatmentType;
  citingOpinionId: number;
  depth: number;
}

export type TreatmentType =
  | 'overruled'
  | 'superseded'
  | 'distinguished'
  | 'criticized'
  | 'questioned'
  | 'limited'
  | 'abrogated'
  | 'reversed'
  | 'vacated';

export interface CitingOpinion {
  id: number;
  treatment: string | null;
  depth: number;
}

// Treatment severity ranking (higher = more severe)
const TREATMENT_SEVERITY: Record<TreatmentType, number> = {
  overruled: 100,
  reversed: 95,
  vacated: 92,
  superseded: 90,
  abrogated: 85,
  limited: 50,
  criticized: 40,
  questioned: 30,
  distinguished: 20,
};

const NEGATIVE_TREATMENT_TYPES: TreatmentType[] = [
  'overruled', 'reversed', 'vacated', 'superseded', 'abrogated',
];

const CAUTION_TREATMENT_TYPES: TreatmentType[] = [
  'distinguished', 'criticized', 'questioned', 'limited',
];

const ALL_NEGATIVE_AND_CAUTION: TreatmentType[] = [
  ...NEGATIVE_TREATMENT_TYPES,
  ...CAUTION_TREATMENT_TYPES,
];

const POSITIVE_TREATMENTS = ['followed', 'affirmed', 'approved', 'cited'];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get forward citations and analyze strength + treatment in a single call.
 *
 * Delegates to getCitationTreatment() which queries the CourtListener
 * citing-opinions endpoint with auth, rate limiting, and retry logic.
 *
 * @param opinionId - CourtListener opinion ID (number or string)
 * @returns Combined strength score and negative treatment analysis
 */
export async function getForwardCitations(
  opinionId: number | string,
): Promise<CitationNetworkResult> {
  const opinionIdStr = String(opinionId);

  log.info(`[CitationNetwork] Querying forward citations for opinion ${opinionIdStr}`);

  const result = await getCitationTreatment(opinionIdStr);

  if (!result.success || !result.data) {
    log.warn(`[CitationNetwork] Failed to get citation treatment for ${opinionIdStr}: ${result.error}`);
    return emptyResult();
  }

  const { positive, negative, caution, treatments } = result.data;
  const totalCount = treatments.length;

  // Build CitingOpinion array from treatments
  const citingOpinions: CitingOpinion[] = treatments.map(t => ({
    id: t.citing_opinion_id,
    treatment: t.treatment || null,
    depth: t.depth,
  }));

  // Calculate strength and treatment from the same data
  const strength = calculateStrengthScore(citingOpinions, totalCount, positive, negative, caution);
  const negativeTreatment = extractTreatmentSignals(citingOpinions);

  log.info(
    `[CitationNetwork] Opinion ${opinionIdStr}: ${totalCount} citing opinions, ` +
    `strength=${strength.rating}, negative_treatment=${negativeTreatment.hasNegativeTreatment}`
  );

  return {
    strength,
    negativeTreatment,
    rawCitingOpinions: citingOpinions,
    totalCount,
    pagesRetrieved: 1,
  };
}

// ============================================================================
// STRENGTH SCORING
// ============================================================================

/**
 * Calculate citation strength based on citing opinions and treatment distribution.
 *
 * Uses pre-computed treatment counts from getCitationTreatment() for efficiency,
 * with the full opinions array available for deeper analysis if needed.
 */
export function calculateStrengthScore(
  citingOpinions: CitingOpinion[],
  totalCount: number,
  positiveCount?: number,
  negativeCount?: number,
  cautionCount?: number,
): StrengthScore {
  if (totalCount === 0) {
    return {
      rating: 'INSUFFICIENT_DATA',
      citingOpinionCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
    };
  }

  // Use pre-computed counts if available, otherwise compute from opinions
  let posCount: number;
  let negCount: number;
  let neutCount: number;

  if (positiveCount !== undefined && negativeCount !== undefined) {
    posCount = positiveCount;
    negCount = negativeCount + (cautionCount ?? 0);
    neutCount = totalCount - posCount - negCount;
  } else {
    posCount = 0;
    negCount = 0;
    neutCount = 0;

    for (const opinion of citingOpinions) {
      const treatment = opinion.treatment?.toLowerCase();
      if (treatment && NEGATIVE_TREATMENT_TYPES.includes(treatment as TreatmentType)) {
        negCount++;
      } else if (treatment && CAUTION_TREATMENT_TYPES.includes(treatment as TreatmentType)) {
        negCount++;
      } else if (treatment && POSITIVE_TREATMENTS.includes(treatment)) {
        posCount++;
      } else {
        neutCount++;
      }
    }
  }

  // Determine rating
  let rating: StrengthScore['rating'];

  if (totalCount < 5) {
    rating = 'INSUFFICIENT_DATA';
  } else if (negCount > 0 && negCount / totalCount > 0.2) {
    rating = 'WEAK'; // More than 20% negative treatment
  } else if (totalCount >= 50 && posCount / totalCount > 0.5) {
    rating = 'STRONG';
  } else if (totalCount >= 10) {
    rating = 'MODERATE';
  } else {
    rating = 'WEAK';
  }

  return {
    rating,
    citingOpinionCount: totalCount,
    positiveCount: posCount,
    negativeCount: negCount,
    neutralCount: neutCount,
  };
}

// ============================================================================
// TREATMENT EXTRACTION
// ============================================================================

/**
 * Extract negative treatment signals from citing opinions.
 * Identifies the most severe treatment for quick risk assessment.
 */
export function extractTreatmentSignals(citingOpinions: CitingOpinion[]): NegativeTreatmentResult {
  const signals: TreatmentSignal[] = [];

  for (const opinion of citingOpinions) {
    const treatment = opinion.treatment?.toLowerCase() as TreatmentType;
    if (treatment && ALL_NEGATIVE_AND_CAUTION.includes(treatment)) {
      signals.push({
        type: treatment,
        citingOpinionId: opinion.id,
        depth: opinion.depth,
      });
    }
  }

  // Find most severe treatment
  let mostSevere: TreatmentType | null = null;
  let maxSeverity = 0;

  for (const signal of signals) {
    const severity = TREATMENT_SEVERITY[signal.type] || 0;
    if (severity > maxSeverity) {
      maxSeverity = severity;
      mostSevere = signal.type;
    }
  }

  return {
    hasNegativeTreatment: signals.length > 0,
    signals,
    mostSevere,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function emptyResult(): CitationNetworkResult {
  return {
    strength: {
      rating: 'INSUFFICIENT_DATA',
      citingOpinionCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
    },
    negativeTreatment: {
      hasNegativeTreatment: false,
      signals: [],
      mostSevere: null,
    },
    rawCitingOpinions: [],
    totalCount: 0,
    pagesRetrieved: 0,
  };
}
