/**
 * Phase I: Intake & Validation (Task 40)
 *
 * Code-controlled intake wizard with 6 steps:
 * 1. Filing/Opposing toggle - sets PATH A (initiating) or PATH B (opposition)
 * 2. Jurisdiction dropdown - Federal 5th/9th, State CA/LA
 * 3. Motion type - grouped by tier, filtered by jurisdiction
 * 4. Case details - party names, case number, judge, court, division
 * 5. Document upload - 500 page limit, auto-detect PATH B if opponent motion uploaded
 * 6. Summary facts - multi-line text, no character minimum
 *
 * Source: Chunk 6, Task 40 - Code Mode Spec Section 2
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface IntakeData {
  // Step 1: Filing/Opposing
  filingType: 'initiating' | 'opposition';
  workflowPath: 'path_a' | 'path_b';

  // Step 2: Jurisdiction
  jurisdiction: 'federal_5th' | 'federal_9th' | 'ca_state' | 'la_state';

  // Step 3: Motion Type
  motionType: string;
  tier: 'A' | 'B' | 'C';

  // Step 4: Case Details
  caseDetails: {
    plaintiffNames: string[];
    defendantNames: string[];
    caseNumber: string;
    judgeName: string | null;
    courtName: string;
    division: string | null;
  };

  // Step 5: Documents
  documents: {
    id: string;
    filename: string;
    pageCount: number;
    type: 'supporting' | 'opponent_motion' | 'exhibit' | 'other';
  }[];
  totalPages: number;

  // Step 6: Summary Facts
  summaryFacts: string;

  // Calculated
  basePrice: number;
  rushFee: number;
  totalPrice: number;
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface PriceCalculation {
  base: number;
  rush: number;
  total: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Maximum pages allowed
const MAX_TOTAL_PAGES = 500;

// Motion types by tier and jurisdiction availability
export const MOTION_TYPES: Record<string, {
  name: string;
  tier: 'A' | 'B' | 'C';
  jurisdictions: string[];
  description: string;
}> = {
  // Tier A - Procedural
  'motion_to_extend_time': {
    name: 'Motion to Extend Time',
    tier: 'A',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request additional time to respond or perform action',
  },
  'motion_to_continue': {
    name: 'Motion to Continue',
    tier: 'A',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request continuance of hearing or trial date',
  },
  'motion_to_appear_pro_hac_vice': {
    name: 'Motion to Appear Pro Hac Vice',
    tier: 'A',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request to appear in court without local bar admission',
  },
  'motion_to_seal': {
    name: 'Motion to Seal',
    tier: 'A',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request to seal documents from public record',
  },

  // Tier B - Substantive
  'motion_to_dismiss': {
    name: 'Motion to Dismiss',
    tier: 'B',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request dismissal of claims',
  },
  'motion_to_compel': {
    name: 'Motion to Compel Discovery',
    tier: 'B',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request court to order discovery compliance',
  },
  'motion_for_protective_order': {
    name: 'Motion for Protective Order',
    tier: 'B',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request protection from discovery abuse',
  },
  'motion_to_strike': {
    name: 'Motion to Strike',
    tier: 'B',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request to strike improper pleadings or evidence',
  },
  'demurrer': {
    name: 'Demurrer',
    tier: 'B',
    jurisdictions: ['ca_state'],
    description: 'Challenge legal sufficiency of pleading (CA only)',
  },
  'exception_of_no_cause_of_action': {
    name: 'Exception of No Cause of Action',
    tier: 'B',
    jurisdictions: ['la_state'],
    description: 'Challenge legal sufficiency of petition (LA only)',
  },

  // Tier C - Complex
  'motion_for_summary_judgment': {
    name: 'Motion for Summary Judgment (MSJ)',
    tier: 'C',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request judgment without trial based on undisputed facts',
  },
  'motion_for_summary_adjudication': {
    name: 'Motion for Summary Adjudication (MSA)',
    tier: 'C',
    jurisdictions: ['ca_state'],
    description: 'Request judgment on specific issues (CA only)',
  },
  'motion_for_preliminary_injunction': {
    name: 'Motion for Preliminary Injunction',
    tier: 'C',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state', 'la_state'],
    description: 'Request temporary restraining order or injunction',
  },
  'motion_for_class_certification': {
    name: 'Motion for Class Certification',
    tier: 'C',
    jurisdictions: ['federal_5th', 'federal_9th', 'ca_state'],
    description: 'Request certification of class action',
  },
};

// Base prices by tier
const BASE_PRICES: Record<'A' | 'B' | 'C', number> = {
  'A': 299,
  'B': 599,
  'C': 999,
};

// Jurisdiction multipliers
const JURISDICTION_MULTIPLIERS: Record<string, number> = {
  'federal_5th': 1.0,
  'federal_9th': 1.1, // 9th Circuit premium
  'ca_state': 1.0,
  'la_state': 0.9, // LA discount
};

// Rush fees
const RUSH_FEES: Record<'standard' | '48hr' | '24hr', number> = {
  'standard': 0,
  '48hr': 199,
  '24hr': 399,
};

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate complete intake data
 */
