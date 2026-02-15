/**
 * Judge Profile Lookup via CourtListener
 * Fetches and caches judge profile data for Phase VII simulation.
 *
 * Uses the CourtListener /v4/people/ endpoint to search for judges
 * and assembles full profiles from related endpoints (positions,
 * educations, political affiliations, ABA ratings).
 *
 * BATCH_11_JUDGE_LOOKUP — ST-006
 */

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getCourtListenerAPIKey } from '@/lib/api-keys';
import { resolveCourtId } from './court-id-map';
import type { JudgeLookupResult, JudgeProfile, JudgeCandidate, JudgeEducation, JudgePosition } from '@/lib/citation/types';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('judge-lookup');

const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4';
const CACHE_TTL_DAYS = 7;
const REQUEST_DELAY_MS = 250; // Per ST-012: serialize with delays to avoid rate limit bursts
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Get auth header for CL API requests.
 * Uses the same key resolution as the citation client.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const dbToken = await getCourtListenerAPIKey();
  if (dbToken) {
    return { Authorization: `Token ${dbToken}` };
  }

  const envKey = process.env.COURTLISTENER_API_KEY;
  if (envKey) {
    return { Authorization: `Token ${envKey}` };
  }

  const envToken = process.env.COURTLISTENER_API_TOKEN;
  if (envToken) {
    return { Authorization: `Token ${envToken}` };
  }

  throw new Error('[JudgeLookup] No CourtListener API key configured');
}

/**
 * Make a GET request to a CL v4 endpoint with retry logic.
 */
