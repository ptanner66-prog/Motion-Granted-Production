/**
 * Parallel Search Module (Phase IV-B)
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * CRITICAL: All searches run IN PARALLEL via Promise.all
 *
 * For EACH element, search THREE tiers IN PARALLEL:
 * - Tier 1: Louisiana Supreme Court (binding)
 * - Tier 2: Louisiana Courts of Appeal (binding)
 * - Tier 3: Fifth Circuit (persuasive)
 *
 * OUTPUT: 30-60 raw candidate citations
 *
 * WRONG (current):
 * for (query of queries) {
 *   await search(query);  // 3 sec each × 10 = 30 sec
 * }
 *
 * RIGHT (required):
 * await Promise.all(queries.map(q => search(q)));  // 3 sec total
 */

import {
  type ExtractedElement,
  type ParallelSearchInput,
  type ParallelSearchOutput,
  type RawCandidate,
  type CourtTier,
} from '@/types/citation-research';
import { searchOpinions } from '@/lib/courtlistener/client';

// ============================================================================
// COURT CODES BY TIER
// ============================================================================

const TIER_COURT_CODES: Record<CourtTier, string[]> = {
  'tier1': ['la', 'lasc'],           // Louisiana Supreme Court
  'tier2': ['lactapp'],               // Louisiana Courts of Appeal
  'tier3': ['ca5', 'laed', 'lamd', 'lawd'], // Fifth Circuit + LA District Courts
};

// All Louisiana courts for broad searches
const ALL_LOUISIANA_COURTS = ['la', 'lactapp', 'ca5'];

// ============================================================================
// PARALLEL SEARCH EXECUTION
// ============================================================================

/**
 * Execute parallel searches across all tiers for all elements
 *
 * This is the core of Phase IV-B. Per Chen's spec:
 * - All searches MUST run in parallel via Promise.all
 * - For EACH element, search THREE tiers
 * - Target: 30-60 raw candidates
 */
