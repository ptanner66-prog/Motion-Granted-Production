/**
 * Case.law API Client
 *
 * Fallback source for citation verification.
 * Harvard Law School's collection of digitized case law.
 *
 * API Documentation: https://case.law/api/
 * Coverage: Excellent historical coverage, all state and federal courts
 */

const CASELAW_BASE_URL = 'https://api.case.law/v1';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

/**
 * Case.law case object
 */
export interface CaseLawCase {
  id: number;
  url: string;
  name: string;
  name_abbreviation: string;
  decision_date: string;
  docket_number: string;
  first_page: string;
  last_page: string;
  citations: Array<{
    cite: string;
    type: string;
  }>;
  volume: {
    url: string;
    volume_number: string;
    barcode: string;
  };
  reporter: {
    url: string;
    full_name: string;
    id: number;
  };
  court: {
    url: string;
    id: number;
    slug: string;
    name: string;
    name_abbreviation: string;
  };
  jurisdiction: {
    url: string;
    id: number;
    slug: string;
    name: string;
    name_long: string;
    whitelisted: boolean;
  };
  cites_to?: Array<{
    cite: string;
    case_ids: number[];
  }>;
  frontend_url?: string;
  preview?: string[];
}

/**
 * Search result wrapper
 */
export interface CaseLawSearchResult {
  found: boolean;
  cases: CaseLawCase[];
  count: number;
}

interface RequestOptions {
  timeout?: number;
  retries?: number;
}

/**
 * Get API key from environment (optional for higher rate limits)
 */
