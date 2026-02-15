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

import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-courtlistener-client');

import {
  COURTLISTENER_BASE_URL,
  COURTLISTENER_CITATION_LOOKUP,
  COURTLISTENER_RATE_LIMIT,
  COURTLISTENER_MAX_CITATIONS_PER_REQUEST,
  COURTLISTENER_MAX_CHARS_PER_REQUEST,
  CitationVerificationStatus,
  type CourtListenerVerificationResult,
} from '@/types/workflow';
import { getCircuitBreaker, CircuitOpenError } from '@/lib/circuit-breaker';

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

export interface CourtListenerSearchResult {
  id: string;
  caseName: string;
  citation: string;
  snippet: string;
  court: string;
  dateFiled: string;
  relevanceScore: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const HOUR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REQUESTS_PER_MINUTE = 60; // 60/min
const REQUESTS_PER_HOUR = 5000; // 5,000/hour
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 32000;
const JITTER_PERCENT = 0.2;

// ============================================================================
// RATE LIMITER (Enhanced with hourly limits)
// ============================================================================

interface RateLimiterState {
  minuteCount: number;
  minuteWindowStart: number;
  hourCount: number;
  hourWindowStart: number;
}

class RateLimiter {
  private state: RateLimiterState = {
    minuteCount: 0,
    minuteWindowStart: Date.now(),
    hourCount: 0,
    hourWindowStart: Date.now(),
  };

  private rateLimitEvents: { timestamp: number; type: 'minute' | 'hour' }[] = [];

  /**
   * Wait for a rate limit slot, respecting both minute and hour limits
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Reset minute window if expired
    if (now - this.state.minuteWindowStart >= RATE_LIMIT_WINDOW_MS) {
      this.state.minuteCount = 0;
      this.state.minuteWindowStart = now;
    }

    // Reset hour window if expired
    if (now - this.state.hourWindowStart >= HOUR_WINDOW_MS) {
      this.state.hourCount = 0;
      this.state.hourWindowStart = now;
    }

    // Check minute limit first (stricter)
    if (this.state.minuteCount >= REQUESTS_PER_MINUTE) {
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - this.state.minuteWindowStart);
      if (waitTime > 0) {
        this.logRateLimitEvent('minute');
        log.info('Minute rate limit reached', { limit: REQUESTS_PER_MINUTE, waitMs: waitTime });
        await this.waitWithJitter(waitTime);
        this.state.minuteCount = 0;
        this.state.minuteWindowStart = Date.now();
      }
    }

    // Check hour limit
    if (this.state.hourCount >= REQUESTS_PER_HOUR) {
      const waitTime = HOUR_WINDOW_MS - (now - this.state.hourWindowStart);
      if (waitTime > 0) {
        this.logRateLimitEvent('hour');
        log.warn('Hour rate limit reached', { limit: REQUESTS_PER_HOUR, waitSeconds: Math.ceil(waitTime / 1000) });
        await this.waitWithJitter(waitTime);
        this.state.hourCount = 0;
        this.state.hourWindowStart = Date.now();
      }
    }

    this.state.minuteCount++;
    this.state.hourCount++;
  }

  /**
   * Wait with jitter to prevent thundering herd
   */
  private async waitWithJitter(baseMs: number): Promise<void> {
    const jitter = baseMs * JITTER_PERCENT * (Math.random() * 2 - 1);
    const waitTime = Math.max(0, baseMs + jitter);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  /**
   * Log rate limit event for monitoring
   */
  private logRateLimitEvent(type: 'minute' | 'hour'): void {
    this.rateLimitEvents.push({ timestamp: Date.now(), type });
    // Keep only last 100 events
    if (this.rateLimitEvents.length > 100) {
      this.rateLimitEvents.shift();
    }
  }

  /**
   * Get rate limit statistics
   */
  getStats(): {
    minuteCount: number;
    hourCount: number;
    minuteRemaining: number;
    hourRemaining: number;
    recentRateLimits: number;
  } {
    const hourAgo = Date.now() - HOUR_WINDOW_MS;
    const recentEvents = this.rateLimitEvents.filter(e => e.timestamp > hourAgo);

    return {
      minuteCount: this.state.minuteCount,
      hourCount: this.state.hourCount,
      minuteRemaining: REQUESTS_PER_MINUTE - this.state.minuteCount,
      hourRemaining: REQUESTS_PER_HOUR - this.state.hourCount,
      recentRateLimits: recentEvents.length,
    };
  }
}

// ============================================================================
// COURTLISTENER CLIENT
// ============================================================================

export class CourtListenerClient {
  private apiKey: string;
  private rateLimiter: RateLimiter;
  private circuitBreaker = getCircuitBreaker('courtlistener');

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COURTLISTENER_API_KEY || '';
    this.rateLimiter = new RateLimiter();