export async function validateIntake(data: Partial<IntakeData>): Promise<IntakeValidationResult> {
  const errors: Record<string, string> = {};

  // Step 1: Filing type
  if (!data.filingType) {
    errors.filingType = 'Please select whether you are filing or opposing';
  }

  // Step 2: Jurisdiction
  if (!data.jurisdiction) {
    errors.jurisdiction = 'Please select a jurisdiction';
  } else if (!['federal_5th', 'federal_9th', 'ca_state', 'la_state'].includes(data.jurisdiction)) {
    errors.jurisdiction = 'Invalid jurisdiction selected';
  }

  // Step 3: Motion type
  if (!data.motionType) {
    errors.motionType = 'Please select a motion type';
  } else {
    const motionConfig = MOTION_TYPES[data.motionType];
    if (!motionConfig) {
      errors.motionType = 'Invalid motion type selected';
    } else if (data.jurisdiction && !motionConfig.jurisdictions.includes(data.jurisdiction)) {
      errors.motionType = `${motionConfig.name} is not available in this jurisdiction`;
    }
  }

  // Step 4: Case details
  if (!data.caseDetails) {
    errors.caseDetails = 'Case details are required';
  } else {
    if (!data.caseDetails.plaintiffNames || data.caseDetails.plaintiffNames.length === 0) {
      errors.plaintiffNames = 'At least one plaintiff name is required';
    }
    if (!data.caseDetails.defendantNames || data.caseDetails.defendantNames.length === 0) {
      errors.defendantNames = 'At least one defendant name is required';
    }
    if (!data.caseDetails.caseNumber) {
      errors.caseNumber = 'Case number is required';
    }
    if (!data.caseDetails.courtName) {
      errors.courtName = 'Court name is required';
    }
  }

  // Step 5: Documents - validate page count
  if (data.documents && data.documents.length > 0) {
    const totalPages = data.documents.reduce((sum, doc) => sum + doc.pageCount, 0);
    if (totalPages > MAX_TOTAL_PAGES) {
      errors.documents = `Total pages (${totalPages}) exceeds maximum of ${MAX_TOTAL_PAGES}`;
    }
  }

  // Step 6: Summary facts - no minimum character requirement per spec
  if (data.summaryFacts !== undefined && data.summaryFacts.trim() === '') {
    // Optional, but if provided should have content
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate a single step
 */
export function validateStep(
  step: number,
  data: Partial<IntakeData>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (step) {
    case 1:
      if (!data.filingType) {
        errors.push('Please select filing type');
      }
      break;

    case 2:
      if (!data.jurisdiction) {
        errors.push('Please select jurisdiction');
      }
      break;

    case 3:
      if (!data.motionType) {
        errors.push('Please select motion type');
      }
      break;

    case 4:
      if (!data.caseDetails?.caseNumber) {
        errors.push('Case number is required');
      }
      if (!data.caseDetails?.courtName) {
        errors.push('Court name is required');
      }
      if (!data.caseDetails?.plaintiffNames?.length) {
        errors.push('At least one plaintiff is required');
      }
      if (!data.caseDetails?.defendantNames?.length) {
        errors.push('At least one defendant is required');
      }
      break;

    case 5:
      // Documents are optional but validate page count if present
      if (data.totalPages && data.totalPages > MAX_TOTAL_PAGES) {
        errors.push(`Total pages exceeds maximum of ${MAX_TOTAL_PAGES}`);
      }
      break;

    case 6:
      // Summary facts has no minimum per spec
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// PRICE CALCULATION
// ============================================================================

/**
 * Calculate price based on tier, jurisdiction, and rush option
 */
export async function calculatePrice(
  tier: 'A' | 'B' | 'C',
  jurisdiction: string,
  rushOption: 'standard' | '48hr' | '24hr'
): Promise<PriceCalculation> {
  const basePrice = BASE_PRICES[tier];
  const multiplier = JURISDICTION_MULTIPLIERS[jurisdiction] || 1.0;
  const rushFee = RUSH_FEES[rushOption];

  const adjustedBase = Math.round(basePrice * multiplier);
  const total = adjustedBase + rushFee;

  return {
    base: adjustedBase,
    rush: rushFee,
    total,
  };
}

/**
 * Get tier from motion type
 */
export function getTierFromMotionType(motionType: string): 'A' | 'B' | 'C' | null {
  const config = MOTION_TYPES[motionType];
  return config?.tier || null;
}

// ============================================================================
// PATH DETECTION
// ============================================================================

/**
 * Detect workflow path from uploaded documents
 * If opponent motion is uploaded, switches to PATH B (opposition)
 */
export async function detectPathFromDocuments(
  documents: IntakeData['documents']
): Promise<'path_a' | 'path_b'> {
  // Check if any document is tagged as opponent's motion
  const hasOpponentMotion = documents.some(doc => doc.type === 'opponent_motion');

  if (hasOpponentMotion) {
    console.log('[Phase I] Detected opponent motion - switching to PATH B');
    return 'path_b';
  }

  return 'path_a';
}

/**
 * Auto-classify document type based on filename
 */
export function classifyDocument(
  filename: string
): IntakeData['documents'][0]['type'] {
  const lowerFilename = filename.toLowerCase();

  // Check for opponent motion indicators
  if (
    lowerFilename.includes('motion') &&
    (lowerFilename.includes('opponent') ||
      lowerFilename.includes('opposition') ||
      lowerFilename.includes('plaintiff') ||
      lowerFilename.includes('defendant'))
  ) {
    return 'opponent_motion';
  }

  // Check for exhibit indicators
  if (
    lowerFilename.includes('exhibit') ||
    lowerFilename.includes('attachment') ||
    lowerFilename.includes('evidence')
  ) {
    return 'exhibit';
  }

  // Default to supporting document
  return 'supporting';
}

// ============================================================================
// MOTION TYPE HELPERS
// ============================================================================

/**
 * Get motion types available for a jurisdiction
 */
export function getMotionTypesForJurisdiction(
  jurisdiction: string
): Array<{ id: string; name: string; tier: 'A' | 'B' | 'C'; description: string }> {
  return Object.entries(MOTION_TYPES)
    .filter(([, config]) => config.jurisdictions.includes(jurisdiction))
    .map(([id, config]) => ({
      id,
      name: config.name,
      tier: config.tier,
      description: config.description,
    }))
    .sort((a, b) => {
      // Sort by tier, then by name
      const tierOrder = { 'A': 0, 'B': 1, 'C': 2 };
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[a.tier] - tierOrder[b.tier];
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * Get motion types grouped by tier
 */
export function getMotionTypesGroupedByTier(
  jurisdiction: string
): Record<'A' | 'B' | 'C', Array<{ id: string; name: string; description: string }>> {
  const types = getMotionTypesForJurisdiction(jurisdiction);

  return {
    'A': types.filter(t => t.tier === 'A').map(({ id, name, description }) => ({ id, name, description })),
    'B': types.filter(t => t.tier === 'B').map(({ id, name, description }) => ({ id, name, description })),
    'C': types.filter(t => t.tier === 'C').map(({ id, name, description }) => ({ id, name, description })),
  };
}

// ============================================================================
// COURT HELPERS
// ============================================================================

/**
 * Get available courts for a jurisdiction
 */
export function getCourtsForJurisdiction(
  jurisdiction: string
): Array<{ id: string; name: string; divisions?: string[] }> {
  switch (jurisdiction) {
    case 'federal_5th':
      return [
        { id: 'txsd', name: 'U.S. District Court - Southern District of Texas', divisions: ['Houston', 'Galveston', 'Brownsville', 'Corpus Christi', 'Laredo', 'McAllen', 'Victoria'] },
        { id: 'txnd', name: 'U.S. District Court - Northern District of Texas', divisions: ['Dallas', 'Fort Worth', 'Abilene', 'Amarillo', 'Lubbock', 'San Angelo', 'Wichita Falls'] },
        { id: 'txed', name: 'U.S. District Court - Eastern District of Texas', divisions: ['Beaumont', 'Lufkin', 'Marshall', 'Sherman', 'Texarkana', 'Tyler'] },
        { id: 'txwd', name: 'U.S. District Court - Western District of Texas', divisions: ['Austin', 'San Antonio', 'El Paso', 'Del Rio', 'Midland', 'Pecos', 'Waco'] },
        { id: 'laed', name: 'U.S. District Court - Eastern District of Louisiana' },
        { id: 'lawd', name: 'U.S. District Court - Western District of Louisiana' },
        { id: 'lamd', name: 'U.S. District Court - Middle District of Louisiana' },
        { id: 'msnd', name: 'U.S. District Court - Northern District of Mississippi' },
        { id: 'mssd', name: 'U.S. District Court - Southern District of Mississippi' },
      ];

    case 'federal_9th':
      return [
        { id: 'cacd', name: 'U.S. District Court - Central District of California', divisions: ['Los Angeles', 'Riverside', 'Santa Ana'] },
        { id: 'cand', name: 'U.S. District Court - Northern District of California', divisions: ['San Francisco', 'Oakland', 'San Jose'] },
        { id: 'casd', name: 'U.S. District Court - Southern District of California' },
        { id: 'caed', name: 'U.S. District Court - Eastern District of California', divisions: ['Sacramento', 'Fresno'] },
        { id: 'azd', name: 'U.S. District Court - District of Arizona', divisions: ['Phoenix', 'Tucson'] },
        { id: 'nvd', name: 'U.S. District Court - District of Nevada', divisions: ['Las Vegas', 'Reno'] },
        { id: 'ord', name: 'U.S. District Court - District of Oregon' },
        { id: 'wawd', name: 'U.S. District Court - Western District of Washington' },
        { id: 'waed', name: 'U.S. District Court - Eastern District of Washington' },
      ];

    case 'ca_state':
      return [
        { id: 'ca_la', name: 'Los Angeles County Superior Court' },
        { id: 'ca_sf', name: 'San Francisco County Superior Court' },
        { id: 'ca_sd', name: 'San Diego County Superior Court' },
        { id: 'ca_orange', name: 'Orange County Superior Court' },
        { id: 'ca_alameda', name: 'Alameda County Superior Court' },
        { id: 'ca_sacramento', name: 'Sacramento County Superior Court' },
        { id: 'ca_santaclara', name: 'Santa Clara County Superior Court' },
        { id: 'ca_riverside', name: 'Riverside County Superior Court' },
        { id: 'ca_sanbernardino', name: 'San Bernardino County Superior Court' },
      ];

    case 'la_state':
      return [
        { id: 'la_orleans', name: 'Orleans Parish Civil District Court' },
        { id: 'la_jefferson', name: 'Jefferson Parish 24th Judicial District Court' },
        { id: 'la_ebr', name: 'East Baton Rouge Parish 19th Judicial District Court' },
        { id: 'la_caddo', name: 'Caddo Parish 1st Judicial District Court' },
        { id: 'la_calcasieu', name: 'Calcasieu Parish 14th Judicial District Court' },
        { id: 'la_lafayette', name: 'Lafayette Parish 15th Judicial District Court' },
      ];

    default:
      return [];
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Save intake data to order
 */
export async function saveIntakeData(
  orderId: string,
  intakeData: IntakeData
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current phase outputs
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('phase_outputs')
      .eq('id', orderId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const phaseOutputs = (order?.phase_outputs || {}) as Record<string, unknown>;

    // Save Phase I output
    phaseOutputs['I'] = {
      phaseComplete: 'I',
      intakeData,
      classification: {
        motionType: intakeData.motionType,
        tier: intakeData.tier,
        path: intakeData.workflowPath,
        jurisdiction: intakeData.jurisdiction,
      },
      caseIdentifiers: {
        caseNumber: intakeData.caseDetails.caseNumber,
        caseCaption: `${intakeData.caseDetails.plaintiffNames.join(', ')} v. ${intakeData.caseDetails.defendantNames.join(', ')}`,
      },
      parties: {
        plaintiffs: intakeData.caseDetails.plaintiffNames,
        defendants: intakeData.caseDetails.defendantNames,
      },
      documentCount: intakeData.documents.length,
      totalPages: intakeData.totalPages,
      pricing: {
        basePrice: intakeData.basePrice,
        rushFee: intakeData.rushFee,
        totalPrice: intakeData.totalPrice,
      },
      validatedAt: new Date().toISOString(),
    };

    // Update order
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        phase_outputs: phaseOutputs,
        tier: intakeData.tier,
        motion_type: intakeData.motionType,
        jurisdiction: intakeData.jurisdiction,
        workflow_path: intakeData.workflowPath,
        case_caption: `${intakeData.caseDetails.plaintiffNames.join(', ')} v. ${intakeData.caseDetails.defendantNames.join(', ')}`,
        case_number: intakeData.caseDetails.caseNumber,
        summary_facts: intakeData.summaryFacts,
        total_price: intakeData.totalPrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw updateError;
    }

    console.log(`[Phase I] Saved intake data for order ${orderId}`);
    return { success: true };
  } catch (error) {
    console.error('[Phase I] Error saving intake data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Complete Phase I and advance workflow
 */
export async function completePhaseI(
  orderId: string,
  intakeData: IntakeData
): Promise<{ success: boolean; nextPhase: string; error?: string }> {
  // Validate intake data
  const validation = await validateIntake(intakeData);
  if (!validation.valid) {
    return {
      success: false,
      nextPhase: 'I',
      error: Object.values(validation.errors).join(', '),
    };
  }

  // Save intake data
  const saveResult = await saveIntakeData(orderId, intakeData);
  if (!saveResult.success) {
    return {
      success: false,
      nextPhase: 'I',
      error: saveResult.error,
    };
  }

  // Update workflow state to Phase II
  try {
    const supabase = await createClient();

    await supabase
      .from('order_workflow_state')
      .update({
        current_phase: 'II',
        phase_i_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    console.log(`[Phase I] Completed for order ${orderId}, advancing to Phase II`);
    return {
      success: true,
      nextPhase: 'II',
    };
  } catch (error) {
    console.error('[Phase I] Error completing phase:', error);
    return {
      success: false,
      nextPhase: 'I',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateIntake,
  validateStep,
  calculatePrice,
  getTierFromMotionType,
  detectPathFromDocuments,
  classifyDocument,
  getMotionTypesForJurisdiction,
  getMotionTypesGroupedByTier,
  getCourtsForJurisdiction,
  saveIntakeData,
  completePhaseI,
  MOTION_TYPES,
};
