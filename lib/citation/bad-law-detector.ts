/**
 * Bad Law Detector
 *
 * High-level bad law detection that delegates to the unified citation network
 * module. Replaces direct CourtListener API calls with a single unified query
 * that returns both strength and treatment data.
 *
 * For the full 3-layer bad law check (CL + curated DB + AI analysis),
 * see lib/citation/steps/step-5-bad-law.ts (legacy pipeline).
 *
 * @version BATCH_10 — ST-004
 */

import {
  getForwardCitations,
  type CitationNetworkResult,
  type NegativeTreatmentResult,
  type TreatmentType,
} from '@/lib/courtlistener/citation-network';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('bad-law-detector');

// ============================================================================
// TYPES
// ============================================================================

export interface BadLawResult {
  isBadLaw: boolean;
  severity: 'NONE' | 'CAUTION' | 'NEGATIVE' | 'OVERRULED';
  signals: NegativeTreatmentResult['signals'];
  mostSevereTreatment: TreatmentType | null;
  citingOpinionCount: number;
  negativeCount: number;
  recommendation: string;
}

// Treatments that indicate the case is definitively bad law
const DEFINITIVE_BAD_LAW: TreatmentType[] = ['overruled', 'reversed', 'vacated', 'superseded', 'abrogated'];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check for bad law via the unified citation network module.
 *
 * Queries CourtListener ONCE and analyzes treatment signals to determine
 * whether the cited opinion has been overruled, reversed, or otherwise
 * negatively treated.
 *
 * @param opinionId - CourtListener opinion ID
 * @returns Bad law assessment with severity and treatment details
 */
export async function checkBadLaw(opinionId: number | string): Promise<BadLawResult> {
  log.info(`[BadLawDetector] Checking opinion ${opinionId} for bad law`);

  let networkResult: CitationNetworkResult;
  try {
    networkResult = await getForwardCitations(opinionId);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[BadLawDetector] Failed to query citation network: ${errorMsg}`);
    return {
      isBadLaw: false,
      severity: 'CAUTION',
      signals: [],
      mostSevereTreatment: null,
      citingOpinionCount: 0,
      negativeCount: 0,
      recommendation: `Error during bad law check: ${errorMsg}. Manual review recommended.`,
    };
  }

  const { negativeTreatment, strength } = networkResult;

  // Determine severity based on most severe treatment
  const isBadLaw = negativeTreatment.mostSevere !== null &&
    DEFINITIVE_BAD_LAW.includes(negativeTreatment.mostSevere);

  let severity: BadLawResult['severity'];
  let recommendation: string;

  if (isBadLaw) {
    severity = negativeTreatment.mostSevere === 'overruled' ? 'OVERRULED' : 'NEGATIVE';
    recommendation = `Case has been ${negativeTreatment.mostSevere}. Do not cite as binding authority.`;
  } else if (negativeTreatment.hasNegativeTreatment) {
    severity = 'CAUTION';
    const signalTypes = [...new Set(negativeTreatment.signals.map(s => s.type))].join(', ');
    recommendation = `Case has negative treatment signals (${signalTypes}). Review before citing.`;
  } else {
    severity = 'NONE';
    recommendation = strength.citingOpinionCount > 0
      ? 'No negative treatment found. Case appears to be good law.'
      : 'No citation data available. Manual verification recommended.';
  }

  log.info(
    `[BadLawDetector] Opinion ${opinionId}: severity=${severity}, ` +
    `isBadLaw=${isBadLaw}, signals=${negativeTreatment.signals.length}`
  );

  return {
    isBadLaw,
    severity,
    signals: negativeTreatment.signals,
    mostSevereTreatment: negativeTreatment.mostSevere,
    citingOpinionCount: strength.citingOpinionCount,
    negativeCount: strength.negativeCount,
    recommendation,
  };
}
