/**
 * Jurisdiction Resolver — CANONICAL resolver for 50-state infrastructure.
 *
 * Every downstream consumer (formatting engine, pricing, email, analytics,
 * workflow, Inngest payloads) depends on this module.
 *
 * SP-C Task 7 (Steps 6.5 + 6.5a)
 *
 * INVARIANTS:
 *  - Never throws on valid input.
 *  - Throws TypeError if stateCode is null/undefined/empty.
 *  - Pure functions — no database calls, no side effects.
 *
 * @module jurisdiction/resolver
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JurisdictionInput {
  stateCode: string;
  courtType: 'STATE' | 'FEDERAL';
  federalCircuit?: string;
  federalDistrict?: string;
}

export interface ResolvedJurisdiction {
  stateCode: string;
  courtType: 'STATE' | 'FEDERAL';
  /** Human-readable: 'California State Court' or 'Federal — 9th Circuit, C.D. Cal.' */
  display: string;
  /** Formatting engine lookup key: 'CA_STATE' or 'FEDERAL_9TH' */
  formatting: string;
  /** Backward-compat legacy code: 'CA' or 'FED_9TH' */
  legacy: string;
  /** Analytics display: 'California — State' or 'California — Federal (9th)' */
  analytics: string;
  federalCircuit?: string;
  federalDistrict?: string;
}

/** Minimal order shape needed by resolveFromOrder */
export interface OrderLike {
  state?: string | null;
  court_type?: string | null;
  jurisdiction?: string | null;
  federal_district?: string | null;
}

// ============================================================================
// STATE NAME MAP
// ============================================================================

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/**
 * State → primary federal circuit mapping.
 * Used when no explicit federalCircuit is provided.
 */
const STATE_TO_CIRCUIT: Record<string, string> = {
  ME: '1ST', MA: '1ST', NH: '1ST', RI: '1ST',
  CT: '2ND', NY: '2ND', VT: '2ND',
  DE: '3RD', NJ: '3RD', PA: '3RD',
  MD: '4TH', NC: '4TH', SC: '4TH', VA: '4TH', WV: '4TH',
  LA: '5TH', MS: '5TH', TX: '5TH',
  KY: '6TH', MI: '6TH', OH: '6TH', TN: '6TH',
  IL: '7TH', IN: '7TH', WI: '7TH',
  AR: '8TH', IA: '8TH', MN: '8TH', MO: '8TH', NE: '8TH', ND: '8TH', SD: '8TH',
  AK: '9TH', AZ: '9TH', CA: '9TH', HI: '9TH', ID: '9TH', MT: '9TH', NV: '9TH', OR: '9TH', WA: '9TH',
  CO: '10TH', KS: '10TH', NM: '10TH', OK: '10TH', UT: '10TH', WY: '10TH',
  AL: '11TH', FL: '11TH', GA: '11TH',
  DC: 'DC',
};

// ============================================================================
// CORE RESOLVER
// ============================================================================

/**
 * Resolve jurisdiction from structured input.
 *
 * @throws TypeError if stateCode is null, undefined, or empty
 */
export function resolveJurisdiction(input: JurisdictionInput): ResolvedJurisdiction {
  if (!input.stateCode) {
    throw new TypeError(
      'resolveJurisdiction: stateCode is required and cannot be null/undefined/empty.'
    );
  }

  const code = input.stateCode.toUpperCase().trim();
  const stateName = STATE_NAMES[code] || code;
  const courtType = input.courtType;
  const circuit = input.federalCircuit || deriveFederalCircuit(code);
  const district = input.federalDistrict || undefined;

  if (courtType === 'FEDERAL') {
    const districtSuffix = district ? `, ${district}` : '';
    const circuitOrdinal = formatCircuitOrdinal(circuit);

    return {
      stateCode: code,
      courtType: 'FEDERAL',
      display: `Federal — ${circuitOrdinal} Circuit${districtSuffix}`,
      formatting: `FEDERAL_${circuit}`,
      legacy: `FED_${circuit}`,
      analytics: `${stateName} — Federal (${circuitOrdinal})`,
      federalCircuit: circuit,
      federalDistrict: district,
    };
  }

  return {
    stateCode: code,
    courtType: 'STATE',
    display: `${stateName} State Court`,
    formatting: `${code}_STATE`,
    legacy: code,
    analytics: `${stateName} — State`,
  };
}

/**
 * Resolve jurisdiction from an order record.
 *
 * Handles both new-format orders (with state/court_type) and legacy orders
 * (with only jurisdiction field).
 */
export function resolveFromOrder(order: OrderLike): ResolvedJurisdiction {
  // New-format order: has state field
  if (order.state) {
    const courtType = (order.court_type === 'FEDERAL' ? 'FEDERAL' : 'STATE') as 'STATE' | 'FEDERAL';
    return resolveJurisdiction({
      stateCode: order.state,
      courtType,
      federalDistrict: order.federal_district || undefined,
    });
  }

  // Legacy fallback: derive from jurisdiction string
  if (order.jurisdiction) {
    return resolveFromLegacyJurisdiction(order.jurisdiction);
  }

  // Absolute fallback: LA STATE (original launch jurisdiction)
  return resolveJurisdiction({ stateCode: 'LA', courtType: 'STATE' });
}

