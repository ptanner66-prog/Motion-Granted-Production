/**
 * Legal Research Integration Types
 * Supports Westlaw and LexisNexis API integrations
 */

export interface LegalResearchConfig {
  provider: 'westlaw' | 'lexisnexis' | 'none';
  apiKey?: string;
  apiSecret?: string;
  clientId?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface CaseSearchParams {
  query: string;
  jurisdiction?: string;
  court?: string;
  dateFrom?: string;
  dateTo?: string;
  topics?: string[];
  maxResults?: number;
}

export interface CaseResult {
  citation: string;
  caseName: string;
  court: string;
  date: string;
  jurisdiction: string;
  summary: string;
  holding?: string;
  relevantQuotes?: string[];
  topics?: string[];
  isGoodLaw: boolean;
  citatorStatus?: 'positive' | 'negative' | 'caution' | 'neutral';
  fullTextUrl?: string;
}

export interface LegalResearchResponse {
  success: boolean;
  results?: CaseResult[];
  totalResults?: number;
  error?: string;
  provider: string;
}

export interface CitationCheckResult {
  citation: string;
  isValid: boolean;
  isGoodLaw: boolean;
  citatorStatus?: 'positive' | 'negative' | 'caution' | 'neutral';
  subsequentHistory?: string;
  negativeHistory?: string[];
  error?: string;
}

// Claude tool definition for legal research
export const LEGAL_RESEARCH_TOOL = {
  name: 'legal_research',
  description: `Search legal databases (Westlaw/LexisNexis) for relevant case law. Use this when you need to find cases to support legal arguments. Returns real, verified case citations with holdings and relevant quotes.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search terms describing the legal issue or topic (e.g., "discovery sanctions failure to comply")',
      },
      jurisdiction: {
        type: 'string',
        description: 'Jurisdiction to search (e.g., "California", "9th Circuit", "Federal")',
      },
      court: {
        type: 'string',
        description: 'Specific court if needed (e.g., "Supreme Court", "Court of Appeals")',
      },
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Legal topics to filter by (e.g., ["civil procedure", "discovery"])',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of cases to return (default: 10)',
      },
    },
    required: ['query'],
  },
};

export const CITATION_CHECK_TOOL = {
  name: 'check_citation',
  description: `Verify a legal citation is valid and check if it's still good law. Use this to verify any case you're about to cite.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      citation: {
        type: 'string',
        description: 'The full legal citation to verify (e.g., "123 F.3d 456 (9th Cir. 2020)")',
      },
    },
    required: ['citation'],
  },
};
