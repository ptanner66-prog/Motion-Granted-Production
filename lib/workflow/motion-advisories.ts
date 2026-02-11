/**
 * Motion Type Advisories
 *
 * QC-024: TRO advisory — time-critical requirements and irreparable harm standard
 * QC-025: Anti-SLAPP advisory — state-specific procedural requirements
 * QC-026: MSJ advisory — statement of undisputed facts requirements
 *
 * These advisories are injected into the workflow context before Phase II
 * to ensure Claude addresses motion-specific requirements from the start.
 */

export interface MotionAdvisory {
  motionType: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  requirements: string[];
  commonPitfalls: string[];
  additionalContext: string;
}

/**
 * QC-024: TRO / Preliminary Injunction Advisory
 */
const TRO_ADVISORY: MotionAdvisory = {
  motionType: 'tro',
  severity: 'CRITICAL',
  title: 'Temporary Restraining Order — Special Requirements',
  requirements: [
    'IRREPARABLE HARM: Must demonstrate that the moving party will suffer irreparable injury unless the TRO is granted. Monetary damages alone are insufficient.',
    'LIKELIHOOD OF SUCCESS: Must show a substantial likelihood of success on the merits of the underlying claim.',
    'BALANCE OF HARDSHIPS: Must demonstrate that the balance of hardships tips in favor of the moving party.',
    'PUBLIC INTEREST: Must address whether the injunction serves the public interest.',
    'SPECIFICITY: The proposed order must describe in reasonable detail the act(s) restrained or required (FRCP 65(d)).',
    'SECURITY/BOND: Must address the bond requirement under FRCP 65(c) or applicable state rule.',
    'EX PARTE REQUIREMENTS: If sought without notice, must certify efforts to notify opposing party and specific reasons why notice should not be required.',
  ],
  commonPitfalls: [
    'Failing to allege irreparable harm with specificity (vague assertions are insufficient)',
    'Not addressing all four injunction factors',
    'Omitting the bond/security discussion',
    'Missing the FRCP 65(d) specificity requirement for the proposed order',
    'Filing without proper verification or declaration under penalty of perjury',
  ],
  additionalContext:
    'TROs are emergency motions. The court expects concise, urgent presentation. ' +
    'Include a proposed order as an exhibit. Louisiana state courts follow La. C.C.P. art. 3601-3613. ' +
    'Federal courts follow FRCP 65. Time is of the essence — filing deadline compliance is critical.',
};

/**
 * QC-025: Anti-SLAPP Advisory
 */
const ANTI_SLAPP_ADVISORY: MotionAdvisory = {
  motionType: 'anti_slapp',
  severity: 'CRITICAL',
  title: 'Anti-SLAPP Motion — State-Specific Procedural Requirements',
  requirements: [
    'PROTECTED ACTIVITY: Must identify the specific protected activity (speech, petition, association) at issue.',
    'BURDEN SHIFTING: Phase 1 — Moving party must show the claims arise from protected activity. Phase 2 — Burden shifts to plaintiff to demonstrate probability of prevailing.',
    'STATE-SPECIFIC STATUTE: Must cite the correct state anti-SLAPP statute (varies significantly by state). Louisiana does not have a traditional anti-SLAPP statute.',
    'DISCOVERY STAY: Address whether filing triggers an automatic discovery stay under the applicable statute.',
    'ATTORNEY FEES: Address the mandatory attorney fees provision (most anti-SLAPP statutes require fee-shifting to the prevailing movant).',
    'TIMING: Must be filed within the statutory deadline (often 60 days of service in California CCP 425.16).',
  ],
  commonPitfalls: [
    'Applying the wrong state anti-SLAPP standard (California, Texas, and other states differ significantly)',
    'Not clearly identifying the protected activity',
    'Failing to address both prongs of the burden-shifting analysis',
    'Missing the filing deadline (many statutes have strict timing requirements)',
    'Not requesting attorney fees (often mandatory under the statute)',
    'Louisiana note: Louisiana does not have a comprehensive anti-SLAPP statute; consider federal counterparts or alternative motions',
  ],
  additionalContext:
    'Anti-SLAPP motions are highly jurisdiction-specific. The analysis framework varies dramatically between states. ' +
    'California (CCP 425.16), Texas (TCPA Ch. 27), and other states have fundamentally different approaches. ' +
    'Always verify the applicable statute and filing deadline for the specific jurisdiction.',
};

/**
 * QC-026: MSJ / Summary Judgment Advisory
 */
