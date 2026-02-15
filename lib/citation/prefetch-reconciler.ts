/**
 * Reconciliation between Eyecite extraction and CL batch results
 *
 * Eyecite is canonical (11 custom Louisiana patterns CL may not recognize).
 * CL batch lookup is an optimization for pre-fetching existence checks.
 * This module reconciles the two extraction engines and identifies gaps.
 *
 * @version BATCH_13 — ST-009
 */

import type { NormalizedCitation } from '@/lib/citation/civ/types';
import type { CLCitationResult } from '@/lib/citation/types';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('prefetch-reconciler');

// ============================================================================
// TYPES
// ============================================================================

export interface ReconciliationResult {
  /** Eyecite citation -> CL result (matched) */
  matched: Map<string, CLCitationResult>;
  /** Eyecite found, CL did not */
  unmatchedEyecite: NormalizedCitation[];
  /** CL found, Eyecite did not (logged for diagnostics) */
  unmatchedCL: string[];
  /** Match rate: matched / total Eyecite citations */
  matchRate: number;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

/**
 * Reconcile Eyecite extractions with CL batch results.
 *
 * For each Eyecite citation, attempts to find a matching CL result via:
 * 1. Exact normalized key match
 * 2. Fuzzy match (stripped formatting differences)
 *
 * Unmatched Eyecite citations should fall through to individual API calls.
 * Unmatched CL citations are logged for diagnostics (Eyecite gaps).
 *
 * @param eyeciteCitations - Canonical citation list from Eyecite
 * @param clBatchResults - Results from CL batch lookup
 * @returns Reconciled results with match statistics
 */
export function reconcilePrefetch(
  eyeciteCitations: NormalizedCitation[],
  clBatchResults: Map<string, CLCitationResult>
): ReconciliationResult {
  const matched = new Map<string, CLCitationResult>();
  const unmatchedEyecite: NormalizedCitation[] = [];
  const unmatchedCL: string[] = [];

  // Track which CL results have been matched
  const clMatched = new Set<string>();

  // For each Eyecite citation, try to find a CL match
  for (const citation of eyeciteCitations) {
    // Try exact normalized match first
    if (clBatchResults.has(citation.normalized)) {
      matched.set(citation.normalized, clBatchResults.get(citation.normalized)!);
      clMatched.add(citation.normalized);
      continue;
    }

    // Try fuzzy match (handle formatting differences)
    const fuzzyMatch = findFuzzyMatch(citation.normalized, clBatchResults);
    if (fuzzyMatch) {
      matched.set(citation.normalized, fuzzyMatch.result);
      clMatched.add(fuzzyMatch.key);
      continue;
    }

    // No match found — will fall through to individual API call
    unmatchedEyecite.push(citation);
  }

  // Identify CL extractions that Eyecite missed
  for (const [key] of clBatchResults) {
    if (!clMatched.has(key)) {
      unmatchedCL.push(key);
    }
  }

  // Calculate match rate
  const matchRate = eyeciteCitations.length > 0
    ? matched.size / eyeciteCitations.length
    : 1;

  // Log diagnostics
  if (matchRate < 0.5) {
    log.warn(
      `PREFETCH_LOW_MATCH_RATE: ${(matchRate * 100).toFixed(1)}% ` +
      `(${matched.size}/${eyeciteCitations.length} citations matched)`
    );
  }

  if (unmatchedCL.length > 0) {
    log.info(
      `PREFETCH_ORPHAN: CL found ${unmatchedCL.length} citations ` +
      `not in Eyecite extraction: ${unmatchedCL.slice(0, 3).join(', ')}` +
      `${unmatchedCL.length > 3 ? '...' : ''}`
    );
  }

  // Record match rate for monitoring
  recordMatchRate(matchRate);

  return {
    matched,
    unmatchedEyecite,
    unmatchedCL,
    matchRate,
  };
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

/**
 * Find a fuzzy match for a citation in CL results.
 * Handles common formatting differences between Eyecite and CL extraction.
 */
function findFuzzyMatch(
  normalized: string,
  clResults: Map<string, CLCitationResult>
): { key: string; result: CLCitationResult } | null {
  const stripped = stripForComparison(normalized);

  for (const [key, result] of clResults) {
    if (stripForComparison(key) === stripped) {
      return { key, result };
    }
  }

  return null;
}

/**
 * Strip citation to minimal comparable form.
 * "555 U.S. 223" -> "555us223"
 */
function stripForComparison(citation: string): string {
  return citation
    .toLowerCase()
    .replace(/\s+/g, '')      // Remove spaces
    .replace(/\./g, '')        // Remove periods
    .replace(/,/g, '')         // Remove commas
    .replace(/\u00a0/g, '');   // Remove non-breaking spaces
}

// ============================================================================
// METRICS
// ============================================================================

export interface ReconciliationMetrics {
  totalOrders: number;
  avgMatchRate: number;
  lowMatchRateCount: number;  // Orders with < 50% match rate
  orphanCitationCount: number;
}

const metricsBuffer: number[] = [];

/**
 * Record match rate for monitoring
 */
export function recordMatchRate(rate: number): void {
  metricsBuffer.push(rate);
  // Keep last 100 orders
  if (metricsBuffer.length > 100) {
    metricsBuffer.shift();
  }
}

/**
 * Get reconciliation metrics summary
 */
export function getReconciliationMetrics(): ReconciliationMetrics {
  if (metricsBuffer.length === 0) {
    return {
      totalOrders: 0,
      avgMatchRate: 0,
      lowMatchRateCount: 0,
      orphanCitationCount: 0,
    };
  }

  const avgMatchRate = metricsBuffer.reduce((a, b) => a + b, 0) / metricsBuffer.length;
  const lowMatchRateCount = metricsBuffer.filter(r => r < 0.5).length;

  return {
    totalOrders: metricsBuffer.length,
    avgMatchRate,
    lowMatchRateCount,
    orphanCitationCount: 0, // Requires separate tracking per-reconciliation
  };
}
