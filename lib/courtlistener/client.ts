/**
 * CourtListener API Client
 *
 * Primary source for citation existence verification and case metadata.
 * Free tier API with optional token for higher rate limits.
 *
 * API Documentation: https://www.courtlistener.com/api/rest-info/
 * Coverage: 10M+ cases, all federal courts, most state appellate
 *
 * IMPORTANT: For citation verification (hallucination detection), use the
 * v3 citation-lookup endpoint, NOT the v4 search endpoint.
 *
 * ZERO TOLERANCE FOR HALLUCINATED CITATIONS:
 * - Every citation must come from CourtListener or be verified against it
 * - No verification = No citation in the final motion
 * - All verifications logged to database for audit trail
 */

import { getCourtListenerAPIKey } from '@/lib/api-keys';
import { CourtListenerOpinion, CourtListenerSearchResult, CourtListenerCitingOpinion } from './types';
import type { CitationDetails, CitationTreatment, CitationReference } from '@/types/citations';
import { simplifyQueryV2 } from './query-builder';
import { scoreRelevance, TOPICAL_RELEVANCE_THRESHOLD, type PropositionContext } from './relevance-scorer';
import { extractCaseName } from '@/lib/citations/extract-case-name';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('courtlistener-client');
const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4';
const COURTLISTENER_V3_URL = 'https://www.courtlistener.com/api/rest/v3';
const DEFAULT_TIMEOUT = 150000; // 150s - CourtListener takes 60-97s per request (measured)
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s exponential backoff

// Rate limiting: 60 requests/minute for free tier
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60000;

// Track API calls for rate limiting
let apiCallTimestamps: number[] = [];

/**
 * Rate limiter - ensures we don't exceed 60 requests/minute
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();

  // Remove timestamps older than 1 minute
  apiCallTimestamps = apiCallTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (apiCallTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
    // Calculate wait time until oldest call expires
    const oldestCall = apiCallTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestCall) + 100; // +100ms buffer

    log.info(`[CourtListener] Rate limit reached, waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Recurse to check again after waiting
    return waitForRateLimit();
  }

  // Record this call
  apiCallTimestamps.push(now);
}

interface RequestOptions {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

/**
 * Get API token from database or environment
 * THROWS if no token is configured - citation verification is MANDATORY
 *
 * Priority order:
 * 1. Database (via getCourtListenerAPIKey)
 * 2. COURTLISTENER_API_KEY env var (Vercel standard)
 * 3. COURTLISTENER_API_TOKEN env var (legacy fallback)
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  // 1. Check database first
  const dbToken = await getCourtListenerAPIKey();
  if (dbToken) {
    return { Authorization: `Token ${dbToken}` };
  }

  // 2. Check COURTLISTENER_API_KEY (Vercel standard)
  const envKey = process.env.COURTLISTENER_API_KEY;
  if (envKey) {
    return { Authorization: `Token ${envKey}` };
  }

  // 3. Legacy fallback: COURTLISTENER_API_TOKEN
  const envToken = process.env.COURTLISTENER_API_TOKEN;
  if (envToken) {
    log.warn('[CourtListener] Using legacy COURTLISTENER_API_TOKEN - consider migrating to COURTLISTENER_API_KEY');
    return { Authorization: `Token ${envToken}` };
  }

  // FATAL: No API key configured
  throw new Error(
    '[CourtListener] FATAL: No API key configured. ' +
    'Citation verification is MANDATORY - cannot proceed without CourtListener access. ' +
    'Set COURTLISTENER_API_KEY environment variable. ' +
    'Get a free API key at: https://www.courtlistener.com/api/rest-info/'
  );
}

/**
 * Validate CourtListener API key is configured
 * Call this at startup to fail fast if misconfigured
 */
