/**
 * Step 6 Flag Compiler — Citation Strength Flags
 *
 * Compiles citation-level flags based on verification results and
 * strength assessment data. Adds two new flag types:
 * - POTENTIALLY_ABANDONED: 0 citing opinions on record
 * - WEAK_AUTHORITY: Very low citing opinion count with insufficient data
 *
 * @version BATCH_12 — ST-007: AIS Citation Strength Section
 */

import type {
  AuthorityStrengthOutput,
  StrengthAssessment,
} from '@/lib/citation/civ/types';

// ============================================================================
// FLAG TYPE ENUM
// ============================================================================

export enum CitationFlagType {
  // Existing flags (unchanged):
  BAD_LAW = 'BAD_LAW',                     // Priority: CRITICAL
  HOLDING_MISMATCH = 'HOLDING_MISMATCH',   // Priority: WARNING
  QUOTE_NOT_FOUND = 'QUOTE_NOT_FOUND',     // Priority: WARNING
  UNPUBLISHED = 'UNPUBLISHED',             // Priority: WARNING

  // NEW flags:
  POTENTIALLY_ABANDONED = 'POTENTIALLY_ABANDONED', // Priority: FLAG (between WARNING and NOTE)
  WEAK_AUTHORITY = 'WEAK_AUTHORITY',               // Priority: NOTE
}

// ============================================================================
// FLAG PRIORITY HIERARCHY — Higher number = more severe
// ============================================================================

export const FLAG_PRIORITY: Record<CitationFlagType, number> = {
  [CitationFlagType.BAD_LAW]: 100,              // CRITICAL - blocks delivery
  [CitationFlagType.HOLDING_MISMATCH]: 80,      // WARNING - requires review
  [CitationFlagType.QUOTE_NOT_FOUND]: 70,       // WARNING - requires review
  [CitationFlagType.UNPUBLISHED]: 60,           // WARNING - attorney discretion
  [CitationFlagType.POTENTIALLY_ABANDONED]: 50,  // FLAG - noteworthy
  [CitationFlagType.WEAK_AUTHORITY]: 30,         // NOTE - informational
};

// ============================================================================
// FLAG INTERFACES
// ============================================================================

export interface CitationFlag {
  type: CitationFlagType;
  priority: number;
  message: string;
  citation: string;
  recommendation: string;
}

/**
 * Minimal verified citation shape for flag compilation.
 * Compatible with both legacy VerifiedCitation and CIV pipeline output.
 */
export interface FlagCitationInput {
  fullCitation: string;
  isBadLaw?: boolean;
  badLawReason?: string;
  holdingMismatch?: boolean;
  quoteNotFound?: boolean;
  isUnpublished?: boolean;
}

/**
 * Strength score shape used by the flag compiler.
 * Maps to AuthorityStrengthOutput metrics from the CIV pipeline.
 */
export interface StrengthScore {
  rating: StrengthAssessment | 'INSUFFICIENT_DATA';
  citingOpinionCount: number;
  citingOpinionsLast10Years: number;
}

// ============================================================================
// FLAG COMPILER
// ============================================================================

/**
 * Compile flags for a verified citation.
 * Includes strength-based flags when strength data is available.
 */
export function compileFlagsForCitation(
  citation: FlagCitationInput,
  strengthScore?: StrengthScore
): CitationFlag[] {
  const flags: CitationFlag[] = [];

  // BAD_LAW flag
  if (citation.isBadLaw) {
    flags.push({
      type: CitationFlagType.BAD_LAW,
      priority: FLAG_PRIORITY[CitationFlagType.BAD_LAW],
      message: `Citation has been ${citation.badLawReason ?? 'identified as bad law'}`,
      citation: citation.fullCitation,
      recommendation: 'Remove citation or find superseding authority',
    });
  }

  // HOLDING_MISMATCH flag
  if (citation.holdingMismatch) {
    flags.push({
      type: CitationFlagType.HOLDING_MISMATCH,
      priority: FLAG_PRIORITY[CitationFlagType.HOLDING_MISMATCH],
      message: 'Citation does not support claimed proposition',
      citation: citation.fullCitation,
      recommendation: 'Verify proposition matches actual holding or replace citation',
    });
  }

  // QUOTE_NOT_FOUND flag
  if (citation.quoteNotFound) {
    flags.push({
      type: CitationFlagType.QUOTE_NOT_FOUND,
      priority: FLAG_PRIORITY[CitationFlagType.QUOTE_NOT_FOUND],
      message: 'Quoted language could not be located in opinion text',
      citation: citation.fullCitation,
      recommendation: 'Verify quote accuracy or paraphrase with citation',
    });
  }

  // UNPUBLISHED flag
  if (citation.isUnpublished) {
    flags.push({
      type: CitationFlagType.UNPUBLISHED,
      priority: FLAG_PRIORITY[CitationFlagType.UNPUBLISHED],
      message: 'Citation is to an unpublished opinion',
      citation: citation.fullCitation,
      recommendation: 'Verify local rules permit citation to unpublished opinions',
    });
  }

  // Strength-based flags (only if strength data available)
  if (strengthScore) {
    // POTENTIALLY_ABANDONED: 0 citing opinions on record
    if (strengthScore.citingOpinionCount === 0) {
      flags.push({
        type: CitationFlagType.POTENTIALLY_ABANDONED,
        priority: FLAG_PRIORITY[CitationFlagType.POTENTIALLY_ABANDONED],
        message: 'Citation has no citing opinions on record',
        citation: citation.fullCitation,
        recommendation: 'Verify continued relevance; consider supplemental authority',
      });
    }
    // WEAK_AUTHORITY: Very low citing opinion count (< 5) with INSUFFICIENT_DATA
    else if (
      strengthScore.citingOpinionCount < 5 &&
      strengthScore.rating === 'INSUFFICIENT_DATA'
    ) {
      flags.push({
        type: CitationFlagType.WEAK_AUTHORITY,
        priority: FLAG_PRIORITY[CitationFlagType.WEAK_AUTHORITY],
        message: `Citation has only ${strengthScore.citingOpinionCount} citing opinions`,
        citation: citation.fullCitation,
        recommendation: 'Consider supplementing with additional well-cited authority',
      });
    }
  }

  // Sort by priority (highest first)
  flags.sort((a, b) => b.priority - a.priority);

  return flags;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Handle unknown flag types gracefully (future-proofing).
 * Returns the known priority or 0 for unrecognized types.
 */
export function getFlagPriority(flagType: string): number {
  const known = FLAG_PRIORITY[flagType as CitationFlagType];
  if (known !== undefined) return known;

  console.warn(`[FlagCompiler] FLAG_TYPE_UNKNOWN: ${flagType}, using default priority 0`);
  return 0;
}

/**
 * Convert AuthorityStrengthOutput (CIV Step 6) into a StrengthScore
 * for use by the flag compiler.
 */
export function toStrengthScore(output: AuthorityStrengthOutput): StrengthScore {
  const citingOpinionCount = output.metrics.totalCitations;
  const citingOpinionsLast10Years = output.metrics.citationsLast10Years;

  // Determine rating: map StrengthAssessment or detect INSUFFICIENT_DATA
  let rating: StrengthScore['rating'];
  if (citingOpinionCount < 5) {
    rating = 'INSUFFICIENT_DATA';
  } else {
    rating = output.assessment;
  }

  return {
    rating,
    citingOpinionCount,
    citingOpinionsLast10Years,
  };
}
