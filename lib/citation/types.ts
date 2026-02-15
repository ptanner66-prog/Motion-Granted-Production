/**
 * Citation Pipeline Types
 *
 * Shared types for the citation verification pipeline, including
 * batch lookup results, pre-fetch map types, and citation network types.
 *
 * @version BATCH_10 — ST-004
 */

// ============================================================================
// CITATION NETWORK TYPES (re-exported from unified module)
// ============================================================================

export type {
  CitationNetworkResult,
  StrengthScore,
  NegativeTreatmentResult,
  TreatmentSignal,
  TreatmentType,
} from '@/lib/courtlistener/citation-network';

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
