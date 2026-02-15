/**
 * BATCH RETRY HANDLER
 *
 * TASK-16: Retry failed batches with alternative queries.
 *
 * When a batch returns 0 results, generate 2-3 alternative queries
 * using synonym substitution, broader scope, and statute removal.
 *
 * Audit Evidence (Pelican order):
 * Batch 4 queried: "La. C.C. Art. 2710 employee duty loyalty compete
 * during employment Louisiana" — 10-word query with specific article.
 * Alternative queries like "employee fiduciary duty compete Louisiana
 * appellate" would likely have returned results.
 *
 * @module batch-retry-handler
 */

import { searchOpinions } from '@/lib/courtlistener/client';
import { type RawCandidate } from '@/types/citation-research';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-batch-retry-handler');

// ============================================================================
// TYPES
// ============================================================================

export interface BatchRetryResult {
  element: string;
  originalQuery: string;
  retryQueries: string[];
  candidates: RawCandidate[];
  success: boolean;
  retriesAttempted: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

/** Synonym substitutions for common legal terms. */
const SYNONYMS: Record<string, string[]> = {
  'duty of loyalty': ['fiduciary duty', 'employee loyalty obligation'],
  'duty loyalty': ['fiduciary duty', 'loyalty obligation'],
  'non-compete': ['noncompete', 'restrictive covenant', 'competition agreement'],
  'noncompete': ['non-compete', 'restrictive covenant'],
  'compete during employment': ['competing while employed', 'competition before termination'],
  'solicit': ['contact customers', 'recruit clients'],
  'trade secret': ['confidential information', 'proprietary information'],
  'breach of contract': ['contract violation', 'breach of agreement'],
};

/** Statute patterns to remove from queries. */
const STATUTE_PATTERNS = [
  /La\.\s*C\.C\.?\s*Art\.\s*\d+/gi,
  /La\.\s*R\.S\.\s*\d+:\d+/gi,
  /\d+:\d+/g,
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Retry a failed batch with alternative queries.
 *
 * @param element - The legal element being searched
 * @param originalQuery - The query that returned 0 results
 * @param jurisdiction - Filing jurisdiction (e.g. "la" for Louisiana)
 * @returns Retry result with candidates if successful
 */
export async function retryFailedBatch(
  element: string,
  originalQuery: string,
  jurisdiction: string
): Promise<BatchRetryResult> {
  const retryQueries = generateAlternativeQueries(element, originalQuery);
  const candidates: RawCandidate[] = [];
  let retriesAttempted = 0;

  log.info('Starting retry for failed batch', {
    element,
    originalQuery,
    alternativeQueryCount: retryQueries.length,
  });

  for (const query of retryQueries.slice(0, MAX_RETRIES)) {
    retriesAttempted++;

    try {
      const result = await Promise.race([
        searchOpinions(
          query,
          jurisdiction.toLowerCase().includes('la') ? 'la' : jurisdiction,
          10
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Search timeout')), TIMEOUT_MS)
        ),
      ]);

      if (result.success && result.data) {
        const opinions = result.data.opinions;

        log.info('Retry search completed', {
          element,
          query,
          resultCount: opinions.length,
          retryAttempt: retriesAttempted,
        });

        if (opinions.length > 0) {
          const mapped = opinions.map((op): RawCandidate => ({
            id: op.id,
            clusterId: op.cluster_id,
            caseName: op.case_name,
            citation: op.citation,
            court: op.court,
            courtCode: op.court,
            dateFiled: op.date_filed,
            snippet: op.snippet,
            absoluteUrl: op.absolute_url,
            precedentialStatus: op.precedential_status,
            forElement: element,
            searchTier: 'tier2',
          }));

          candidates.push(...mapped);

          if (candidates.length >= 3) {
            break;
          }
        }
      } else {
        log.warn('Retry search returned error', {
          element,
          query,
          error: result.error,
        });
      }
    } catch (error) {
      log.warn('Retry search failed', {
        element,
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const success = candidates.length > 0;

  if (!success) {
    log.warn('All retries failed — marking as RESEARCH_GAP', {
      element,
      retriesAttempted,
    });
  }

  return {
    element,
    originalQuery,
    retryQueries: retryQueries.slice(0, MAX_RETRIES),
    candidates,
    success,
    retriesAttempted,
  };
}

// ============================================================================
// QUERY GENERATION
// ============================================================================

/**
 * Generate alternative search queries for a failed element.
 *
 * Strategies:
 * 1. Remove statute-specific references
 * 2. Synonym substitution
 * 3. Broaden scope (remove qualifiers)
 * 4. Element-based fallback queries
 */
export function generateAlternativeQueries(
  element: string,
  originalQuery: string
): string[] {
  const alternatives: string[] = [];
  const query = originalQuery.toLowerCase();

  // ──────────────────────────────────────────────────────────────────────
  // STRATEGY 1: Remove statute references
  // ──────────────────────────────────────────────────────────────────────

  let withoutStatutes = query;
  for (const pattern of STATUTE_PATTERNS) {
    withoutStatutes = withoutStatutes.replace(pattern, '').trim();
  }
  withoutStatutes = withoutStatutes.replace(/\s+/g, ' ').trim();

  if (withoutStatutes !== query && withoutStatutes.length > 10) {
    alternatives.push(withoutStatutes);
  }

  // ──────────────────────────────────────────────────────────────────────
  // STRATEGY 2: Synonym substitution
  // ──────────────────────────────────────────────────────────────────────

  for (const [term, subs] of Object.entries(SYNONYMS)) {
    if (query.includes(term)) {
      for (const sub of subs) {
        const substituted = query.replace(term, sub);
        if (!alternatives.includes(substituted)) {
          alternatives.push(substituted);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // STRATEGY 3: Broaden scope
  // ──────────────────────────────────────────────────────────────────────

  const broader = query
    .replace(/during employment/gi, '')
    .replace(/while employed/gi, '')
    .replace(/\bemployee\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (broader !== query && broader.length > 10) {
    alternatives.push(broader + ' Louisiana appellate');
  }

  // ──────────────────────────────────────────────────────────────────────
  // STRATEGY 4: Element-based fallback
  // ──────────────────────────────────────────────────────────────────────

  const elementFallbacks: Record<string, string[]> = {
    'duty_of_loyalty': [
      'employee fiduciary duty breach Louisiana',
      'duty loyalty employment Louisiana appellate',
    ],
    'competing_during_employment': [
      'employee compete while employed Louisiana',
      'forming competing business employment Louisiana',
    ],
    'non_compete_enforceability': [
      'non-compete enforcement Louisiana R.S. 23:921',
      'restrictive covenant employee Louisiana',
    ],
    'legitimate_business_interest': [
      'protectable business interest non-compete Louisiana',
      'customer relationships trade secrets employer',
    ],
  };

  if (elementFallbacks[element]) {
    for (const fallback of elementFallbacks[element]) {
      if (!alternatives.includes(fallback)) {
        alternatives.push(fallback);
      }
    }
  }

  return [...new Set(alternatives)].slice(0, 5);
}
