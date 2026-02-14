/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Jurisdiction-Aware Authority Classification — BUG-10 Production Fix
 *
 * Classifies citations as binding or persuasive based on:
 * 1. The court that issued the opinion
 * 2. The jurisdiction where the motion is being filed
 *
 * LOUISIANA COURT HIERARCHY:
 * - LA Supreme Court = BINDING on ALL LA courts
 * - Correct Circuit Court of Appeal = BINDING on district courts in that circuit
 * - Other Circuit Courts of Appeal = PERSUASIVE
 * - Federal courts interpreting LA law = PERSUASIVE
 *
 * FEDERAL HIERARCHY:
 * - US Supreme Court = BINDING on all federal courts
 * - Same-circuit Court of Appeals = BINDING
 * - Other circuits = PERSUASIVE
 */

// ============================================================================
// TYPES
// ============================================================================

export type AuthorityLevel = 'binding' | 'persuasive' | 'unknown';

export interface ClassificationResult {
  authorityLevel: AuthorityLevel;
  reason: string;
}

// ============================================================================
// LOUISIANA CIRCUIT MAPPING
// ============================================================================

// Maps JDC numbers to their Circuit Court of Appeal
const LA_JDC_TO_CIRCUIT: Record<string, number> = {
  // 1st Circuit: East Baton Rouge, Ascension, etc.
  '19th JDC': 1, '21st JDC': 1, '22nd JDC': 1, '23rd JDC': 1,
  '18th JDC': 1, '20th JDC': 1, '32nd JDC': 1,
  'East Baton Rouge': 1, 'Ascension': 1, 'Livingston': 1,
  // 2nd Circuit: Caddo, Bossier, etc.
  '1st JDC': 2, '4th JDC': 2, '26th JDC': 2, '2nd JDC': 2,
  'Caddo': 2, 'Bossier': 2,
  // 3rd Circuit: Lafayette, Calcasieu, etc.
  '9th JDC': 2, '14th JDC': 3, '15th JDC': 3, '27th JDC': 3,
  '31st JDC': 3, '12th JDC': 3, '13th JDC': 3,
  'Lafayette': 3, 'Calcasieu': 3, 'Rapides': 3,
  // 4th Circuit: Orleans Parish
  'Orleans': 4, 'Orleans Parish': 4,
  // 5th Circuit: Jefferson Parish, etc.
  '24th JDC': 5, '29th JDC': 5,
  'Jefferson': 5, 'Jefferson Parish': 5,
};

// Maps circuit numbers to common court name patterns
const LA_CIRCUIT_PATTERNS: Record<number, string[]> = {
  1: ['First Circuit', '1st Circuit', '1st Cir.', 'La. App. 1'],
  2: ['Second Circuit', '2nd Circuit', '2nd Cir.', 'La. App. 2'],
  3: ['Third Circuit', '3rd Circuit', '3rd Cir.', 'La. App. 3'],
  4: ['Fourth Circuit', '4th Circuit', '4th Cir.', 'La. App. 4'],
  5: ['Fifth Circuit', '5th Circuit', '5th Cir.', 'La. App. 5'],
};

// ============================================================================
// FEDERAL CIRCUIT MAPPING
// ============================================================================

const FEDERAL_DISTRICT_TO_CIRCUIT: Record<string, number> = {
  'EDLA': 5, 'MDLA': 5, 'WDLA': 5, // Louisiana → 5th Circuit
  'NDCA': 9, 'CDCA': 9, 'SDCA': 9, 'EDCA': 9, // California → 9th Circuit
  'SDNY': 2, 'EDNY': 2, 'NDNY': 2, 'WDNY': 2, // New York → 2nd Circuit
  'NDTX': 5, 'SDTX': 5, 'EDTX': 5, 'WDTX': 5, // Texas → 5th Circuit
};

const FEDERAL_CIRCUIT_PATTERNS: Record<number, string[]> = {
  1: ['First Circuit', '1st Cir.'],
  2: ['Second Circuit', '2nd Cir.'],
  3: ['Third Circuit', '3rd Cir.'],
  4: ['Fourth Circuit', '4th Cir.'],
  5: ['Fifth Circuit', '5th Cir.'],
  6: ['Sixth Circuit', '6th Cir.'],
  7: ['Seventh Circuit', '7th Cir.'],
  8: ['Eighth Circuit', '8th Cir.'],
  9: ['Ninth Circuit', '9th Cir.'],
  10: ['Tenth Circuit', '10th Cir.'],
  11: ['Eleventh Circuit', '11th Cir.'],
};

// ============================================================================
// CLASSIFICATION
// ============================================================================

/**
 * Determine the LA circuit for a given jurisdiction/court division string
 */
