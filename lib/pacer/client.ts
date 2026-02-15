/**
 * PACER API Client
 *
 * PACER (Public Access to Court Electronic Records) provides access to
 * federal court documents. Authentication uses username/password to
 * generate session tokens.
 *
 * COST: ~$0.10 per lookup - MINIMIZE USAGE
 * Only use when CourtListener doesn't have the case.
 *
 * Documentation: https://pacer.uscourts.gov
 */

import type { PACERLookupResult } from './types';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('pacer-client');
// PACER API endpoints
const PACER_LOGIN_URL = 'https://pacer.login.uscourts.gov/csologin/login.jsf';
const PACER_PCL_BASE = 'https://pcl.uscourts.gov/pcl-public-api/rest';

// Session management
let pacerSessionToken: string | null = null;
let pacerSessionExpiry: Date | null = null;

// Cost tracking
let totalPACERCost = 0;
const PACER_LOOKUP_COST = 0.10;

// ============================================================================
// CREDENTIALS
// ============================================================================

function getPACERCredentials(): { username: string; password: string } | null {
  const username = process.env.PACER_USERNAME;
  const password = process.env.PACER_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function getPACERSession(): Promise<string> {
  // Check if we have a valid session
  if (pacerSessionToken && pacerSessionExpiry && new Date() < pacerSessionExpiry) {
    return pacerSessionToken;
  }

  const credentials = getPACERCredentials();
  if (!credentials) {
    throw new Error('PACER credentials not configured. Set PACER_USERNAME and PACER_PASSWORD environment variables.');
  }

  log.info('[PACER] Authenticating...');

  try {
    // PACER uses form-based authentication
    const response = await fetch(PACER_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        loginForm: 'loginForm',
        'loginForm:loginName': credentials.username,
        'loginForm:password': credentials.password,
        'loginForm:clientCode': '',
        'loginForm:fbtnLogin': '',
      }),
      redirect: 'manual', // Don't follow redirects - we need the cookie
    });

    // Extract session cookie from response
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('No session cookie received from PACER');
    }

    // Parse the PacerSession cookie
    const sessionMatch = setCookie.match(/PacerSession=([^;]+)/);
    if (!sessionMatch) {
      throw new Error('Could not parse PACER session cookie');
    }

    pacerSessionToken = sessionMatch[1];
    // Sessions typically last 30 minutes - refresh after 25
    pacerSessionExpiry = new Date(Date.now() + 25 * 60 * 1000);

    log.info('[PACER] Authentication successful');
    return pacerSessionToken;

  } catch (error) {
    log.error('[PACER] Authentication failed:', error);
    throw error;
  }
}

// ============================================================================
// CASE LOOKUP
// ============================================================================

export async function lookupPACER(citation: string): Promise<PACERLookupResult> {
  log.info(`[PACER] Looking up: ${citation} (cost: ~$${PACER_LOOKUP_COST})`);

  // Check credentials first
  const credentials = getPACERCredentials();
  if (!credentials) {
    log.info('[PACER] Credentials not configured - skipping PACER lookup');
    return {
      found: false,
      error: 'PACER credentials not configured',
    };
  }

  try {
    const sessionToken = await getPACERSession();

    // Parse the citation to extract case info
    const caseInfo = parseCitationForPACER(citation);

    if (!caseInfo.searchTerm) {
      return {
        found: false,
        error: 'Could not parse citation for PACER lookup',
      };
    }

    // Query PACER Case Locator API
    const searchParams = new URLSearchParams({
      caseTitle: caseInfo.searchTerm,
      ...(caseInfo.courtId && { courtId: caseInfo.courtId }),
      ...(caseInfo.year && { filedYear: String(caseInfo.year) }),
    });

    const response = await fetch(`${PACER_PCL_BASE}/cases/find?${searchParams}`, {
      method: 'GET',
      headers: {
        'Cookie': `PacerSession=${sessionToken}`,
        'Accept': 'application/json',
      },
    });

    // Track cost regardless of result
    totalPACERCost += PACER_LOOKUP_COST;

    if (!response.ok) {
      if (response.status === 401) {
        // Session expired - clear and retry once
        log.info('[PACER] Session expired, refreshing...');
        pacerSessionToken = null;
        pacerSessionExpiry = null;
        return lookupPACER(citation);
      }
      throw new Error(`PACER API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.content && data.content.length > 0) {
      const caseData = data.content[0];
      return {
        found: true,
        caseId: caseData.caseId,
        caseName: caseData.caseTitle,
        court: caseData.courtId,
        url: buildPACERCaseUrl(caseData.courtId, caseData.caseId),
        cost: PACER_LOOKUP_COST,
      };
    }

    return {
      found: false,
      cost: PACER_LOOKUP_COST, // Still charged for the lookup
    };

  } catch (error) {
    log.error('[PACER] Lookup failed:', error);

    // Track cost even on error (PACER may have charged)
    totalPACERCost += PACER_LOOKUP_COST;

    return {
      found: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      cost: PACER_LOOKUP_COST,
    };
  }
}

// ============================================================================
// CITATION PARSING
// ============================================================================

interface ParsedPACERCitation {
  searchTerm: string;
  courtId?: string;
  caseNumber?: string;
  year?: number;
}

function parseCitationForPACER(citation: string): ParsedPACERCitation {
  const result: ParsedPACERCitation = {
    searchTerm: '',
  };

  // Extract year from citation
  const yearMatch = citation.match(/\((\d{4})\)/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1], 10);
  }

  // Extract case name (everything before "v." or "vs." up to the citation)
  const caseNameMatch = citation.match(/^([^,]+(?:\s+v\.?\s+[^,]+)?)/i);
  if (caseNameMatch) {
    result.searchTerm = caseNameMatch[1].trim();
  }

  // Map reporter to court type
  if (citation.includes('F.4th') || citation.includes('F.3d') || citation.includes('F.2d')) {
    // Circuit court - can't determine which one without more context
    result.courtId = undefined;
  } else if (citation.includes('F. Supp.') || citation.includes('F.Supp.')) {
    // District court - can't determine which one without more context
    result.courtId = undefined;
  }

  // Try to extract case number if present
  const caseNumberMatch = citation.match(/(?:No\.|Case)\s*([\d:-]+cv-[\d]+|[\d-]+)/i);
  if (caseNumberMatch) {
    result.caseNumber = caseNumberMatch[1];
  }

  return result;
}

function buildPACERCaseUrl(courtId: string, caseId: string): string {
  // Map court ID to ECF domain
  const courtDomain = courtId.toLowerCase();
  return `https://ecf.${courtDomain}.uscourts.gov/cgi-bin/DktRpt.pl?${caseId}`;
}

// ============================================================================
// COST TRACKING
// ============================================================================

export function getPACERCostThisSession(): number {
  return totalPACERCost;
}

export function resetPACERCostTracking(): void {
  totalPACERCost = 0;
}

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

export function isPACERConfigured(): boolean {
  return !!(process.env.PACER_USERNAME && process.env.PACER_PASSWORD);
}
