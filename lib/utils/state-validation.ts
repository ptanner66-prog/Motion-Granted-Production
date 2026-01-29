// /lib/utils/state-validation.ts
// State code sanitization and validation utilities
// Task 14: 50-State Input Sanitization
// VERSION: 1.0 — January 28, 2026

/**
 * Valid US state codes (50 states + DC)
 */
export const VALID_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
] as const;

export type StateCode = typeof VALID_STATE_CODES[number];

/**
 * States currently enabled for Motion Granted
 * Update this list as new states are launched
 */
export const ENABLED_STATES: StateCode[] = ['CA', 'LA'];

/**
 * Sanitize state code input
 * - Trims whitespace
 * - Converts to uppercase
 * - Returns null for invalid format
 *
 * @param input - Raw state code input (e.g., "ca", " CA ", "California")
 * @returns Sanitized 2-letter code or null if invalid format
 */
export function sanitizeStateCode(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim().toUpperCase();

  // Must be exactly 2 uppercase letters
  if (!/^[A-Z]{2}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Validation result with detailed error information
 */
export interface StateValidationResult {
  valid: boolean;
  sanitized: string | null;
  error?: string;
  isEnabled?: boolean;
}

/**
 * Validate state code against known US states
 *
 * @param code - State code to validate (will be sanitized first)
 * @returns Validation result with error details if invalid
 */
export function validateStateCode(code: string | null | undefined): StateValidationResult {
  const sanitized = sanitizeStateCode(code);

  if (!sanitized) {
    return {
      valid: false,
      sanitized: null,
      error: 'Invalid state code format. Expected 2-letter code (e.g., CA, TX, LA).',
    };
  }

  if (!VALID_STATE_CODES.includes(sanitized as StateCode)) {
    return {
      valid: false,
      sanitized,
      error: `Unknown state code: ${sanitized}. Must be a valid US state or DC.`,
    };
  }

  const isEnabled = ENABLED_STATES.includes(sanitized as StateCode);

  return {
    valid: true,
    sanitized,
    isEnabled,
  };
}

/**
 * Check if a state is enabled for Motion Granted services
 *
 * @param code - State code (will be sanitized first)
 * @returns true if state is enabled, false otherwise
 */
export function isStateEnabled(code: string | null | undefined): boolean {
  const sanitized = sanitizeStateCode(code);
  if (!sanitized) return false;
  return ENABLED_STATES.includes(sanitized as StateCode);
}

/**
 * Get list of all enabled states with their names
 */
export function getEnabledStates(): { code: StateCode; name: string }[] {
  const STATE_NAMES: Record<StateCode, string> = {
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

  return ENABLED_STATES.map(code => ({
    code,
    name: STATE_NAMES[code],
  }));
}

/**
 * Validate state for API requests
 * Returns a Response object if validation fails, null if valid
 *
 * @example
 * const error = validateStateForAPI(searchParams.get('state'));
 * if (error) return error;
 */
export function validateStateForAPI(
  code: string | null | undefined,
  requireEnabled: boolean = true
): Response | null {
  const result = validateStateCode(code);

  if (!result.valid) {
    return Response.json(
      { error: result.error },
      { status: 400 }
    );
  }

  if (requireEnabled && !result.isEnabled) {
    return Response.json(
      {
        error: `State ${result.sanitized} is not yet available. Currently serving: ${ENABLED_STATES.join(', ')}.`,
        enabledStates: ENABLED_STATES,
      },
      { status: 400 }
    );
  }

  return null;
}
