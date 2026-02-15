/**
 * CROSS-BATCH GAP FILLING
 *
 * TASK-05: When a research batch returns 0 results, scan
 * related batches for candidates that may address the gap.
 *
 * Audit Evidence (Pelican order):
 * Batch 4 (duty_of_loyalty) got 0 results.
 * Batch 8 (competing_during_employment) returned Risk Management
 * Services v. Moss and Creative Risk Controls v. Brechtel —
 * both discuss duty of loyalty. Pipeline never cross-referenced.
 *
 * @module cross-batch-filler
 */

import type { ScoredCitation } from './citation-scorer';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchResult {
  batchId: string;
  element: string;
  candidates: ScoredCitation[];
  success: boolean;
}

export interface CrossBatchFillResult {
  element: string;
  originalCandidates: number;
  crossBatchCandidates: ScoredCitation[];
  sourceBatches: string[];
  filled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT ADJACENCY MAP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Elements that often overlap in case law.
 * If one element fails, check adjacent elements.
 */
const ELEMENT_ADJACENCY: Record<string, string[]> = {
  'duty_of_loyalty': [
    'competing_during_employment',
    'breach_of_contract_elements',
    'fiduciary_duty',
  ],
  'competing_during_employment': [
    'duty_of_loyalty',
    'non_compete_enforceability',
    'breach_of_fiduciary_duty',
  ],
  'non_compete_enforceability': [
    'non_solicitation',
    'legitimate_business_interest',
    'restrictive_covenant',
  ],
  'non_solicitation': [
    'non_compete_enforceability',
    'customer_relationships',
    'trade_secrets',
  ],
  'legitimate_business_interest': [
    'non_compete_enforceability',
    'trade_secrets',
    'customer_relationships',
  ],
  'breach_of_contract': [
    'breach_of_contract_elements',
    'damages',
    'performance',
  ],
  'summary_judgment_standard': [
    'genuine_issue_material_fact',
    'burden_of_proof',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fill gaps in failed batches using candidates from related batches.
 *
 * @param batchResults - All batch results from Phase IV research
 * @returns Cross-batch fill results for failed elements
 */
export function crossBatchFill(
  batchResults: BatchResult[]
): CrossBatchFillResult[] {
  const results: CrossBatchFillResult[] = [];

  // Find failed batches (0 candidates)
  const failedBatches = batchResults.filter(b => b.candidates.length === 0);
  const successfulBatches = batchResults.filter(b => b.candidates.length > 0);

  for (const failed of failedBatches) {
    const adjacentElements = ELEMENT_ADJACENCY[failed.element] || [];
    const crossBatchCandidates: ScoredCitation[] = [];
    const sourceBatches: string[] = [];

    logger.info('[CROSS-BATCH] Attempting fill for failed element', {
      element: failed.element,
      adjacentElements,
    });

    // Scan adjacent elements
    for (const adjacentElement of adjacentElements) {
      const adjacentBatches = successfulBatches.filter(b =>
        b.element === adjacentElement ||
        b.element.includes(adjacentElement) ||
        adjacentElement.includes(b.element)
      );

      for (const adjacentBatch of adjacentBatches) {
        // Check each candidate for relevance to failed element
        for (const candidate of adjacentBatch.candidates) {
          if (isRelevantToElement(candidate, failed.element)) {
            crossBatchCandidates.push({
              ...candidate,
              // Flag as cross-batch sourced
              searchElement: failed.element,
              searchBatchId: `${adjacentBatch.batchId}_cross_fill`,
            });

            if (!sourceBatches.includes(adjacentBatch.batchId)) {
              sourceBatches.push(adjacentBatch.batchId);
            }
          }
        }
      }
    }

    results.push({
      element: failed.element,
      originalCandidates: 0,
      crossBatchCandidates,
      sourceBatches,
      filled: crossBatchCandidates.length > 0,
    });

    if (crossBatchCandidates.length > 0) {
      logger.info('[CROSS-BATCH] Fill successful', {
        element: failed.element,
        candidatesFound: crossBatchCandidates.length,
        sourceBatches,
      });
    } else {
      logger.warn('[CROSS-BATCH] Fill failed — element marked as RESEARCH_GAP', {
        element: failed.element,
      });
    }
  }

  return results;
}

/**
 * Check if a citation is relevant to a different element.
 */
function isRelevantToElement(
  candidate: ScoredCitation,
  targetElement: string
): boolean {
  const snippet = candidate.snippet.toLowerCase();

  // Element-specific keywords
  const elementKeywords: Record<string, string[]> = {
    'duty_of_loyalty': ['loyalty', 'fiduciary', 'duty of loyalty', 'faithful'],
    'competing_during_employment': ['compet', 'during employment', 'while employed'],
    'non_compete_enforceability': ['non-compete', 'noncompete', 'enforceable', '23:921'],
    'non_solicitation': ['solicit', 'customer', 'non-solicit'],
    'legitimate_business_interest': ['legitimate', 'protectable', 'business interest'],
    'breach_of_contract': ['breach', 'contract', 'agreement'],
  };

  const keywords = elementKeywords[targetElement] || [];

  // Check if snippet contains relevant keywords
  for (const keyword of keywords) {
    if (snippet.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate alternative search queries for a failed element.
 * Used when cross-batch fill also fails.
 */
export function generateAlternativeQueries(
  element: string,
  originalQuery: string
): string[] {
  const alternatives: string[] = [];

  // Strategy 1: Remove statute references
  const withoutStatute = originalQuery.replace(/\b\d+:\d+\b/g, '').trim();
  if (withoutStatute !== originalQuery) {
    alternatives.push(withoutStatute);
  }

  // Strategy 2: Synonym substitution
  const synonyms: Record<string, string[]> = {
    'duty of loyalty': ['fiduciary duty', 'employee loyalty'],
    'compete': ['competition', 'competing business'],
    'non-compete': ['noncompete', 'restrictive covenant', 'competition agreement'],
    'solicit': ['contact', 'approach', 'recruit'],
  };

  for (const [term, subs] of Object.entries(synonyms)) {
    if (originalQuery.toLowerCase().includes(term)) {
      for (const sub of subs) {
        alternatives.push(originalQuery.toLowerCase().replace(term, sub));
      }
    }
  }

  // Strategy 3: Broaden scope
  alternatives.push(`${element.replace(/_/g, ' ')} Louisiana appellate`);

  // Dedupe and limit
  return [...new Set(alternatives)].slice(0, 3);
}
