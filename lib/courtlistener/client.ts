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

const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4';
const COURTLISTENER_V3_URL = 'https://www.courtlistener.com/api/rest/v3';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
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

    console.log(`[CourtListener] Rate limit reached, waiting ${waitTime}ms...`);
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
    console.warn('[CourtListener] Using legacy COURTLISTENER_API_TOKEN - consider migrating to COURTLISTENER_API_KEY');
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
      console.log(`[CourtListener] API key configured (db): ${dbToken.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    // 2. Check COURTLISTENER_API_KEY (Vercel standard)
    const envKey = process.env.COURTLISTENER_API_KEY;
    if (envKey) {
      console.log(`[CourtListener] API key configured (COURTLISTENER_API_KEY): ${envKey.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    // 3. Legacy fallback: COURTLISTENER_API_TOKEN
    const envToken = process.env.COURTLISTENER_API_TOKEN;
    if (envToken) {
      console.log(`[CourtListener] API key configured (legacy COURTLISTENER_API_TOKEN): ${envToken.substring(0, 8)}... ✓`);
      return { configured: true };
    }

    const error = 'COURTLISTENER_API_KEY not set. Get a free key at https://www.courtlistener.com/api/rest-info/';
    console.error(`[CourtListener] FATAL: ${error}`);
    return { configured: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Failed to check API key';
    return { configured: false, error };
  }
}

/**
 * Make a request with retry logic and rate limiting
 */
async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES } = options;
  const authHeader = await getAuthHeader();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Wait for rate limit before making request
      await waitForRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fullUrl = `${COURTLISTENER_BASE_URL}${endpoint}`;
      console.log(`[makeRequest] API call: ${fullUrl.substring(0, 150)}...`);
      console.log(`[makeRequest] Auth header present: ${!!authHeader.Authorization}`);
      console.log(`[makeRequest] Auth header prefix: ${authHeader.Authorization?.substring(0, 15)}...`);

      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`[makeRequest] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Log error response body for debugging
        const errorBody = await response.text();
        console.error(`[makeRequest] ❌ HTTP ${response.status} error body: ${errorBody.substring(0, 500)}`);

        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
          console.log(`[makeRequest] Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status === 404) {
          console.log(`[makeRequest] 404 Not Found - returning empty result`);
          return { success: true, data: undefined }; // Not found is valid result
        }

        throw new Error(`CourtListener API error: ${response.status} ${response.statusText} - ${errorBody.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log(`[makeRequest] ✓ Success - received ${JSON.stringify(data).length} bytes`);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await fetch(`${COURTLISTENER_V3_URL}/citation-lookup/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...authHeader,
        },
        body: `text=${encodeURIComponent(citationText)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
 */
export async function searchByCitation(
  citation: string
): Promise<{ success: boolean; data?: CourtListenerSearchResult; error?: string }> {
  // URL encode the citation
  const encodedCitation = encodeURIComponent(citation);

  const result = await makeRequest<{ results: CourtListenerOpinion[]; count: number }>(
    `/opinions/?citation=${encodedCitation}`
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
  // PRIMARY METHOD: Use v3 citation-lookup endpoint (designed for hallucination detection)
  const lookupResult = await lookupCitation(citation);

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

  if (citationResult.success && citationResult.data?.found && citationResult.data.opinions.length > 0) {
    const opinion = citationResult.data.opinions[0];
    return {
      success: true,
      data: {
        exists: true,
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

    if (nameResult.success && nameResult.data?.found && nameResult.data.opinions.length > 0) {
      const opinion = nameResult.data.opinions[0];
      return {
        success: true,
        data: {
          exists: true,
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

  // Not found in any source
  return {
    success: true,
    data: {
      exists: false,
    },
  };
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
}

/**
 * Search opinions by query with jurisdiction filter
 *
 * This is the PRIMARY method for Phase IV to find real citations.
 * Instead of Claude generating citations, we search CourtListener first.
 *
 * @param query - Search query (e.g., "discovery compel Louisiana")
 * @param jurisdiction - Court filter (e.g., "la" for Louisiana)
 * @param limit - Max results to return
 */
export async function searchOpinions(
  query: string,
  jurisdiction?: string,
  limit: number = 20
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
  try {
    // Build search endpoint
    let endpoint = `/search/?q=${encodeURIComponent(query)}&type=o`;

    // Add jurisdiction filter if provided
    const courtCode = jurisdiction ? mapJurisdictionToCourtCode(jurisdiction) : null;
    if (courtCode) {
      endpoint += `&court=${courtCode}`;
    }

    endpoint += `&page_size=${limit}`;

    // DIAGNOSTIC LOGGING
    console.log(`╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  [searchOpinions] DEBUG                                      ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝`);
    console.log(`[searchOpinions] Query: "${query}"`);
    console.log(`[searchOpinions] Jurisdiction input: "${jurisdiction}"`);
    console.log(`[searchOpinions] Mapped court codes: "${courtCode}"`);
    console.log(`[searchOpinions] Full endpoint: ${endpoint}`);
    console.log(`[searchOpinions] Full URL: ${COURTLISTENER_BASE_URL}${endpoint}`);

    const result = await makeRequest<{
      count: number;
      results: Array<{
        id: number;
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
      }>;
    }>(endpoint);

    // DIAGNOSTIC: Log raw API response
    console.log(`[searchOpinions] API call success: ${result.success}`);
    console.log(`[searchOpinions] API error: ${result.error || 'none'}`);
    console.log(`[searchOpinions] Raw count: ${result.data?.count ?? 'undefined'}`);
    console.log(`[searchOpinions] Results array length: ${result.data?.results?.length ?? 'undefined'}`);

    if (!result.success) {
      console.error(`[searchOpinions] ❌ API CALL FAILED: ${result.error}`);
      return { success: false, error: result.error };
    }

    if (!result.data || result.data.count === 0) {
      console.log(`[searchOpinions] ⚠️ ZERO RESULTS returned for query: "${query}"`);
      console.log(`[searchOpinions] Full response data:`, JSON.stringify(result.data, null, 2));
      return {
        success: true,
        data: { opinions: [], total_count: 0 },
      };
    }

    // Transform results to consistent format
    const opinions = result.data.results.map(op => {
      // Build citation string from citation array
      let citationStr = '';
      if (op.citations && op.citations.length > 0) {
        const c = op.citations[0];
        citationStr = `${c.volume} ${c.reporter} ${c.page}`;
      } else if (op.citation && op.citation.length > 0) {
        citationStr = op.citation[0];
      }

      return {
        id: op.id,
        cluster_id: op.cluster_id || op.id,
        case_name: op.caseName || op.case_name || 'Unknown Case',
        citation: citationStr,
        court: op.court || op.court_id || 'Unknown Court',
        date_filed: op.dateFiled || op.date_filed || '',
        snippet: op.snippet || '',
        absolute_url: op.absolute_url || '',
        precedential_status: op.precedential_status || 'Unknown',
      };
    });

    console.log(`[CourtListener] Found ${opinions.length} opinions for query: "${query}"`);

    return {
      success: true,
      data: {
        opinions,
        total_count: result.data.count,
      },
    };
  } catch (error) {
    console.error('[CourtListener] Search error:', error);
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

  // Louisiana courts - FIXED: was using invalid 'lasc', now using correct codes
  if (normalized.includes('louisiana') || normalized === 'la') {
    // la = Supreme Court, lactapp = Court of Appeal, ca5 = Fifth Circuit
    return 'la,lactapp,ca5';
  }

  // California courts
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
    console.log(`[CourtListener] Fetching opinion text for ID: ${opinionId}`);

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
    console.error('[CourtListener] Get opinion text error:', error);
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
export async function buildVerifiedCitationBank(
  queries: Array<{
    query: string;
    forElement: string;
    jurisdiction: string;
  }>,
  minCitationsPerElement: number = 2
): Promise<{
  success: boolean;
  data?: {
    citations: VerifiedCitation[];
    totalVerified: number;
    searchesPerformed: number;
    elementsWithCitations: number;
  };
  error?: string;
}> {
  // COMPREHENSIVE DIAGNOSTIC LOGGING
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  buildVerifiedCitationBank - DEBUG                          ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`[buildVerifiedCitationBank] Total queries received: ${queries.length}`);
  console.log(`[buildVerifiedCitationBank] Min citations per element: ${minCitationsPerElement}`);
  console.log(`[buildVerifiedCitationBank] API Key present: ${!!process.env.COURTLISTENER_API_KEY}`);
  if (process.env.COURTLISTENER_API_KEY) {
    console.log(`[buildVerifiedCitationBank] API Key prefix: ${process.env.COURTLISTENER_API_KEY.substring(0, 8)}...`);
  }

  // Log sample queries
  console.log(`[buildVerifiedCitationBank] Sample queries:`);
  for (let i = 0; i < Math.min(3, queries.length); i++) {
    const q = queries[i];
    console.log(`  [${i}] query="${q.query.substring(0, 60)}..." element="${q.forElement}" jurisdiction="${q.jurisdiction}"`);
  }
  if (queries.length > 3) {
    console.log(`  ... and ${queries.length - 3} more queries`);
  }

  const citations: VerifiedCitation[] = [];
  let searchesPerformed = 0;
  const elementCoverage = new Set<string>();

  console.log(`[buildVerifiedCitationBank] Starting search loop...`);

  for (const queryInfo of queries) {
    try {
      // Search CourtListener
      const searchResult = await searchOpinions(
        queryInfo.query,
        queryInfo.jurisdiction,
        minCitationsPerElement * 2 // Get extra in case some don't have holdings
      );

      searchesPerformed++;

      if (!searchResult.success || !searchResult.data?.opinions.length) {
        console.log(`[CourtListener] No results for: "${queryInfo.query}"`);
        continue;
      }

      // Take top results for this element
      const topOpinions = searchResult.data.opinions.slice(0, minCitationsPerElement);

      for (const opinion of topOpinions) {
        // CRITICAL: Validate that CourtListener returned an ID
        // This is the source of truth - if no ID here, it's a CourtListener issue
        if (!opinion.id) {
          console.error(`[CourtListener] ❌ SKIPPING opinion with NO ID: "${opinion.case_name?.substring(0, 50)}..."`);
          console.error(`[CourtListener] Full opinion object:`, JSON.stringify(opinion, null, 2));
          continue; // Skip this one - cannot verify without ID
        }

        // Skip if we already have this citation
        if (citations.some(c => c.courtlistener_id === opinion.id)) {
          console.log(`[CourtListener] Skipping duplicate: id=${opinion.id}`);
          continue;
        }

        console.log(`[CourtListener] ✓ Adding citation: id=${opinion.id}, name="${opinion.case_name?.substring(0, 40)}..."`);

        const verifiedCitation: VerifiedCitation = {
          caseName: opinion.case_name,
          citation: opinion.citation || `${opinion.case_name}`,
          courtlistener_id: opinion.id,  // GUARANTEED to exist - we checked above
          courtlistener_cluster_id: opinion.cluster_id || opinion.id,
          verification_timestamp: new Date().toISOString(),
          verification_method: 'search',
          court: opinion.court,
          date_filed: opinion.date_filed,
          forElement: queryInfo.forElement,
          proposition: '', // To be filled by Claude in Phase IV
          relevantHolding: opinion.snippet || '', // Search snippet as initial holding
          authorityLevel: determineAuthorityLevel(opinion.court, queryInfo.jurisdiction),
        };

        citations.push(verifiedCitation);
        elementCoverage.add(queryInfo.forElement);
      }
    } catch (error) {
      console.error(`[CourtListener] Error searching for element "${queryInfo.forElement}":`, error);
      // Continue with other elements
    }
  }

  console.log(`[CourtListener] ═══════════════════════════════════════════════════════`);
  console.log(`[CourtListener] Citation bank complete: ${citations.length} citations covering ${elementCoverage.size} elements`);

  // FINAL VALIDATION: Ensure every citation has courtlistener_id
  const citationsWithoutId = citations.filter(c => !c.courtlistener_id);
  if (citationsWithoutId.length > 0) {
    console.error(`[CourtListener] ❌ FATAL: ${citationsWithoutId.length} citations missing courtlistener_id!`);
    // Remove invalid citations
    const validCitations = citations.filter(c => c.courtlistener_id);
    console.log(`[CourtListener] Filtered to ${validCitations.length} valid citations with IDs`);

    return {
      success: validCitations.length > 0,
      data: {
        citations: validCitations,
        totalVerified: validCitations.length,
        searchesPerformed,
        elementsWithCitations: elementCoverage.size,
      },
      error: citationsWithoutId.length > 0
        ? `Filtered out ${citationsWithoutId.length} citations without IDs`
        : undefined,
    };
  }

  console.log(`[CourtListener] ✓ All ${citations.length} citations have courtlistener_id`);

  return {
    success: true,
    data: {
      citations,
      totalVerified: citations.length,
      searchesPerformed,
      elementsWithCitations: elementCoverage.size,
    },
  };
}

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
