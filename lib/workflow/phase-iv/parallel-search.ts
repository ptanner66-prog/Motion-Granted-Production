/**
 * Parallel Search Module (Phase IV-B)
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * MODIFIED: 2026-01-30-CHEN-TIMEOUT-FIX
 * Changed from pure parallel to BATCHED execution to prevent:
 * - Rate limit violations (CourtListener: 60 req/min)
 * - Vercel function timeouts (5 min max)
 * - Server overload
 *
 * For EACH element, search THREE tiers in CONTROLLED BATCHES:
 * - Tier 1: Louisiana Supreme Court (binding)
 * - Tier 2: Louisiana Courts of Appeal (binding)
 * - Tier 3: Fifth Circuit (persuasive)
 *
 * Batch Configuration:
 * - Batch size: 5 concurrent requests
 * - Inter-batch delay: 1.5 seconds
 * - Per-request timeout: 15 seconds
 * - Max total duration: 4 minutes (1 min buffer for Vercel)
 *
 * OUTPUT: 30-60 raw candidate citations
 */

import {
  type ExtractedElement,
  type ParallelSearchInput,
  type ParallelSearchOutput,
  type RawCandidate,
  type CourtTier,
} from '@/types/citation-research';
import { searchOpinions } from '@/lib/courtlistener/client';
import {
  executeBatchedSearches,
  collectUniqueCandidates,
  type BatchSearchTask,
} from '@/lib/courtlistener/batched-search';

// ============================================================================
// JURISDICTION TYPE DETECTION
// ============================================================================

/**
 * Jurisdiction type: state court vs federal court
 * CRITICAL for determining which tiers to search
 */
export type JurisdictionType = 'state' | 'federal';

/**
 * Detect jurisdiction type from jurisdiction string
 *
 * STATE court indicators:
 * - "19th Judicial District Court"
 * - "Louisiana State Court"
 * - "District Court, Parish of..."
 * - Contains "JDC" or "Judicial District"
 *
 * FEDERAL court indicators:
 * - "Eastern District of Louisiana"
 * - "EDLA", "MDLA", "WDLA"
 * - "United States District Court"
 * - "Fifth Circuit"
 */
export function detectJurisdictionType(jurisdiction: string): JurisdictionType {
  const normalized = jurisdiction.toLowerCase();

  // Federal court patterns
  const federalPatterns = [
    /eastern district/i,
    /middle district/i,
    /western district/i,
    /\bedla\b/i,
    /\bmdla\b/i,
    /\bwdla\b/i,
    /united states district/i,
    /u\.?s\.? district/i,
    /fifth circuit/i,
    /5th circuit/i,
    /federal court/i,
    /bankruptcy court/i,
  ];

  for (const pattern of federalPatterns) {
    if (pattern.test(normalized)) {
      console.log(`[JurisdictionDetect] FEDERAL detected: "${jurisdiction}" matched ${pattern}`);
      return 'federal';
    }
  }

  // State court patterns (Louisiana)
  const statePatterns = [
    /judicial district/i,
    /\bjdc\b/i,
    /parish of/i,
    /state court/i,
    /district court.*louisiana/i,
    /louisiana.*district court/i,
    /civil district court/i,
    /family court/i,
    /juvenile court/i,
  ];

  for (const pattern of statePatterns) {
    if (pattern.test(normalized)) {
      console.log(`[JurisdictionDetect] STATE detected: "${jurisdiction}" matched ${pattern}`);
      return 'state';
    }
  }

  // Default to STATE for Louisiana jurisdiction (most common use case)
  if (normalized.includes('louisiana')) {
    console.log(`[JurisdictionDetect] STATE (default): "${jurisdiction}" contains "louisiana"`);
    return 'state';
  }

  // If unclear, default to state (conservative - better to get state citations)
  console.log(`[JurisdictionDetect] STATE (fallback): "${jurisdiction}" - defaulting to state`);
  return 'state';
}

// ============================================================================
// COURT CODES BY TIER
// ============================================================================

