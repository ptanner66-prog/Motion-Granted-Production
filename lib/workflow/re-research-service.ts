/**
 * RE-RESEARCH SERVICE
 *
 * When Phase VIII (Revision) encounters a [CITATION NEEDED] placeholder,
 * this service performs targeted CourtListener searches to fill the gap.
 *
 * Constraints:
 * - Maximum 3 supplemental searches per revision loop iteration
 * - Results must pass through CourtListener verification before insertion
 * - New citations flagged as verification_method: 're-research' for audit
 * - If all searches fail, placeholder preserved and flagged in AIS
 *
 * Audit Evidence (Pelican order):
 * Batch 4 (duty_of_loyalty_during_employment) returned 0 results.
 * Batch 8 returned Risk Management Services v. Moss and Creative Risk Controls
 * v. Brechtel — both discuss duty of loyalty but weren't accessible to revision.
 *
 * @module re-research-service
 */

import {
  searchCourtListener,
  getCourtListenerClient,
  type CourtListenerSearchResult,
} from './courtlistener-client';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-re-research-service');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CitationGap {
  placeholder: string;           // e.g., "[CITATION NEEDED]"
  context: string;              // Surrounding text for query generation
  element: string;              // Legal element this supports (e.g., "duty_of_loyalty")
  location: {
    section: string;            // Which section of the motion
    paragraphIndex: number;     // Which paragraph
  };
}

export interface ReResearchResult {
  gap: CitationGap;
  searchesAttempted: number;
  queriesUsed: string[];
  citationsFound: ReResearchCitation[];
  resolved: boolean;
  failureReason?: string;
}

export interface ReResearchCitation {
  caseName: string;
  citation: string;
  courtlistenerId: string;
  relevanceScore: number;
  snippet: string;
  verificationStatus: 'verified' | 'unverified' | 'failed';
  verificationMethod: 're-research';
  sourceQuery: string;
}

export interface ReResearchOptions {
  jurisdiction: string;
  tier: 'A' | 'B' | 'C' | 'D';
  orderId: string;
  revisionLoop: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SEARCHES_PER_LOOP = 3;
const SEARCH_TIMEOUT_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════════
// QUERY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate search queries for a citation gap.
 *
 * Uses the gap context and element to create targeted queries.
 * Avoids overly specific queries that may have poor coverage.
 */
function generateSearchQueries(gap: CitationGap, jurisdiction: string): string[] {
  const queries: string[] = [];

  // Extract key terms from context
  const contextTerms = extractKeyTerms(gap.context);

  // Element-based queries
  const elementQueryMap: Record<string, string[]> = {
    'duty_of_loyalty': [
      'employee fiduciary duty loyalty Louisiana',
      'breach duty loyalty employment',
      'employee competing while employed',
    ],
    'competing_during_employment': [
      'employee compete during employment breach',
      'competing business while employed',
      'employee fiduciary duty compete',
    ],
    'non_compete_enforceability': [
      'non-compete agreement enforceability Louisiana',
      'La. R.S. 23:921 non-competition',
      'restrictive covenant employment Louisiana',
    ],
    'non_solicitation': [
      'non-solicitation agreement employee',
      'customer solicitation restriction',
      '23:921 non-solicitation',
    ],
    'legitimate_business_interest': [
      'protectable business interest non-compete',
      'customer relationships trade secrets',
      'legitimate business interest employer',
    ],
    'breach_of_contract': [
      'breach employment contract Louisiana',
      'contract violation employer employee',
      'employment agreement breach damages',
    ],
    'summary_judgment_standard': [
      'summary judgment standard Louisiana',
      'genuine issue material fact',
      'La. C.C.P. Art. 966',
    ],
  };

  // Add element-specific queries
  if (elementQueryMap[gap.element]) {
    queries.push(...elementQueryMap[gap.element]);
  }

  // Add context-derived query
  if (contextTerms.length >= 2) {
    queries.push(`${contextTerms.join(' ')} ${jurisdiction} appellate`);
  }

  // Dedupe and limit
  const uniqueQueries = [...new Set(queries)];
  return uniqueQueries.slice(0, MAX_SEARCHES_PER_LOOP);
}

/**
 * Extract key legal terms from context text.
 */
function extractKeyTerms(context: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'that', 'this',
    'these', 'those', 'it', 'its', 'they', 'their', 'them', 'he', 'she',
  ]);

  const words = context
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  // Return top 5 most meaningful terms
  return [...new Set(words)].slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RE-RESEARCH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attempt to resolve a [CITATION NEEDED] gap through targeted research.
 *
 * @param gap - The citation gap to resolve
 * @param options - Research options including jurisdiction and tier
 * @returns Research result with citations found or failure reason
 */
