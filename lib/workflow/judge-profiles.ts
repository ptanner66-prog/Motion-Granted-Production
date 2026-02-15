/**
 * Judge Simulation Profiles — DEFAULT_STATE baseline
 *
 * SP-C Task 20 (Step 7.14b / Gap 47)
 *
 * Provides judicial simulation profiles for Phase VII.
 * DEFAULT_STATE uses FRCP as baseline for federal, generic state standards for state.
 * NEVER applies CRC 3.1113 to non-CA orders.
 *
 * @module workflow/judge-profiles
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JudgeProfile {
  /** Identifier for this profile */
  id: string;
  /** Display name */
  name: string;
  /** Court type this profile applies to */
  courtType: 'STATE' | 'FEDERAL';
  /** Rules of procedure reference */
  proceduralRules: string;
  /** Motion page/word limits */
  pageLimits: {
    motion: number;
    opposition: number;
    reply: number;
    msj: number;
  };
  /** Separate statement requirements */
  separateStatement: {
    required: boolean;
    rule: string;
  };
  /** Evidence standards */
  evidenceStandard: string;
  /** How strict the judge is on formatting */
  formattingStrictness: 'strict' | 'moderate' | 'lenient';
  /** Specific evaluation criteria */
  evaluationFocus: string[];
}

// ============================================================================
// PROFILES
// ============================================================================

const CALIFORNIA_STATE: JudgeProfile = {
  id: 'CA_STATE',
  name: 'California Superior Court',
  courtType: 'STATE',
  proceduralRules: 'California Code of Civil Procedure; California Rules of Court',
  pageLimits: { motion: 15, opposition: 15, reply: 10, msj: 20 },
  separateStatement: {
    required: true,
    rule: 'CRC 3.1350 — Separate Statement of Undisputed Material Facts required for MSJ/MSA',
  },
  evidenceStandard: 'Declarations under penalty of perjury per CCP § 2015.5; authenticated exhibits per Evidence Code § 1400 et seq.',
  formattingStrictness: 'strict',
  evaluationFocus: [
    'Line numbering compliance (CRC 3.1113)',
    'Separate statement completeness',
    'Meet and confer declaration',
    'Proper notice of motion format',
  ],
};

const CALIFORNIA_FEDERAL: JudgeProfile = {
  id: 'CA_FEDERAL',
  name: 'California Federal Court (9th Circuit)',
  courtType: 'FEDERAL',
  proceduralRules: 'Federal Rules of Civil Procedure; Local Rules of the Central/Northern/Southern/Eastern District of California',
  pageLimits: { motion: 25, opposition: 25, reply: 15, msj: 35 },
  separateStatement: {
    required: true,
    rule: 'Local Rule 56 — Statement of Uncontroverted Facts and Conclusions of Law',
  },
  evidenceStandard: 'Declarations under 28 U.S.C. § 1746; authenticated exhibits per FRE 901/902.',
  formattingStrictness: 'moderate',
  evaluationFocus: [
    'Compliance with FRCP and local rules',
    'Citation to binding 9th Circuit authority',
    'Statement of genuine disputes of material fact',
  ],
};

const LOUISIANA_STATE: JudgeProfile = {
  id: 'LA_STATE',
  name: 'Louisiana State Court',
  courtType: 'STATE',
  proceduralRules: 'Louisiana Code of Civil Procedure; Louisiana District Court Rules',
  pageLimits: { motion: 30, opposition: 30, reply: 15, msj: 30 },
  separateStatement: {
    required: false,
    rule: 'Not required — Louisiana practice uses memoranda in support',
  },
  evidenceStandard: 'Affidavits under La. C.C.P. art. 967; La. C.E. art. 901 authentication.',
  formattingStrictness: 'moderate',
  evaluationFocus: [
    'Proper exception classification (declinatory/dilatory/peremptory)',
    'Citation to Louisiana Civil Code and Code of Civil Procedure',
    'Legal paper format compliance',
  ],
};

