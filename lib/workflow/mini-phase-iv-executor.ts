/**
 * A-006: Mini Phase IV Executor
 *
 * Targeted citation search triggered by Protocol 5 (Statutory Citation Extraction)
 * during the revision loop. Unlike full Phase IV (comprehensive research), this
 * runs a focused search for case law supporting specific statutory propositions
 * identified by P5.
 *
 * This executor reuses existing Phase IV search infrastructure (CourtListener
 * parallel search) but scoped to individual statutory citations rather than
 * full element extraction.
 */

import { createLogger } from '@/lib/logging/logger';
import { searchByCitation, searchByCaseName } from '@/lib/courtlistener/client';

const logger = createLogger('mini-phase-iv');

export interface StatutoryCitation {
  statute: string;        // e.g., "28 U.S.C. § 1746"
  proposition: string;    // What it's cited for
  context: string;        // Surrounding text
}

export interface MiniPhaseIVInput {
  orderId: string;
  tier: string;
  jurisdiction: string;
  statutoryCitations: StatutoryCitation[];
}

export interface SupplementalCase {
  caseName: string;
  citation: string;
  relevance: string;
  courtlistenerId?: string;
}

export interface MiniPhaseIVResult {
  supplementalCitations: Array<{
    originalStatute: string;
    supportingCases: SupplementalCase[];
  }>;
  searchesPerformed: number;
  casesFound: number;
  durationMs: number;
}

/**
 * Execute a targeted mini Phase IV search for case law supporting
 * specific statutory citations identified by Protocol 5.
 *
 * For each statutory citation, searches CourtListener for cases that
 * cite or interpret the same statute in a similar context.
 */
export async function executeMiniPhaseIV(
  input: MiniPhaseIVInput
): Promise<MiniPhaseIVResult> {
  const start = Date.now();
  let totalSearches = 0;
  let totalCasesFound = 0;

  logger.info('mini_phase_iv.started', {
    orderId: input.orderId,
    tier: input.tier,
    statutoryCount: input.statutoryCitations.length,
  });

  const supplementalCitations: MiniPhaseIVResult['supplementalCitations'] = [];

  // Process each statutory citation — search for supporting case law
  for (const statutory of input.statutoryCitations) {
    const supportingCases: SupplementalCase[] = [];

    // Strategy 1: Search for the statute text directly
    // Cases that cite the same statute are likely relevant
    const statuteQuery = statutory.statute.replace(/§/g, 'section');
    const searchResult = await searchByCaseName(statuteQuery);
    totalSearches++;

    if (searchResult.success && searchResult.data?.found && searchResult.data.opinions.length > 0) {
      for (const opinion of searchResult.data.opinions.slice(0, 3)) {
        supportingCases.push({
          caseName: opinion.case_name || 'Unknown',
          citation: Array.isArray(opinion.citation) ? opinion.citation.join(', ') : (opinion.citation || ''),
          relevance: `Cites ${statutory.statute} — potential supporting authority`,
          courtlistenerId: opinion.id ? String(opinion.id) : undefined,
        });
        totalCasesFound++;
      }
    }

    // Strategy 2: Search by proposition keywords if no results from statute search
    if (supportingCases.length === 0 && statutory.proposition.length > 10) {
      // Extract key terms from the proposition (first 100 chars for search)
      const propositionQuery = statutory.proposition.substring(0, 100);
      const propResult = await searchByCaseName(propositionQuery);
      totalSearches++;

      if (propResult.success && propResult.data?.found && propResult.data.opinions.length > 0) {
        for (const opinion of propResult.data.opinions.slice(0, 2)) {
          supportingCases.push({
            caseName: opinion.case_name || 'Unknown',
            citation: Array.isArray(opinion.citation) ? opinion.citation.join(', ') : (opinion.citation || ''),
            relevance: `Related to proposition: "${statutory.proposition.substring(0, 80)}..."`,
            courtlistenerId: opinion.id ? String(opinion.id) : undefined,
          });
          totalCasesFound++;
        }
      }
    }

    supplementalCitations.push({
      originalStatute: statutory.statute,
      supportingCases,
    });
  }

  const durationMs = Date.now() - start;

  logger.info('mini_phase_iv.completed', {
    orderId: input.orderId,
    searchesPerformed: totalSearches,
    casesFound: totalCasesFound,
    durationMs,
  });

  return {
    supplementalCitations,
    searchesPerformed: totalSearches,
    casesFound: totalCasesFound,
    durationMs,
  };
}
