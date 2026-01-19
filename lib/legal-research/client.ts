/**
 * Legal Research API Client
 * Handles integration with Westlaw and LexisNexis
 */

import type {
  LegalResearchConfig,
  CaseSearchParams,
  CaseResult,
  LegalResearchResponse,
  CitationCheckResult,
} from './types';

// Get config from environment or database
export async function getLegalResearchConfig(): Promise<LegalResearchConfig> {
  // Check environment variables first
  const westlawKey = process.env.WESTLAW_API_KEY;
  const lexisKey = process.env.LEXISNEXIS_API_KEY;

  if (westlawKey && !westlawKey.includes('xxxxx')) {
    return {
      provider: 'westlaw',
      apiKey: westlawKey,
      clientId: process.env.WESTLAW_CLIENT_ID,
      baseUrl: process.env.WESTLAW_BASE_URL || 'https://api.westlaw.com/v1',
      enabled: true,
    };
  }

  if (lexisKey && !lexisKey.includes('xxxxx')) {
    return {
      provider: 'lexisnexis',
      apiKey: lexisKey,
      clientId: process.env.LEXISNEXIS_CLIENT_ID,
      baseUrl: process.env.LEXISNEXIS_BASE_URL || 'https://api.lexisnexis.com/v1',
      enabled: true,
    };
  }

  return {
    provider: 'none',
    enabled: false,
  };
}

export function isLegalResearchConfigured(): boolean {
  const westlawKey = process.env.WESTLAW_API_KEY;
  const lexisKey = process.env.LEXISNEXIS_API_KEY;

  return (
    (!!westlawKey && !westlawKey.includes('xxxxx')) ||
    (!!lexisKey && !lexisKey.includes('xxxxx'))
  );
}

/**
 * Search for relevant case law
 */
export async function searchCases(
  params: CaseSearchParams
): Promise<LegalResearchResponse> {
  const config = await getLegalResearchConfig();

  if (!config.enabled) {
    return {
      success: false,
      error: 'Legal research is not configured. Add Westlaw or LexisNexis API keys in settings.',
      provider: 'none',
    };
  }

  try {
    if (config.provider === 'westlaw') {
      return await searchWestlaw(params, config);
    } else if (config.provider === 'lexisnexis') {
      return await searchLexisNexis(params, config);
    }

    return {
      success: false,
      error: 'Unknown provider',
      provider: config.provider,
    };
  } catch (error) {
    console.error('[Legal Research Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search cases',
      provider: config.provider,
    };
  }
}

/**
 * Verify a citation is valid and check if it's good law
 */
export async function checkCitation(
  citation: string
): Promise<CitationCheckResult> {
  const config = await getLegalResearchConfig();

  if (!config.enabled) {
    return {
      citation,
      isValid: false,
      isGoodLaw: false,
      error: 'Legal research is not configured',
    };
  }

  try {
    if (config.provider === 'westlaw') {
      return await checkCitationWestlaw(citation, config);
    } else if (config.provider === 'lexisnexis') {
      return await checkCitationLexisNexis(citation, config);
    }

    return {
      citation,
      isValid: false,
      isGoodLaw: false,
      error: 'Unknown provider',
    };
  } catch (error) {
    return {
      citation,
      isValid: false,
      isGoodLaw: false,
      error: error instanceof Error ? error.message : 'Failed to check citation',
    };
  }
}

// ============================================================================
// WESTLAW IMPLEMENTATION
// ============================================================================

async function searchWestlaw(
  params: CaseSearchParams,
  config: LegalResearchConfig
): Promise<LegalResearchResponse> {
  // Westlaw API implementation
  // This is a placeholder - actual implementation depends on Westlaw API specs

  const response = await fetch(`${config.baseUrl}/search/cases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-ID': config.clientId || '',
    },
    body: JSON.stringify({
      query: params.query,
      jurisdiction: params.jurisdiction,
      court: params.court,
      dateRange: params.dateFrom && params.dateTo ? {
        from: params.dateFrom,
        to: params.dateTo,
      } : undefined,
      topics: params.topics,
      limit: params.maxResults || 10,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Westlaw API error: ${error}`);
  }

  const data = await response.json();

  // Transform Westlaw response to our format
  const results: CaseResult[] = (data.results || []).map((r: Record<string, unknown>) => ({
    citation: r.citation as string,
    caseName: r.title as string,
    court: r.court as string,
    date: r.date as string,
    jurisdiction: r.jurisdiction as string,
    summary: r.summary as string,
    holding: r.holding as string,
    relevantQuotes: r.keyPassages as string[],
    topics: r.topics as string[],
    isGoodLaw: r.keyCiteStatus !== 'negative',
    citatorStatus: mapWestlawCitatorStatus(r.keyCiteStatus as string),
    fullTextUrl: r.documentUrl as string,
  }));

  return {
    success: true,
    results,
    totalResults: data.totalCount,
    provider: 'westlaw',
  };
}

