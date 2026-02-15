/**
 * Citation Pipeline Types
 *
 * Shared types for the citation verification pipeline, including
 * batch lookup results, pre-fetch map types, and citation network types.
 *
 * @version BATCH_10 — ST-004
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

// ============================================================================
// JUDGE LOOKUP TYPES (ST-006 — BATCH_11_JUDGE_LOOKUP)
// ============================================================================

/**
 * Result from a CourtListener judge profile lookup.
 * Used by Phase I intake enrichment and Phase VII judge simulation.
 */
export interface JudgeLookupResult {
  status: 'FOUND' | 'MULTIPLE' | 'NOT_FOUND' | 'ERROR';
  profile: JudgeProfile | null;
  candidates: JudgeCandidate[] | null;  // Populated when status='MULTIPLE'
  source: 'courtlistener' | 'cache';
  lookupTimestamp: string;  // ISO 8601
}

/**
 * Full judge profile assembled from CourtListener endpoints.
 */
export interface JudgeProfile {
  clPersonId: number;
  name: string;
  title: string;
  court: string;
  appointedBy: string | null;
  politicalAffiliation: string | null;
  abaRating: string | null;
  educations: JudgeEducation[];
  positions: JudgePosition[];
  notableRulings: string[];
}

export interface JudgeEducation {
  school: string;
  degree: string;
  year: number | null;
}

export interface JudgePosition {
  court: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

/**
 * Candidate match when multiple judges match a search query.
 */
export interface JudgeCandidate {
  clPersonId: number;
  name: string;
  court: string;
  confidenceScore: number;  // 0-1
}