function getAuthHeader(): Record<string, string> {
  const apiKey = process.env.CASELAW_API_KEY;
  if (apiKey) {
    return { Authorization: `Token ${apiKey}` };
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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${CASELAW_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
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
          return { success: true, data: undefined };
        }

        throw new Error(`Case.law API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Request timeout');
      }

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
 * Search for cases by citation
 */
export async function searchByCitation(
  citation: string
): Promise<{ success: boolean; data?: CaseLawSearchResult; error?: string }> {
  const encodedCitation = encodeURIComponent(citation);

  const result = await makeRequest<{ results: CaseLawCase[]; count: number }>(
    `/cases/?cite=${encodedCitation}`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data || result.data.count === 0) {
    return {
      success: true,
      data: {
        found: false,
        cases: [],
        count: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      found: true,
      cases: result.data.results,
      count: result.data.count,
    },
  };
}

/**
 * Search for cases by case name
 */
export async function searchByCaseName(
  caseName: string
): Promise<{ success: boolean; data?: CaseLawSearchResult; error?: string }> {
  const encodedName = encodeURIComponent(caseName);

  const result = await makeRequest<{ results: CaseLawCase[]; count: number }>(
    `/cases/?search=${encodedName}`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data || result.data.count === 0) {
    return {
      success: true,
      data: {
        found: false,
        cases: [],
        count: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      found: true,
      cases: result.data.results,
      count: result.data.count,
    },
  };
}

/**
 * Get case by ID with full text
 */
export async function getCaseById(
  caseId: number | string,
  includeText: boolean = false
): Promise<{ success: boolean; data?: CaseLawCase & { casebody?: { data: { opinions: Array<{ text: string; type: string; author: string }> } } }; error?: string }> {
  let endpoint = `/cases/${caseId}/`;
  if (includeText) {
    endpoint += '?full_case=true';
  }

  return makeRequest(endpoint);
}

/**
 * Search cases within a specific jurisdiction
 */
export async function searchByJurisdiction(
  jurisdiction: string,
  caseName?: string,
  citation?: string
): Promise<{ success: boolean; data?: CaseLawSearchResult; error?: string }> {
  let endpoint = `/cases/?jurisdiction=${encodeURIComponent(jurisdiction)}`;

  if (caseName) {
    endpoint += `&search=${encodeURIComponent(caseName)}`;
  }
  if (citation) {
    endpoint += `&cite=${encodeURIComponent(citation)}`;
  }

  const result = await makeRequest<{ results: CaseLawCase[]; count: number }>(endpoint);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      found: (result.data?.count || 0) > 0,
      cases: result.data?.results || [],
      count: result.data?.count || 0,
    },
  };
}

/**
 * Get case text (opinion content)
 */
export async function getCaseText(
  caseId: number | string
): Promise<{
  success: boolean;
  data?: {
    opinions: Array<{
      text: string;
      type: string;
      author: string;
    }>;
  };
  error?: string;
}> {
  const result = await getCaseById(caseId, true);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.data?.casebody?.data?.opinions) {
    return {
      success: true,
      data: { opinions: [] },
    };
  }

  return {
    success: true,
    data: {
      opinions: result.data.casebody.data.opinions,
    },
  };
}

/**
 * Verify citation exists in Case.law
 * Returns normalized data for VPI storage
 */
export async function verifyCitationExists(
  citation: string,
  caseName?: string
): Promise<{
  success: boolean;
  data?: {
    exists: boolean;
    caselawId?: string;
    caselawUrl?: string;
    caseName?: string;
    court?: string;
    jurisdiction?: string;
    year?: number;
    dateDecided?: string;
  };
  error?: string;
}> {
  // First try citation search
  const citationResult = await searchByCitation(citation);

  if (citationResult.success && citationResult.data?.found && citationResult.data.cases.length > 0) {
    const caseData = citationResult.data.cases[0];
    return {
      success: true,
      data: {
        exists: true,
        caselawId: String(caseData.id),
        caselawUrl: caseData.frontend_url || caseData.url,
        caseName: caseData.name,
        court: caseData.court?.name,
        jurisdiction: caseData.jurisdiction?.name,
        year: caseData.decision_date ? new Date(caseData.decision_date).getFullYear() : undefined,
        dateDecided: caseData.decision_date,
      },
    };
  }

  // Fallback: try case name search
  if (caseName) {
    const nameResult = await searchByCaseName(caseName);

    if (nameResult.success && nameResult.data?.found && nameResult.data.cases.length > 0) {
      const caseData = nameResult.data.cases[0];
      return {
        success: true,
        data: {
          exists: true,
          caselawId: String(caseData.id),
          caselawUrl: caseData.frontend_url || caseData.url,
          caseName: caseData.name,
          court: caseData.court?.name,
          jurisdiction: caseData.jurisdiction?.name,
          year: caseData.decision_date ? new Date(caseData.decision_date).getFullYear() : undefined,
          dateDecided: caseData.decision_date,
        },
      };
    }
  }

  // Not found
  return {
    success: true,
    data: {
      exists: false,
    },
  };
}

/**
 * Get citing cases (cases that cite a given case)
 */
export async function getCitingCases(
  caseId: number | string,
  limit: number = 100
): Promise<{
  success: boolean;
  data?: {
    citingCases: CaseLawCase[];
    count: number;
  };
  error?: string;
}> {
  const result = await makeRequest<{ results: CaseLawCase[]; count: number }>(
    `/cases/?cites_to=${caseId}&page_size=${limit}`
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      citingCases: result.data?.results || [],
      count: result.data?.count || 0,
    },
  };
}

/**
 * Jurisdiction slug mappings
 */
export const JURISDICTION_SLUGS: Record<string, string> = {
  federal: 'us',
  'supreme-court': 'us',
  california: 'cal',
  texas: 'tex',
  'new-york': 'ny',
  florida: 'fla',
  illinois: 'ill',
  pennsylvania: 'pa',
  ohio: 'ohio',
  georgia: 'ga',
  michigan: 'mich',
  'north-carolina': 'nc',
  'new-jersey': 'nj',
  virginia: 'va',
  washington: 'wash',
  arizona: 'ariz',
  massachusetts: 'mass',
  tennessee: 'tenn',
  indiana: 'ind',
  missouri: 'mo',
  maryland: 'md',
  wisconsin: 'wis',
  colorado: 'colo',
  minnesota: 'minn',
  'south-carolina': 'sc',
  alabama: 'ala',
  louisiana: 'la',
  kentucky: 'ky',
  oregon: 'or',
  oklahoma: 'okla',
  connecticut: 'conn',
  iowa: 'iowa',
  mississippi: 'miss',
  arkansas: 'ark',
  utah: 'utah',
  nevada: 'nev',
  kansas: 'kan',
  'new-mexico': 'nm',
  nebraska: 'neb',
  'west-virginia': 'wva',
  idaho: 'idaho',
  hawaii: 'haw',
  'new-hampshire': 'nh',
  maine: 'me',
  'rhode-island': 'ri',
  montana: 'mont',
  delaware: 'del',
  'south-dakota': 'sd',
  'north-dakota': 'nd',
  alaska: 'alaska',
  vermont: 'vt',
  'district-of-columbia': 'dc',
  wyoming: 'wyo',
};