function getLACircuit(jurisdiction: string): number | null {
  const upper = jurisdiction.toUpperCase();
  for (const [key, circuit] of Object.entries(LA_JDC_TO_CIRCUIT)) {
    if (upper.includes(key.toUpperCase())) return circuit;
  }
  return null;
}

/**
 * Determine the federal circuit for a given jurisdiction
 */
function getFederalCircuit(jurisdiction: string): number | null {
  const upper = jurisdiction.toUpperCase();
  for (const [key, circuit] of Object.entries(FEDERAL_DISTRICT_TO_CIRCUIT)) {
    if (upper.includes(key.toUpperCase())) return circuit;
  }
  return null;
}

/**
 * Detect which circuit a court name belongs to
 */
function detectCircuitFromCourt(court: string, patterns: Record<number, string[]>): number | null {
  const upper = court.toUpperCase();
  for (const [circuit, names] of Object.entries(patterns)) {
    if (names.some(name => upper.includes(name.toUpperCase()))) {
      return Number(circuit);
    }
  }
  return null;
}

/**
 * Classify a citation's authority level based on jurisdiction.
 *
 * @param citationCourt - The court that issued the opinion (e.g., "La. App. 1 Cir.")
 * @param filingJurisdiction - Where the motion is being filed (e.g., "19th JDC")
 * @param filingCourtDivision - Optional court division for more precise matching
 */
export function classifyAuthority(
  citationCourt: string,
  filingJurisdiction: string,
  filingCourtDivision?: string
): ClassificationResult {
  const courtUpper = citationCourt.toUpperCase();
  const jurisdictionUpper = filingJurisdiction.toUpperCase();

  // ==================== US SUPREME COURT ====================
  if (courtUpper.includes('SUPREME COURT') && courtUpper.includes('UNITED STATES') ||
      courtUpper.includes('U.S.') && courtUpper.includes('SUPREME') ||
      courtUpper.includes('SCOTUS')) {
    return { authorityLevel: 'binding', reason: 'US Supreme Court is binding on all courts' };
  }

  // ==================== LOUISIANA STATE COURTS ====================
  const isLAFiling = jurisdictionUpper.includes('LA') || jurisdictionUpper.includes('LOUISIANA') ||
                     jurisdictionUpper.includes('JDC') || jurisdictionUpper.includes('PARISH');

  if (isLAFiling) {
    // LA Supreme Court
    if (courtUpper.includes('LOUISIANA SUPREME') || courtUpper.includes('LA. SUP') ||
        courtUpper.includes('LA SUP') || (courtUpper.includes('SO.') && courtUpper.includes('LA.'))) {
      // Check if it's actually LA Supreme Court vs LA App
      if (!courtUpper.includes('APP')) {
        return { authorityLevel: 'binding', reason: 'Louisiana Supreme Court is binding on all LA courts' };
      }
    }

    // LA Circuit Court of Appeal
    const filingCircuit = getLACircuit(filingJurisdiction) || getLACircuit(filingCourtDivision || '');
    const citationCircuit = detectCircuitFromCourt(citationCourt, LA_CIRCUIT_PATTERNS);

    if (citationCircuit !== null && filingCircuit !== null) {
      if (citationCircuit === filingCircuit) {
        return {
          authorityLevel: 'binding',
          reason: `${citationCircuit === 1 ? 'First' : citationCircuit === 2 ? 'Second' : citationCircuit === 3 ? 'Third' : citationCircuit === 4 ? 'Fourth' : 'Fifth'} Circuit Court of Appeal is binding on courts within its circuit`,
        };
      }
      return {
        authorityLevel: 'persuasive',
        reason: `Different circuit (${citationCircuit}) than filing circuit (${filingCircuit})`,
      };
    }
  }

  // ==================== FEDERAL COURTS ====================
  const isFederalFiling = jurisdictionUpper.includes('FEDERAL') || jurisdictionUpper.includes('DISTRICT') ||
                          jurisdictionUpper.includes('EDLA') || jurisdictionUpper.includes('MDLA') ||
                          jurisdictionUpper.includes('WDLA') || jurisdictionUpper.includes('NDCA');

  if (isFederalFiling || !isLAFiling) {
    const filingFedCircuit = getFederalCircuit(filingJurisdiction);
    const citationFedCircuit = detectCircuitFromCourt(citationCourt, FEDERAL_CIRCUIT_PATTERNS);

    if (citationFedCircuit !== null && filingFedCircuit !== null) {
      if (citationFedCircuit === filingFedCircuit) {
        return { authorityLevel: 'binding', reason: `Same federal circuit (${citationFedCircuit})` };
      }
      return { authorityLevel: 'persuasive', reason: `Different federal circuit` };
    }
  }

  // Default: unknown
  return { authorityLevel: 'unknown', reason: 'Could not determine court hierarchy relationship' };
}