const MSJ_ADVISORY: MotionAdvisory = {
  motionType: 'msj',
  severity: 'WARNING',
  title: 'Motion for Summary Judgment — Statement of Undisputed Facts Required',
  requirements: [
    'STATEMENT OF UNDISPUTED MATERIAL FACTS (SUMF): Must include a separate, numbered statement of each material fact the movant contends is undisputed, with specific record citations.',
    'RECORD CITATIONS: Each fact must cite to specific evidence in the record (depositions, declarations, documents). Unsupported facts will be disregarded.',
    'NO GENUINE DISPUTE STANDARD: Must demonstrate there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law (FRCP 56(a)).',
    'SUPPORTING EVIDENCE: Must attach or identify all evidence supporting each undisputed fact (declarations, deposition excerpts, exhibits).',
    'LOCAL RULES: Many courts have specific formatting requirements for the SUMF. Check the local rules for the specific court.',
    'SEPARATE STATEMENT: Some jurisdictions (e.g., California) require a separate statement as a standalone document.',
  ],
  commonPitfalls: [
    'Submitting without a properly formatted Statement of Undisputed Material Facts',
    'Citing to evidence not in the record or not properly authenticated',
    'Including legal arguments in the fact statement (facts only, no argument)',
    'Failing to address all elements of each claim/defense',
    'Not reviewing opposing party evidence that may create genuine disputes',
    'Missing local rule requirements for separate statement formatting',
  ],
  additionalContext:
    'Summary judgment motions are among the most complex filings. The SUMF is often the most important document — ' +
    'judges rely on it to determine if factual disputes exist. Louisiana state courts follow La. C.C.P. art. 966-967. ' +
    'Federal courts follow FRCP 56. Always check local rules for additional requirements (many districts mandate ' +
    'a separate statement of material facts in a specific format).',
};

/**
 * Map of motion type identifiers to their advisories.
 */
const ADVISORY_MAP: Record<string, MotionAdvisory> = {
  // TRO variants
  tro: TRO_ADVISORY,
  temporary_restraining_order: TRO_ADVISORY,
  preliminary_injunction: TRO_ADVISORY,

  // Anti-SLAPP variants
  anti_slapp: ANTI_SLAPP_ADVISORY,
  slapp: ANTI_SLAPP_ADVISORY,

  // MSJ variants
  msj: MSJ_ADVISORY,
  msj_simple: MSJ_ADVISORY,
  msj_complex: MSJ_ADVISORY,
  summary_judgment: MSJ_ADVISORY,
  motion_for_summary_judgment: MSJ_ADVISORY,
  partial_sj: MSJ_ADVISORY,
  opp_msj: MSJ_ADVISORY,
};

/**
 * Get advisory for a motion type.
 * Returns null if no special advisory exists for the given type.
 *
 * @param motionType - The motion type string (from order or config)
 */
export function getMotionAdvisory(motionType: string): MotionAdvisory | null {
  const normalized = motionType.toLowerCase().replace(/[\s-]+/g, '_');
  return ADVISORY_MAP[normalized] || null;
}

/**
 * Format advisory as a prompt injection for the AI pipeline.
 * Inserted before Phase II to guide the entire workflow.
 */
export function formatAdvisoryForPrompt(advisory: MotionAdvisory): string {
  const severityLabel = advisory.severity === 'CRITICAL'
    ? 'CRITICAL ADVISORY'
    : advisory.severity === 'WARNING'
      ? 'IMPORTANT ADVISORY'
      : 'ADVISORY';

  return `
=== ${severityLabel}: ${advisory.title} ===

MANDATORY REQUIREMENTS FOR THIS MOTION TYPE:
${advisory.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

COMMON PITFALLS TO AVOID:
${advisory.commonPitfalls.map(p => `- ${p}`).join('\n')}

${advisory.additionalContext}

=== END ADVISORY ===
`.trim();
}

/**
 * Check if a motion type has any advisory.
 */
export function hasAdvisory(motionType: string): boolean {
  return getMotionAdvisory(motionType) !== null;
}

// ============================================================================
// ADVISORY GENERATION API (SP8)
// ============================================================================

/**
 * Structured advisory with unique ID and statute references.
 * Used for workflow output and audit trail.
 */
export interface Advisory {
  id: string;
  motionType: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  statutes: string[];
  requirements: string[];
  commonPitfalls: string[];
}

/**
 * Statute map for each advisory type, keyed by jurisdiction prefix.
 * 'federal' entries apply when jurisdiction contains 'federal' (case-insensitive).
 * State codes (e.g. 'LA', 'CA') apply for state courts.
 */
const STATUTE_MAP: Record<string, Record<string, string[]>> = {
  TRO: {
    LA: ['C.C.P. Art. 3601-3613'],
    federal: ['FRCP 65'],
    CA: ['CCP 527'],
    TX: ['TRCP 680'],
  },
  ANTI_SLAPP: {
    CA: ['CCP 425.16'],
    TX: ['TCPA Ch. 27'],
    federal: [],
    LA: [],
  },
  MSJ: {
    LA: ['C.C.P. Art. 966-967'],
    federal: ['FRCP 56'],
    CA: ['CCP 437c'],
    TX: ['TRCP 166a'],
  },
};

/**
 * Advisory ID map (QC codes).
 */
const ADVISORY_ID_MAP: Record<string, string> = {
  TRO: 'QC-024',
  ANTI_SLAPP: 'QC-025',
  MSJ: 'QC-026',
};

/**
 * Canonical type name map — maps detected types to their internal key.
 */
