/**
 * CourtListener Judge Lookup
 *
 * Fetches judge profile data from CourtListener's People API.
 * Used in Phase VII (Judge Simulation) to build judicial profiles
 * for writing style and ruling tendency analysis.
 *
 * SERIALIZED fetches with 250ms delays between each call to avoid
 * micro-burst rate limiting when combined with concurrent citation verification.
 *
 * @version BATCH_11
 */

import { getCourtListenerAPIKey } from '@/lib/api-keys';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('courtlistener-judge-lookup');

const COURTLISTENER_BASE_URL = 'https://www.courtlistener.com/api/rest/v4';
const DEFAULT_TIMEOUT = 30000; // 30s per endpoint

// ============================================================================
// TYPES
// ============================================================================

export interface JudgePosition {
  id: number;
  court: string;
  court_full_name?: string;
  position_type?: string;
  date_start?: string;
  date_termination?: string;
  appointer?: string;
  supervisor?: string;
  how_selected?: string;
}

export interface JudgeEducation {
  id: number;
  school: string;
  degree_level?: string;
  degree_detail?: string;
  degree_year?: number;
}

export interface PoliticalAffiliation {
  id: number;
  political_party?: string;
  source?: string;
  date_start?: string;
  date_end?: string;
}

export interface AbaRating {
  id: number;
  rating: string;
  year_rated?: number;
}

export interface JudgeProfile {
  personId: number;
  positions: JudgePosition[];
  educations: JudgeEducation[];
  politicalAffiliations: PoliticalAffiliation[];
  abaRatings: AbaRating[];
  fetchedAt: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

async function createAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = await getCourtListenerAPIKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Token ${apiKey}`;
  }
  return headers;
}

async function fetchFromCL<T>(url: string, label: string): Promise<T[]> {
  const headers = await createAuthHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn(`[JudgeLookup] ${label} returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`[JudgeLookup] ${label} failed: ${msg}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// INDIVIDUAL FETCH FUNCTIONS
// ============================================================================

async function fetchPositions(personId: number): Promise<JudgePosition[]> {
  const url = `${COURTLISTENER_BASE_URL}/positions/?person=${personId}&page_size=20`;
  return fetchFromCL<JudgePosition>(url, `positions for person ${personId}`);
}

async function fetchEducations(personId: number): Promise<JudgeEducation[]> {
  const url = `${COURTLISTENER_BASE_URL}/educations/?person=${personId}&page_size=20`;
  return fetchFromCL<JudgeEducation>(url, `educations for person ${personId}`);
}

async function fetchPoliticalAffiliations(personId: number): Promise<PoliticalAffiliation[]> {
  const url = `${COURTLISTENER_BASE_URL}/political-affiliations/?person=${personId}&page_size=20`;
  return fetchFromCL<PoliticalAffiliation>(url, `affiliations for person ${personId}`);
}

async function fetchAbaRatings(personId: number): Promise<AbaRating[]> {
  const url = `${COURTLISTENER_BASE_URL}/aba-ratings/?person=${personId}&page_size=20`;
  return fetchFromCL<AbaRating>(url, `ABA ratings for person ${personId}`);
}

// ============================================================================
// MAIN ASSEMBLY FUNCTION
// ============================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Assemble a full judge profile from CourtListener.
 *
 * SERIALIZED with 250ms spacing between calls (NOT parallel Promise.all)
 * to avoid micro-burst rate limiting when combined with concurrent
 * citation verification requests.
 *
 * Total expected time: 4 API calls + 750ms delays < 2 seconds
 */
export async function assembleFullProfile(clPersonId: number): Promise<JudgeProfile> {
  log.info(`[JudgeLookup] Assembling profile for person ${clPersonId}`);
  const startTime = Date.now();

  // SERIALIZED with 250ms spacing (NOT parallel Promise.all)
  const positions = await fetchPositions(clPersonId);
  await delay(250);
  const educations = await fetchEducations(clPersonId);
  await delay(250);
  const politicalAffiliations = await fetchPoliticalAffiliations(clPersonId);
  await delay(250);
  const abaRatings = await fetchAbaRatings(clPersonId);

  const duration = Date.now() - startTime;
  log.info(
    `[JudgeLookup] Profile assembled for person ${clPersonId} in ${duration}ms: ` +
    `${positions.length} positions, ${educations.length} educations, ` +
    `${politicalAffiliations.length} affiliations, ${abaRatings.length} ratings`
  );

  return {
    personId: clPersonId,
    positions,
    educations,
    politicalAffiliations,
    abaRatings,
    fetchedAt: new Date().toISOString(),
  };
}
