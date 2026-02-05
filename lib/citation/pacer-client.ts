/**
 * PACER Client Module
 *
 * Fallback citation verification for unpublished federal cases.
 * Primary source is CourtListener (free), PACER is used only when:
 * 1. CourtListener lookup fails
 * 2. RECAP archive lookup fails
 * 3. Citation is federal (not state)
 *
 * PACER costs ~$0.10 per document, target budget: <$50/month
 *
 * Source: CIV Spec v3.2 Errata, Gap Analysis A-5
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface PACERCredentials {
  username: string;
  password: string;
}

export interface PACERAuthToken {
  token: string;
  expiresAt: Date;
}

export interface PACERSearchResult {
  found: boolean;
  source: 'PACER' | 'RECAP' | 'NONE';
  caseNumber?: string;
  caseName?: string;
  court?: string;
  filingDate?: string;
  documentUrl?: string;
  costIncurred?: number;
  error?: string;
}

export interface PACERCostTracking {
  totalCostCents: number;
  requestCount: number;
  monthlyBudgetCents: number;
  budgetRemaining: number;
  lastResetAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PACER_BASE_URL = 'https://pacer.uscourts.gov';
const PACER_LOGIN_URL = `${PACER_BASE_URL}/pscof/cgi-bin/login.pl`;
const RECAP_BASE_URL = 'https://www.courtlistener.com/api/rest/v4/recap';

// Cost per PACER document (in cents)
const PACER_COST_PER_PAGE_CENTS = 10;
const PACER_MAX_COST_PER_DOC_CENTS = 300; // $3 cap per document

// Monthly budget (in cents)
const MONTHLY_BUDGET_CENTS = 5000; // $50/month

// Token refresh threshold (refresh if expires within this time)
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiting
const REQUESTS_PER_MINUTE = 30;

// ============================================================================
// RATE LIMITER
// ============================================================================

class PACERRateLimiter {
  private requestTimestamps: number[] = [];

  async waitForCapacity(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);

    if (this.requestTimestamps.length >= REQUESTS_PER_MINUTE) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest + 60000 - now;
      if (waitTime > 0) {
        console.log(`[PACER] Rate limit: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.requestTimestamps.push(Date.now());
  }
}

// ============================================================================
// PACER CLIENT CLASS
// ============================================================================

class PACERClient {
  private authToken: PACERAuthToken | null = null;
  private rateLimiter = new PACERRateLimiter();
  private costTracking: PACERCostTracking = {
    totalCostCents: 0,
    requestCount: 0,
    monthlyBudgetCents: MONTHLY_BUDGET_CENTS,
    budgetRemaining: MONTHLY_BUDGET_CENTS,
    lastResetAt: new Date().toISOString(),
  };

  /**
   * Check if PACER credentials are configured
   */
  isConfigured(): boolean {
    return !!(process.env.PACER_USERNAME && process.env.PACER_PASSWORD);
  }

  /**
   * Get credentials from environment
   */
  private getCredentials(): PACERCredentials | null {
    const username = process.env.PACER_USERNAME;
    const password = process.env.PACER_PASSWORD;

    if (!username || !password) {
      console.warn('[PACER] Credentials not configured');
      return null;
    }

    return { username, password };
  }

  /**
   * Authenticate with PACER and get auth token
   */
  async authenticate(): Promise<boolean> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return false;
    }

    try {
      await this.rateLimiter.waitForCapacity();

      // PACER uses form-based login
      const formData = new URLSearchParams();
      formData.append('login', credentials.username);
      formData.append('key', credentials.password);

      const response = await fetch(PACER_LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        console.error('[PACER] Authentication failed:', response.status);
        await this.logAuthFailure('HTTP error: ' + response.status);
        return false;
      }

      // Extract session cookie/token from response
      const cookies = response.headers.get('set-cookie');
      if (cookies) {
        // Parse the PACER session token
        const tokenMatch = cookies.match(/PacerSession=([^;]+)/);
        if (tokenMatch) {
          this.authToken = {
            token: tokenMatch[1],
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          };
          console.log('[PACER] Authentication successful');
          return true;
        }
      }

      console.error('[PACER] No session token in response');
      await this.logAuthFailure('No session token received');
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PACER] Authentication error:', errorMessage);
      await this.logAuthFailure(errorMessage);
      return false;
    }
  }

  /**
   * Check if token needs refresh
   */
  private needsTokenRefresh(): boolean {
    if (!this.authToken) return true;
    return this.authToken.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_THRESHOLD_MS;
  }

  /**
   * Ensure we have a valid auth token
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (this.needsTokenRefresh()) {
      return this.authenticate();
    }
    return true;
  }

  /**
   * Log authentication failure for alerting
   */
  private async logAuthFailure(reason: string): Promise<void> {
    try {
      const supabase = await createClient();
      await supabase.from('automation_logs').insert({
        action_type: 'pacer_auth_failure',
        action_details: {
          reason,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Ignore logging errors
    }
  }

  /**
   * Check budget before making request
   */
  private hasBudget(): boolean {
    // Reset budget if new month
    const lastReset = new Date(this.costTracking.lastResetAt);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      this.costTracking = {
        totalCostCents: 0,
        requestCount: 0,
        monthlyBudgetCents: MONTHLY_BUDGET_CENTS,
        budgetRemaining: MONTHLY_BUDGET_CENTS,
        lastResetAt: now.toISOString(),
      };
    }

    return this.costTracking.budgetRemaining > PACER_COST_PER_PAGE_CENTS;
  }

  /**
   * Record cost for budget tracking
   */
  private recordCost(costCents: number): void {
    this.costTracking.totalCostCents += costCents;
    this.costTracking.requestCount++;
    this.costTracking.budgetRemaining = this.costTracking.monthlyBudgetCents - this.costTracking.totalCostCents;

    if (this.costTracking.budgetRemaining < MONTHLY_BUDGET_CENTS * 0.1) {
      console.warn(`[PACER] Budget warning: only $${(this.costTracking.budgetRemaining / 100).toFixed(2)} remaining`);
    }
  }

  /**
   * Try RECAP first (free PACER mirror via CourtListener)
   */
  async queryRECAP(citation: string): Promise<PACERSearchResult> {
    try {
      await this.rateLimiter.waitForCapacity();

      // Parse citation to extract components
      const parsed = parseCitation(citation);
      if (!parsed) {
        return { found: false, source: 'NONE', error: 'Invalid citation format' };
      }

      // CIV-001: Search RECAP via CourtListener API — removed deprecated citation= parameter
      const searchUrl = `${RECAP_BASE_URL}/?q=${encodeURIComponent(citation)}&type=r`;

      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Token ${process.env.COURTLISTENER_API_KEY || ''}`,
        },
      });

      if (!response.ok) {
        return { found: false, source: 'NONE', error: `RECAP error: ${response.status}` };
      }

      const data = await response.json();

      if (data.count > 0 && data.results?.[0]) {
        const result = data.results[0];
        return {
          found: true,
          source: 'RECAP',
          caseNumber: result.docket_number,
          caseName: result.case_name,
          court: result.court,
          filingDate: result.date_filed,
          documentUrl: result.filepath_local || result.filepath_ia,
          costIncurred: 0, // RECAP is free
        };
      }

      return { found: false, source: 'NONE' };
    } catch (error) {
      return {
        found: false,
        source: 'NONE',
        error: error instanceof Error ? error.message : 'RECAP query failed',
      };
    }
  }

  /**
   * Query PACER directly (costs money)
   * Only used as last resort for federal cases
   */
  async queryPACER(citation: string): Promise<PACERSearchResult> {
    // Check budget first
    if (!this.hasBudget()) {
      console.warn('[PACER] Monthly budget exhausted');
      return {
        found: false,
        source: 'NONE',
        error: 'PACER monthly budget exhausted',
      };
    }

    // Ensure authenticated
    const authenticated = await this.ensureAuthenticated();
    if (!authenticated) {
      return {
        found: false,
        source: 'NONE',
        error: 'PACER authentication failed',
      };
    }

    try {
      await this.rateLimiter.waitForCapacity();

      // Parse citation
      const parsed = parseCitation(citation);
      if (!parsed) {
        return { found: false, source: 'NONE', error: 'Invalid citation format' };
      }

      // Determine which PACER court system to query
      const courtCode = getCourtCode(parsed.court);
      if (!courtCode) {
        return {
          found: false,
          source: 'NONE',
          error: 'Unable to determine court for citation',
        };
      }

      // This is a simplified example - actual PACER API is more complex
      // In production, this would use the actual PACER Case Locator API
      const searchUrl = `${PACER_BASE_URL}/cgi-bin/possible_case_numbers.pl`;

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `PacerSession=${this.authToken?.token}`,
        },
        body: new URLSearchParams({
          court: courtCode,
          case_num: parsed.caseNumber || citation,
        }).toString(),
      });

      // Record cost (PACER charges per page accessed)
      const costCents = Math.min(PACER_COST_PER_PAGE_CENTS, PACER_MAX_COST_PER_DOC_CENTS);
      this.recordCost(costCents);

      if (!response.ok) {
        return {
          found: false,
          source: 'NONE',
          error: `PACER error: ${response.status}`,
          costIncurred: costCents,
        };
      }

      const html = await response.text();

      // Parse PACER response (actual parsing would be more sophisticated)
      if (html.includes('No cases found')) {
        return {
          found: false,
          source: 'NONE',
          costIncurred: costCents,
        };
      }

      // Extract case info from response
      // This is simplified - real implementation would parse HTML
      return {
        found: true,
        source: 'PACER',
        caseNumber: parsed.caseNumber,
        court: parsed.court,
        costIncurred: costCents,
      };
    } catch (error) {
      return {
        found: false,
        source: 'NONE',
        error: error instanceof Error ? error.message : 'PACER query failed',
      };
    }
  }

  /**
   * Main verification method - tries RECAP first, then PACER
   */
  async verifyCitation(citation: string): Promise<PACERSearchResult> {
    // Only for federal citations
    if (!isFederalCitation(citation)) {
      return {
        found: false,
        source: 'NONE',
        error: 'PACER only supports federal citations',
      };
    }

    // Try RECAP first (free)
    const recapResult = await this.queryRECAP(citation);
    if (recapResult.found) {
      return recapResult;
    }

    // Fall back to PACER (costs money)
    return this.queryPACER(citation);
  }

  /**
   * Get cost tracking data
   */
  getCostTracking(): PACERCostTracking {
    return { ...this.costTracking };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a legal citation into components
 */
function parseCitation(citation: string): {
  volume?: string;
  reporter?: string;
  page?: string;
  court?: string;
  year?: string;
  caseNumber?: string;
} | null {
  // Federal reporter patterns
  const federalPattern = /(\d+)\s+F\.?\s*(2d|3d|4th|Supp\.?\s*(2d|3d)?|App'x)?\s+(\d+)/i;
  const match = citation.match(federalPattern);

  if (match) {
    return {
      volume: match[1],
      reporter: match[2] || 'F',
      page: match[4],
    };
  }

  // Try to extract year
  const yearMatch = citation.match(/\((\d{4})\)/);

  return {
    caseNumber: citation,
    year: yearMatch?.[1],
  };
}

/**
 * Check if citation is federal (vs state)
 */
export function isFederalCitation(citation: string): boolean {
  const federalReporters = [
    'F.', 'F.2d', 'F.3d', 'F.4th',
    'F. Supp.', 'F. Supp. 2d', 'F. Supp. 3d',
    'F. App\'x',
    'U.S.', 'S. Ct.', 'L. Ed.',
    'B.R.', // Bankruptcy
    'Fed. Cl.', // Federal Claims
    'Fed. Cir.',
  ];

  const upperCitation = citation.toUpperCase();
  return federalReporters.some(reporter =>
    upperCitation.includes(reporter.toUpperCase())
  );
}

/**
 * Get PACER court code from court name
 */
function getCourtCode(courtName?: string): string | null {
  if (!courtName) return null;

  const courtCodes: Record<string, string> = {
    'supreme court': 'scotus',
    'first circuit': 'ca1',
    'second circuit': 'ca2',
    'third circuit': 'ca3',
    'fourth circuit': 'ca4',
    'fifth circuit': 'ca5',
    'sixth circuit': 'ca6',
    'seventh circuit': 'ca7',
    'eighth circuit': 'ca8',
    'ninth circuit': 'ca9',
    'tenth circuit': 'ca10',
    'eleventh circuit': 'ca11',
    'd.c. circuit': 'cadc',
    'federal circuit': 'cafc',
    // District courts would be added here
  };

  const lower = courtName.toLowerCase();
  for (const [name, code] of Object.entries(courtCodes)) {
    if (lower.includes(name)) {
      return code;
    }
  }

  return null;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const pacerClient = new PACERClient();

export const isPACERConfigured = pacerClient.isConfigured();

export async function queryRECAP(citation: string): Promise<PACERSearchResult> {
  return pacerClient.queryRECAP(citation);
}

export async function queryPACER(citation: string): Promise<PACERSearchResult> {
  return pacerClient.queryPACER(citation);
}

export async function verifyCitationWithPACER(citation: string): Promise<PACERSearchResult> {
  return pacerClient.verifyCitation(citation);
}

export function getPACERCostTracking(): PACERCostTracking {
  return pacerClient.getCostTracking();
}

// ============================================================================
// DATABASE-BACKED COST TRACKING
// ============================================================================

/**
 * Get current month's PACER spend from database
 * More accurate than in-memory tracking across server restarts
 */
export async function getPACERMonthlySpend(): Promise<number> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_pacer_monthly_spend');

    if (error) {
      console.error('[PACER] Error getting monthly spend:', error);
      // Fall back to in-memory tracking
      return pacerClient.getCostTracking().totalCostCents / 100;
    }

    if (data && data.length > 0) {
      return data[0].total_cost_dollars || 0;
    }

    return 0;
  } catch (error) {
    console.error('[PACER] Error getting monthly spend:', error);
    return pacerClient.getCostTracking().totalCostCents / 100;
  }
}

/**
 * Check if PACER can be used (budget not exceeded)
 * Uses database function for accurate cross-server tracking
 */
export async function canUsePACER(): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('can_use_pacer');

    if (error) {
      console.error('[PACER] Error checking budget:', error);
      // Fall back to in-memory tracking
      return pacerClient.getCostTracking().budgetRemaining > 10;
    }

    return data === true;
  } catch (error) {
    console.error('[PACER] Error checking budget:', error);
    return pacerClient.getCostTracking().budgetRemaining > 10;
  }
}

/**
 * Log PACER usage to database for accurate tracking
 */
export async function logPACERUsage(
  orderId: string | null,
  citation: string,
  found: boolean,
  options?: {
    normalizedCitation?: string;
    source?: 'PACER' | 'RECAP' | 'NONE';
    costCents?: number;
    caseNumber?: string;
    court?: string;
    error?: string;
  }
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('pacer_usage').insert({
      order_id: orderId,
      citation_searched: citation,
      normalized_citation: options?.normalizedCitation,
      result_found: found,
      source: options?.source || (found ? 'PACER' : 'NONE'),
      cost_cents: options?.costCents ?? 10,
      case_number: options?.caseNumber,
      court: options?.court,
      error_message: options?.error,
    });
  } catch (error) {
    console.error('[PACER] Error logging usage:', error);
    // Don't throw - logging failure shouldn't break the pipeline
  }
}

/**
 * Get PACER budget status
 */
export async function getPACERBudgetStatus(): Promise<{
  totalSpentCents: number;
  totalSpentDollars: number;
  budgetRemainingCents: number;
  budgetRemainingDollars: number;
  searchCount: number;
  budgetExceeded: boolean;
  percentUsed: number;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_pacer_monthly_spend');

    if (error || !data || data.length === 0) {
      // Return defaults if no data
      return {
        totalSpentCents: 0,
        totalSpentDollars: 0,
        budgetRemainingCents: 5000,
        budgetRemainingDollars: 50,
        searchCount: 0,
        budgetExceeded: false,
        percentUsed: 0,
      };
    }

    const row = data[0];
    return {
      totalSpentCents: row.total_cost_cents || 0,
      totalSpentDollars: row.total_cost_dollars || 0,
      budgetRemainingCents: row.budget_remaining_cents || 5000,
      budgetRemainingDollars: (row.budget_remaining_cents || 5000) / 100,
      searchCount: row.search_count || 0,
      budgetExceeded: row.budget_exceeded || false,
      percentUsed: ((row.total_cost_cents || 0) / 5000) * 100,
    };
  } catch (error) {
    console.error('[PACER] Error getting budget status:', error);
    return {
      totalSpentCents: 0,
      totalSpentDollars: 0,
      budgetRemainingCents: 5000,
      budgetRemainingDollars: 50,
      searchCount: 0,
      budgetExceeded: false,
      percentUsed: 0,
    };
  }
}

export default pacerClient;