async function checkCitationWestlaw(
  citation: string,
  config: LegalResearchConfig
): Promise<CitationCheckResult> {
  const response = await fetch(`${config.baseUrl}/keycite/check`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-ID': config.clientId || '',
    },
    body: JSON.stringify({ citation }),
  });

  if (!response.ok) {
    throw new Error('Failed to verify citation');
  }

  const data = await response.json();

  return {
    citation,
    isValid: data.found === true,
    isGoodLaw: data.status !== 'negative' && data.status !== 'overruled',
    citatorStatus: mapWestlawCitatorStatus(data.status),
    subsequentHistory: data.subsequentHistory,
    negativeHistory: data.negativeHistory,
  };
}

function mapWestlawCitatorStatus(status: string): 'positive' | 'negative' | 'caution' | 'neutral' {
  switch (status?.toLowerCase()) {
    case 'positive':
    case 'followed':
      return 'positive';
    case 'negative':
    case 'overruled':
    case 'superseded':
      return 'negative';
    case 'caution':
    case 'questioned':
    case 'criticized':
      return 'caution';
    default:
      return 'neutral';
  }
}

// ============================================================================
// LEXISNEXIS IMPLEMENTATION
// ============================================================================

async function searchLexisNexis(
  params: CaseSearchParams,
  config: LegalResearchConfig
): Promise<LegalResearchResponse> {
  // LexisNexis API implementation
  // This is a placeholder - actual implementation depends on LexisNexis API specs

  const response = await fetch(`${config.baseUrl}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      searchTerms: params.query,
      jurisdiction: params.jurisdiction,
      court: params.court,
      filters: {
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        topics: params.topics,
      },
      pageSize: params.maxResults || 10,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LexisNexis API error: ${error}`);
  }

  const data = await response.json();

  // Transform LexisNexis response to our format
  const results: CaseResult[] = (data.documents || []).map((r: Record<string, unknown>) => ({
    citation: r.citation as string,
    caseName: r.name as string,
    court: r.court as string,
    date: r.decisionDate as string,
    jurisdiction: r.jurisdiction as string,
    summary: r.overview as string,
    holding: r.coreTerms as string,
    relevantQuotes: r.headnotes as string[],
    topics: r.legalTopics as string[],
    isGoodLaw: r.shepardStatus !== 'negative',
    citatorStatus: mapLexisCitatorStatus(r.shepardStatus as string),
    fullTextUrl: r.link as string,
  }));

  return {
    success: true,
    results,
    totalResults: data.totalHits,
    provider: 'lexisnexis',
  };
}

async function checkCitationLexisNexis(
  citation: string,
  config: LegalResearchConfig
): Promise<CitationCheckResult> {
  const response = await fetch(`${config.baseUrl}/shepards/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ citation }),
  });

  if (!response.ok) {
    throw new Error('Failed to verify citation');
  }

  const data = await response.json();

  return {
    citation,
    isValid: data.found === true,
    isGoodLaw: data.signal !== 'negative' && data.signal !== 'warning',
    citatorStatus: mapLexisCitatorStatus(data.signal),
    subsequentHistory: data.subsequentHistory,
    negativeHistory: data.negativeReferences,
  };
}

function mapLexisCitatorStatus(status: string): 'positive' | 'negative' | 'caution' | 'neutral' {
  switch (status?.toLowerCase()) {
    case 'positive':
    case 'followed':
      return 'positive';
    case 'negative':
    case 'warning':
    case 'overruled':
      return 'negative';
    case 'caution':
    case 'questioned':
      return 'caution';
    default:
      return 'neutral';
  }
}
