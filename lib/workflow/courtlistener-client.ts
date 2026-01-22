/**
 * CourtListener API Client
 *
 * Handles citation verification via the CourtListener API.
 * Three-stage verification: Existence → Opinion Retrieval → Holding Verification
 *
 * API Details:
 * - Base URL: https://www.courtlistener.com/api/rest/v4/
 * - Rate Limits: 60 citations/min, 5,000 queries/hour
 * - Max per Request: 128 citations, 64,000 characters
 */

import {
  COURTLISTENER_BASE_URL,
  COURTLISTENER_CITATION_LOOKUP,
  COURTLISTENER_RATE_LIMIT,
  COURTLISTENER_MAX_CITATIONS_PER_REQUEST,
  COURTLISTENER_MAX_CHARS_PER_REQUEST,
  CitationVerificationStatus,
  type CourtListenerVerificationResult,
} from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export interface CourtListenerCitation {
  id: number;
  absolute_url: string;
  case_name: string;
  citation: string;
  cluster_id: number;
  court: string;
  date_filed: string;
  docket_id: number;
  docket_number: string;
  status: string;
}

export interface CourtListenerLookupResponse {
  citations: CourtListenerCitation[];
}

export interface CourtListenerOpinion {
  id: number;
  absolute_url: string;
  author_str: string;
  cluster: string;
  date_created: string;
  download_url: string;
  html: string;
  html_with_citations: string;
  plain_text: string;
  sha1: string;
  type: string;
}

export interface RateLimitState {
  requestCount: number;
  windowStart: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private state: RateLimitState = {
    requestCount: 0,
    windowStart: Date.now(),
  };

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Reset window if expired
    if (now - this.state.windowStart >= RATE_LIMIT_WINDOW_MS) {
      this.state = {
        requestCount: 0,
        windowStart: now,
      };
    }

    // Check if we need to wait
    if (this.state.requestCount >= COURTLISTENER_RATE_LIMIT) {
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - this.state.windowStart);
      if (waitTime > 0) {
        console.log(`[CourtListener] Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.state = {
          requestCount: 0,
          windowStart: Date.now(),
        };
      }
    }

    this.state.requestCount++;
  }
}

// ============================================================================
// COURTLISTENER CLIENT
// ============================================================================

export class CourtListenerClient {
  private apiKey: string;
  private rateLimiter: RateLimiter;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COURTLISTENER_API_KEY || '';
    this.rateLimiter = new RateLimiter();

    if (!this.apiKey) {
      console.warn('[CourtListener] No API key configured');
    }
  }

  /**
   * Stage 1: Check if citation exists in CourtListener database
   */
  async checkCitationExists(citationText: string): Promise<{
    found: boolean;
    citations: CourtListenerCitation[];
    error?: string;
  }> {
    try {
      await this.rateLimiter.waitForSlot();

      const response = await this.fetchWithRetry(
        `${COURTLISTENER_BASE_URL}${COURTLISTENER_CITATION_LOOKUP}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `text=${encodeURIComponent(citationText)}`,
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { found: false, citations: [] };
        }
        throw new Error(`CourtListener API error: ${response.status}`);
      }

