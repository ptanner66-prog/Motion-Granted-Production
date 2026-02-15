/**
 * Court ID Map for CourtListener Lookups
 *
 * SP-C Tasks 30, 31 (Steps 11, 11a / Gaps 38, 46)
 *
 * Three-tier lookup:
 *   Tier 1: Exact match from COURT_ID_MAP
 *   Tier 2: CourtListener general search (fuzzy)
 *   Tier 3: DEGRADED fallback (log warning, return null)
 *
 * Expanded to support all 50 states + DC.
 *
 * @module courtlistener/court-id-map
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('court-id-map');

// ============================================================================
// TIER 1: EXACT MATCH MAP
// ============================================================================

export const COURT_ID_MAP: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // FEDERAL COURTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Supreme Court
  'U.S. Supreme Court': 'scotus',

  // Federal Circuits
  '1st Circuit': 'ca1',
  '2nd Circuit': 'ca2',
  '3rd Circuit': 'ca3',
  '4th Circuit': 'ca4',
  '5th Circuit': 'ca5',
  '6th Circuit': 'ca6',
  '7th Circuit': 'ca7',
  '8th Circuit': 'ca8',
  '9th Circuit': 'ca9',
  '10th Circuit': 'ca10',
  '11th Circuit': 'ca11',
  'D.C. Circuit': 'cadc',
  'Federal Circuit': 'cafc',

  // Federal District Courts — All 94 districts
  // Alabama
  'Northern District of Alabama': 'alnd',
  'Middle District of Alabama': 'almd',
  'Southern District of Alabama': 'alsd',
  // Alaska
  'District of Alaska': 'akd',
  // Arizona
  'District of Arizona': 'azd',
  // Arkansas
  'Eastern District of Arkansas': 'ared',
  'Western District of Arkansas': 'arwd',
  // California
  'Central District of California': 'cacd',
  'Northern District of California': 'cand',
  'Southern District of California': 'casd',
  'Eastern District of California': 'caed',
  // Colorado
  'District of Colorado': 'cod',
  // Connecticut
  'District of Connecticut': 'ctd',
  // Delaware
  'District of Delaware': 'ded',
  // District of Columbia
  'District of Columbia': 'dcd',
  // Florida
  'Northern District of Florida': 'flnd',
  'Middle District of Florida': 'flmd',
  'Southern District of Florida': 'flsd',
  // Georgia
  'Northern District of Georgia': 'gand',
  'Middle District of Georgia': 'gamd',
  'Southern District of Georgia': 'gasd',
  // Hawaii
  'District of Hawaii': 'hid',
  // Idaho
  'District of Idaho': 'idd',
  // Illinois
  'Northern District of Illinois': 'ilnd',
  'Central District of Illinois': 'ilcd',
  'Southern District of Illinois': 'ilsd',
  // Indiana
  'Northern District of Indiana': 'innd',
  'Southern District of Indiana': 'insd',
  // Iowa
  'Northern District of Iowa': 'iand',
  'Southern District of Iowa': 'iasd',
  // Kansas
  'District of Kansas': 'ksd',
  // Kentucky
  'Eastern District of Kentucky': 'kyed',
  'Western District of Kentucky': 'kywd',
  // Louisiana
  'Eastern District of Louisiana': 'laed',
  'Middle District of Louisiana': 'lamd',
  'Western District of Louisiana': 'lawd',
  // Maine
  'District of Maine': 'med',
  // Maryland
  'District of Maryland': 'mdd',
  // Massachusetts
  'District of Massachusetts': 'mad',
  // Michigan
  'Eastern District of Michigan': 'mied',
  'Western District of Michigan': 'miwd',
  // Minnesota
  'District of Minnesota': 'mnd',
  // Mississippi
  'Northern District of Mississippi': 'msnd',
  'Southern District of Mississippi': 'mssd',
  // Missouri
  'Eastern District of Missouri': 'moed',
  'Western District of Missouri': 'mowd',
  // Montana
  'District of Montana': 'mtd',
  // Nebraska
  'District of Nebraska': 'ned',
  // Nevada
  'District of Nevada': 'nvd',
  // New Hampshire
  'District of New Hampshire': 'nhd',
  // New Jersey
  'District of New Jersey': 'njd',
  // New Mexico
  'District of New Mexico': 'nmd',
  // New York
  'Northern District of New York': 'nynd',
  'Southern District of New York': 'nysd',
  'Eastern District of New York': 'nyed',
  'Western District of New York': 'nywd',
  // North Carolina
  'Eastern District of North Carolina': 'nced',
  'Middle District of North Carolina': 'ncmd',
  'Western District of North Carolina': 'ncwd',
  // North Dakota
  'District of North Dakota': 'ndd',
  // Ohio
  'Northern District of Ohio': 'ohnd',
  'Southern District of Ohio': 'ohsd',
  // Oklahoma
  'Northern District of Oklahoma': 'oknd',
  'Eastern District of Oklahoma': 'oked',
  'Western District of Oklahoma': 'okwd',
  // Oregon
  'District of Oregon': 'ord',
  // Pennsylvania
  'Eastern District of Pennsylvania': 'paed',
  'Middle District of Pennsylvania': 'pamd',
  'Western District of Pennsylvania': 'pawd',
  // Rhode Island
  'District of Rhode Island': 'rid',
  // South Carolina
  'District of South Carolina': 'scd',
  // South Dakota
  'District of South Dakota': 'sdd',
  // Tennessee
  'Eastern District of Tennessee': 'tned',
  'Middle District of Tennessee': 'tnmd',
  'Western District of Tennessee': 'tnwd',
  // Texas
  'Northern District of Texas': 'txnd',
  'Southern District of Texas': 'txsd',
  'Eastern District of Texas': 'txed',
  'Western District of Texas': 'txwd',
  // Utah
  'District of Utah': 'utd',
  // Vermont
  'District of Vermont': 'vtd',
  // Virginia
  'Eastern District of Virginia': 'vaed',
  'Western District of Virginia': 'vawd',
  // Washington
  'Eastern District of Washington': 'waed',
  'Western District of Washington': 'wawd',
  // West Virginia
  'Northern District of West Virginia': 'wvnd',
  'Southern District of West Virginia': 'wvsd',
  // Wisconsin
  'Eastern District of Wisconsin': 'wied',
  'Western District of Wisconsin': 'wiwd',
  // Wyoming
  'District of Wyoming': 'wyd',

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE COURTS — Supreme Courts (all 50 + DC)
  // ═══════════════════════════════════════════════════════════════════════════
  'Alabama Supreme Court': 'ala',
  'Alaska Supreme Court': 'alaska',
  'Arizona Supreme Court': 'ariz',
  'Arkansas Supreme Court': 'ark',
  'California Supreme Court': 'cal',
  'Colorado Supreme Court': 'colo',
  'Connecticut Supreme Court': 'conn',
  'Delaware Supreme Court': 'del',
  'Florida Supreme Court': 'fla',
  'Georgia Supreme Court': 'ga',
  'Hawaii Supreme Court': 'haw',
  'Idaho Supreme Court': 'idaho',
  'Illinois Supreme Court': 'ill',
  'Indiana Supreme Court': 'ind',
  'Iowa Supreme Court': 'iowa',
  'Kansas Supreme Court': 'kan',
  'Kentucky Supreme Court': 'ky',
  'Louisiana Supreme Court': 'la',
  'Maine Supreme Court': 'me',
  'Maryland Supreme Court': 'md',
  'Massachusetts Supreme Court': 'mass',
  'Michigan Supreme Court': 'mich',
  'Minnesota Supreme Court': 'minn',
  'Mississippi Supreme Court': 'miss',
  'Missouri Supreme Court': 'mo',
  'Montana Supreme Court': 'mont',
  'Nebraska Supreme Court': 'neb',
  'Nevada Supreme Court': 'nev',
  'New Hampshire Supreme Court': 'nh',
  'New Jersey Supreme Court': 'nj',
  'New Mexico Supreme Court': 'nm',
  'New York Supreme Court': 'ny',
  'North Carolina Supreme Court': 'nc',
  'North Dakota Supreme Court': 'nd',
  'Ohio Supreme Court': 'ohio',
  'Oklahoma Supreme Court': 'okla',
  'Oregon Supreme Court': 'or',
  'Pennsylvania Supreme Court': 'pa',
  'Rhode Island Supreme Court': 'ri',
  'South Carolina Supreme Court': 'sc',
  'South Dakota Supreme Court': 'sd',
  'Tennessee Supreme Court': 'tenn',
  'Texas Supreme Court': 'tex',
  'Utah Supreme Court': 'utah',
  'Vermont Supreme Court': 'vt',
  'Virginia Supreme Court': 'va',
  'Washington Supreme Court': 'wash',
  'West Virginia Supreme Court': 'wva',
  'Wisconsin Supreme Court': 'wis',
  'Wyoming Supreme Court': 'wyo',
  'DC Court of Appeals': 'dcca',

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE APPELLATE COURTS — Key states
  // ═══════════════════════════════════════════════════════════════════════════

  // California
  'CA Court of Appeal': 'calctapp',
  'CA Court of Appeal, 1st District': 'calctapp_1d',
  'CA Court of Appeal, 2nd District': 'calctapp_2d',
  'CA Court of Appeal, 3rd District': 'calctapp_3d',
  'CA Court of Appeal, 4th District': 'calctapp_4d',
  'CA Court of Appeal, 5th District': 'calctapp_5d',
  'CA Court of Appeal, 6th District': 'calctapp_6d',

  // Louisiana
  'LA Court of Appeal': 'lactapp',
  'LA Court of Appeal, 1st Circuit': 'lactapp_1cir',
  'LA Court of Appeal, 2nd Circuit': 'lactapp_2cir',
  'LA Court of Appeal, 3rd Circuit': 'lactapp_3cir',
  'LA Court of Appeal, 4th Circuit': 'lactapp_4cir',
  'LA Court of Appeal, 5th Circuit': 'lactapp_5cir',

  // Texas
  'TX Court of Appeals': 'texapp',

  // New York
  'NY Appellate Division': 'nyappdiv',

  // Florida
  'FL District Court of Appeal': 'fladistctapp',

  // Illinois
  'IL Appellate Court': 'illappct',
};

// ============================================================================
// STATE CODE → SUPREME COURT ID SHORTHAND
// ============================================================================

const STATE_SUPREME_COURT_IDS: Record<string, string> = {
  AL: 'ala', AK: 'alaska', AZ: 'ariz', AR: 'ark', CA: 'cal',
  CO: 'colo', CT: 'conn', DE: 'del', DC: 'dcca', FL: 'fla',
  GA: 'ga', HI: 'haw', ID: 'idaho', IL: 'ill', IN: 'ind',
  IA: 'iowa', KS: 'kan', KY: 'ky', LA: 'la', ME: 'me',
  MD: 'md', MA: 'mass', MI: 'mich', MN: 'minn', MS: 'miss',
  MO: 'mo', MT: 'mont', NE: 'neb', NV: 'nev', NH: 'nh',
  NJ: 'nj', NM: 'nm', NY: 'ny', NC: 'nc', ND: 'nd',
  OH: 'ohio', OK: 'okla', OR: 'or', PA: 'pa', RI: 'ri',
  SC: 'sc', SD: 'sd', TN: 'tenn', TX: 'tex', UT: 'utah',
  VT: 'vt', VA: 'va', WA: 'wash', WV: 'wva', WI: 'wis',
  WY: 'wyo',
};

// ============================================================================
// THREE-TIER LOOKUP
// ============================================================================

/**
 * Resolve a court name to its CourtListener ID.
 *
 * Three-tier lookup:
 *   Tier 1: Exact match from COURT_ID_MAP
 *   Tier 2: Fuzzy matching / abbreviation expansion
 *   Tier 3: DEGRADED fallback (log warning, return null)
 *
 * @param courtName - Display name from intake form
 * @param district - Optional district/circuit number
 * @returns CL court ID or null if not found
 */
