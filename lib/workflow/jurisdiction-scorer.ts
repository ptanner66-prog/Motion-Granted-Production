/**
 * JURISDICTION SCORER
 *
 * TASK-12: Jurisdiction-weighted relevance scoring.
 *
 * A First Circuit case carries more persuasive weight in the 19th JDC
 * (First Circuit) than a Fifth Circuit case.
 *
 * Audit Evidence (Pelican order):
 * Batch 6 returned Acadian Cypress v. Stewart, 121 So.3d 667
 * (La. App. 1st Cir. 2013) — a First Circuit non-compete case.
 * The 19th JDC is in the First Circuit.
 * This case should have been prioritized but didn't survive.
 *
 * @module jurisdiction-scorer
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-jurisdiction-scorer');

// ============================================================================
// TYPES
// ============================================================================

export type LACircuit = '1st' | '2nd' | '3rd' | '4th' | '5th';

export interface JurisdictionScore {
  score: number;
  reason: string;
  caseCircuit?: LACircuit;
  filingCircuit?: LACircuit;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Louisiana JDC to Circuit mapping.
 *
 * First Circuit: East Baton Rouge, Ascension, Iberville/Pointe Coupee/WBR,
 *                Livingston/St. Helena/Tangipahoa, St. Tammany/Washington
 * Second Circuit: Ouachita/Morehouse, Bienville/Claiborne/Jackson,
 *                 Caddo, Bossier/Webster
 * Third Circuit: Calcasieu, Lafayette/Acadia/Vermilion,
 *                Iberia/St. Martin/St. Mary, St. Landry, Jefferson Davis
 * Fourth Circuit: Civil District Court (Orleans)
 * Fifth Circuit: Jefferson, St. Charles, St. John the Baptist
 */
const JDC_TO_CIRCUIT: Record<string, LACircuit> = {
  // First Circuit
  '19jdc': '1st',  // East Baton Rouge
  '23jdc': '1st',  // Ascension
  '18jdc': '1st',  // Iberville, Pointe Coupee, West Baton Rouge
  '21jdc': '1st',  // Livingston, St. Helena, Tangipahoa
  '22jdc': '1st',  // St. Tammany, Washington

  // Second Circuit
  '4jdc': '2nd',   // Ouachita, Morehouse
  '2jdc': '2nd',   // Bienville, Claiborne, Jackson
  '1jdc': '2nd',   // Caddo
  '26jdc': '2nd',  // Bossier, Webster

  // Third Circuit
  '14jdc': '3rd',  // Calcasieu
  '15jdc': '3rd',  // Lafayette, Acadia, Vermilion
  '16jdc': '3rd',  // Iberia, St. Martin, St. Mary
  '27jdc': '3rd',  // St. Landry
  '31jdc': '3rd',  // Jefferson Davis

  // Fourth Circuit
  'cdc': '4th',    // Civil District Court (Orleans)

  // Fifth Circuit
  '24jdc': '5th',  // Jefferson
  '29jdc': '5th',  // St. Charles
  '40jdc': '5th',  // St. John the Baptist
};

/** Adjacent circuits (for partial bonus). */
const ADJACENT_CIRCUITS: Record<LACircuit, LACircuit[]> = {
  '1st': ['4th', '5th'],
  '2nd': ['3rd'],
  '3rd': ['2nd', '5th'],
  '4th': ['1st', '5th'],
  '5th': ['1st', '3rd', '4th'],
};

/** Scoring constants for jurisdiction weighting. */
const SCORE = {
  LA_SUPREME_COURT: 20,
  SAME_CIRCUIT: 15,
  ADJACENT_CIRCUIT: 5,
  SAME_STATE_DIFFERENT_CIRCUIT: 3,
  OUT_OF_STATE: 0,
  FEDERAL_5TH_CIRCUIT: 12,
  FEDERAL_DISTRICT: 8,
} as const;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate jurisdiction weight for a citation.
 *
 * @param caseCourt - The court that decided the case (e.g. "La. App. 1st Cir.")
 * @param filingCourt - The court where the motion is filed (e.g. "19jdc")
 * @param _filingJurisdiction - The jurisdiction string (reserved for future use)
 * @returns Jurisdiction score with explanation
 */