const CANONICAL_TYPE_MAP: Record<string, string> = {
  tro: 'TRO',
  temporary_restraining_order: 'TRO',
  preliminary_injunction: 'TRO',
  anti_slapp: 'ANTI_SLAPP',
  slapp: 'ANTI_SLAPP',
  msj: 'MSJ',
  msj_simple: 'MSJ',
  msj_complex: 'MSJ',
  summary_judgment: 'MSJ',
  motion_for_summary_judgment: 'MSJ',
  partial_sj: 'MSJ',
  opp_msj: 'MSJ',
};

/**
 * Detect which advisory-relevant motion types apply based on the motion type string
 * and optional description. Returns an array of canonical type keys (e.g. ['TRO', 'MSJ']).
 *
 * @param motionType - The motion type name (e.g. 'Temporary Restraining Order')
 * @param description - Optional additional description text to scan for keywords
 */
export function detectMotionType(motionType: string, description: string = ''): string[] {
  const combined = `${motionType} ${description}`.toLowerCase();
  const detected = new Set<string>();

  // Check against known patterns
  const patterns: Array<{ regex: RegExp; type: string }> = [
    { regex: /\btro\b|temporary\s+restraining|preliminary\s+injunction/, type: 'TRO' },
    { regex: /anti[_\s-]*slapp|slapp/, type: 'ANTI_SLAPP' },
    { regex: /\bmsj\b|summary\s+judgment|motion\s+for\s+summary/, type: 'MSJ' },
  ];

  for (const { regex, type } of patterns) {
    if (regex.test(combined)) {
      detected.add(type);
    }
  }

  // Also check normalized key against canonical map
  const normalized = motionType.toLowerCase().replace(/[\s-]+/g, '_');
  const canonical = CANONICAL_TYPE_MAP[normalized];
  if (canonical) {
    detected.add(canonical);
  }

  return Array.from(detected);
}

/**
 * Generate structured advisories for the given motion types and jurisdiction.
 *
 * @param types - Array of canonical type keys from detectMotionType() (e.g. ['TRO'])
 * @param jurisdiction - Jurisdiction string (e.g. 'LA', 'Federal', 'CA')
 * @returns Array of Advisory objects with statutes resolved for the jurisdiction
 */
export function generateAdvisories(types: string[], jurisdiction: string): Advisory[] {
  const advisories: Advisory[] = [];
  const normalizedJurisdiction = jurisdiction.toUpperCase().trim();
  const isFederal = normalizedJurisdiction.includes('FEDERAL');

  // Map canonical type to the MotionAdvisory source data
  const typeToAdvisory: Record<string, MotionAdvisory> = {
    TRO: TRO_ADVISORY,
    ANTI_SLAPP: ANTI_SLAPP_ADVISORY,
    MSJ: MSJ_ADVISORY,
  };

  for (const type of types) {
    const source = typeToAdvisory[type];
    if (!source) continue;

    const id = ADVISORY_ID_MAP[type] || `QC-${type}`;
    const statuteMap = STATUTE_MAP[type] || {};

    // Resolve statutes: combine jurisdiction-specific + federal if applicable
    const statutes: string[] = [];
    if (isFederal) {
      statutes.push(...(statuteMap['federal'] || []));
    } else {
      // Extract state code from jurisdiction (e.g. 'LA' from 'Louisiana' or 'LA')
      const stateCode = extractStateCode(normalizedJurisdiction);
      if (stateCode && statuteMap[stateCode]) {
        statutes.push(...statuteMap[stateCode]);
      }
      // Always include federal statutes as supplementary
      statutes.push(...(statuteMap['federal'] || []));
    }

    advisories.push({
      id,
      motionType: type,
      severity: source.severity,
      title: source.title,
      statutes,
      requirements: source.requirements,
      commonPitfalls: source.commonPitfalls,
    });
  }

  return advisories;
}

/**
 * Extract a 2-letter state code from a jurisdiction string.
 */
function extractStateCode(jurisdiction: string): string | null {
  const stateNames: Record<string, string> = {
    LOUISIANA: 'LA', CALIFORNIA: 'CA', TEXAS: 'TX', FLORIDA: 'FL',
    'NEW YORK': 'NY', GEORGIA: 'GA', ILLINOIS: 'IL', OHIO: 'OH',
    PENNSYLVANIA: 'PA', MICHIGAN: 'MI', VIRGINIA: 'VA', WASHINGTON: 'WA',
    ARIZONA: 'AZ', COLORADO: 'CO', MASSACHUSETTS: 'MA', MARYLAND: 'MD',
    MINNESOTA: 'MN', MISSOURI: 'MO', NEVADA: 'NV', 'NEW JERSEY': 'NJ',
    'NORTH CAROLINA': 'NC', OREGON: 'OR', TENNESSEE: 'TN', WISCONSIN: 'WI',
  };

  // Check if it's already a 2-letter code
  if (/^[A-Z]{2}$/.test(jurisdiction)) {
    return jurisdiction;
  }

  // Try to extract from full state name
  for (const [name, code] of Object.entries(stateNames)) {
    if (jurisdiction.includes(name)) {
      return code;
    }
  }

  return null;
}