export async function executeParallelSearch(
  input: ParallelSearchInput
): Promise<ParallelSearchOutput> {
  const start = Date.now();

  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  PHASE IV-B: PARALLEL TARGETED SEARCH                        ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`[Phase IV-B] Elements to search: ${input.elements.length}`);
  console.log(`[Phase IV-B] Max candidates per element: ${input.maxCandidatesPerElement}`);
  console.log(`[Phase IV-B] PARALLEL EXECUTION: Enabled`);

  try {
    // Build all search tasks
    const searchTasks = buildSearchTasks(input.elements);
    console.log(`[Phase IV-B] Total search tasks: ${searchTasks.length}`);

    // Track searches by tier
    const searchesByTier = { tier1: 0, tier2: 0, tier3: 0 };
    for (const task of searchTasks) {
      searchesByTier[task.tier]++;
    }
    console.log(`[Phase IV-B] Searches by tier: T1=${searchesByTier.tier1}, T2=${searchesByTier.tier2}, T3=${searchesByTier.tier3}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL: Execute ALL searches in parallel using Promise.allSettled
    // This is the key performance optimization per Chen's spec
    // ═══════════════════════════════════════════════════════════════════════
    const searchStart = Date.now();
    console.log(`[Phase IV-B] >>> LAUNCHING ${searchTasks.length} PARALLEL SEARCHES...`);

    const searchPromises = searchTasks.map(task =>
      executeSearchTask(task).catch(error => {
        console.warn(`[Phase IV-B] Search failed for "${task.query}":`, error);
        return [] as RawCandidate[];
      })
    );

    // Use Promise.allSettled to handle partial failures gracefully
    const results = await Promise.allSettled(searchPromises);

    const searchDuration = Date.now() - searchStart;
    console.log(`[Phase IV-B] <<< PARALLEL SEARCHES COMPLETE in ${searchDuration}ms`);

    // Collect all candidates
    const allCandidates: RawCandidate[] = [];
    const seenIds = new Set<number>();
    let successfulSearches = 0;
    let failedSearches = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successfulSearches++;
        for (const candidate of result.value) {
          // Deduplicate by ID
          if (candidate.id && !seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            allCandidates.push(candidate);
          }
        }
      } else {
        failedSearches++;
        console.warn(`[Phase IV-B] Search rejected:`, result.reason);
      }
    }

    console.log(`[Phase IV-B] Successful searches: ${successfulSearches}/${searchTasks.length}`);
    if (failedSearches > 0) {
      console.warn(`[Phase IV-B] Failed searches: ${failedSearches}`);
    }
    console.log(`[Phase IV-B] Unique candidates found: ${allCandidates.length}`);

    // Sort candidates: Louisiana first, then by date (recent first)
    const sortedCandidates = sortCandidatesByAuthority(allCandidates);

    const duration = Date.now() - start;

    console.log(`[Phase IV-B] Total candidates: ${sortedCandidates.length}`);
    console.log(`[Phase IV-B] Duration: ${duration}ms`);

    return {
      success: sortedCandidates.length > 0,
      candidates: sortedCandidates,
      totalCandidates: sortedCandidates.length,
      searchesExecuted: successfulSearches,
      searchesByTier,
      durationMs: duration,
      error: sortedCandidates.length === 0 ? 'No candidates found from CourtListener' : undefined,
    };
  } catch (error) {
    console.error('[Phase IV-B] Parallel search failed:', error);
    return {
      success: false,
      candidates: [],
      totalCandidates: 0,
      searchesExecuted: 0,
      searchesByTier: { tier1: 0, tier2: 0, tier3: 0 },
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Parallel search failed',
    };
  }
}

// ============================================================================
// SEARCH TASK BUILDING
// ============================================================================

interface SearchTask {
  query: string;
  forElement: string;
  elementId: string;
  tier: CourtTier;
  courtCodes: string[];
}

/**
 * Build search tasks for all elements across all tiers
 *
 * Per Chen's spec:
 * - Each element gets searched across 3 tiers
 * - Each element has 1-3 search queries
 * - Total: (elements × queries × 3 tiers) searches
 */
function buildSearchTasks(elements: ExtractedElement[]): SearchTask[] {
  const tasks: SearchTask[] = [];

  for (const element of elements) {
    // Limit queries per element to avoid explosion
    const queries = element.searchQueries.slice(0, 3);

    for (const query of queries) {
      // Create a search task for each tier
      for (const tier of ['tier1', 'tier2', 'tier3'] as CourtTier[]) {
        tasks.push({
          query,
          forElement: element.name,
          elementId: element.id,
          tier,
          courtCodes: TIER_COURT_CODES[tier],
        });
      }
    }
  }

  // Also add some broad fallback searches
  const fallbackQueries = [
    { query: 'motion compel Louisiana', forElement: 'fallback' },
    { query: 'discovery Louisiana', forElement: 'fallback' },
    { query: 'Louisiana civil procedure', forElement: 'fallback' },
  ];

  for (const fallback of fallbackQueries) {
    // Only Tier 1 and 2 for fallbacks (Louisiana courts)
    for (const tier of ['tier1', 'tier2'] as CourtTier[]) {
      tasks.push({
        query: fallback.query,
        forElement: fallback.forElement,
        elementId: 'fallback',
        tier,
        courtCodes: TIER_COURT_CODES[tier],
      });
    }
  }

  return tasks;
}

// ============================================================================
// SEARCH EXECUTION
// ============================================================================

/**
 * Execute a single search task and transform results to RawCandidate[]
 */
async function executeSearchTask(task: SearchTask): Promise<RawCandidate[]> {
  // Map tier to jurisdiction string for searchOpinions
  const jurisdictionMap: Record<CourtTier, string> = {
    'tier1': 'Louisiana',  // Will map to la,lactapp,ca5
    'tier2': 'Louisiana',
    'tier3': 'fifth circuit',
  };

  const result = await searchOpinions(
    task.query,
    jurisdictionMap[task.tier],
    10  // Max results per search
  );

  if (!result.success || !result.data?.opinions) {
    return [];
  }

  // Transform to RawCandidate format
  return result.data.opinions.map(op => ({
    id: op.id,
    clusterId: op.cluster_id,
    caseName: op.case_name,
    citation: op.citation || '',
    court: op.court,
    courtCode: extractCourtCode(op.court),
    dateFiled: op.date_filed,
    snippet: op.snippet,
    absoluteUrl: op.absolute_url,
    precedentialStatus: op.precedential_status,
    forElement: task.forElement,
    searchTier: task.tier,
  }));
}

/**
 * Extract court code from court name
 */
function extractCourtCode(court: string): string {
  const normalizedCourt = court.toLowerCase();

  if (normalizedCourt.includes('supreme court of louisiana') || normalizedCourt === 'la') {
    return 'la';
  }
  if (normalizedCourt.includes('louisiana court of appeal') || normalizedCourt === 'lactapp') {
    return 'lactapp';
  }
  if (normalizedCourt.includes('fifth circuit') || normalizedCourt === 'ca5') {
    return 'ca5';
  }
  if (normalizedCourt.includes('eastern district') && normalizedCourt.includes('louisiana')) {
    return 'laed';
  }
  if (normalizedCourt.includes('middle district') && normalizedCourt.includes('louisiana')) {
    return 'lamd';
  }
  if (normalizedCourt.includes('western district') && normalizedCourt.includes('louisiana')) {
    return 'lawd';
  }
  if (normalizedCourt.includes('supreme court of the united states')) {
    return 'scotus';
  }

  return court;  // Return as-is if not matched
}

// ============================================================================
// SORTING
// ============================================================================

/**
 * Sort candidates by authority (Louisiana first) then by date (recent first)
 */
function sortCandidatesByAuthority(candidates: RawCandidate[]): RawCandidate[] {
  return [...candidates].sort((a, b) => {
    // Priority: LA Supreme > LA App > 5th Cir > District > Other
    const getPriority = (c: RawCandidate): number => {
      const code = c.courtCode.toLowerCase();
      if (code === 'la' || code === 'lasc') return 1;
      if (code === 'lactapp') return 2;
      if (code === 'scotus') return 3;
      if (code === 'ca5') return 4;
      if (['laed', 'lamd', 'lawd'].includes(code)) return 5;
      return 6;
    };

    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    // Same priority — sort by date (recent first)
    const dateA = a.dateFiled ? new Date(a.dateFiled).getTime() : 0;
    const dateB = b.dateFiled ? new Date(b.dateFiled).getTime() : 0;
    return dateB - dateA;
  });
}

// ============================================================================
// RATE LIMITING
// ============================================================================

// Track concurrent requests for rate limiting
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_QUEUE: Array<() => void> = [];

/**
 * Execute with rate limiting
 *
 * CourtListener has a 60/min rate limit. We use concurrency limiting
 * to avoid overwhelming the API while still being parallel.
 */
export async function executeWithRateLimit<T>(
  fn: () => Promise<T>
): Promise<T> {
  // Wait for slot if at max concurrency
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>(resolve => {
      REQUEST_QUEUE.push(resolve);
    });
  }

  activeRequests++;

  try {
    return await fn();
  } finally {
    activeRequests--;

    // Release next in queue
    if (REQUEST_QUEUE.length > 0) {
      const next = REQUEST_QUEUE.shift();
      if (next) next();
    }
  }
}

// ============================================================================
// ELEMENT COVERAGE TRACKING
// ============================================================================

/**
 * Calculate element coverage from candidates
 */
export function calculateElementCoverage(
  candidates: RawCandidate[],
  elements: ExtractedElement[]
): Map<string, number> {
  const coverage = new Map<string, number>();

  // Initialize all elements with 0
  for (const element of elements) {
    coverage.set(element.name, 0);
    coverage.set(element.id, 0);
  }

  // Count candidates per element
  for (const candidate of candidates) {
    const currentCount = coverage.get(candidate.forElement) || 0;
    coverage.set(candidate.forElement, currentCount + 1);
  }

  return coverage;
}