export async function reResearchGap(
  gap: CitationGap,
  options: ReResearchOptions
): Promise<ReResearchResult> {
  const { jurisdiction, orderId, revisionLoop } = options;

  const result: ReResearchResult = {
    gap,
    searchesAttempted: 0,
    queriesUsed: [],
    citationsFound: [],
    resolved: false,
  };

  // Generate search queries
  const queries = generateSearchQueries(gap, jurisdiction);

  log.info('[RE-RESEARCH] Starting gap resolution', {
    orderId,
    revisionLoop,
    element: gap.element,
    queryCount: queries.length,
  });

  const client = getCourtListenerClient();

  // Execute searches
  for (const query of queries) {
    if (result.searchesAttempted >= MAX_SEARCHES_PER_LOOP) {
      break;
    }

    result.searchesAttempted++;
    result.queriesUsed.push(query);

    try {
      // Search CourtListener with timeout
      const searchResults = await Promise.race([
        searchCourtListener({
          query,
          jurisdiction: jurisdiction.includes('la') ? 'la' : undefined,
          maxResults: 5,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Search timeout')), SEARCH_TIMEOUT_MS)
        ),
      ]) as CourtListenerSearchResult[];

      log.info('[RE-RESEARCH] Search completed', {
        orderId,
        query,
        resultCount: searchResults.length,
      });

      // Process results — verify each through CourtListener Stage 1+2
      for (const searchResult of searchResults) {
        if (!searchResult.citation) continue;

        // Verify through CourtListener (existence check + opinion retrieval)
        const verification = await client.verifyCitation(searchResult.citation);

        const citation: ReResearchCitation = {
          caseName: searchResult.caseName,
          citation: searchResult.citation,
          courtlistenerId: searchResult.id,
          relevanceScore: searchResult.relevanceScore ?? 50,
          snippet: searchResult.snippet,
          verificationStatus: verification.verificationStatus === 'VERIFIED' ? 'verified' : 'failed',
          verificationMethod: 're-research',
          sourceQuery: query,
        };

        if (verification.verificationStatus === 'VERIFIED' || verification.verificationStatus === 'VERIFIED_WEB_ONLY') {
          citation.verificationStatus = 'verified';
          result.citationsFound.push(citation);

          log.info('[RE-RESEARCH] Citation verified', {
            orderId,
            citation: citation.citation,
            courtlistenerId: citation.courtlistenerId,
          });
        }
      }

      // If we found at least one verified citation, consider resolved
      if (result.citationsFound.length > 0) {
        result.resolved = true;
        break;
      }

    } catch (error) {
      log.error('[RE-RESEARCH] Search failed', {
        orderId,
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // If not resolved, log failure
  if (!result.resolved) {
    result.failureReason = `All ${result.searchesAttempted} searches failed to produce viable citations for element: ${gap.element}`;

    log.warn('[RE-RESEARCH] Gap unresolved', {
      orderId,
      revisionLoop,
      element: gap.element,
      queriesAttempted: result.queriesUsed,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH RE-RESEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process all citation gaps in a motion draft.
 *
 * @param gaps - Array of citation gaps found in the draft
 * @param options - Research options
 * @returns Results for each gap
 */
export async function reResearchAllGaps(
  gaps: CitationGap[],
  options: ReResearchOptions
): Promise<{
  results: ReResearchResult[];
  totalResolved: number;
  totalUnresolved: number;
  newCitations: ReResearchCitation[];
}> {
  const results: ReResearchResult[] = [];
  const newCitations: ReResearchCitation[] = [];

  // Process gaps sequentially to respect rate limits
  for (const gap of gaps) {
    const result = await reResearchGap(gap, options);
    results.push(result);

    if (result.resolved) {
      newCitations.push(...result.citationsFound);
    }
  }

  return {
    results,
    totalResolved: results.filter(r => r.resolved).length,
    totalUnresolved: results.filter(r => !r.resolved).length,
    newCitations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect [CITATION NEEDED] placeholders in motion text.
 *
 * @param motionText - The full motion text
 * @returns Array of detected gaps with context
 */
export function detectCitationGaps(motionText: string): CitationGap[] {
  const gaps: CitationGap[] = [];

  // Pattern matches [CITATION NEEDED] and variants
  const pattern = /\[CITATION\s+NEEDED\]|\[CITE\]|\[AUTHORITY\s+NEEDED\]/gi;

  const sections = motionText.split(/(?=\n##?\s)/); // Split by markdown headers

  sections.forEach((section) => {
    const paragraphs = section.split(/\n\n+/);

    paragraphs.forEach((paragraph, paragraphIndex) => {
      let match;
      // Reset lastIndex for global regex used in a loop
      pattern.lastIndex = 0;
      while ((match = pattern.exec(paragraph)) !== null) {
        // Extract context (100 chars before and after)
        const start = Math.max(0, match.index - 100);
        const end = Math.min(paragraph.length, match.index + match[0].length + 100);
        const context = paragraph.slice(start, end);

        // Determine element from context
        const element = inferElementFromContext(context);

        gaps.push({
          placeholder: match[0],
          context,
          element,
          location: {
            section: extractSectionTitle(section),
            paragraphIndex,
          },
        });
      }
    });
  });

  return gaps;
}

/**
 * Infer the legal element from surrounding context.
 */
function inferElementFromContext(context: string): string {
  const contextLower = context.toLowerCase();

  const elementPatterns: [string, RegExp][] = [
    ['duty_of_loyalty', /duty\s+of\s+loyalty|fiduciary|loyalty/],
    ['competing_during_employment', /compet(e|ing)\s+(during|while)\s+employ/],
    ['non_compete_enforceability', /non-?compete|restrictive\s+covenant|23:921/],
    ['non_solicitation', /non-?solicit|customer\s+solicit/],
    ['legitimate_business_interest', /legitimate\s+business|protectable\s+interest/],
    ['breach_of_contract', /breach\s+(of\s+)?contract/],
    ['summary_judgment_standard', /summary\s+judgment|genuine\s+issue|material\s+fact/],
  ];

  for (const [element, elementPattern] of elementPatterns) {
    if (elementPattern.test(contextLower)) {
      return element;
    }
  }

  return 'unknown_element';
}

/**
 * Extract section title from section text.
 */
function extractSectionTitle(section: string): string {
  const headerMatch = section.match(/^#+\s*(.+)$/m);
  return headerMatch ? headerMatch[1].trim() : 'untitled_section';
}