    if (!this.apiKey) {
      log.warn('No API key configured');
    }
  }

  /**
   * Get rate limit statistics
   */
  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Check if the client is healthy (circuit not open)
   */
  async isHealthy(): Promise<boolean> {
    return this.circuitBreaker.canExecute();
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
      log.error('Citation lookup error', { error: error instanceof Error ? error.message : String(error) });
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
      log.error('Opinion retrieval error', { error: error instanceof Error ? error.message : String(error) });
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
   * Fetch with exponential backoff retry and circuit breaker
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    // Check circuit breaker first
    const canExecute = await this.circuitBreaker.canExecute();
    if (!canExecute) {
      throw new CircuitOpenError('courtlistener', 30);
    }

    let lastError: Error | null = null;
    let backoffMs = INITIAL_BACKOFF_MS;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Handle rate limiting with enhanced backoff
        if (response.status === 429) {
          await this.circuitBreaker.recordFailure(new Error('Rate limited'));

          if (attempt < retries) {
            // Add jitter to backoff
            const jitter = backoffMs * JITTER_PERCENT * (Math.random() * 2 - 1);
            const waitTime = Math.min(backoffMs + jitter, MAX_BACKOFF_MS);
            log.info('Rate limited (429), backing off', { waitMs: Math.round(waitTime), attempt: attempt + 1, maxAttempts: retries + 1 });
            await new Promise(resolve => setTimeout(resolve, waitTime));
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          }
        }

        // Handle server errors
        if (response.status >= 500) {
          await this.circuitBreaker.recordFailure(new Error(`Server error: ${response.status}`));

          if (attempt < retries) {
            const jitter = backoffMs * JITTER_PERCENT * (Math.random() * 2 - 1);
            const waitTime = Math.min(backoffMs + jitter, MAX_BACKOFF_MS);
            log.info('Server error, retrying', { status: response.status, waitMs: Math.round(waitTime) });
            await new Promise(resolve => setTimeout(resolve, waitTime));
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          }
        }

        // Success - record it
        if (response.ok) {
          await this.circuitBreaker.recordSuccess();
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        await this.circuitBreaker.recordFailure(lastError);

        if (attempt < retries) {
          const jitter = backoffMs * JITTER_PERCENT * (Math.random() * 2 - 1);
          const waitTime = Math.min(backoffMs + jitter, MAX_BACKOFF_MS);
          log.info('Request failed, retrying', { error: lastError.message, waitMs: Math.round(waitTime) });
          await new Promise(resolve => setTimeout(resolve, waitTime));
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
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

  /**
   * Search CourtListener for cases matching a query.
   * Uses the search endpoint for keyword/topic-based case discovery.
   * Used by re-research service to find citations for [CITATION NEEDED] gaps.
   */
  async searchCases(params: {
    query: string;
    jurisdiction?: string;
    maxResults?: number;
  }): Promise<CourtListenerSearchResult[]> {
    const { query, jurisdiction, maxResults = 5 } = params;

    try {
      await this.rateLimiter.waitForSlot();

      const searchParams = new URLSearchParams({
        q: query,
        type: 'o', // opinions
        order_by: 'score desc',
        page_size: String(maxResults),
      });

      if (jurisdiction) {
        searchParams.set('court', jurisdiction);
      }

      const response = await this.fetchWithRetry(
        `${COURTLISTENER_BASE_URL}search/?${searchParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Token ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        log.error('CourtListener search failed', { status: response.status, query });
        return [];
      }

      const data = await response.json();
      const results: CourtListenerSearchResult[] = (data.results || [])
        .slice(0, maxResults)
        .map((r: Record<string, unknown>) => ({
          id: String(r.cluster_id || r.id || ''),
          caseName: String(r.caseName || r.case_name || ''),
          citation: String(Array.isArray(r.citation) ? r.citation[0] : (r.citation || '')),
          snippet: String(r.snippet || r.text || '').slice(0, 500),
          court: String(r.court || ''),
          dateFiled: String(r.dateFiled || r.date_filed || ''),
          relevanceScore: typeof r.score === 'number' ? r.score : 50,
        }));

      return results;
    } catch (error) {
      log.error('CourtListener search error', {
        error: error instanceof Error ? error.message : String(error),
        query,
      });
      return [];
    }
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
// SEARCH HELPER
// ============================================================================

/**
 * Convenience function for searching CourtListener.
 * Used by re-research-service.ts.
 */
export async function searchCourtListener(params: {
  query: string;
  jurisdiction?: string;
  maxResults?: number;
}): Promise<CourtListenerSearchResult[]> {
  const client = getCourtListenerClient();
  return client.searchCases(params);
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
