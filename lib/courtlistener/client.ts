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
 */

import { getCourtListenerAPIKey } from '@/lib/api-keys';
import { CourtListenerOpinion, CourtListenerSearchResult, CourtListenerCitingOpinion } from './types';

const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4';
const COURTLISTENER_V3_URL = 'https://www.courtlistener.com/api/rest/v3';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s exponential backoff

interface RequestOptions {
  timeout?: number;
  retries?: number;
}

/**
 * Get API token from database or environment
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getCourtListenerAPIKey();
  if (token) {
    return { Authorization: `Token ${token}` };
  }
  // Fallback to env var for backwards compatibility
  const envToken = process.env.COURTLISTENER_API_TOKEN;
  if (envToken) {
    return { Authorization: `Token ${envToken}` };
  }
  return {};
}

/**
 * Make a request with retry logic
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${COURTLISTENER_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status === 404) {
          return { success: true, data: undefined }; // Not found is valid result
        }

        throw new Error(`CourtListener API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
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