const TIER_COURT_CODES: Record<CourtTier, string[]> = {
  'tier1': ['la', 'lasc'],           // Louisiana Supreme Court
  'tier2': ['lactapp'],               // Louisiana Courts of Appeal
  'tier3': ['ca5', 'laed', 'lamd', 'lawd'], // Fifth Circuit + LA District Courts
};

// All Louisiana STATE courts (no federal)
const LOUISIANA_STATE_COURTS = ['la', 'lasc', 'lactapp'];

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

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN JURISDICTION FIX (2026-02-03): Detect jurisdiction type
  // For STATE court cases, only search state court tiers (tier1, tier2)
  // For FEDERAL court cases, search federal tiers (tier3)
  // ═══════════════════════════════════════════════════════════════════════
  const jurisdictionType = detectJurisdictionType(input.jurisdiction);

  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  PHASE IV-B: PARALLEL TARGETED SEARCH                        ║`);
  console.log(`║  JURISDICTION FIX: 2026-02-03-CHEN-STATE-COURT-FIX           ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`[Phase IV-B] Elements to search: ${input.elements.length}`);
  console.log(`[Phase IV-B] Jurisdiction: "${input.jurisdiction}"`);
  console.log(`[Phase IV-B] Jurisdiction TYPE: ${jurisdictionType.toUpperCase()}`);
  console.log(`[Phase IV-B] Max candidates per element: ${input.maxCandidatesPerElement}`);
  console.log(`[Phase IV-B] PARALLEL EXECUTION: Enabled`);

  try {
    // Build all search tasks with jurisdiction-aware tier assignment
    const searchTasks = buildSearchTasks(input.elements, jurisdictionType);
    console.log(`[Phase IV-B] Total search tasks: ${searchTasks.length}`);

    // Track searches by tier
    const searchesByTier = { tier1: 0, tier2: 0, tier3: 0 };
    for (const task of searchTasks) {
      searchesByTier[task.tier]++;
    }
    console.log(`[Phase IV-B] Searches by tier: T1=${searchesByTier.tier1}, T2=${searchesByTier.tier2}, T3=${searchesByTier.tier3}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CHEN-TIMEOUT-FIX (2026-01-30): BATCHED EXECUTION
    // Replaced parallel Promise.all with controlled batches to prevent:
    // - Rate limit violations (60/min)
    // - Vercel function timeouts (5 min)
    // - CourtListener server overload
    // ═══════════════════════════════════════════════════════════════════════
    const searchStart = Date.now();
    console.log(`[Phase IV-B] >>> LAUNCHING BATCHED SEARCHES (NOT parallel)...`);
    console.log(`[Phase IV-B] Total tasks: ${searchTasks.length}, Batch size: 5, Inter-batch delay: 1.5s`);

    // Convert to BatchSearchTask format
    const batchTasks: BatchSearchTask[] = searchTasks.map((task, idx) => ({
      id: `task-${idx + 1}`,
      query: task.query,
      jurisdiction: input.jurisdiction,
      elementName: task.forElement,
      tier: task.tier,
    }));

    // Execute with batching and rate limiting
    const batchSummary = await executeBatchedSearches(batchTasks);

    const searchDuration = Date.now() - searchStart;
    console.log(`[Phase IV-B] <<< BATCHED SEARCHES COMPLETE in ${searchDuration}ms`);

    // Collect unique candidates from batch results
    const allCandidates = collectUniqueCandidates(batchSummary.results);

    const successfulSearches = batchSummary.succeeded;
    const failedSearches = batchSummary.failed + batchSummary.timedOut;

    console.log(`[Phase IV-B] Successful searches: ${successfulSearches}/${searchTasks.length}`);
    if (failedSearches > 0) {
      console.warn(`[Phase IV-B] Failed searches: ${failedSearches} (${batchSummary.timedOut} timeouts)`);
    }
    if (batchSummary.partialResults) {
      console.warn(`[Phase IV-B] PARTIAL RESULTS: ${batchSummary.abortReason}`);
    }
    console.log(`[Phase IV-B] Unique candidates found: ${allCandidates.length}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CHEN JURISDICTION FIX (2026-02-03): Post-search jurisdiction validation
    // Filter out any cases that slipped through with wrong jurisdiction
    // ═══════════════════════════════════════════════════════════════════════
    const validatedCandidates = validateJurisdiction(allCandidates, jurisdictionType);
    const filteredCount = allCandidates.length - validatedCandidates.length;
    if (filteredCount > 0) {
      console.log(`[Phase IV-B] ⚠️ Filtered out ${filteredCount} wrong-jurisdiction cases`);
    }
    console.log(`[Phase IV-B] Validated candidates: ${validatedCandidates.length}`);

    // Sort candidates: Louisiana first, then by date (recent first)
    const sortedCandidates = sortCandidatesByAuthority(validatedCandidates);

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
 * Build search tasks for all elements with JURISDICTION-AWARE tier assignment
 *
 * CHEN JURISDICTION FIX (2026-02-03):
 * - For STATE court cases: ONLY tier1 and tier2 (Louisiana state courts)
 *   - tier1: Louisiana Supreme Court (la, lasc)
 *   - tier2: Louisiana Courts of Appeal (lactapp)
 *   - NO tier3 (federal courts) for primary searches
 *
 * - For FEDERAL court cases: ONLY tier3 (federal courts)
 *   - tier3: Fifth Circuit, District Courts (ca5, laed, lamd, lawd)
 *
 * This ensures state court motions get state court citations (So.3d)
 * and federal court motions get federal citations (F.3d/F.4th)
 */
function buildSearchTasks(
  elements: ExtractedElement[],
  jurisdictionType: JurisdictionType
): SearchTask[] {
  const tasks: SearchTask[] = [];

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN JURISDICTION FIX: Select tiers based on jurisdiction type
  // ═══════════════════════════════════════════════════════════════════════
  let tiersToSearch: CourtTier[];
  if (jurisdictionType === 'state') {
    // STATE COURT: Only search state court tiers
    // tier1 = LA Supreme Court, tier2 = LA Courts of Appeal
    tiersToSearch = ['tier1', 'tier2'];
    console.log(`[Phase IV-B] STATE COURT detected — searching ONLY tier1 (LA Supreme) and tier2 (LA App)`);
    console.log(`[Phase IV-B] ⛔ tier3 (federal courts) EXCLUDED for primary searches`);
  } else {
    // FEDERAL COURT: Only search federal court tiers
    tiersToSearch = ['tier3'];
    console.log(`[Phase IV-B] FEDERAL COURT detected — searching ONLY tier3 (5th Cir, District Courts)`);
  }

  for (const element of elements) {
    // Limit queries per element to avoid explosion
    const queries = element.searchQueries.slice(0, 3);

    for (const query of queries) {
      // Create search tasks ONLY for jurisdiction-appropriate tiers
      for (const tier of tiersToSearch) {
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

  // Also add some broad fallback searches (state courts only for Louisiana)
  const fallbackQueries = [
    { query: 'motion compel Louisiana', forElement: 'fallback' },
    { query: 'discovery Louisiana', forElement: 'fallback' },
    { query: 'Louisiana civil procedure', forElement: 'fallback' },
  ];

  for (const fallback of fallbackQueries) {
    // Fallbacks use same jurisdiction-appropriate tiers
    for (const tier of tiersToSearch) {
      tasks.push({
        query: fallback.query,
        forElement: fallback.forElement,
        elementId: 'fallback',
        tier,
        courtCodes: TIER_COURT_CODES[tier],
      });
    }
  }

  console.log(`[Phase IV-B] Built ${tasks.length} search tasks for ${jurisdictionType.toUpperCase()} jurisdiction`);
  console.log(`[Phase IV-B] Tiers used: ${tiersToSearch.join(', ')}`);

  return tasks;
}

// ============================================================================
// SEARCH EXECUTION
// ============================================================================

/**
 * Execute a single search task and transform results to RawCandidate[]
 *
 * CHEN JURISDICTION FIX (2026-02-03):
 * - tier1/tier2 now use 'louisiana_state' (la,lactapp ONLY - no federal)
 * - tier3 uses 'louisiana_federal' (ca5, laed, lamd, lawd)
 *
 * This ensures state court searches return ONLY state court cases (So.3d)
 * not federal cases (F.3d/F.4th) that happen to mention "Louisiana"
 */
async function executeSearchTask(task: SearchTask): Promise<RawCandidate[]> {
  // CHEN JURISDICTION FIX: Map tier to STRICT jurisdiction strings
  // tier1/tier2 = STATE ONLY (no federal courts!)
  // tier3 = FEDERAL ONLY
  const jurisdictionMap: Record<CourtTier, string> = {
    'tier1': 'louisiana_state',    // la,lactapp ONLY (Louisiana Supreme + Court of Appeal)
    'tier2': 'louisiana_state',    // la,lactapp ONLY (same - binding state authority)
    'tier3': 'louisiana_federal',  // ca5,laed,lamd,lawd (Fifth Circuit + LA Districts)
  };

  console.log(`[executeSearchTask] Task "${task.query}" tier=${task.tier} → jurisdiction="${jurisdictionMap[task.tier]}"`);

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
// JURISDICTION VALIDATION
// ============================================================================

/**
 * Validate that returned cases match expected jurisdiction type
 *
 * CHEN JURISDICTION FIX (2026-02-03):
 * For STATE court searches: filter OUT federal cases
 * For FEDERAL court searches: filter OUT state cases
 *
 * This is a safety net in case any wrong-jurisdiction cases slip through
 * the CourtListener filtering (e.g., from party names containing "Louisiana")
 */
function validateJurisdiction(
  candidates: RawCandidate[],
  expectedJurisdiction: JurisdictionType
): RawCandidate[] {
  // State court patterns (Louisiana)
  const stateCourtPatterns = [
    /louisiana supreme court/i,
    /supreme court of louisiana/i,
    /louisiana court of appeal/i,
    /la\.\s*(app|ct)/i,
    /\bla\b.*circuit.*appeal/i,
    /so\.\s*3d/i,           // Southern Reporter 3d = Louisiana state courts
    /so\.\s*2d/i,           // Southern Reporter 2d = Louisiana state courts
  ];

  // Federal court patterns
  const federalCourtPatterns = [
    /fifth circuit/i,
    /5th circuit/i,
    /circuit court of appeals/i,
    /district of louisiana/i,
    /\bedla\b/i,
    /\bmdla\b/i,
    /\bwdla\b/i,
    /united states district/i,
    /u\.?s\.? district/i,
    /f\.\s*3d/i,            // Federal Reporter 3d = Federal courts
    /f\.\s*4th/i,           // Federal Reporter 4th = Federal courts
    /f\.\s*2d/i,            // Federal Reporter 2d = Federal courts
    /f\.\s*supp/i,          // Federal Supplement = Federal district courts
  ];

  return candidates.filter(candidate => {
    const courtName = (candidate.court || '').toLowerCase();
    const citation = (candidate.citation || '').toLowerCase();
    const caseName = (candidate.caseName || '').toLowerCase();

    if (expectedJurisdiction === 'state') {
      // For STATE court searches, EXCLUDE federal cases
      const isFederal = federalCourtPatterns.some(pattern =>
        pattern.test(courtName) || pattern.test(citation)
      );
      if (isFederal) {
        console.log(`[JurisdictionFilter] ⛔ EXCLUDED federal case from STATE search: "${candidate.caseName?.substring(0, 50)}..." (${candidate.citation})`);
        return false;
      }
      return true;
    } else {
      // For FEDERAL court searches, EXCLUDE state cases
      const isState = stateCourtPatterns.some(pattern =>
        pattern.test(courtName) || pattern.test(citation)
      );
      if (isState) {
        console.log(`[JurisdictionFilter] ⛔ EXCLUDED state case from FEDERAL search: "${candidate.caseName?.substring(0, 50)}..." (${candidate.citation})`);
        return false;
      }
      return true;
    }
  });
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
