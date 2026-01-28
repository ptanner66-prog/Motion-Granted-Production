/**
 * State Configuration Data Structure (Task 80)
 *
 * Configuration for all 50 US states plus DC.
 * Only California and Louisiana enabled at launch.
 *
 * Source: Chunk 11, Task 80 - MOTION_TYPES_BY_STATE_SPEC_v2_EXPANDED.md
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StateConfig {
  code: string;                    // Two-letter state code
  name: string;                    // Full state name
  enabled: boolean;                // Is this state available for orders?
  federal_circuits: string[];      // Which federal circuits cover this state
  federal_districts: string[];     // Federal district court names
  state_specific_motions: string[]; // Motion IDs ONLY available in this state
  excluded_motions: string[];      // Motion IDs NOT available in this state
}

// ============================================================================
// STATE CONFIGURATIONS - ALL 50 STATES + DC
// ============================================================================

export const STATE_CONFIGS: StateConfig[] = [
  // ============================================================================
  // ENABLED STATES (Launch)
  // ============================================================================
  {
    code: 'CA',
    name: 'California',
    enabled: true,
    federal_circuits: ['9th'],
    federal_districts: ['N.D. Cal.', 'C.D. Cal.', 'E.D. Cal.', 'S.D. Cal.'],
    state_specific_motions: [
      'demurrer',
      'anti_slapp',
      'motion_to_compel_further',
      'motion_for_summary_adjudication',
      'peremptory_challenge_170_6',
      'motion_bifurcate_punitive_damages',
      'motion_expunge_lis_pendens',
      'motion_relate_cases',
      'motion_complex_case_determination'
    ],
    excluded_motions: []
  },
  {
    code: 'LA',
    name: 'Louisiana',
    enabled: true,
    federal_circuits: ['5th'],
    federal_districts: ['E.D. La.', 'M.D. La.', 'W.D. La.'],
    state_specific_motions: [
      'exception_no_cause_of_action',
      'exception_prescription',
      'exception_no_right_of_action',
      'declinatory_exception',
      'dilatory_exception',
      'peremptory_exception'
    ],
    excluded_motions: ['demurrer', 'anti_slapp']
  },

  // ============================================================================
  // DISABLED STATES (Coming Soon) - Alphabetical Order
  // ============================================================================
  {
    code: 'AL',
    name: 'Alabama',
    enabled: false,
    federal_circuits: ['11th'],
    federal_districts: ['N.D. Ala.', 'M.D. Ala.', 'S.D. Ala.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'AK',
    name: 'Alaska',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Alaska'],
    state_specific_motions: [],
    excluded_motions: ['demurrer']
  },
  {
    code: 'AZ',
    name: 'Arizona',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Ariz.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer']
  },
  {
    code: 'AR',
    name: 'Arkansas',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['E.D. Ark.', 'W.D. Ark.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'CO',
    name: 'Colorado',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['D. Colo.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'CT',
    name: 'Connecticut',
    enabled: false,
    federal_circuits: ['2nd'],
    federal_districts: ['D. Conn.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer']
  },
  {
    code: 'DE',
    name: 'Delaware',
    enabled: false,
    federal_circuits: ['3rd'],
    federal_districts: ['D. Del.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'DC',
    name: 'District of Columbia',
    enabled: false,
    federal_circuits: ['D.C.'],
    federal_districts: ['D.D.C.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'FL',
    name: 'Florida',
    enabled: false,
    federal_circuits: ['11th'],
    federal_districts: ['N.D. Fla.', 'M.D. Fla.', 'S.D. Fla.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'GA',
    name: 'Georgia',
    enabled: false,
    federal_circuits: ['11th'],
    federal_districts: ['N.D. Ga.', 'M.D. Ga.', 'S.D. Ga.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'HI',
    name: 'Hawaii',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Haw.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'ID',
    name: 'Idaho',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Idaho'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'IL',
    name: 'Illinois',
    enabled: false,
    federal_circuits: ['7th'],
    federal_districts: ['N.D. Ill.', 'C.D. Ill.', 'S.D. Ill.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'IN',
    name: 'Indiana',
    enabled: false,
    federal_circuits: ['7th'],
    federal_districts: ['N.D. Ind.', 'S.D. Ind.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'IA',
    name: 'Iowa',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['N.D. Iowa', 'S.D. Iowa'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'KS',
    name: 'Kansas',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['D. Kan.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'KY',
    name: 'Kentucky',
    enabled: false,
    federal_circuits: ['6th'],
    federal_districts: ['E.D. Ky.', 'W.D. Ky.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'ME',
    name: 'Maine',
    enabled: false,
    federal_circuits: ['1st'],
    federal_districts: ['D. Me.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MD',
    name: 'Maryland',
    enabled: false,
    federal_circuits: ['4th'],
    federal_districts: ['D. Md.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MA',
    name: 'Massachusetts',
    enabled: false,
    federal_circuits: ['1st'],
    federal_districts: ['D. Mass.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MI',
    name: 'Michigan',
    enabled: false,
    federal_circuits: ['6th'],
    federal_districts: ['E.D. Mich.', 'W.D. Mich.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MN',
    name: 'Minnesota',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['D. Minn.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MS',
    name: 'Mississippi',
    enabled: false,
    federal_circuits: ['5th'],
    federal_districts: ['N.D. Miss.', 'S.D. Miss.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'MO',
    name: 'Missouri',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['E.D. Mo.', 'W.D. Mo.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'MT',
    name: 'Montana',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Mont.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'NE',
    name: 'Nebraska',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['D. Neb.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'NV',
    name: 'Nevada',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Nev.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'NH',
    name: 'New Hampshire',
    enabled: false,
    federal_circuits: ['1st'],
    federal_districts: ['D.N.H.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    enabled: false,
    federal_circuits: ['3rd'],
    federal_districts: ['D.N.J.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'NM',
    name: 'New Mexico',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['D.N.M.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'NY',
    name: 'New York',
    enabled: false,
    federal_circuits: ['2nd'],
    federal_districts: ['N.D.N.Y.', 'S.D.N.Y.', 'E.D.N.Y.', 'W.D.N.Y.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'NC',
    name: 'North Carolina',
    enabled: false,
    federal_circuits: ['4th'],
    federal_districts: ['E.D.N.C.', 'M.D.N.C.', 'W.D.N.C.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'ND',
    name: 'North Dakota',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['D.N.D.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'OH',
    name: 'Ohio',
    enabled: false,
    federal_circuits: ['6th'],
    federal_districts: ['N.D. Ohio', 'S.D. Ohio'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'OK',
    name: 'Oklahoma',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['N.D. Okla.', 'E.D. Okla.', 'W.D. Okla.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'OR',
    name: 'Oregon',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['D. Or.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'PA',
    name: 'Pennsylvania',
    enabled: false,
    federal_circuits: ['3rd'],
    federal_districts: ['E.D. Pa.', 'M.D. Pa.', 'W.D. Pa.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'RI',
    name: 'Rhode Island',
    enabled: false,
    federal_circuits: ['1st'],
    federal_districts: ['D.R.I.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'SC',
    name: 'South Carolina',
    enabled: false,
    federal_circuits: ['4th'],
    federal_districts: ['D.S.C.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'SD',
    name: 'South Dakota',
    enabled: false,
    federal_circuits: ['8th'],
    federal_districts: ['D.S.D.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'TN',
    name: 'Tennessee',
    enabled: false,
    federal_circuits: ['6th'],
    federal_districts: ['E.D. Tenn.', 'M.D. Tenn.', 'W.D. Tenn.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'TX',
    name: 'Texas',
    enabled: false,
    federal_circuits: ['5th'],
    federal_districts: ['N.D. Tex.', 'S.D. Tex.', 'E.D. Tex.', 'W.D. Tex.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'UT',
    name: 'Utah',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['D. Utah'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'VT',
    name: 'Vermont',
    enabled: false,
    federal_circuits: ['2nd'],
    federal_districts: ['D. Vt.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'VA',
    name: 'Virginia',
    enabled: false,
    federal_circuits: ['4th'],
    federal_districts: ['E.D. Va.', 'W.D. Va.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'WA',
    name: 'Washington',
    enabled: false,
    federal_circuits: ['9th'],
    federal_districts: ['E.D. Wash.', 'W.D. Wash.'],
    state_specific_motions: ['anti_slapp'],
    excluded_motions: ['demurrer']
  },
  {
    code: 'WV',
    name: 'West Virginia',
    enabled: false,
    federal_circuits: ['4th'],
    federal_districts: ['N.D.W. Va.', 'S.D.W. Va.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'WI',
    name: 'Wisconsin',
    enabled: false,
    federal_circuits: ['7th'],
    federal_districts: ['E.D. Wis.', 'W.D. Wis.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
  {
    code: 'WY',
    name: 'Wyoming',
    enabled: false,
    federal_circuits: ['10th'],
    federal_districts: ['D. Wyo.'],
    state_specific_motions: [],
    excluded_motions: ['demurrer', 'anti_slapp']
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get state configuration by state code
 */
