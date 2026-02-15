/**
 * VERIFICATION STATUS VALIDATOR
 *
 * TASK-13: Fix 'verified_now' entries with null CourtListener IDs.
 *
 * Audit Evidence (Pelican order):
 * Phase V.1: "267 So. 3" — verified: true, courtlistener_id: null
 * A citation marked 'verified: true' with no CourtListener record ID
 * has not been validated against a source database.
 *
 * Rule: verified: true AND courtlistener_id: null is INVALID.
 * These are mutually exclusive states.
 *
 * @module verification-status-validator
 */

import { logger } from '@/lib/logger';

// =======================================================================
// TYPES
// =======================================================================

export type VerificationStatus =
  | 'bank_verified'      // From Phase IV bank, has courtlistener_id
  | 'draft_verified'     // Found in draft, confirmed against CourtListener
  | 'unmatched'          // Found in draft, no CourtListener match
  | 'failed';            // Verification attempted, failed

export interface ValidatedCitation {
  citation: string;
  caseName?: string;
  verificationStatus: VerificationStatus;
  courtlistenerId: string | null;
  verificationMethod: string;
  needsManualReview: boolean;
}

export interface ValidationResult {
  validCitations: ValidatedCitation[];
  invalidCitations: ValidatedCitation[];
  flaggedForReview: ValidatedCitation[];
  report: string;
}

// =======================================================================
// VALIDATION
// =======================================================================

/**
 * Validate that verification status is consistent with courtlistener_id.
 *
 * Rules:
 * - verified: true requires courtlistener_id
 * - If no courtlistener_id, status must be 'unmatched' not 'verified'
 * - 'unmatched' citations are flagged for manual review
 */
export function validateVerificationStatus(
  citation: string,
  verified: boolean,
  courtlistenerId: string | null,
  source: 'bank' | 'draft'
): ValidatedCitation {
  // -------------------------------------------------------------------
  // CASE 1: Has courtlistener_id — properly verified
  // -------------------------------------------------------------------

  if (courtlistenerId) {
    return {
      citation,
      verificationStatus: source === 'bank' ? 'bank_verified' : 'draft_verified',
      courtlistenerId,
      verificationMethod: source === 'bank' ? 'research_bank' : 'draft_lookup',
      needsManualReview: false,
    };
  }

  // -------------------------------------------------------------------
  // CASE 2: No courtlistener_id but marked as verified — INVALID
  // -------------------------------------------------------------------

  if (verified && !courtlistenerId) {
    logger.error('[VERIFICATION] Invalid state: verified=true with null ID', {
      citation,
      source,
    });

    // Correct the status to 'unmatched'
    return {
      citation,
      verificationStatus: 'unmatched',
      courtlistenerId: null,
      verificationMethod: 'corrected_from_invalid',
      needsManualReview: true,
    };
  }

  // -------------------------------------------------------------------
  // CASE 3: Not verified and no ID — unmatched (expected state)
  // -------------------------------------------------------------------

  return {
    citation,
    verificationStatus: 'unmatched',
    courtlistenerId: null,
    verificationMethod: 'no_match_found',
    needsManualReview: true,
  };
}

/**
 * Process a batch of citations and validate all statuses.
 */
export function validateCitationBatch(
  citations: {
    citation: string;
    caseName?: string;
    verified: boolean;
    courtlistenerId: string | null;
    source: 'bank' | 'draft';
  }[]
): ValidationResult {
  const validCitations: ValidatedCitation[] = [];
  const invalidCitations: ValidatedCitation[] = [];
  const flaggedForReview: ValidatedCitation[] = [];

  for (const c of citations) {
    const validated = validateVerificationStatus(
      c.citation,
      c.verified,
      c.courtlistenerId,
      c.source
    );
    validated.caseName = c.caseName;

    if (validated.verificationStatus === 'bank_verified' ||
        validated.verificationStatus === 'draft_verified') {
      validCitations.push(validated);
    } else if (validated.verificationMethod === 'corrected_from_invalid') {
      invalidCitations.push(validated);
      flaggedForReview.push(validated);
    } else if (validated.needsManualReview) {
      flaggedForReview.push(validated);
    }
  }

  // Generate report
  const report = generateValidationReport(validCitations, invalidCitations, flaggedForReview);

  return {
    validCitations,
    invalidCitations,
    flaggedForReview,
    report,
  };
}

/**
 * Generate verification report for AIS.
 */
function generateValidationReport(
  valid: ValidatedCitation[],
  invalid: ValidatedCitation[],
  flagged: ValidatedCitation[]
): string {
  let report = '## Citation Verification Summary\n\n';

  // Valid citations
  report += `### Verified Citations (${valid.length})\n\n`;
  for (const c of valid) {
    report += `- ${c.caseName || c.citation} — ${c.verificationStatus}\n`;
  }

  // Invalid (corrected) citations
  if (invalid.length > 0) {
    report += `\n### Citations with Corrected Status (${invalid.length})\n\n`;
    report += 'These citations were marked as "verified" but had no CourtListener ID. Status corrected to "unmatched".\n\n';
    for (const c of invalid) {
      report += `- ${c.citation} — requires manual verification\n`;
    }
  }

  // Flagged for review
  if (flagged.length > 0) {
    report += `\n### Flagged for Manual Review (${flagged.length})\n\n`;
    for (const c of flagged) {
      report += `- ${c.citation}\n`;
    }
  }

  return report;
}