/**
 * Derive the federal circuit for a state code.
 *
 * @param stateCode - Two-letter state code
 * @param federalCircuits - Optional override array (from states table)
 * @returns Circuit number string (e.g. '5TH', '9TH', 'DC')
 */
export function deriveFederalCircuit(
  stateCode: string,
  federalCircuits?: string[]
): string {
  if (federalCircuits && federalCircuits.length > 0) {
    return federalCircuits[0].toUpperCase();
  }
  return STATE_TO_CIRCUIT[stateCode.toUpperCase()] || '5TH';
}

/**
 * Get state name from code.
 */
export function getStateName(stateCode: string): string {
  return STATE_NAMES[stateCode.toUpperCase()] || stateCode;
}

/**
 * Check if a state code is valid (exists in our map).
 */
export function isValidStateCode(stateCode: string): boolean {
  return stateCode.toUpperCase() in STATE_NAMES;
}

// ============================================================================
// LEGACY BRIDGE
// ============================================================================

/**
 * Parse a legacy jurisdiction string into ResolvedJurisdiction.
 *
 * Handles formats: 'la_state', 'la_ed', 'ca_federal', 'federal_5th', etc.
 */
function resolveFromLegacyJurisdiction(jurisdiction: string): ResolvedJurisdiction {
  const j = jurisdiction.toLowerCase().trim();

  // Louisiana state court
  if (j === 'la_state' || j === 'la') {
    return resolveJurisdiction({ stateCode: 'LA', courtType: 'STATE' });
  }

  // Louisiana federal districts
  if (j === 'la_ed') {
    return resolveJurisdiction({ stateCode: 'LA', courtType: 'FEDERAL', federalDistrict: 'E.D. La.' });
  }
  if (j === 'la_md') {
    return resolveJurisdiction({ stateCode: 'LA', courtType: 'FEDERAL', federalDistrict: 'M.D. La.' });
  }
  if (j === 'la_wd') {
    return resolveJurisdiction({ stateCode: 'LA', courtType: 'FEDERAL', federalDistrict: 'W.D. La.' });
  }

  // California state
  if (j === 'ca_state' || j === 'ca_superior' || j === 'ca') {
    return resolveJurisdiction({ stateCode: 'CA', courtType: 'STATE' });
  }

  // California federal
  if (j === 'ca_federal') {
    return resolveJurisdiction({ stateCode: 'CA', courtType: 'FEDERAL' });
  }

  // Federal circuit patterns: 'federal_5th', 'FED_5TH', etc.
  const fedCircuitMatch = j.match(/^(?:federal|fed)_(\w+)/);
  if (fedCircuitMatch) {
    const circuitRaw = fedCircuitMatch[1].toUpperCase();
    const circuitMap: Record<string, { circuit: string; state: string }> = {
      '5TH': { circuit: '5TH', state: 'LA' },
      'FIFTH': { circuit: '5TH', state: 'LA' },
      '9TH': { circuit: '9TH', state: 'CA' },
      'NINTH': { circuit: '9TH', state: 'CA' },
      '2ND': { circuit: '2ND', state: 'NY' },
      'SECOND': { circuit: '2ND', state: 'NY' },
      '11TH': { circuit: '11TH', state: 'FL' },
      'ELEVENTH': { circuit: '11TH', state: 'FL' },
    };
    const mapped = circuitMap[circuitRaw];
    if (mapped) {
      return resolveJurisdiction({
        stateCode: mapped.state,
        courtType: 'FEDERAL',
        federalCircuit: mapped.circuit,
      });
    }
  }

  // Generic state code + court type: e.g. 'TX_STATE', 'NY_FEDERAL'
  const stateCourtMatch = j.match(/^([a-z]{2})_(state|federal)$/);
  if (stateCourtMatch) {
    return resolveJurisdiction({
      stateCode: stateCourtMatch[1].toUpperCase(),
      courtType: stateCourtMatch[2].toUpperCase() as 'STATE' | 'FEDERAL',
    });
  }

  // Bare two-letter code: assume state court
  const bareCode = j.toUpperCase();
  if (bareCode.length === 2 && STATE_NAMES[bareCode]) {
    return resolveJurisdiction({ stateCode: bareCode, courtType: 'STATE' });
  }

  // Unrecognized: default to LA state
  return resolveJurisdiction({ stateCode: 'LA', courtType: 'STATE' });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format circuit number to ordinal: '5TH' → '5th', '9TH' → '9th', 'DC' → 'D.C.'
 */
function formatCircuitOrdinal(circuit: string): string {
  if (circuit === 'DC') return 'D.C.';
  if (circuit === 'FEDERAL') return 'Federal';
  // Convert '5TH' → '5th', '11TH' → '11th', etc.
  return circuit.toLowerCase();
}