export function getStateConfig(code: string): StateConfig | undefined {
  return STATE_CONFIGS.find(
    (state) => state.code.toUpperCase() === code.toUpperCase()
  );
}

/**
 * Get all enabled states (available for orders)
 */
export function getEnabledStates(): StateConfig[] {
  return STATE_CONFIGS.filter((state) => state.enabled);
}

/**
 * Check if a state is enabled for orders
 */
export function isStateEnabled(code: string): boolean {
  const state = getStateConfig(code);
  return state?.enabled ?? false;
}

/**
 * Get all states (for dropdowns, sorted alphabetically)
 */
export function getAllStates(): StateConfig[] {
  return [...STATE_CONFIGS].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get states grouped by enabled status
 */
export function getStatesGrouped(): {
  enabled: StateConfig[];
  comingSoon: StateConfig[];
} {
  const enabled: StateConfig[] = [];
  const comingSoon: StateConfig[] = [];

  STATE_CONFIGS.forEach((state) => {
    if (state.enabled) {
      enabled.push(state);
    } else {
      comingSoon.push(state);
    }
  });

  return {
    enabled: enabled.sort((a, b) => a.name.localeCompare(b.name)),
    comingSoon: comingSoon.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Get federal circuit for a state
 */
export function getFederalCircuit(stateCode: string): string | undefined {
  const state = getStateConfig(stateCode);
  return state?.federal_circuits[0];
}

/**
 * Get all states in a federal circuit
 */
export function getStatesInCircuit(circuit: string): StateConfig[] {
  return STATE_CONFIGS.filter((state) =>
    state.federal_circuits.includes(circuit)
  );
}

/**
 * Check if a motion is available in a state
 */
export function isMotionAvailableInState(
  motionId: string,
  stateCode: string
): boolean {
  const state = getStateConfig(stateCode);
  if (!state || !state.enabled) return false;

  // Check if explicitly excluded
  if (state.excluded_motions.includes(motionId)) {
    return false;
  }

  // Check if state-specific (only available in specific states)
  if (state.state_specific_motions.includes(motionId)) {
    return true;
  }

  // Universal motions are available unless excluded
  return true;
}
