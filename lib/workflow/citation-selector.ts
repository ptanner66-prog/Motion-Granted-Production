/**
 * CITATION SELECTION ALGORITHM
 *
 * TASK-04: Recalibrate citation selection for Tier B/C/D.
 *
 * Audit Evidence (Pelican order):
 * 110 candidates → 4 citations (3.6% survival rate).
 * Target for Tier C MSJ: 6-10 citations.
 * Wechem v. Evans, Acadian Cypress v. Stewart never survived.
 *
 * Solution:
 * Tier-appropriate thresholds and yield warnings.
 *
 * @module citation-selector
 */

import type { ScoredCitation, ScoringContext } from './citation-scorer';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SelectionResult {
  selectedCitations: ScoredCitation[];
  rejectedCitations: ScoredCitation[];
  yieldWarnings: YieldWarning[];
  stats: SelectionStats;
}

export interface YieldWarning {
  batchId: string;
  element: string;
  candidateCount: number;
  selectedCount: number;
  reason: string;
}

export interface SelectionStats {
  totalCandidates: number;
  totalSelected: number;
  yieldPercentage: number;
  averageScore: number;
  thresholdUsed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Citation yield targets by tier
const CITATION_TARGETS: Record<string, { min: number; max: number }> = {
  A: { min: 2, max: 4 },
  B: { min: 4, max: 6 },
  C: { min: 6, max: 10 },
  D: { min: 8, max: 12 },
};

// Minimum relevance score thresholds by tier
// Lower tiers need higher thresholds (stricter), higher tiers more lenient
const BASE_THRESHOLDS: Record<string, number> = {
  A: 65,  // Strict — only high-relevance for simple motions
  B: 55,  // Moderate
  C: 45,  // More lenient — need more citations
  D: 40,  // Most lenient — need extensive citations
};

// Threshold reduction for re-selection attempts
const THRESHOLD_RELAXATION = 10;
const MAX_RELAXATION_ATTEMPTS = 2;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SELECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select citations from candidates based on tier-appropriate criteria.
 *
 * Selection process:
 * 1. Score all candidates
 * 2. Apply tier-specific threshold
 * 3. Check yield against target
 * 4. If yield too low, relax threshold and re-select
 * 5. Log YIELD_WARNING if still below target
 *
 * @param candidates - Scored citation candidates
 * @param context - Scoring and selection context
 * @returns Selection result with warnings
 */
export function selectCitations(
  candidates: ScoredCitation[],
  context: ScoringContext
): SelectionResult {
  const tier = context.tier;
  const target = CITATION_TARGETS[tier];
  const baseThreshold = BASE_THRESHOLDS[tier];

  const yieldWarnings: YieldWarning[] = [];
  let threshold = baseThreshold;
  let selected: ScoredCitation[] = [];
  let rejected: ScoredCitation[] = [];
  let relaxationAttempts = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTION WITH THRESHOLD RELAXATION
  // ─────────────────────────────────────────────────────────────────────────

  while (relaxationAttempts <= MAX_RELAXATION_ATTEMPTS) {
    selected = candidates.filter(c => c.relevanceScore >= threshold);
    rejected = candidates.filter(c => c.relevanceScore < threshold);

    // Check if we meet minimum yield
    if (selected.length >= target.min) {
      break;
    }

    // Not enough — relax threshold
    if (relaxationAttempts < MAX_RELAXATION_ATTEMPTS) {
      logger.info('[CITATION-SELECTOR] Relaxing threshold', {
        tier,
        currentThreshold: threshold,
        newThreshold: threshold - THRESHOLD_RELAXATION,
        currentYield: selected.length,
        targetMin: target.min,
      });

      threshold -= THRESHOLD_RELAXATION;
      relaxationAttempts++;
    } else {
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // YIELD WARNING
  // ─────────────────────────────────────────────────────────────────────────

  if (selected.length < target.min) {
    const warning: YieldWarning = {
      batchId: 'aggregated',
      element: 'all',
      candidateCount: candidates.length,
      selectedCount: selected.length,
      reason: `YIELD_WARNING: Selected ${selected.length} citations, target minimum is ${target.min} for Tier ${tier}`,
    };

    yieldWarnings.push(warning);

    logger.warn('[CITATION-SELECTOR] Below yield target', {
      tier,
      selected: selected.length,
      targetMin: target.min,
      totalCandidates: candidates.length,
      thresholdUsed: threshold,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAP AT MAXIMUM
  // ─────────────────────────────────────────────────────────────────────────

  if (selected.length > target.max) {
    // Sort by score and take top N
    selected.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const excess = selected.slice(target.max);
    selected = selected.slice(0, target.max);
    rejected = [...rejected, ...excess];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ─────────────────────────────────────────────────────────────────────────

  const avgScore = selected.length > 0
    ? selected.reduce((sum, c) => sum + c.relevanceScore, 0) / selected.length
    : 0;

  return {
    selectedCitations: selected,
    rejectedCitations: rejected,
    yieldWarnings,
    stats: {
      totalCandidates: candidates.length,
      totalSelected: selected.length,
      yieldPercentage: candidates.length > 0
        ? (selected.length / candidates.length) * 100
        : 0,
      averageScore: Math.round(avgScore * 10) / 10,
      thresholdUsed: threshold,
    },
  };
}

/**
 * Check batch-level yield and generate warnings.
 *
 * When a batch returns 10+ candidates but 0 survive,
 * this indicates overly aggressive filtering.
 */
export function checkBatchYield(
  batchId: string,
  element: string,
  candidates: ScoredCitation[],
  selected: ScoredCitation[]
): YieldWarning | null {
  if (candidates.length >= 10 && selected.length === 0) {
    return {
      batchId,
      element,
      candidateCount: candidates.length,
      selectedCount: 0,
      reason: `YIELD_WARNING: Batch ${batchId} returned ${candidates.length} candidates for '${element}' but 0 survived selection`,
    };
  }

  return null;
}
