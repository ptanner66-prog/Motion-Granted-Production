/**
 * Citation Pipeline Types
 *
 * Shared types for the citation verification pipeline, including
 * batch lookup results, pre-fetch map types, and flag compiler exports.
 *
 * @version BATCH_12 — ST-007: AIS Citation Strength Section
 */

// Re-export flag compiler types (BATCH_12)
export {
  CitationFlagType,
  FLAG_PRIORITY,
  type CitationFlag,
  type StrengthScore,
  compileFlagsForCitation,
  getFlagPriority,
  toStrengthScore,
} from './steps/step-6-flags';

// ============================================================================
// COURTLISTENER BATCH LOOKUP TYPES
// ============================================================================

/**
 * Result from a CourtListener citation lookup.
 * Used by both individual and batch lookup methods.
 */
export interface CLCitationResult {
  found: boolean;
  opinionId?: number;
  caseName?: string;
  court?: string;
  dateFiled?: string;
  citation?: string;
}

/**
 * Pre-fetch map: normalized citation string -> CL lookup result.
 * Used to cache batch lookup results for O(1) access during
 * per-citation pipeline execution.
 */
export type PrefetchMap = Map<string, CLCitationResult | null>;

/**
 * Error from a batch lookup operation.
 */
export interface BatchError {
  textBlock: string;
  error: string;
  recoverable: boolean;
}

/**
 * Result of a batch citation lookup operation.
 */
export interface BatchLookupResult {
  results: Map<string, CLCitationResult>;
  apiCallsUsed: number;
  errors: BatchError[];
}