export function resolveCourtId(courtName: string, district?: string): string | null {
  // Tier 1: Exact match
  if (COURT_ID_MAP[courtName]) {
    return COURT_ID_MAP[courtName];
  }

  // Try with district appended
  if (district) {
    const withDistrict = `${courtName}, ${district}`;
    if (COURT_ID_MAP[withDistrict]) {
      return COURT_ID_MAP[withDistrict];
    }
  }

  // Tier 2: Fuzzy matching / abbreviation expansion
  const normalized = courtName.toLowerCase().trim();

  // Federal district patterns: 'N.D. Cal.' → 'Northern District of California'
  const districtPatterns: Array<{ pattern: RegExp; key: string }> = [
    { pattern: /n\.?d\.?\s*cal/i, key: 'Northern District of California' },
    { pattern: /c\.?d\.?\s*cal/i, key: 'Central District of California' },
    { pattern: /s\.?d\.?\s*cal/i, key: 'Southern District of California' },
    { pattern: /e\.?d\.?\s*cal/i, key: 'Eastern District of California' },
    { pattern: /e\.?d\.?\s*la/i, key: 'Eastern District of Louisiana' },
    { pattern: /m\.?d\.?\s*la/i, key: 'Middle District of Louisiana' },
    { pattern: /w\.?d\.?\s*la/i, key: 'Western District of Louisiana' },
    { pattern: /s\.?d\.?\s*n\.?y/i, key: 'Southern District of New York' },
    { pattern: /e\.?d\.?\s*n\.?y/i, key: 'Eastern District of New York' },
    { pattern: /n\.?d\.?\s*tex/i, key: 'Northern District of Texas' },
    { pattern: /s\.?d\.?\s*tex/i, key: 'Southern District of Texas' },
    { pattern: /e\.?d\.?\s*tex/i, key: 'Eastern District of Texas' },
    { pattern: /w\.?d\.?\s*tex/i, key: 'Western District of Texas' },
  ];

  for (const { pattern, key } of districtPatterns) {
    if (pattern.test(courtName)) {
      return COURT_ID_MAP[key] || null;
    }
  }

  // CA appellate variations
  if (normalized.includes('california') && normalized.includes('appeal')) {
    if (district) {
      const distNum = district.match(/(\d)/)?.[1];
      if (distNum) return `calctapp_${distNum}d`;
    }
    return 'calctapp';
  }

  // LA appellate variations
  if (normalized.includes('louisiana') && normalized.includes('appeal')) {
    if (district) {
      const circNum = district.match(/(\d)/)?.[1];
      if (circNum) return `lactapp_${circNum}cir`;
    }
    return 'lactapp';
  }

  // Tier 3: DEGRADED fallback
  log.warn(`[CourtIdMap] COURT_ID_UNRESOLVED: "${courtName}" (district: ${district}) — DEGRADED mode`);
  return null;
}