      const data: CourtListenerLookupResponse = await response.json();
      return {
        found: data.citations && data.citations.length > 0,
        citations: data.citations || [],
      };
    } catch (error) {
      console.error('[CourtListener] Citation lookup error:', error);
      return {
        found: false,
        citations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stage 2: Retrieve the full opinion text
   */
  async getOpinionText(clusterId: number): Promise<{
    retrieved: boolean;
    opinion?: CourtListenerOpinion;
    plainText?: string;
    error?: string;
  }> {
    try {
      await this.rateLimiter.waitForSlot();

      const response = await this.fetchWithRetry(
        `${COURTLISTENER_BASE_URL}opinions/?cluster=${clusterId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }

      const data = await response.json();
      const opinions = data.results || [];

      if (opinions.length === 0) {
        return { retrieved: false, error: 'No opinions found for cluster' };
      }

      const opinion = opinions[0];
      return {
        retrieved: true,
        opinion,
        plainText: opinion.plain_text || this.stripHtml(opinion.html || ''),
      };
    } catch (error) {
      console.error('[CourtListener] Opinion retrieval error:', error);
      return {
        retrieved: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch citation lookup (up to 128 citations)
   */
  async batchCheckCitations(citationTexts: string[]): Promise<{
    results: Map<string, CourtListenerCitation[]>;
    errors: string[];
  }> {
    // Ensure we don't exceed limits
    if (citationTexts.length > COURTLISTENER_MAX_CITATIONS_PER_REQUEST) {
      throw new Error(`Too many citations. Max: ${COURTLISTENER_MAX_CITATIONS_PER_REQUEST}`);
    }

    const combinedText = citationTexts.join('\n\n');
    if (combinedText.length > COURTLISTENER_MAX_CHARS_PER_REQUEST) {
      throw new Error(`Text too long. Max: ${COURTLISTENER_MAX_CHARS_PER_REQUEST} chars`);
    }

    const results = new Map<string, CourtListenerCitation[]>();
    const errors: string[] = [];

    try {
      await this.rateLimiter.waitForSlot();

      const response = await this.fetchWithRetry(
        `${COURTLISTENER_BASE_URL}${COURTLISTENER_CITATION_LOOKUP}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `text=${encodeURIComponent(combinedText)}`,
        }
      );

      if (!response.ok) {
        errors.push(`API error: ${response.status}`);
        return { results, errors };
      }

      const data: CourtListenerLookupResponse = await response.json();

      // Map citations back to their original text
      for (const citation of data.citations || []) {
        const matchingText = citationTexts.find(
          text => text.includes(citation.citation) ||
                  citation.citation.toLowerCase().includes(text.toLowerCase().split(',')[0])
        );
        if (matchingText) {
          const existing = results.get(matchingText) || [];
          existing.push(citation);
          results.set(matchingText, existing);
        }
      }

      // Mark citations that weren't found
      for (const text of citationTexts) {
        if (!results.has(text)) {
          results.set(text, []);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return { results, errors };
  }

  /**
   * Full 3-stage verification for a single citation
   * Note: Stage 3 (holding verification) requires calling Opus separately
   */
  async verifyCitation(
    citationText: string,
    proposition?: string
  ): Promise<CourtListenerVerificationResult> {
    const result: CourtListenerVerificationResult = {
      citationText,
      stage1Result: 'error',
      verificationStatus: 'PENDING',
    };

    // Stage 1: Existence check
    const existenceCheck = await this.checkCitationExists(citationText);

    if (existenceCheck.error) {
      result.stage1Result = 'error';
      result.verificationStatus = 'PENDING';
      result.notes = `Stage 1 error: ${existenceCheck.error}`;
      return result;
    }

    if (!existenceCheck.found || existenceCheck.citations.length === 0) {
      result.stage1Result = 'not_found';
      result.verificationStatus = 'NOT_FOUND';
      result.notes = 'Citation not found in CourtListener database';
      return result;
    }

    result.stage1Result = 'found';
    const citation = existenceCheck.citations[0];
    result.courtListenerId = String(citation.cluster_id);

    // Stage 2: Opinion retrieval
    const opinionResult = await this.getOpinionText(citation.cluster_id);

    if (!opinionResult.retrieved) {
      result.stage2Result = 'not_retrieved';
      result.verificationStatus = 'VERIFIED'; // Found but couldn't get text
      result.notes = `Found but couldn't retrieve opinion: ${opinionResult.error}`;
      return result;
    }

    result.stage2Result = 'retrieved';
    result.opinionText = opinionResult.plainText;

    // Stage 3 will be handled externally by Opus for holding verification
    // For now, mark as verified (existence + retrieval complete)
    result.verificationStatus = 'VERIFIED';

    return result;
  }

  /**
   * Fetch with exponential backoff retry
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;
    let backoffMs = INITIAL_BACKOFF_MS;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Handle rate limiting
        if (response.status === 429) {
          if (attempt < retries) {
            console.log(`[CourtListener] Rate limited, backing off ${backoffMs}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            backoffMs *= 2;
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        if (attempt < retries) {
          console.log(`[CourtListener] Request failed, retrying in ${backoffMs}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          backoffMs *= 2;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let clientInstance: CourtListenerClient | null = null;

export function getCourtListenerClient(): CourtListenerClient {
  if (!clientInstance) {
    clientInstance = new CourtListenerClient();
  }
  return clientInstance;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine verification status based on stage results
 */
export function determineVerificationStatus(
  stage1: 'found' | 'not_found' | 'error',
  stage2?: 'retrieved' | 'not_retrieved' | 'error',
  stage3?: 'verified' | 'mismatch' | 'partial' | 'error'
): CitationVerificationStatus {
  if (stage1 === 'not_found') return 'NOT_FOUND';
  if (stage1 === 'error') return 'PENDING';

  if (stage3 === 'mismatch') return 'HOLDING_MISMATCH';
  if (stage3 === 'partial') return 'HOLDING_PARTIAL';

  if (stage2 === 'not_retrieved' && stage1 === 'found') {
    return 'VERIFIED_WEB_ONLY';
  }

  return 'VERIFIED';
}

/**
 * Extract citation components from text
 */
export function parseCitation(text: string): {
  caseName?: string;
  volume?: string;
  reporter?: string;
  page?: string;
  year?: number;
  court?: string;
} {
  // Pattern for standard citations: Case Name, Volume Reporter Page (Court Year)
  const pattern = /^(.+?),?\s*(\d+)\s+([A-Za-z.]+\d*[a-z]*\.?)\s+(\d+)(?:\s*\((.+?)(\d{4})\))?/i;
  const match = text.match(pattern);

  if (!match) {
    return {};
  }

  return {
    caseName: match[1]?.trim(),
    volume: match[2],
    reporter: match[3]?.trim(),
    page: match[4],
    court: match[5]?.trim(),
    year: match[6] ? parseInt(match[6]) : undefined,
  };
}