export async function validateCourtListenerConfig(): Promise<{
  configured: boolean;
  error?: string;
}> {
  try {
    // 1. Check database
    const dbToken = await getCourtListenerAPIKey();
    if (dbToken) {
      log.info(`[CourtListener] API key configured (db): ${dbToken.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    // 2. Check COURTLISTENER_API_KEY (Vercel standard)
    const envKey = process.env.COURTLISTENER_API_KEY;
    if (envKey) {
      log.info(`[CourtListener] API key configured (COURTLISTENER_API_KEY): ${envKey.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    // 3. Legacy fallback: COURTLISTENER_API_TOKEN
    const envToken = process.env.COURTLISTENER_API_TOKEN;
    if (envToken) {
      log.info(`[CourtListener] API key configured (legacy COURTLISTENER_API_TOKEN): ${envToken.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    const error = 'COURTLISTENER_API_KEY not set. Get a free key at https://www.courtlistener.com/api/rest-info/';
    log.error(`[CourtListener] FATAL: ${error}`);
    return { configured: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Failed to check API key';
    return { configured: false, error };
  }
}

/**
 * Make a request with retry logic and rate limiting
 *
 * MODIFIED: 2026-01-30-CHEN-TIMEOUT-FIX
 * - Added external AbortSignal support for caller-controlled timeouts
 */
async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, signal: externalSignal } = options;
  const authHeader = await getAuthHeader();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Check if external signal was already aborted
      if (externalSignal?.aborted) {
        throw new Error('Request aborted by caller');
      }

      // Wait for rate limit before making request
      await waitForRateLimit();

      const fullUrl = `${COURTLISTENER_BASE_URL}${endpoint}`;
      log.info(`[makeRequest] API call: ${fullUrl.substring(0, 150)}...`);
      log.info(`[makeRequest] Auth header present: ${!!authHeader.Authorization}`);
      log.info(`[makeRequest] Auth header prefix: ${authHeader.Authorization?.substring(0, 15)}...`);

      // CHEN-TIMEOUT-FIX: Combine external signal with timeout signal
      // If external signal provided, use it; otherwise use timeout
      const effectiveSignal = externalSignal || AbortSignal.timeout(timeout);

      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        signal: effectiveSignal,
      });

      log.info(`[makeRequest] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Log error response body for debugging
        const errorBody = await response.text();
        log.error(`[makeRequest] ❌ HTTP ${response.status} error body: ${errorBody.substring(0, 500)}`);

        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
          log.info(`[makeRequest] Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status === 404) {
          log.info(`[makeRequest] 404 Not Found - returning empty result`);
          return { success: true, data: undefined }; // Not found is valid result
        }

        // CHEN-FIX: CourtListener returns 502/503/504 sometimes - retry with delay
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          log.warn(`[makeRequest] ⚠️ Got ${response.status} (server error), retrying after 2s delay...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue; // This will retry the request
        }

        throw new Error(`CourtListener API error: ${response.status} ${response.statusText} - ${errorBody.substring(0, 200)}`);
      }

      const data = await response.json();
      log.info(`[makeRequest] ✓ Success - received ${JSON.stringify(data).length} bytes`);
      return { success: true, data };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Request timeout');
      }

      // Wait before retry
      if (attempt < retries) {
        const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Request failed after retries',
  };
}

/**
 * Citation Lookup - PRIMARY METHOD FOR HALLUCINATION DETECTION
 *
 * Uses the v3 citation-lookup endpoint specifically designed to verify
 * citations and catch AI hallucinations. This is the correct endpoint
 * for CIV Step 1 existence verification.
 *
 * POST to /api/rest/v3/citation-lookup/
 * Content-Type: application/x-www-form-urlencoded
 * Body: text=<citation>
 */
export async function lookupCitation(
  citationText: string
): Promise<{
  success: boolean;
  data?: {
    found: boolean;
    citations: Array<{
      citation: string;
      normalized_citations: string[];
      match_url?: string;
      match_id?: number;
      reporter?: string;
      volume?: string;
      page?: string;
      year?: string;
    }>;
  };
  error?: string;
}> {
  const authHeader = await getAuthHeader();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Use AbortSignal.timeout() for cleaner timeout handling (Vercel Pro optimization)
      const response = await fetch(`${COURTLISTENER_V3_URL}/citation-lookup/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...authHeader,
        },
        body: `text=${encodeURIComponent(citationText)}`,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        throw new Error(`CourtListener citation-lookup error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // The API returns an array of citation matches
      const citations = Array.isArray(data) ? data : [];
      const hasMatches = citations.some((c: { match_url?: string }) => c.match_url);

      return {
        success: true,
        data: {
          found: hasMatches,
          citations: citations.map((c: Record<string, unknown>) => ({
            citation: String(c.citation || ''),
            normalized_citations: Array.isArray(c.normalized_citations) ? c.normalized_citations : [],
            match_url: c.match_url ? String(c.match_url) : undefined,
            match_id: typeof c.match_id === 'number' ? c.match_id : undefined,
            reporter: c.reporter ? String(c.reporter) : undefined,
            volume: c.volume ? String(c.volume) : undefined,
            page: c.page ? String(c.page) : undefined,
            year: c.year ? String(c.year) : undefined,
          })),
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Request timeout');
      }

      if (attempt < MAX_RETRIES) {
        const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Citation lookup failed after retries',
  };
}

/**
 * Search for a case by citation
 * This is the primary method for Step 1 existence check
 *
 * [CIV-001] Removed deprecated citation= parameter — returns HTTP 400 after Feb 10, 2026.
 * Now uses /search/?q=<query>&type=o for opinion search.
 */
export async function searchByCitation(
  citation: string
): Promise<{ success: boolean; data?: CourtListenerSearchResult; error?: string }> {
  const encodedCitation = encodeURIComponent(citation);

  // CIV-001: Use search endpoint with q= parameter instead of deprecated citation= parameter
  const result = await makeRequest<{ results: CourtListenerOpinion[]; count: number }>(
    `/search/?q=${encodedCitation}&type=o`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data || result.data.count === 0 || result.data.results.length === 0) {
    return {
      success: true,
      data: {
        found: false,
        opinions: [],
        count: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      found: true,
      opinions: result.data.results,
      count: result.data.count,
    },
  };
}

/**
 * Get opinion details by CourtListener ID
 */
export async function getOpinionById(
  opinionId: string
): Promise<{ success: boolean; data?: CourtListenerOpinion; error?: string }> {
  return makeRequest<CourtListenerOpinion>(`/opinions/${opinionId}/`);
}

/**
 * Get opinion with full text
 * Useful for holding verification (Step 2)
 */
export async function getOpinionWithText(
  opinionId: string
): Promise<{ success: boolean; data?: CourtListenerOpinion & { plain_text: string }; error?: string }> {
  return makeRequest<CourtListenerOpinion & { plain_text: string }>(
    `/opinions/${opinionId}/?fields=id,absolute_url,cluster,author,joined_by,type,date_created,date_modified,plain_text`
  );
}

/**
 * Search for cases by case name
 * Fallback when citation search fails
 */
export async function searchByCaseName(
  caseName: string
): Promise<{ success: boolean; data?: CourtListenerSearchResult; error?: string }> {
  const encodedName = encodeURIComponent(caseName);

  const result = await makeRequest<{ results: CourtListenerOpinion[]; count: number }>(
    `/opinions/?case_name=${encodedName}`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data || result.data.count === 0) {
    return {
      success: true,
      data: {
        found: false,
        opinions: [],
        count: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      found: true,
      opinions: result.data.results,
      count: result.data.count,
    },
  };
}

/**
 * Get cluster (case) information including citations and treatment
 * A cluster groups related opinions (majority, dissent, concurrence)
 */
export async function getCluster(
  clusterId: string
): Promise<{
  success: boolean;
  data?: {
    id: number;
    absolute_url: string;
    case_name: string;
    case_name_short: string;
    date_filed: string;
    docket: string;
    citations: Array<{ volume: number; reporter: string; page: number; type: number }>;
    precedential_status: string;
    citation_count: number;
    judges: string;
    court: string;
  };
  error?: string;
}> {
  return makeRequest(`/clusters/${clusterId}/`);
}

/**
 * Get citing opinions for a case
 * Used for authority strength assessment (Step 6)
 */
export async function getCitingOpinions(
  opinionId: string,
  limit: number = 100
): Promise<{ success: boolean; data?: CourtListenerCitingOpinion[]; error?: string }> {
  const result = await makeRequest<{ results: CourtListenerCitingOpinion[]; count: number }>(
    `/opinions/${opinionId}/cited-opinions/?page_size=${limit}`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: result.data?.results || [],
  };
}

/**
 * Search RECAP for unpublished federal opinions
 * Fallback for cases not in main database
 */
export async function searchRECAP(
  caseName: string,
  courtId?: string
): Promise<{ success: boolean; data?: { found: boolean; documents: unknown[] }; error?: string }> {
  let endpoint = `/recap/?q=${encodeURIComponent(caseName)}`;
  if (courtId) {
    endpoint += `&court=${courtId}`;
  }

  const result = await makeRequest<{ results: unknown[]; count: number }>(endpoint);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      found: (result.data?.count || 0) > 0,
      documents: result.data?.results || [],
    },
  };
}

/**
 * Get treatment information for a case (how it's been cited)
 * Used for bad law check (Step 5)
 */
export async function getCitationTreatment(
  opinionId: string
): Promise<{
  success: boolean;
  data?: {
    positive: number;
    negative: number;
    caution: number;
    treatments: Array<{
      citing_opinion_id: number;
      treatment: string;
      depth: number;
    }>;
  };
  error?: string;
}> {
  // Get opinions that cite this case
  const result = await makeRequest<{
    results: Array<{
      id: number;
      depth: number;
      cited_opinion: number;
      citing_opinion: number;
      treatment?: string;
    }>;
    count: number;
  }>(`/opinions/${opinionId}/citing-opinions/?page_size=200`);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const treatments = result.data?.results || [];

  // Count by treatment type
  let positive = 0;
  let negative = 0;
  let caution = 0;

  const treatmentDetails: Array<{
    citing_opinion_id: number;
    treatment: string;
    depth: number;
  }> = [];

  for (const t of treatments) {
    const treatment = t.treatment || 'cited';
    treatmentDetails.push({
      citing_opinion_id: t.citing_opinion,
      treatment,
      depth: t.depth,
    });

    switch (treatment.toLowerCase()) {
      case 'followed':
      case 'affirmed':
      case 'approved':
        positive++;
        break;
      case 'overruled':
      case 'reversed':
      case 'vacated':
      case 'superseded':
        negative++;
        break;
      case 'distinguished':
      case 'criticized':
      case 'questioned':
        caution++;
        break;
    }
  }

  return {
    success: true,
    data: {
      positive,
      negative,
      caution,
      treatments: treatmentDetails,
    },
  };
}

/**
 * Check if a citation exists in CourtListener
 * Returns normalized data for VPI storage
 *
 * IMPORTANT: Uses the v3 citation-lookup endpoint as primary method.
 * This endpoint is specifically designed for hallucination detection.
 */
export async function verifyCitationExists(
  citation: string,
  caseName?: string
): Promise<{
  success: boolean;
  data?: {
    exists: boolean;
    apiReachable: boolean; // A-016: Distinguish "not found" from "couldn't check"
    courtlistenerId?: string;
    courtlistenerUrl?: string;
    caseName?: string;
    court?: string;
    year?: number;
    dateDecided?: string;
    isPublished?: boolean;
    precedentialStatus?: string;
  };
  error?: string;
}> {
  // A-016: Track whether any API call succeeded (reachable)
  let anyApiReachable = false;
  // PRIMARY METHOD: Use v3 citation-lookup endpoint (designed for hallucination detection)
  const lookupResult = await lookupCitation(citation);
  if (lookupResult.success) anyApiReachable = true;

  if (lookupResult.success && lookupResult.data?.found) {
    // Find the first citation with a match
    const matchedCitation = lookupResult.data.citations.find(c => c.match_url);

    if (matchedCitation) {
      // Extract opinion ID from match_url if available
      const opinionId = matchedCitation.match_id
        ? String(matchedCitation.match_id)
        : matchedCitation.match_url?.match(/\/opinion\/(\d+)\//)?.[1];

      return {
        success: true,
        data: {
          exists: true,
          apiReachable: true,
          courtlistenerId: opinionId,
          courtlistenerUrl: matchedCitation.match_url
            ? `https://www.courtlistener.com${matchedCitation.match_url}`
            : undefined,
          year: matchedCitation.year ? parseInt(matchedCitation.year, 10) : undefined,
        },
      };
    }
  }

  // FALLBACK 1: Try v4 opinions search by citation
  const citationResult = await searchByCitation(citation);
  if (citationResult.success) anyApiReachable = true;

  if (citationResult.success && citationResult.data?.found && citationResult.data.opinions.length > 0) {
    const opinion = citationResult.data.opinions[0];
    return {
      success: true,
      data: {
        exists: true,
        apiReachable: true,
        courtlistenerId: String(opinion.id),
        courtlistenerUrl: opinion.absolute_url ? `https://www.courtlistener.com${opinion.absolute_url}` : undefined,
        caseName: opinion.case_name,
        court: opinion.court,
        year: opinion.date_filed ? new Date(opinion.date_filed).getFullYear() : undefined,
        dateDecided: opinion.date_filed,
        isPublished: opinion.precedential_status !== 'Unpublished',
        precedentialStatus: opinion.precedential_status,
      },
    };
  }

  // FALLBACK 2: Try case name search if provided
  if (caseName) {
    const nameResult = await searchByCaseName(caseName);
    if (nameResult.success) anyApiReachable = true;

    if (nameResult.success && nameResult.data?.found && nameResult.data.opinions.length > 0) {
      const opinion = nameResult.data.opinions[0];
      return {
        success: true,
        data: {
          exists: true,
          apiReachable: true,
          courtlistenerId: String(opinion.id),
          courtlistenerUrl: opinion.absolute_url ? `https://www.courtlistener.com${opinion.absolute_url}` : undefined,
          caseName: opinion.case_name,
          court: opinion.court,
          year: opinion.date_filed ? new Date(opinion.date_filed).getFullYear() : undefined,
          dateDecided: opinion.date_filed,
          isPublished: opinion.precedential_status !== 'Unpublished',
          precedentialStatus: opinion.precedential_status,
        },
      };
    }
  }

  // A-016: Not found — but distinguish "confirmed not found" from "API unreachable"
  return {
    success: true,
    data: {
      exists: false,
      apiReachable: anyApiReachable,
    },
  };
}

// ============================================================================
// PARALLEL SEARCH HELPER (Vercel Pro Timeout Optimization)
// Runs multiple searches in parallel batches to maximize throughput
// while respecting CourtListener rate limits (60 req/min)
// ============================================================================

const PARALLEL_BATCH_SIZE = 5; // Number of concurrent requests per batch

/**
 * Execute searches in parallel batches for better performance
 * Respects rate limits by processing in small batches
 */
async function parallelSearchBatch<T>(
  items: T[],
  searchFn: (item: T) => Promise<{ success: boolean; data?: unknown; error?: string }>,
  batchSize: number = PARALLEL_BATCH_SIZE
): Promise<Array<{ item: T; result: { success: boolean; data?: unknown; error?: string } }>> {
  const results: Array<{ item: T; result: { success: boolean; data?: unknown; error?: string } }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const result = await searchFn(item);
        return { item, result };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ============================================================================
// PHASE IV: SEARCH-FIRST CITATION RETRIEVAL
// These functions are used by Phase IV to find REAL citations from CourtListener
// instead of having Claude generate potentially hallucinated citations.
// ============================================================================

/**
 * Verified Citation interface - REQUIRED for Phase IV output
 * Every citation must have verification proof
 */
export interface VerifiedCitation {
  // Identification
  caseName: string;
  citation: string;

  // VERIFICATION PROOF (REQUIRED - without these, citation is INVALID)
  courtlistener_id: number;
  courtlistener_cluster_id: number;
  verification_timestamp: string;
  verification_method: 'search' | 'citation_lookup';

  // Metadata from CourtListener
  court: string;
  date_filed: string;

  // Usage
  forElement: string;
  proposition: string;
  relevantHolding: string;
  authorityLevel: 'binding' | 'persuasive';

  // CHEN RELEVANCE FIX (2026-02-05): Proposition tracking
  proposition_id?: string;
  proposition_text?: string;

  // CHEN RELEVANCE FIX (2026-02-05): Topical relevance scoring
  topical_relevance_score?: number;
  topical_relevance_reasoning?: string;

  // CHEN RELEVANCE FIX (2026-02-05): Search provenance
  search_query_used?: string;
  search_result_rank?: number;
}

/**
 * Search options for searchOpinions
 */
export interface SearchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Search opinions by query with jurisdiction filter
 *
 * This is the PRIMARY method for Phase IV to find real citations.
 * Instead of Claude generating citations, we search CourtListener first.
 *
 * MODIFIED: 2026-01-30-CHEN-TIMEOUT-FIX
 * - Added AbortSignal support for timeout handling
 * - Added request timeout (15s default)
 *
 * @param query - Search query (e.g., "discovery compel Louisiana")
 * @param jurisdiction - Court filter (e.g., "la" for Louisiana)
 * @param limit - Max results to return
 * @param options - Optional settings including abort signal
 */
export async function searchOpinions(
  query: string,
  jurisdiction?: string,
  limit: number = 20,
  options: SearchOptions = {}
): Promise<{
  success: boolean;
  data?: {
    opinions: Array<{
      id: number;
      cluster_id: number;
      case_name: string;
      citation: string;
      court: string;
      date_filed: string;
      snippet: string;
      absolute_url: string;
      precedential_status: string;
    }>;
    total_count: number;
  };
  error?: string;
}> {
  const { signal, timeoutMs } = options;

  try {
    // Build search endpoint
    let endpoint = `/search/?q=${encodeURIComponent(query)}&type=o`;

    // Add jurisdiction filter if provided
    // CRITICAL FIX (2026-01-30): CourtListener requires REPEATED court params
    // e.g., &court=la&court=lactapp NOT &court=la,lactapp (comma returns 0 results!)
    const courtCode = jurisdiction ? mapJurisdictionToCourtCode(jurisdiction) : null;
    if (courtCode) {
      // Split comma-separated codes and add each as separate param
      const courtParams = courtCode.split(',').map(c => `court=${c.trim()}`).join('&');
      endpoint += `&${courtParams}`;
      log.info(`[searchOpinions] Court filter: ${courtParams}`);
    }

    endpoint += `&page_size=${limit}`;

    // DIAGNOSTIC LOGGING
    log.info(`╔══════════════════════════════════════════════════════════════╗`);
    log.info(`║  [searchOpinions] DEBUG                                      ║`);
    log.info(`╚══════════════════════════════════════════════════════════════╝`);
    log.info(`[searchOpinions] Query: "${query}"`);
    log.info(`[searchOpinions] Jurisdiction input: "${jurisdiction}"`);
    log.info(`[searchOpinions] Mapped court codes: "${courtCode}"`);
    log.info(`[searchOpinions] Full endpoint: ${endpoint}`);
    log.info(`[searchOpinions] Full URL: ${COURTLISTENER_BASE_URL}${endpoint}`);

    const result = await makeRequest<{
      count: number;
      results: Array<{
        id: number | null;  // NOTE: id is NULL at search result level!
        cluster_id: number;
        caseName?: string;
        case_name?: string;
        citation?: string[];
        citations?: Array<{ volume: number; reporter: string; page: number }>;
        court?: string;
        court_id?: string;
        dateFiled?: string;
        date_filed?: string;
        snippet?: string;
        absolute_url?: string;
        precedential_status?: string;
        // CRITICAL: The actual opinion ID is in the nested opinions array
        opinions?: Array<{
          id: number;
          author_id?: number | null;
          type?: string;
          snippet?: string;
        }>;
        sibling_ids?: number[];
      }>;
    }>(endpoint, {
      signal,
      timeout: timeoutMs,
    });

    // DIAGNOSTIC: Log raw API response
    log.info(`[searchOpinions] API call success: ${result.success}`);
    log.info(`[searchOpinions] API error: ${result.error || 'none'}`);
    log.info(`[searchOpinions] Raw count: ${result.data?.count ?? 'undefined'}`);
    log.info(`[searchOpinions] Results array length: ${result.data?.results?.length ?? 'undefined'}`);

    if (!result.success) {
      log.error(`[searchOpinions] ❌ API CALL FAILED: ${result.error}`);
      return { success: false, error: result.error };
    }

    if (!result.data || result.data.count === 0) {
      log.info(`[searchOpinions] ⚠️ ZERO RESULTS returned for query: "${query}"`);
      log.info(`[searchOpinions] Full response data:`, JSON.stringify(result.data, null, 2));
      return {
        success: true,
        data: { opinions: [], total_count: 0 },
      };
    }

    // Transform results to consistent format
    // CRITICAL FIX (2026-01-30): CourtListener search returns id=null at result level!
    // The actual opinion ID is in op.opinions[0].id (nested array)
    // We MUST extract from the nested opinions array or use cluster_id as fallback
    log.info(`[searchOpinions] ═══ TRANSFORMING ${result.data.results.length} RESULTS ═══`);

    const opinions = result.data.results.map((op, idx) => {
      // Build citation string from citation array
      // CHEN CIV FIX (2026-02-02): Validate citations to reject bare numbers (opinion IDs)
      let citationStr = '';
      if (op.citations && op.citations.length > 0) {
        const c = op.citations[0];
        citationStr = `${c.volume} ${c.reporter} ${c.page}`;
      } else if (op.citation && op.citation.length > 0) {
        citationStr = op.citation[0];
      }

      // VALIDATION: Reject citation if it's just a bare number (opinion ID, not a legal citation)
      // Valid citations look like "884 F.3d 546" not "9402549"
      if (citationStr && /^\d+$/.test(citationStr.trim())) {
        log.warn(`[searchOpinions] ⚠️ INVALID CITATION: "${citationStr}" is a bare number (likely opinion ID), not a legal citation. Case: ${op.caseName || op.case_name}`);
        citationStr = ''; // Clear invalid citation - better to have no citation than a fake one
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Extract opinion ID from nested opinions array
      // CourtListener search API returns id=null at result level!
      // The actual ID is in result.opinions[0].id
      // ═══════════════════════════════════════════════════════════════════════
      const nestedOpinionId = op.opinions?.[0]?.id;
      const siblingId = op.sibling_ids?.[0];
      const clusterId = op.cluster_id;

      // Priority: nested opinion ID > sibling_ids > cluster_id
      // All are valid CourtListener identifiers
      const resolvedId = nestedOpinionId || siblingId || clusterId;

      if (idx < 3) {
        log.info(`[searchOpinions] Result[${idx}] ID resolution:`);
        log.info(`  - op.id (TOP LEVEL - USUALLY NULL): ${op.id}`);
        log.info(`  - op.opinions[0].id (NESTED): ${nestedOpinionId}`);
        log.info(`  - op.sibling_ids[0]: ${siblingId}`);
        log.info(`  - op.cluster_id: ${clusterId}`);
        log.info(`  - RESOLVED ID: ${resolvedId}`);
      }

      if (!resolvedId) {
        log.error(`[searchOpinions] ❌ FATAL: Could not resolve ID for result ${idx}!`);
        log.error(`[searchOpinions] Full result object:`, JSON.stringify(op, null, 2).substring(0, 500));
      }

      return {
        id: resolvedId,  // Use resolved ID, NOT op.id which is null!
        cluster_id: clusterId,
        case_name: op.caseName || op.case_name || extractCaseName(citationStr),
        citation: citationStr,
        court: op.court || op.court_id || 'Unknown Court',
        date_filed: op.dateFiled || op.date_filed || '',
        snippet: op.opinions?.[0]?.snippet || op.snippet || '',
        absolute_url: op.absolute_url || '',
        precedential_status: op.precedential_status || 'Unknown',
      };
    });

    // Filter out any results without valid IDs
    // FIX: Use proper null/undefined check - ID 0 is a valid CourtListener ID!
    const validOpinions = opinions.filter(op => op.id !== undefined && op.id !== null);
    if (validOpinions.length < opinions.length) {
      log.warn(`[searchOpinions] ⚠️ Filtered out ${opinions.length - validOpinions.length} results without valid IDs`);
    }

    log.info(`[searchOpinions] ✅ Found ${validOpinions.length} valid opinions for query: "${query}"`);
    log.info(`[searchOpinions] First opinion ID: ${validOpinions[0]?.id || 'NONE'}`);
    log.info(`[searchOpinions] First opinion case_name: ${validOpinions[0]?.case_name || 'NONE'}`);
    log.info(`[searchOpinions] All IDs: [${validOpinions.slice(0, 5).map(o => o.id).join(', ')}${validOpinions.length > 5 ? '...' : ''}]`);

    return {
      success: true,
      data: {
        opinions: validOpinions,  // Use filtered opinions with valid IDs
        total_count: result.data.count,
      },
    };
  } catch (error) {
    log.error('[CourtListener] Search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    };
  }
}

/**
 * Map jurisdiction name to CourtListener court codes
 *
 * IMPORTANT: Court codes must match CourtListener's exact IDs.
 * See: https://www.courtlistener.com/api/rest/v4/courts/
 *
 * Louisiana courts (verified 2024):
 *   - la: Supreme Court of Louisiana
 *   - lactapp: Louisiana Court of Appeal
 *   - laag: Louisiana Attorney General Reports
 *   - ca5: Fifth Circuit (federal appeals covering LA)
 */
function mapJurisdictionToCourtCode(jurisdiction: string): string | null {
  const normalized = jurisdiction.toLowerCase().trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // CHEN CIV FIX (2026-02-02): Separate state-only vs state+federal filters
  // For Louisiana STATE court motions, we want So. 3d citations (state courts)
  // not F.3d/F.4th citations (federal courts) dominating the results.
  //
  // Use "louisiana_state" for state courts only (binding authority)
  // Use "louisiana" for state + federal (includes persuasive federal)
  // Use "louisiana_federal" for federal courts only
  // ═══════════════════════════════════════════════════════════════════════════

  // Louisiana STATE courts only (for binding authority in state court motions)
  // Returns So. 3d citations from LA Supreme Court and Courts of Appeal
  if (normalized === 'louisiana_state' || normalized === 'la_state') {
    log.info('[mapJurisdictionToCourtCode] Louisiana STATE courts only (binding authority)');
    return 'la,lactapp';
  }

  // Louisiana ALL courts (state + Fifth Circuit for persuasive authority)
  if (normalized.includes('louisiana') || normalized === 'la') {
    // la = Supreme Court, lactapp = Court of Appeal, ca5 = Fifth Circuit
    log.info('[mapJurisdictionToCourtCode] Louisiana ALL courts (state + federal)');
    return 'la,lactapp,ca5';
  }

  // Louisiana FEDERAL courts only
  if (normalized === 'louisiana_federal' || normalized === 'la_federal') {
    log.info('[mapJurisdictionToCourtCode] Louisiana FEDERAL courts only');
    return 'ca5,laed,lamd,lawd';
  }

  // California STATE courts only
  if (normalized === 'california_state' || normalized === 'ca_state') {
    return 'cal,calctapp';
  }

  // California courts (state + federal)
  if (normalized.includes('california') || normalized === 'ca') {
    return 'cal,calctapp,ca9';
  }

  // Texas courts
  if (normalized.includes('texas') || normalized === 'tx') {
    return 'tex,texapp,texcrimapp,ca5';
  }

  // Federal courts
  if (normalized.includes('federal') || normalized === 'fed') {
    return 'scotus,ca5,ca9,cadc';
  }

  // Fifth Circuit (covers Louisiana, Texas, Mississippi)
  if (normalized.includes('fifth circuit') || normalized === 'ca5') {
    return 'ca5';
  }

  // Ninth Circuit (covers California and western states)
  if (normalized.includes('ninth circuit') || normalized === 'ca9') {
    return 'ca9';
  }

  return null;
}

/**
 * Get full opinion text for holding extraction
 *
 * Used after searchOpinions to get the full text for:
 * 1. Verifying the holding supports the proposition
 * 2. Extracting relevant quotes
 */
export async function getOpinionText(
  opinionId: number
): Promise<{
  success: boolean;
  data?: {
    id: number;
    case_name: string;
    plain_text: string;
    html_with_citations?: string;
    date_filed: string;
    court: string;
    citation: string;
  };
  error?: string;
}> {
  try {
    log.info(`[CourtListener] Fetching opinion text for ID: ${opinionId}`);

    const result = await makeRequest<{
      id: number;
      case_name?: string;
      plain_text?: string;
      html_with_citations?: string;
      date_filed?: string;
      court?: string;
      court_id?: string;
      cluster?: {
        case_name?: string;
        citations?: Array<{ volume: number; reporter: string; page: number }>;
      };
    }>(`/opinions/${opinionId}/?fields=id,case_name,plain_text,html_with_citations,date_filed,court,cluster`);

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Opinion not found' };
    }

    const op = result.data;

    // Build citation from cluster if available
    let citation = '';
    if (op.cluster?.citations && op.cluster.citations.length > 0) {
      const c = op.cluster.citations[0];
      citation = `${c.volume} ${c.reporter} ${c.page}`;
    }

    return {
      success: true,
      data: {
        id: op.id,
        case_name: op.case_name || op.cluster?.case_name || 'Unknown',
        plain_text: op.plain_text || '',
        html_with_citations: op.html_with_citations,
        date_filed: op.date_filed || '',
        court: op.court || op.court_id || 'Unknown',
        citation,
      },
    };
  } catch (error) {
    log.error('[CourtListener] Get opinion text error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get opinion text',
    };
  }
}

/**
 * Build a verified citation bank from CourtListener search results
 *
 * This is the main entry point for Phase IV citation retrieval.
 * Given a list of search queries (one per legal element), it:
 * 1. Executes searches against CourtListener
 * 2. Builds a citation bank from REAL results only
 * 3. Returns citations with full verification proof
 */
// ================================================================
// EXPANDED FALLBACK QUERIES - TARGET 12-20 CITATIONS
// ================================================================
const EXPANDED_FALLBACK_QUERIES: Record<string, string[]> = {
  'motion_to_compel': [
    // General discovery
    'motion to compel',
    'compel discovery',
    'discovery sanctions',
    'failure respond discovery',
    // Louisiana specific
    'Louisiana discovery',
    'Louisiana motion compel',
    'Louisiana interrogatories',
    'Louisiana requests production',
    // Insurance (common in LA)
    'insurance discovery Louisiana',
    'bad faith discovery',
    // Procedural
    'discovery deadline',
    'discovery abuse',
    'discovery sanctions Louisiana',
    'discovery order',
    'discovery dispute',
  ],
  'motion_to_dismiss': [
    'motion to dismiss',
    'dismiss failure state claim',
    'Louisiana motion dismiss',
    '12(b)(6) motion',
    'peremptory exception',  // Louisiana term
    'no cause action Louisiana',
    'prescription Louisiana',  // Louisiana statute of limitations
    'dismiss Louisiana',
    'pleading standard Louisiana',
    'exception no cause action',
    'dismiss complaint failure',
    'motion dismiss federal',
  ],
  'summary_judgment': [
    'summary judgment',
    'summary judgment Louisiana',
    'genuine issue material fact',
    'no genuine dispute',
    'motion summary judgment',
    'partial summary judgment',
    'Louisiana summary judgment standard',
    'summary judgment evidence',
    'summary judgment discovery',
    'motion summary judgment denied',
    'summary judgment granted',
  ],
  'default': [
    'Louisiana civil procedure',
    'Louisiana court appeal',
    'Louisiana Supreme Court',
    'Louisiana discovery',
    'Louisiana motion',
    'Fifth Circuit Louisiana',
    'Louisiana sanctions',
    'Louisiana procedural',
    'civil procedure Louisiana',
    'Louisiana attorney fees',
    'Louisiana litigation',
    'Louisiana judgment',
  ],
};

// LOUISIANA COURT CODES for CourtListener
const LOUISIANA_STATE_COURTS = ['la', 'lactapp'];  // Supreme Court + Courts of Appeal
const FEDERAL_LOUISIANA_COURTS = ['ca5', 'laed', 'lamd', 'lawd'];  // 5th Circuit + District Courts

/**
 * @deprecated REMOVED by CHEN CITATION RELEVANCE FIX (2026-02-05).
 *
 * The old simplifyQuery() truncated queries to 5-8 words and stripped statutory
 * references, causing irrelevant search results (defamation cases cited for
 * discovery propositions).
 *
 * Replaced by buildPropositionQuery() in @/lib/courtlistener/query-builder.ts
 * which preserves statutory references and builds proposition-specific queries.
 *
 * This shim is kept ONLY for any remaining call sites during migration.
 * It delegates to the new simplifyQueryV2() which uses the proposition-aware builder.
 */
function simplifyQuery(query: string): string {
  // CHEN RELEVANCE FIX: Delegate to the new query builder
  // This preserves statutory references and allows up to 15 words
  return simplifyQueryV2(query);
}

// ============================================================================
// CIV-005: STATUTORY-ANCHORED QUERY BUILDER
// ============================================================================

/**
 * Build a statutory-anchored search query for CourtListener.
 * These queries include the relevant statutory reference + legal terms
 * to return jurisdiction-relevant results instead of generic matches.
 *
 * CIV-005: Replaces generic queries with statutory-anchored queries.
 */
export function buildStatutoryAnchoredQuery(params: {
  motionType: string;
  statutoryBasis?: string;
  legalTerms: string[];
  jurisdiction: string;
}): string {
  const { motionType, statutoryBasis, legalTerms, jurisdiction } = params;

  const parts: string[] = [];

  // Add statutory basis as primary anchor
  if (statutoryBasis) {
    parts.push(`"${statutoryBasis}"`);
  }

  // Add key legal terms
  const topTerms = legalTerms.slice(0, 3);
  parts.push(...topTerms);

  // Add jurisdiction qualifier
  if (jurisdiction.toLowerCase().includes('louisiana') || jurisdiction.toLowerCase() === 'la') {
    parts.push('Louisiana');
  }

  return parts.join(' ');
}

// ============================================================================
// CIV-006: RELEVANCE SCORING
// ============================================================================

import {
  RELEVANCE_WEIGHTS,
  getAuthorityLevel,
  type FilingContext,
} from '@/lib/config/citation-models';

export interface ScoredSearchResult {
  id: number;
  caseName: string;
  citation: string;
  court: string;
  courtId: string;
  dateFiled: string;
  snippet: string;
  relevanceScore: number;
  breakdown: {
    keywordScore: number;
    courtScore: number;
    recencyScore: number;
  };
}

/**
 * Score CourtListener search results by relevance.
 * Weights: keyword 40%, court 30%, recency 30%.
 * Per Clay's Part C CL-FIX-03.
 */
export function scoreCandidates(
  results: Array<{ id: number; case_name: string; citation: string; court: string; date_filed: string; snippet?: string }>,
  legalTerms: string[],
  filingContext: FilingContext = 'STATE',
): ScoredSearchResult[] {
  return results.map(result => {
    // Keyword match (40%)
    const keywordScore = calculateKeywordRelevance(
      `${result.case_name} ${result.snippet || ''}`,
      legalTerms
    );

    // Court weight (30%) — binding > persuasive, higher > lower
    const courtId = mapCourtToId(result.court);
    const authorityLevel = getAuthorityLevel(courtId, filingContext);
    const courtScore = authorityLevel === 'BINDING' ? 1.0 : 0.4;

    // Recency (30%) — decay over time
    const yearsSinceDecision = result.date_filed
      ? (Date.now() - new Date(result.date_filed).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      : 25; // Default to 25 years if unknown
    const recencyScore = Math.max(0, 1 - (yearsSinceDecision / 50)); // Linear decay over 50 years

    const totalScore =
      keywordScore * RELEVANCE_WEIGHTS.KEYWORD_MATCH +
      courtScore * RELEVANCE_WEIGHTS.COURT_WEIGHT +
      recencyScore * RELEVANCE_WEIGHTS.RECENCY;

    return {
      id: result.id,
      caseName: result.case_name,
      citation: result.citation,
      court: result.court,
      courtId,
      dateFiled: result.date_filed,
      snippet: result.snippet || '',
      relevanceScore: totalScore,
      breakdown: { keywordScore, courtScore, recencyScore },
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Calculate keyword relevance between result text and search terms.
 */
function calculateKeywordRelevance(text: string, terms: string[]): number {
  if (!terms.length || !text) return 0;

  const lowerText = text.toLowerCase();
  let matchCount = 0;

  for (const term of terms) {
    if (lowerText.includes(term.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / terms.length;
}

/**
 * Map court name string to court ID for authority lookup.
 */
function mapCourtToId(court: string): string {
  const lower = court.toLowerCase();

  if (lower.includes('supreme') && lower.includes('u.s.')) return 'scotus';
  if (lower.includes('supreme') && lower.includes('louisiana')) return 'la';
  if (lower.includes('appeal') && lower.includes('louisiana')) return 'lactapp';
  if (lower.includes('fifth circuit') || lower.includes('5th cir')) return 'ca5';
  if (lower.includes('eastern district') && lower.includes('louisiana')) return 'laed';
  if (lower.includes('middle district') && lower.includes('louisiana')) return 'lamd';
  if (lower.includes('western district') && lower.includes('louisiana')) return 'lawd';

  return court.toLowerCase().replace(/\s+/g, '_');
}

export async function buildVerifiedCitationBank(
  queries: Array<{
    query: string;
    forElement: string;
    jurisdiction: string;
  }>,
  minCitations: number = 12,  // INCREASED from 2 per element to 12 total minimum
  maxCitations: number = 20,  // NEW: cap to avoid over-fetching
  tier?: string               // A-025: Tier for tiered citation limits
): Promise<{
  success: boolean;
  data?: {
    citations: VerifiedCitation[];
    totalVerified: number;
    searchesPerformed: number;
    elementsWithCitations: number;
    louisianaCitations: number;
    federalCitations: number;
  };
  error?: string;
}> {
  // A-025: Tiered citation limits (override flat defaults if tier provided)
  if (tier) {
    const tierMin: Record<string, number> = { 'A': 5, 'B': 10, 'C': 15, 'D': 20 };
    const tierMax: Record<string, number> = { 'A': 10, 'B': 15, 'C': 25, 'D': 30 };
    minCitations = tierMin[tier] ?? minCitations;
    maxCitations = tierMax[tier] ?? maxCitations;
  }

  // EXPANDED CITATION RESEARCH — TARGET tiered CITATIONS
  log.info(`╔══════════════════════════════════════════════════════════════╗`);
  log.info(`║  EXPANDED CITATION RESEARCH — TARGET: ${minCitations}-${maxCitations} CITATIONS       ║`);
  log.info(`║  Version: 2026-01-30-CITATION-ENFORCEMENT                   ║`);
  log.info(`╚══════════════════════════════════════════════════════════════╝`);
  log.info(`[buildVerifiedCitationBank] Total queries received: ${queries.length}`);
  log.info(`[buildVerifiedCitationBank] Target citations: ${minCitations}-${maxCitations} (tier: ${tier || 'unset'})`);
  log.info(`[buildVerifiedCitationBank] API Key present: ${!!process.env.COURTLISTENER_API_KEY}`);

  const citations: VerifiedCitation[] = [];
  let searchesPerformed = 0;
  const elementCoverage = new Set<string>();
  const seenIds = new Set<number>();

  // Get jurisdiction from first query (they're all the same)
  const jurisdiction = queries[0]?.jurisdiction || 'Louisiana';

  // Detect motion type from queries for fallback selection
  const queryText = queries.map(q => q.query.toLowerCase()).join(' ');
  let motionType = 'default';
  if (queryText.includes('compel') || queryText.includes('discovery')) {
    motionType = 'motion_to_compel';
  } else if (queryText.includes('dismiss')) {
    motionType = 'motion_to_dismiss';
  } else if (queryText.includes('summary') || queryText.includes('judgment')) {
    motionType = 'summary_judgment';
  }
  log.info(`[buildVerifiedCitationBank] Motion type detected: ${motionType}`);

  // Get expanded fallback queries
  const fallbackQueries = EXPANDED_FALLBACK_QUERIES[motionType] || EXPANDED_FALLBACK_QUERIES['default'];

  // Combine provided queries with fallbacks
  const allQueries = [
    ...(queries || []).map(q => ({ query: simplifyQuery(q.query), forElement: q.forElement })),
    ...fallbackQueries.map(q => ({ query: q, forElement: 'fallback' })),
  ].filter(q => q.query.length > 2);
  const uniqueQueries = [...new Map(allQueries.map(q => [q.query, q])).values()];
  log.info(`[buildVerifiedCitationBank] ${uniqueQueries.length} unique queries to search`);

  // CHEN RELEVANCE FIX (2026-02-05): Build proposition context for relevance scoring
  const propositionContext: PropositionContext = {
    proposition: queries.map(q => q.forElement).join('; '),
    motionType: motionType === 'motion_to_compel' ? 'MCOMPEL'
      : motionType === 'motion_to_dismiss' ? 'MTD_12B6'
      : motionType === 'summary_judgment' ? 'MSJ'
      : 'GENERIC',
    statutoryBasis: [],
    elementName: queries[0]?.forElement || 'general',
  };
  let relevanceRejections = 0;

  // Helper function to add citations from search results
  // CHEN RELEVANCE FIX: Now includes topical relevance scoring
  const addCitationsFromSearch = (
    opinions: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }>,
    forElement: string,
    source: string,
    searchQuery?: string
  ) => {
    for (let rank = 0; rank < opinions.length; rank++) {
      const opinion = opinions[rank];
      if (citations.length >= maxCitations) break;
      if (!opinion.id || seenIds.has(opinion.id)) continue;

      // CHEN RELEVANCE FIX: Score topical relevance before adding
      const relevanceResult = scoreRelevance(
        {
          caseName: opinion.case_name || '',
          citation: opinion.citation || '',
          court: opinion.court || '',
          snippet: opinion.snippet || '',
        },
        {
          ...propositionContext,
          elementName: forElement,
        }
      );

      if (!relevanceResult.passes_threshold) {
        relevanceRejections++;
        log.info(`[buildVerifiedCitationBank] ⛔ RELEVANCE REJECT (${relevanceResult.score.toFixed(3)}): ${opinion.case_name?.substring(0, 50)}... — ${relevanceResult.reasoning.substring(0, 100)}`);
        continue;
      }

      seenIds.add(opinion.id);

      citations.push({
        caseName: opinion.case_name,
        citation: opinion.citation || opinion.case_name,
        courtlistener_id: opinion.id,
        courtlistener_cluster_id: opinion.cluster_id || opinion.id,
        verification_timestamp: new Date().toISOString(),
        verification_method: 'search',
        court: opinion.court,
        date_filed: opinion.date_filed,
        forElement,
        proposition: '',
        relevantHolding: opinion.snippet || '',
        authorityLevel: determineAuthorityLevel(opinion.court, jurisdiction),
        // CHEN RELEVANCE FIX: Proposition tracking
        proposition_id: forElement,
        proposition_text: forElement,
        // CHEN RELEVANCE FIX: Topical relevance
        topical_relevance_score: relevanceResult.score,
        topical_relevance_reasoning: relevanceResult.reasoning,
        // CHEN RELEVANCE FIX: Search provenance
        search_query_used: searchQuery || '',
        search_result_rank: rank + 1,
      });
      log.info(`[buildVerifiedCitationBank] ✅ ${source} (relevance: ${relevanceResult.score.toFixed(3)}): ${opinion.case_name?.substring(0, 50)}...`);
      elementCoverage.add(forElement);
    }
  };

  // ================================================================
  // PHASE 1: Search LOUISIANA STATE COURTS FIRST (highest authority)
  // Uses parallel batches for faster execution (Vercel Pro optimization)
  // ================================================================
  log.info(`[buildVerifiedCitationBank] ═══ PHASE 1: Louisiana State Courts (PARALLEL) ═══`);

  // Run searches in parallel batches of 5 for better performance
  const phase1Queries = uniqueQueries.slice(0, 10);
  const phase1Results = await parallelSearchBatch(
    phase1Queries,
    async (queryInfo) => {
      try {
        return await searchOpinions(queryInfo.query, 'Louisiana', 8);
      } catch (error) {
        log.error(`[buildVerifiedCitationBank] LA state search failed for "${queryInfo.query}":`, error);
        return { success: false, error: String(error) };
      }
    },
    PARALLEL_BATCH_SIZE
  );

  // Process results
  for (const { item: queryInfo, result: searchResult } of phase1Results) {
    if (citations.length >= maxCitations) break;
    searchesPerformed++;

    if (searchResult.success && (searchResult.data as { opinions?: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> })?.opinions?.length) {
      // Filter to only Louisiana state court results
      const opinions = (searchResult.data as { opinions: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> }).opinions;
      const laStateOpinions = opinions.filter(op =>
        op.court?.toLowerCase().includes('louisiana') ||
        op.court === 'la' ||
        op.court === 'lactapp'
      );
      addCitationsFromSearch(laStateOpinions, queryInfo.forElement, 'LA State', queryInfo.query);
    }
  }

  log.info(`[buildVerifiedCitationBank] After Phase 1 (LA State): ${citations.length} citations (${relevanceRejections} relevance rejections)`);

  // ================================================================
  // PHASE 2: Search FIFTH CIRCUIT FEDERAL (binding federal authority)
  // Uses parallel batches for faster execution (Vercel Pro optimization)
  // ================================================================
  if (citations.length < maxCitations) {
    log.info(`[buildVerifiedCitationBank] ═══ PHASE 2: Fifth Circuit Federal (PARALLEL) ═══`);

    // Run searches in parallel batches of 5 for better performance
    const phase2Queries = uniqueQueries.slice(0, 8);
    const phase2Results = await parallelSearchBatch(
      phase2Queries,
      async (queryInfo) => {
        try {
          return await searchOpinions(queryInfo.query, 'fifth circuit', 6);
        } catch (error) {
          log.error(`[buildVerifiedCitationBank] Federal search failed for "${queryInfo.query}":`, error);
          return { success: false, error: String(error) };
        }
      },
      PARALLEL_BATCH_SIZE
    );

    // Process results
    for (const { item: queryInfo, result: searchResult } of phase2Results) {
      if (citations.length >= maxCitations) break;
      searchesPerformed++;

      if (searchResult.success && (searchResult.data as { opinions?: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> })?.opinions?.length) {
        // Filter to Fifth Circuit results
        const opinions = (searchResult.data as { opinions: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> }).opinions;
        const federalOpinions = opinions.filter(op =>
          op.court?.toLowerCase().includes('fifth') ||
          op.court?.toLowerCase().includes('circuit') ||
          op.court?.toLowerCase().includes('district') ||
          op.court === 'ca5'
        );
        addCitationsFromSearch(federalOpinions, queryInfo.forElement, '5th Cir', queryInfo.query);
      }
    }
  }

  log.info(`[buildVerifiedCitationBank] After Phase 2 (Federal): ${citations.length} citations`);

  // ================================================================
  // PHASE 3: Broad search if still under minimum
  // Uses parallel batches for faster execution (Vercel Pro optimization)
  // ================================================================
  if (citations.length < minCitations) {
    log.info(`[buildVerifiedCitationBank] ═══ PHASE 3: Broad Search (PARALLEL, under ${minCitations} citations) ═══`);

    const broadQueries = [
      'Louisiana civil procedure',
      'discovery Louisiana',
      'motion Louisiana',
      'Louisiana appeal',
      `${motionType.replace(/_/g, ' ')} Louisiana`,
    ];

    // Run all broad searches in parallel
    const phase3Results = await Promise.all(
      broadQueries.map(async (query) => {
        try {
          const result = await searchOpinions(query, 'Louisiana', 10);
          return { query, result };
        } catch (error) {
          log.error(`[buildVerifiedCitationBank] Broad search failed for "${query}":`, error);
          return { query, result: { success: false, error: String(error) } };
        }
      })
    );

    // Process results
    for (const { query: broadQuery, result: searchResult } of phase3Results) {
      if (citations.length >= minCitations) break;
      searchesPerformed++;

      if (searchResult.success && (searchResult as { data?: { opinions?: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> } }).data?.opinions?.length) {
        const opinions = (searchResult as { data: { opinions: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> } }).data.opinions;
        addCitationsFromSearch(opinions, 'broad', 'Broad', broadQuery);
      }
    }
  }

  log.info(`[buildVerifiedCitationBank] After Phase 3 (Broad): ${citations.length} citations (${relevanceRejections} total relevance rejections)`);

  // ================================================================
  // PHASE 4: LAST RESORT - Search without jurisdiction filter
  // Uses parallel execution for faster recovery (Vercel Pro optimization)
  // ================================================================
  if (citations.length < 4) {  // Minimum 4 for any motion
    log.info(`[buildVerifiedCitationBank] ═══ PHASE 4: LAST RESORT (PARALLEL, no filter) ═══`);

    const lastResortQueries = ['motion to compel', 'discovery sanctions', 'civil procedure'];

    // Run all last resort searches in parallel
    const phase4Results = await Promise.all(
      lastResortQueries.map(async (query) => {
        try {
          // NO JURISDICTION - search all courts
          const result = await searchOpinions(query, undefined, 15);
          return { query, result };
        } catch (error) {
          log.error(`[buildVerifiedCitationBank] Last resort error:`, error);
          return { query, result: { success: false, error: String(error) } };
        }
      })
    );

    // Process results
    for (const { result: searchResult } of phase4Results) {
      if (citations.length >= 4) break;
      searchesPerformed++;

      if (searchResult.success && (searchResult as { data?: { opinions?: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> } }).data?.opinions?.length) {
        const opinions = (searchResult as { data: { opinions: Array<{ id: number; cluster_id: number; case_name: string; citation: string; court: string; date_filed: string; snippet: string }> } }).data.opinions;
        addCitationsFromSearch(opinions, 'last_resort', 'Last Resort', 'last_resort');
      }
    }
  }

  // ================================================================
  // SORT: Louisiana state first, then federal, then by date (recent first)
  // ================================================================
  citations.sort((a, b) => {
    // Priority: LA Supreme > LA App > 5th Cir > District > Other
    const getPriority = (c: VerifiedCitation) => {
      const court = (c.court || '').toLowerCase();
      if (court.includes('supreme') && court.includes('louisiana')) return 1;
      if (court.includes('louisiana') && court.includes('appeal')) return 2;
      if (court === 'la') return 1;  // LA Supreme Court code
      if (court === 'lactapp') return 2;  // LA Court of Appeal code
      if (court.includes('fifth circuit') || court === 'ca5') return 3;
      if (court.includes('district')) return 4;
      return 5;
    };

    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    // Same priority — sort by date (recent first)
    const dateA = new Date(a.date_filed || '1900-01-01').getTime();
    const dateB = new Date(b.date_filed || '1900-01-01').getTime();
    return dateB - dateA;
  });

  // Count Louisiana vs federal citations
  const louisianaCitations = citations.filter(c =>
    (c.court || '').toLowerCase().includes('louisiana') ||
    c.court === 'la' ||
    c.court === 'lactapp'
  ).length;
  const federalCitations = citations.length - louisianaCitations;

  // ================================================================
  // FINAL REPORT
  // ================================================================
  log.info(`╔══════════════════════════════════════════════════════════════╗`);
  log.info(`║  CITATION BANK COMPLETE                                      ║`);
  log.info(`╚══════════════════════════════════════════════════════════════╝`);
  log.info(`[buildVerifiedCitationBank] Total citations: ${citations.length}`);
  log.info(`[buildVerifiedCitationBank] Louisiana citations: ${louisianaCitations}`);
  log.info(`[buildVerifiedCitationBank] Federal citations: ${federalCitations}`);
  log.info(`[buildVerifiedCitationBank] Searches performed: ${searchesPerformed}`);
  log.info(`[buildVerifiedCitationBank] Elements covered: ${elementCoverage.size}`);
  log.info(`[buildVerifiedCitationBank] Relevance rejections: ${relevanceRejections}`);

  if (citations.length > 0) {
    log.info(`[buildVerifiedCitationBank] Top citations by authority:`);
    citations.slice(0, 5).forEach((c, i) => {
      log.info(`  ${i + 1}. ${c.caseName?.substring(0, 50)}... (${c.court})`);
    });
    log.info(`[buildVerifiedCitationBank] All IDs: [${citations.slice(0, 8).map(c => c.courtlistener_id).join(', ')}${citations.length > 8 ? '...' : ''}]`);
  } else {
    log.error(`[buildVerifiedCitationBank] ❌ FATAL: No citations found!`);
  }

  return {
    success: citations.length >= 4,  // Minimum 4 for any motion
    data: {
      citations,
      totalVerified: citations.length,
      searchesPerformed,
      elementsWithCitations: elementCoverage.size,
      louisianaCitations,
      federalCitations,
    },
    error: citations.length < 4 ? 'Not enough citations found - need at least 4' : undefined,
  };
}

// ============================================================================
// CITATION VIEWER: Extended API Methods
// Added: January 30, 2026
// These methods support the Citation Viewer feature for detailed case display.
// ============================================================================

/**
 * Get full citation details for the Citation Viewer modal
 * Fetches opinion, cluster, and treatment data from CourtListener
 *
 * @param opinionId - CourtListener opinion ID
 * @param options - Include full opinion text, force refresh from API
 */
export async function getCitationDetailsForViewer(
  opinionId: string,
  options?: { includeText?: boolean; forceRefresh?: boolean }
): Promise<{
  success: boolean;
  data?: CitationDetails;
  error?: string;
}> {
  const includeText = options?.includeText ?? false;

  try {
    log.info(`[CitationViewer] Fetching details for opinion ${opinionId}`);

    // Fetch opinion data
    const opinionResult = await makeRequest<{
      id: number;
      absolute_url?: string;
      cluster?: number | string;
      case_name?: string;
      case_name_short?: string;
      date_filed?: string;
      court?: string;
      court_id?: string;
      plain_text?: string;
      html_with_citations?: string;
      citation_count?: number;
      precedential_status?: string;
    }>(`/opinions/${opinionId}/?fields=id,absolute_url,cluster,case_name,case_name_short,date_filed,court,court_id,plain_text,html_with_citations,citation_count,precedential_status`);

    if (!opinionResult.success || !opinionResult.data) {
      return { success: false, error: opinionResult.error || 'Opinion not found' };
    }

    const opinion = opinionResult.data;
    const clusterId = typeof opinion.cluster === 'number' ? String(opinion.cluster) : opinion.cluster;

    // Fetch cluster data for citations and case metadata
    let clusterData: {
      case_name?: string;
      case_name_short?: string;
      date_filed?: string;
      court?: string;
      court_id?: string;
      citations?: Array<{ volume: number; reporter: string; page: number }>;
      citation_count?: number;
      judges?: string;
      syllabus?: string;
      headnotes?: string;
    } | undefined;

    if (clusterId) {
      const clusterResult = await makeRequest<typeof clusterData>(`/clusters/${clusterId}/`);
      if (clusterResult.success && clusterResult.data) {
        clusterData = clusterResult.data;
      }
    }

    // Build citation string
    let citationString = '';
    if (clusterData?.citations && clusterData.citations.length > 0) {
      const c = clusterData.citations[0];
      citationString = `${c.volume} ${c.reporter} ${c.page}`;
    }

    // Get treatment data
    const treatmentResult = await getCitationTreatment(opinionId);
    const treatment: CitationTreatment = {
      isGoodLaw: treatmentResult.success ? (treatmentResult.data?.negative ?? 0) === 0 : true,
      overruledBy: [],
      distinguishedBy: [],
      followedBy: [],
      citedBy: [],
    };

    if (treatmentResult.success && treatmentResult.data) {
      // Categorize treatments
      for (const t of treatmentResult.data.treatments) {
        const ref: CitationReference = {
          caseName: '', // Would need additional fetch to get case names
          citation: '',
          date: '',
          treatment: t.treatment,
          courtlistenerId: String(t.citing_opinion_id),
        };

        switch (t.treatment.toLowerCase()) {
          case 'overruled':
          case 'reversed':
          case 'vacated':
          case 'superseded':
            treatment.overruledBy = treatment.overruledBy || [];
            treatment.overruledBy.push(ref);
            treatment.isGoodLaw = false;
            break;
          case 'distinguished':
          case 'criticized':
          case 'questioned':
            treatment.distinguishedBy = treatment.distinguishedBy || [];
            treatment.distinguishedBy.push(ref);
            break;
          case 'followed':
          case 'affirmed':
          case 'approved':
            treatment.followedBy = treatment.followedBy || [];
            treatment.followedBy.push(ref);
            break;
          default:
            treatment.citedBy = treatment.citedBy || [];
            treatment.citedBy.push(ref);
        }
      }
    }

    // Build response
    const caseName = opinion.case_name || clusterData?.case_name || extractCaseName(citationString);
    const caseNameShort = opinion.case_name_short || clusterData?.case_name_short || extractShortName(caseName);
    const court = opinion.court || opinion.court_id || clusterData?.court || clusterData?.court_id || 'Unknown Court';
    const dateFiled = opinion.date_filed || clusterData?.date_filed || '';

    const details: CitationDetails = {
      opinionId: String(opinion.id),
      clusterId: clusterId || String(opinion.id),

      caseName,
      caseNameShort,
      citation: citationString,
      court: formatCourtName(court),
      courtShort: formatCourtShort(court),
      dateFiled,
      dateFiledDisplay: dateFiled ? formatDateDisplay(dateFiled) : '',

      syllabus: clusterData?.syllabus || undefined,
      headnotes: clusterData?.headnotes ? [clusterData.headnotes] : undefined,

      courtlistenerUrl: opinion.absolute_url
        ? `https://www.courtlistener.com${opinion.absolute_url}`
        : `https://www.courtlistener.com/opinion/${opinionId}/`,

      citedByCount: clusterData?.citation_count || opinion.citation_count || 0,
      treatment,

      cachedAt: new Date().toISOString(),
      source: 'live',
    };

    // Include opinion text if requested
    if (includeText) {
      if (opinion.html_with_citations) {
        details.opinionText = opinion.html_with_citations;
        details.opinionTextType = 'html';
      } else if (opinion.plain_text) {
        details.opinionText = opinion.plain_text;
        details.opinionTextType = 'plain';
      }
    }

    log.info(`[CitationViewer] Successfully fetched details for ${caseNameShort}`);
    return { success: true, data: details };
  } catch (error) {
    log.error('[CitationViewer] Error fetching citation details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch citation details',
    };
  }
}

/**
 * Batch fetch citation details for multiple opinions
 * Efficient for initial page load
 *
 * @param opinionIds - Array of CourtListener opinion IDs
 */
export async function batchGetCitationDetails(
  opinionIds: string[]
): Promise<{
  success: boolean;
  data?: Map<string, CitationDetails>;
  errors?: string[];
}> {
  const results = new Map<string, CitationDetails>();
  const errors: string[] = [];

  log.info(`[CitationViewer] Batch fetching ${opinionIds.length} citations`);

  // Process in parallel with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < opinionIds.length; i += CONCURRENCY) {
    const batch = opinionIds.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (id) => {
      const result = await getCitationDetailsForViewer(id);
      if (result.success && result.data) {
        results.set(id, result.data);
      } else {
        errors.push(`Failed to fetch opinion ${id}: ${result.error}`);
      }
    });
    await Promise.all(promises);
  }

  log.info(`[CitationViewer] Batch complete: ${results.size} success, ${errors.length} errors`);
  return { success: true, data: results, errors };
}

/**
 * Extract short case name from full case name
 * e.g., "Brumfield v. Louisiana State Board of Education" -> "Brumfield"
 */
function extractShortName(caseName: string): string {
  // Try to get first party name before "v." or "vs."
  const match = caseName.match(/^([^v]+?)(?:\s+v\.?\s+|\s+vs\.?\s+)/i);
  if (match) {
    return match[1].trim().split(/[,\s]/)[0];
  }
  // Fallback: first word
  return caseName.split(/[,\s]/)[0] || caseName;
}

/**
 * Format court code to full name
 */
function formatCourtName(court: string): string {
  const courtNames: Record<string, string> = {
    'scotus': 'Supreme Court of the United States',
    'ca5': 'United States Court of Appeals for the Fifth Circuit',
    'ca9': 'United States Court of Appeals for the Ninth Circuit',
    'la': 'Supreme Court of Louisiana',
    'lactapp': 'Louisiana Court of Appeal',
    'cal': 'Supreme Court of California',
    'calctapp': 'California Court of Appeal',
  };
  return courtNames[court.toLowerCase()] || court;
}

/**
 * Format court code to short abbreviation
 */
function formatCourtShort(court: string): string {
  const shortNames: Record<string, string> = {
    'scotus': 'U.S.',
    'ca5': '5th Cir.',
    'ca9': '9th Cir.',
    'la': 'La.',
    'lactapp': 'La. Ct. App.',
    'cal': 'Cal.',
    'calctapp': 'Cal. Ct. App.',
  };
  return shortNames[court.toLowerCase()] || court;
}

/**
 * Format date for display
 * e.g., "2015-11-10" -> "November 10, 2015"
 */
function formatDateDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// END CITATION VIEWER METHODS
// ============================================================================

// ============================================================================
// V4 CURSOR-BASED PAGINATION HELPER
// ============================================================================

export interface PaginationConfig {
  /** Maximum pages to retrieve (default: 10) */
  maxPages: number;
  /** Results per page (default: 100) */
  pageSize: number;
  /** Stop if a page returns 0 results (default: true) */
  abortOnEmpty: boolean;
}

export interface PaginatedResult<T> {
  results: T[];
  totalCount: number;
  pagesRetrieved: number;
  /** True if maxPages reached before exhausting results */
  truncated: boolean;
}

const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  maxPages: 10,
  pageSize: 100,
  abortOnEmpty: true,
};

/**
 * Paginate through a V4 endpoint using cursor-based pagination.
 *
 * CourtListener V4 uses cursor-based pagination (not offset-based).
 * Response format: { count, next (URL with cursor), previous, results }
 *
 * @param endpoint - API endpoint path (e.g., '/opinions-cited/')
 * @param params - Query parameters (excluding cursor/limit)
 * @param config - Pagination configuration overrides
 * @param requestOptions - Optional timeout/signal options
 *
 * @version BATCH_13 — ST-010
 */
export async function paginateV4<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  config?: Partial<PaginationConfig>,
  requestOptions?: RequestOptions
): Promise<PaginatedResult<T>> {
  const cfg = { ...DEFAULT_PAGINATION_CONFIG, ...config };
  const results: T[] = [];
  let totalCount = 0;
  let pagesRetrieved = 0;
  let cursor: string | null = null;

  // Build query string from params
  const buildQueryString = (extraParams: Record<string, string | number>): string => {
    const allParams = { ...params, limit: cfg.pageSize, ...extraParams };
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(allParams)) {
      searchParams.set(key, String(value));
    }
    return searchParams.toString();
  };

  try {
    // First page
    const firstPageQuery = buildQueryString({});
    const firstResponse = await makeRequest<V4PaginationResponse<T>>(
      `${endpoint}?${firstPageQuery}`,
      requestOptions
    );

    if (!firstResponse.success || !firstResponse.data) {
      log.warn(`[paginateV4] First page request failed: ${firstResponse.error}`);
      return { results, totalCount, pagesRetrieved: 0, truncated: false };
    }

    totalCount = firstResponse.data.count ?? 0;
    pagesRetrieved = 1;

    if (Array.isArray(firstResponse.data.results)) {
      results.push(...firstResponse.data.results);
    }

    // Extract cursor from next URL
    cursor = extractCursorFromUrl(firstResponse.data.next);

    // Abort if empty and configured to do so
    if (cfg.abortOnEmpty && results.length === 0) {
      return { results, totalCount, pagesRetrieved, truncated: false };
    }

    // Continue pagination
    while (cursor && pagesRetrieved < cfg.maxPages) {
      const pageQuery = buildQueryString({ cursor });
      const pageResponse = await makeRequest<V4PaginationResponse<T>>(
        `${endpoint}?${pageQuery}`,
        requestOptions
      );

      pagesRetrieved++;

      if (!pageResponse.success || !pageResponse.data) {
        log.warn(`[paginateV4] Page ${pagesRetrieved} request failed: ${pageResponse.error}`);
        break;
      }

      if (Array.isArray(pageResponse.data.results)) {
        results.push(...pageResponse.data.results);
      }

      // Abort on empty page
      if (cfg.abortOnEmpty && pageResponse.data.results?.length === 0) {
        log.warn(`[paginateV4] CL_EMPTY_PAGE_WITH_CURSOR at page ${pagesRetrieved}`);
        break;
      }

      cursor = extractCursorFromUrl(pageResponse.data.next);
    }

    return {
      results,
      totalCount,
      pagesRetrieved,
      truncated: cursor !== null,
    };
  } catch (error) {
    // Handle cursor expiration gracefully — return what we have so far
    if (error instanceof Error && error.message.includes('cursor')) {
      log.warn(`[paginateV4] CL_CURSOR_EXPIRED at page ${pagesRetrieved}`);
      return { results, totalCount, pagesRetrieved, truncated: true };
    }
    throw error;
  }
}

/**
 * V4 paginated response shape from CourtListener
 */
interface V4PaginationResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Extract cursor parameter from CL's next URL.
 * V4 uses cursor-based pagination where the next URL contains a cursor param.
 */
function extractCursorFromUrl(nextUrl: string | null | undefined): string | null {
  if (!nextUrl) return null;

  try {
    const url = new URL(nextUrl);
    return url.searchParams.get('cursor');
  } catch {
    // Invalid URL — no more pages
    return null;
  }
}

// ============================================================================
// END V4 PAGINATION HELPER
// ============================================================================

/**
 * Determine if a court's decisions are binding or persuasive for a jurisdiction
 *
 * CourtListener court codes:
 *   - la: Supreme Court of Louisiana
 *   - lactapp: Louisiana Court of Appeal
 *   - ca5: Fifth Circuit (federal, covers LA/TX/MS)
 *   - cal: Supreme Court of California
 *   - calctapp: California Court of Appeal
 *   - ca9: Ninth Circuit (federal, covers CA)
 */
function determineAuthorityLevel(court: string, jurisdiction: string): 'binding' | 'persuasive' {
  const normalizedCourt = court.toLowerCase();
  const normalizedJurisdiction = jurisdiction.toLowerCase();

  // U.S. Supreme Court is binding everywhere
  if (normalizedCourt.includes('supreme court of the united states') || normalizedCourt === 'scotus') {
    return 'binding';
  }

  // State supreme courts are binding in their state
  if (normalizedJurisdiction.includes('louisiana')) {
    // Louisiana Supreme Court (court code: la)
    if (normalizedCourt.includes('louisiana supreme') || normalizedCourt === 'la' || normalizedCourt.includes('supreme court of louisiana')) {
      return 'binding';
    }
    // Louisiana Court of Appeal is persuasive but important (court code: lactapp)
    if (normalizedCourt.includes('louisiana court of appeal') || normalizedCourt === 'lactapp') {
      return 'persuasive'; // Appellate courts are persuasive, not binding
    }
    // Fifth Circuit federal court (covers Louisiana)
    if (normalizedCourt.includes('fifth circuit') || normalizedCourt === 'ca5') {
      return 'binding';
    }
  }

  if (normalizedJurisdiction.includes('california')) {
    // California Supreme Court (court code: cal)
    if (normalizedCourt.includes('california supreme') || normalizedCourt === 'cal' || normalizedCourt.includes('supreme court of california')) {
      return 'binding';
    }
    // California Court of Appeal (court code: calctapp)
    if (normalizedCourt.includes('california court of appeal') || normalizedCourt === 'calctapp') {
      return 'persuasive';
    }
    // Ninth Circuit federal court (covers California)
    if (normalizedCourt.includes('ninth circuit') || normalizedCourt === 'ca9') {
      return 'binding';
    }
  }

  if (normalizedJurisdiction.includes('texas')) {
    // Texas Supreme Court
    if (normalizedCourt.includes('texas supreme') || normalizedCourt === 'tex' || normalizedCourt.includes('supreme court of texas')) {
      return 'binding';
    }
    // Fifth Circuit federal court (covers Texas)
    if (normalizedCourt.includes('fifth circuit') || normalizedCourt === 'ca5') {
      return 'binding';
    }
  }

  // Everything else is persuasive
  return 'persuasive';
}

// ============================================================================
// BACKWARD CITATION ANALYSIS (SP-13 AO-12 / D9-017 / ST-D9R2-01)
// Returns cases that OUR case cites (its foundation authorities).
// CORRECT parameter: ?cited_opinion (NOT ?citing_opinion which is FORWARD).
// SCOPE: Tier D ONLY — pipeline must check tier before calling.
// ============================================================================

export interface BackwardCitation {
  opinionId: number;
  caseName: string;
  court: string;
  dateFiled: string;
  citation: string;
  depth: number;
}

/**
 * Get backward citations — cases that the given opinion cites.
 *
 * CRITICAL (D9-017 / ST-D9R2-01): Uses `?cited_opinion` parameter,
 * NOT `?citing_opinion`. The difference:
 * - cited_opinion: returns cases where our case IS THE ONE CITING them (backward)
 * - citing_opinion: returns cases that cite our case (forward)
 *
 * @param opinionId - CourtListener opinion ID
 * @param tier - Motion tier. MUST be 'D' — other tiers skip backward analysis.
 */
export async function getBackwardCitations(
  opinionId: string,
  tier: string
): Promise<{ success: boolean; data?: BackwardCitation[]; error?: string }> {
  // BINDING (D9-017): Tier D ONLY
  if (tier !== 'D') {
    return { success: true, data: [] };
  }

  // CORRECT: ?cited_opinion returns BACKWARD citations (what our case cites)
  const result = await makeRequest<{
    results: Array<{
      id: number;
      case_name?: string;
      court?: string;
      court_id?: string;
      date_filed?: string;
      citations?: Array<{ volume: number; reporter: string; page: number }>;
      depth?: number;
    }>;
    count: number;
  }>(`/search/?type=o&cited_opinion=${opinionId}&page_size=50`);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data || result.data.count === 0) {
    return { success: true, data: [] };
  }

  const citations: BackwardCitation[] = result.data.results.map(op => {
    let citationStr = '';
    if (op.citations && op.citations.length > 0) {
      const c = op.citations[0];
      citationStr = `${c.volume} ${c.reporter} ${c.page}`;
    }

    return {
      opinionId: op.id,
      caseName: op.case_name || 'Unknown',
      court: op.court || op.court_id || 'Unknown',
      dateFiled: op.date_filed || '',
      citation: citationStr,
      depth: op.depth || 0,
    };
  });

  return { success: true, data: citations };
}