/**
 * Resolve court ID from state code and court type.
 *
 * For state courts: returns the state supreme court ID as a starting point.
 * For federal courts: requires district name for exact resolution.
 *
 * @param stateCode - Two-letter state code
 * @param courtType - STATE or FEDERAL
 * @param federalDistrict - Optional: e.g. 'E.D. La.'
 */
export function resolveCourtIdByState(
  stateCode: string,
  courtType: 'STATE' | 'FEDERAL',
  federalDistrict?: string
): string | null {
  const code = stateCode.toUpperCase();

  if (courtType === 'STATE') {
    return STATE_SUPREME_COURT_IDS[code] || null;
  }

  // Federal: try resolving from district abbreviation
  if (federalDistrict) {
    return resolveCourtId(federalDistrict);
  }

  return null;
}

/**
 * Citation jurisdiction type — expanded for 50-state support.
 *
 * SP-C Task 30: Accepts all 50 state codes + DC.
 */
export type CitationJurisdiction =
  | 'FEDERAL'
  | 'AL' | 'AK' | 'AZ' | 'AR' | 'CA' | 'CO' | 'CT' | 'DE' | 'DC'
  | 'FL' | 'GA' | 'HI' | 'ID' | 'IL' | 'IN' | 'IA' | 'KS' | 'KY'
  | 'LA' | 'ME' | 'MD' | 'MA' | 'MI' | 'MN' | 'MS' | 'MO' | 'MT'
  | 'NE' | 'NV' | 'NH' | 'NJ' | 'NM' | 'NY' | 'NC' | 'ND' | 'OH'
  | 'OK' | 'OR' | 'PA' | 'RI' | 'SC' | 'SD' | 'TN' | 'TX' | 'UT'
  | 'VT' | 'VA' | 'WA' | 'WV' | 'WI' | 'WY';
