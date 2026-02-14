import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-validators-required-documents');

/**
 * Required Documents Validator — BUG-07 Production Fix
 *
 * Phase I "front door" validation that checks if minimum required
 * document types are uploaded for the given motion type.
 *
 * SCOPE: Checks document CATEGORIES only, NOT content.
 * Content validation is Phase II/III scope.
 *
 * UNMAPPED MOTION TYPES: Pass with generic warning.
 * With 88+ motion types, the lookup table will initially be incomplete.
 *
 * BUG-07 FIX: Missing required documents now produce ERRORS (blocking),
 * not just warnings. The workflow will not proceed past Phase I if
 * required documents are missing for a mapped motion type.
 */

// ============================================================================
// REQUIRED DOCUMENTS LOOKUP TABLE
// ============================================================================

export const REQUIRED_DOCUMENTS: Record<string, { categories: string[]; description: string }> = {
  'MCOMPEL': {
    categories: ['discovery_requests', 'objection_responses', 'meet_and_confer'],
    description: 'Motion to Compel requires: discovery requests, objection responses, meet-and-confer correspondence',
  },
  'MSJ': {
    categories: ['supporting_evidence'],
    description: 'Motion for Summary Judgment requires at least one piece of supporting evidence',
  },
  'MSA': {
    categories: ['supporting_evidence'],
    description: 'Motion for Summary Adjudication requires at least one piece of supporting evidence',
  },
  'MTD_12B6': {
    categories: [],
    description: 'Motion to Dismiss may proceed without supporting documents (based on pleadings)',
  },
  'MSTRIKE': {
    categories: [],
    description: 'Motion to Strike may proceed without supporting documents',
  },
  'MTC': {
    categories: [],
    description: 'Motion to Continue typically does not require supporting documents',
  },
  'MEXT': {
    categories: [],
    description: 'Motion for Extension of Time typically does not require supporting documents',
  },
  'MPRO_HAC': {
    categories: ['bar_admission_proof'],
    description: 'Pro Hac Vice motion requires proof of bar admission in home state',
  },
  'MSANCTIONS': {
    categories: ['supporting_evidence', 'meet_and_confer'],
    description: 'Motion for Sanctions requires supporting evidence and meet-and-confer documentation',
  },
  'MPROTECTIVE': {
    categories: ['discovery_requests'],
    description: 'Protective Order motion requires the discovery requests at issue',
  },
  'MLIMININE': {
    categories: [],
    description: 'Motion in Limine may proceed without supporting documents',
  },
};

// ============================================================================
// DOCUMENT TYPE DETECTION
// ============================================================================

/**
 * Map natural-language motion type strings to lookup table keys.
 */
function normalizeMotionType(motionType: string): string {
  const upper = motionType.toUpperCase().replace(/\s+/g, '_');

  const mappings: Record<string, string> = {
    'MOTION_TO_COMPEL': 'MCOMPEL',
    'COMPEL': 'MCOMPEL',
    'COMPEL_DISCOVERY': 'MCOMPEL',
    'MOTION_FOR_SUMMARY_JUDGMENT': 'MSJ',
    'SUMMARY_JUDGMENT': 'MSJ',
    'MOTION_FOR_SUMMARY_ADJUDICATION': 'MSA',
    'SUMMARY_ADJUDICATION': 'MSA',
    'MOTION_TO_DISMISS': 'MTD_12B6',
    'DISMISS': 'MTD_12B6',
    '12B6': 'MTD_12B6',
    'MOTION_TO_STRIKE': 'MSTRIKE',
    'STRIKE': 'MSTRIKE',
    'MOTION_TO_CONTINUE': 'MTC',
    'CONTINUE': 'MTC',
    'CONTINUANCE': 'MTC',
    'MOTION_FOR_EXTENSION': 'MEXT',
    'EXTENSION': 'MEXT',
    'EXTENSION_OF_TIME': 'MEXT',
    'PRO_HAC_VICE': 'MPRO_HAC',
    'MOTION_FOR_SANCTIONS': 'MSANCTIONS',
    'SANCTIONS': 'MSANCTIONS',
    'PROTECTIVE_ORDER': 'MPROTECTIVE',
    'MOTION_FOR_PROTECTIVE_ORDER': 'MPROTECTIVE',
    'MOTION_IN_LIMINE': 'MLIMININE',
    'LIMINE': 'MLIMININE',
  };

  return mappings[upper] || upper;
}

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentValidationResult {
  complete: boolean;
  /** Whether missing docs should block workflow execution */
  blocked: boolean;
  missingCategories: string[];
  warnings: string[];
  /** Blocking errors — workflow must not proceed */
  errors: string[];
  motionTypeCode: string;
  isMapped: boolean;
  description: string;
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate that required document types are uploaded for the motion type.
 *
 * BUG-07 FIX: Returns `blocked: true` and populates `errors[]` when
 * required documents are missing for a MAPPED motion type. This prevents
 * the workflow from proceeding without critical evidence.
 *
 * @param motionType - Natural language motion type (e.g., "Motion to Compel")
 * @param uploadedDocumentTypes - Array of document type/category strings that were uploaded
 * @returns DocumentValidationResult
 */
export function validateRequiredDocuments(
  motionType: string,
  uploadedDocumentTypes: string[]
): DocumentValidationResult {
  const code = normalizeMotionType(motionType);
  const requirements = REQUIRED_DOCUMENTS[code];
  const warnings: string[] = [];

  // UNMAPPED MOTION TYPE: Pass with generic warning
  if (!requirements) {
    return {
      complete: true,
      blocked: false,
      missingCategories: [],
      warnings: [
        `No document requirements defined for motion type "${motionType}" (code: ${code}). Proceeding with available uploads.`,
      ],
      errors: [],
      motionTypeCode: code,
      isMapped: false,
      description: 'Unmapped motion type — proceeding with available uploads',
    };
  }

  // No required categories — always pass
  if (requirements.categories.length === 0) {
    return {
      complete: true,
      blocked: false,
      missingCategories: [],
      warnings: [],
      errors: [],
      motionTypeCode: code,
      isMapped: true,
      description: requirements.description,
    };
  }

  // Check each required category
  const normalizedUploaded = uploadedDocumentTypes.map(t => t.toLowerCase().replace(/\s+/g, '_'));
  const missing: string[] = [];

  for (const requiredCategory of requirements.categories) {
    const found = normalizedUploaded.some(uploaded =>
      uploaded.includes(requiredCategory.toLowerCase()) ||
      requiredCategory.toLowerCase().includes(uploaded)
    );
    if (!found) {
      missing.push(requiredCategory);
    }
  }

  if (missing.length > 0) {
    // BUG-07 FIX: Missing required documents are now ERRORS, not warnings.
    // The workflow MUST NOT proceed without these documents.
    const errorMessage = `BLOCKED: ${requirements.description}. Missing required documents: ${missing.join(', ')}. Upload these documents before proceeding.`;
    log.error(`[BUG-07] Document validation BLOCKED for ${code}: missing ${missing.join(', ')}`);

    return {
      complete: false,
      blocked: true,
      missingCategories: missing,
      warnings: [],
      errors: [errorMessage],
      motionTypeCode: code,
      isMapped: true,
      description: requirements.description,
    };
  }

  return {
    complete: true,
    blocked: false,
    missingCategories: [],
    warnings: [],
    errors: [],
    motionTypeCode: code,
    isMapped: true,
    description: requirements.description,
  };
}