const LOUISIANA_FEDERAL: JudgeProfile = {
  id: 'LA_FEDERAL',
  name: 'Louisiana Federal Court (5th Circuit)',
  courtType: 'FEDERAL',
  proceduralRules: 'Federal Rules of Civil Procedure; Local Rules of the Eastern/Middle/Western District of Louisiana',
  pageLimits: { motion: 25, opposition: 25, reply: 15, msj: 30 },
  separateStatement: {
    required: true,
    rule: 'Local Rule 56.1 — Statement of Material Facts',
  },
  evidenceStandard: 'Declarations under 28 U.S.C. § 1746; authenticated exhibits per FRE 901/902.',
  formattingStrictness: 'moderate',
  evaluationFocus: [
    'Compliance with FRCP and local rules',
    'Citation to binding 5th Circuit authority',
    'Proper 12(b)(6) analysis under Twombly/Iqbal',
  ],
};

/**
 * DEFAULT_STATE — Generic judicial profile.
 *
 * BD-19: ZERO state-specific statutory references.
 * Uses FRCP as baseline for federal, generic state standards for state.
 * NEVER applies CRC 3.1113 to non-CA orders.
 */
const DEFAULT_STATE: JudgeProfile = {
  id: 'DEFAULT_STATE',
  name: 'State Court (Generic)',
  courtType: 'STATE',
  proceduralRules: 'Applicable state rules of civil procedure; local court rules',
  pageLimits: { motion: 25, opposition: 25, reply: 15, msj: 30 },
  separateStatement: {
    required: false,
    rule: 'See local rules for separate statement requirements',
  },
  evidenceStandard: 'Declarations under penalty of perjury under applicable state law; properly authenticated exhibits.',
  formattingStrictness: 'moderate',
  evaluationFocus: [
    'Compliance with applicable rules of civil procedure',
    'Proper citation to controlling authority',
    'Logical organization and persuasive advocacy',
    'Complete factual record with evidentiary support',
  ],
};

const DEFAULT_FEDERAL: JudgeProfile = {
  id: 'DEFAULT_FEDERAL',
  name: 'Federal Court (Generic)',
  courtType: 'FEDERAL',
  proceduralRules: 'Federal Rules of Civil Procedure; applicable local rules',
  pageLimits: { motion: 25, opposition: 25, reply: 15, msj: 30 },
  separateStatement: {
    required: false,
    rule: 'See local rules for statement of material facts requirements',
  },
  evidenceStandard: 'Declarations under 28 U.S.C. § 1746; authenticated exhibits per FRE 901/902.',
  formattingStrictness: 'moderate',
  evaluationFocus: [
    'Compliance with FRCP and local rules',
    'Citation to binding circuit authority',
    'Proper standards of review',
    'Logical organization and persuasive advocacy',
  ],
};

// ============================================================================
// PROFILE REGISTRY
// ============================================================================

const PROFILE_REGISTRY: Record<string, JudgeProfile> = {
  'CA_STATE': CALIFORNIA_STATE,
  'CA_FEDERAL': CALIFORNIA_FEDERAL,
  'LA_STATE': LOUISIANA_STATE,
  'LA_FEDERAL': LOUISIANA_FEDERAL,
  'FEDERAL_5TH': LOUISIANA_FEDERAL,
  'FEDERAL_9TH': CALIFORNIA_FEDERAL,
  'DEFAULT_STATE': DEFAULT_STATE,
  'DEFAULT_FEDERAL': DEFAULT_FEDERAL,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the judicial simulation profile for a formatting key.
 *
 * Fallback chain: exact match → DEFAULT_STATE/DEFAULT_FEDERAL
 *
 * @param formattingKey - e.g. 'CA_STATE', 'FEDERAL_9TH', 'TX_STATE'
 * @returns The judge profile to use for Phase VII simulation
 */
export function getJudgeProfile(formattingKey: string): JudgeProfile {
  const key = formattingKey.toUpperCase();

  // Exact match
  if (PROFILE_REGISTRY[key]) {
    return PROFILE_REGISTRY[key];
  }

  // Court type fallback
  if (key.includes('FEDERAL')) {
    return DEFAULT_FEDERAL;
  }

  return DEFAULT_STATE;
}

/**
 * Get the judge profile for an order using its state/court_type.
 *
 * @param stateCode - Two-letter state code
 * @param courtType - STATE or FEDERAL
 */
export function getJudgeProfileForOrder(stateCode: string, courtType: 'STATE' | 'FEDERAL'): JudgeProfile {
  const key = courtType === 'FEDERAL'
    ? `${stateCode.toUpperCase()}_FEDERAL`
    : `${stateCode.toUpperCase()}_STATE`;
  return getJudgeProfile(key);
}