async function clGet<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  const authHeader = await getAuthHeader();

  const url = new URL(`${COURTLISTENER_BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = BACKOFF_BASE_MS * Math.pow(2, attempt);
          log.warn(`[JudgeLookup] Rate limited, waiting ${waitTime}ms`);
          await delay(waitTime);
          continue;
        }
        if (response.status === 404) {
          return { results: [] } as unknown as T;
        }
        throw new Error(`CL API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await delay(BACKOFF_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a Supabase client with service_role for cache writes.
 * Follows the same pattern as lib/inngest/functions.ts.
 */
function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('[JudgeLookup] Supabase environment variables not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Retrieve a cached judge profile if it exists and hasn't expired.
 */
async function getCachedProfile(clPersonId: number): Promise<JudgeProfile | null> {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from('judge_profiles_cache')
      .select('profile_json, expires_at')
      .eq('cl_person_id', clPersonId)
      .single();

    if (data && new Date(data.expires_at) > new Date()) {
      return data.profile_json as JudgeProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write a judge profile to cache using service_role.
 */
async function cacheProfile(clPersonId: number, profile: JudgeProfile): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    await supabase.from('judge_profiles_cache').upsert({
      cl_person_id: clPersonId,
      profile_json: profile,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    log.warn('[JudgeLookup] Failed to cache profile:', error);
  }
}

// ============================================================================
// CL DATA FETCHERS (serialized with 250ms delays per ST-012)
// ============================================================================

interface CLPaginatedResponse<T> {
  count: number;
  results: T[];
}

async function fetchPositions(personId: number): Promise<JudgePosition[]> {
  try {
    const response = await clGet<CLPaginatedResponse<Record<string, unknown>>>(
      '/positions/',
      { person: personId }
    );
    return (response.results || []).map((p) => ({
      court: (p.court as string) || '',
      title: (p.job_title as string) || '',
      startDate: (p.date_start as string) || null,
      endDate: (p.date_termination as string) || null,
      isCurrent: !p.date_termination,
    }));
  } catch {
    return [];
  }
}

async function fetchEducations(personId: number): Promise<JudgeEducation[]> {
  try {
    const response = await clGet<CLPaginatedResponse<Record<string, unknown>>>(
      '/educations/',
      { person: personId }
    );
    return (response.results || []).map((e) => ({
      school: ((e.school as Record<string, unknown>)?.name as string) || '',
      degree: (e.degree_detail as string) || (e.degree_level as string) || '',
      year: (e.degree_year as number) || null,
    }));
  } catch {
    return [];
  }
}

async function fetchPoliticalAffiliations(personId: number): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await clGet<CLPaginatedResponse<Record<string, unknown>>>(
      '/political-affiliations/',
      { person: personId }
    );
    return response.results || [];
  } catch {
    return [];
  }
}

async function fetchAbaRatings(personId: number): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await clGet<CLPaginatedResponse<Record<string, unknown>>>(
      '/aba-ratings/',
      { person: personId }
    );
    return response.results || [];
  } catch {
    return [];
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Look up a judge by name and court.
 * Returns cached data if available, otherwise fetches from CourtListener.
 */
export async function lookupJudge(
  judgeName: string,
  courtName: string,
  district?: string
): Promise<JudgeLookupResult> {
  const courtId = resolveCourtId(courtName, district);

  if (!courtId) {
    return {
      status: 'NOT_FOUND',
      profile: null,
      candidates: null,
      source: 'courtlistener',
      lookupTimestamp: new Date().toISOString(),
    };
  }

  try {
    // Search for judge in CL people database
    const response = await clGet<CLPaginatedResponse<Record<string, unknown>>>(
      '/people/',
      {
        name: normalizeJudgeName(judgeName),
        court: courtId,
        is_judge: true,
      }
    );

    const results = response.results || [];

    if (results.length === 0) {
      return {
        status: 'NOT_FOUND',
        profile: null,
        candidates: null,
        source: 'courtlistener',
        lookupTimestamp: new Date().toISOString(),
      };
    }

    if (results.length === 1) {
      // Single match - fetch full profile
      const profile = await assembleFullProfile(results[0].id as number);

      // Cache the profile
      await cacheProfile(results[0].id as number, profile);

      return {
        status: 'FOUND',
        profile,
        candidates: null,
        source: 'courtlistener',
        lookupTimestamp: new Date().toISOString(),
      };
    }

    // Multiple matches - return candidates for disambiguation
    const candidates: JudgeCandidate[] = results.slice(0, 10).map((r) => ({
      clPersonId: r.id as number,
      name: (r.name_full as string) || (r.name as string) || '',
      court: (r.court as string) || courtName,
      confidenceScore: calculateConfidence(
        judgeName,
        (r.name_full as string) || (r.name as string) || '',
        courtId,
        (r.court as string) || ''
      ),
    }));

    // Sort by confidence
    candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // If top candidate has high confidence, use it
    if (candidates[0].confidenceScore >= 0.8) {
      const profile = await assembleFullProfile(candidates[0].clPersonId);
      await cacheProfile(candidates[0].clPersonId, profile);

      return {
        status: 'FOUND',
        profile,
        candidates,
        source: 'courtlistener',
        lookupTimestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'MULTIPLE',
      profile: null,
      candidates,
      source: 'courtlistener',
      lookupTimestamp: new Date().toISOString(),
    };
  } catch (error) {
    log.error('[JudgeLookup] Error:', error);
    return {
      status: 'ERROR',
      profile: null,
      candidates: null,
      source: 'courtlistener',
      lookupTimestamp: new Date().toISOString(),
    };
  }
}

/**
 * Assemble full judge profile from CL endpoints.
 * SERIALIZED with 250ms delays to avoid rate limit bursts (per ST-012).
 */
export async function assembleFullProfile(clPersonId: number): Promise<JudgeProfile> {
  // Check cache first
  const cached = await getCachedProfile(clPersonId);
  if (cached) {
    return cached;
  }

  // Fetch base person data
  const person = await clGet<Record<string, unknown>>(`/people/${clPersonId}/`);

  // Fetch related data SERIALLY with delays (per ST-012)
  await delay(REQUEST_DELAY_MS);
  const positions = await fetchPositions(clPersonId);

  await delay(REQUEST_DELAY_MS);
  const educations = await fetchEducations(clPersonId);

  await delay(REQUEST_DELAY_MS);
  const affiliations = await fetchPoliticalAffiliations(clPersonId);

  await delay(REQUEST_DELAY_MS);
  const abaRatings = await fetchAbaRatings(clPersonId);

  return {
    clPersonId,
    name: (person.name_full as string) || `${person.name_first} ${person.name_last}`,
    title: positions[0]?.title || 'Judge',
    court: positions[0]?.court || 'Unknown',
    appointedBy: (person.appointed_by as string) || null,
    politicalAffiliation: (affiliations[0]?.political_party as string) || null,
    abaRating: (abaRatings[0]?.rating as string) || null,
    educations,
    positions,
    notableRulings: [], // Would require separate opinion search
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Strip common judicial title prefixes from a name for search.
 */
function normalizeJudgeName(name: string): string {
  return name
    .replace(/^(Hon\.|Judge|Justice|Chief Justice|Magistrate)\s+/i, '')
    .trim();
}

/**
 * Calculate confidence score for a judge match.
 * Combines name similarity and court match.
 */
function calculateConfidence(
  searchName: string,
  resultName: string,
  searchCourt: string,
  resultCourt: string
): number {
  let score = 0;

  // Name match
  const searchLower = searchName.toLowerCase();
  const resultLower = resultName.toLowerCase();

  if (resultLower === searchLower) {
    score += 0.5;
  } else if (resultLower.includes(searchLower) || searchLower.includes(resultLower)) {
    score += 0.3;
  } else {
    // Last name match
    const searchLast = searchLower.split(' ').pop() || '';
    const resultLast = resultLower.split(' ').pop() || '';
    if (searchLast === resultLast) {
      score += 0.2;
    }
  }

  // Court match
  if (searchCourt === resultCourt) {
    score += 0.5;
  } else if (resultCourt?.includes(searchCourt) || searchCourt?.includes(resultCourt)) {
    score += 0.3;
  }

  return Math.min(1, score);
}