export function calculateJurisdictionWeight(
  caseCourt: string,
  filingCourt: string,
  _filingJurisdiction: string
): JurisdictionScore {
  const caseCourtLower = caseCourt.toLowerCase();

  // ──────────────────────────────────────────────────────────────────────
  // LOUISIANA SUPREME COURT — Maximum bonus
  // ──────────────────────────────────────────────────────────────────────

  if (isLouisianaSupremeCourt(caseCourtLower)) {
    return {
      score: SCORE.LA_SUPREME_COURT,
      reason: 'Louisiana Supreme Court — binding authority',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // FEDERAL COURTS
  // ──────────────────────────────────────────────────────────────────────

  if (isFederalCourt(caseCourtLower)) {
    if (caseCourtLower.includes('5th') || caseCourtLower.includes('fifth')) {
      return {
        score: SCORE.FEDERAL_5TH_CIRCUIT,
        reason: '5th Circuit Court of Appeals — persuasive for LA federal filings',
      };
    }
    if (caseCourtLower.includes('district')) {
      return {
        score: SCORE.FEDERAL_DISTRICT,
        reason: 'Federal District Court',
      };
    }
    return {
      score: SCORE.OUT_OF_STATE,
      reason: 'Federal court outside 5th Circuit',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // LOUISIANA APPELLATE COURTS
  // ──────────────────────────────────────────────────────────────────────

  const caseCircuit = extractCircuit(caseCourtLower);
  const filingCircuit = JDC_TO_CIRCUIT[filingCourt.toLowerCase()];

  if (!caseCircuit || !filingCircuit) {
    if (isLouisianaCourt(caseCourtLower)) {
      return {
        score: SCORE.SAME_STATE_DIFFERENT_CIRCUIT,
        reason: 'Louisiana court (circuit unknown)',
      };
    }
    return {
      score: SCORE.OUT_OF_STATE,
      reason: 'Out of state or unknown court',
    };
  }

  // Same circuit
  if (caseCircuit === filingCircuit) {
    log.info('Same circuit match', { caseCircuit, filingCourt });
    return {
      score: SCORE.SAME_CIRCUIT,
      reason: `Same circuit (${caseCircuit} Circuit) — highly persuasive`,
      caseCircuit,
      filingCircuit,
    };
  }

  // Adjacent circuit
  if (ADJACENT_CIRCUITS[filingCircuit]?.includes(caseCircuit)) {
    return {
      score: SCORE.ADJACENT_CIRCUIT,
      reason: `Adjacent circuit (${caseCircuit} Circuit filing in ${filingCircuit} Circuit)`,
      caseCircuit,
      filingCircuit,
    };
  }

  // Same state, different circuit
  return {
    score: SCORE.SAME_STATE_DIFFERENT_CIRCUIT,
    reason: `Different circuit (${caseCircuit} Circuit, filing in ${filingCircuit} Circuit)`,
    caseCircuit,
    filingCircuit,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isLouisianaSupremeCourt(court: string): boolean {
  return (
    court.includes('supreme') &&
    (court.includes('louisiana') || court.includes('la.'))
  );
}

function isFederalCourt(court: string): boolean {
  return (
    court.includes('circuit') ||
    court.includes('district') ||
    court.includes('u.s.') ||
    court.includes('federal')
  );
}

function isLouisianaCourt(court: string): boolean {
  return (
    court.includes('louisiana') ||
    court.includes('la.') ||
    court.includes('la app') ||
    /\d+(st|nd|rd|th)\s*cir/i.test(court)
  );
}

/**
 * Extract circuit from court name.
 *
 * Matches patterns like:
 * - "La. App. 1st Cir."
 * - "Louisiana Court of Appeal, First Circuit"
 * - "1 Cir."
 */
function extractCircuit(court: string): LACircuit | null {
  // Match numeric patterns
  const numMatch = court.match(/(\d)(st|nd|rd|th)?\s*cir/i);
  if (numMatch) {
    const num = numMatch[1];
    const circuitMap: Record<string, LACircuit> = {
      '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th',
    };
    return circuitMap[num] || null;
  }

  // Match word patterns
  const wordMatch = court.match(/(first|second|third|fourth|fifth)\s*circuit/i);
  if (wordMatch) {
    const wordMap: Record<string, LACircuit> = {
      'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th',
    };
    return wordMap[wordMatch[1].toLowerCase()] || null;
  }

  return null;
}

/**
 * Get all JDCs in a circuit.
 */
export function getJDCsInCircuit(circuit: LACircuit): string[] {
  return Object.entries(JDC_TO_CIRCUIT)
    .filter(([, c]) => c === circuit)
    .map(([jdc]) => jdc);
}

/**
 * Get circuit for a JDC.
 */
export function getCircuitForJDC(jdc: string): LACircuit | null {
  return JDC_TO_CIRCUIT[jdc.toLowerCase()] || null;
}
