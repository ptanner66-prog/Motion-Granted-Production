/**
 * CIV Step 1: Existence Check
 *
 * Multi-source triangulation to verify citation exists in legal databases.
 * Catches hallucinated citations before any further processing.
 *
 * UPDATED FLOW (January 2026):
 * - Case.law (Harvard) was SUNSET on September 5, 2024 - REMOVED
 * - New flow: CourtListener (PRIMARY) → PACER (FALLBACK for unpublished federal only)
 *
 * Sources:
 * 1. CourtListener (PRIMARY) - 10M+ cases via RECAP and scrapers
 * 2. PACER (FALLBACK) - Federal unpublished cases only (~$0.10/lookup)
 */

import { verifyCitationExists as courtListenerVerify, searchRECAP } from '@/lib/courtlistener/client';
import { lookupPACER, isPACERConfigured } from '@/lib/pacer/client';
import { waitForToken } from '@/lib/rate-limiter';
import { normalizeCitation, parseCitation, createOrUpdateCitation } from '../database';
import type { ExistenceCheckOutput, NormalizedCitation } from '../types';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-civ-steps-step-1-existence');
/**
 * Parse and normalize a citation string
 */
export function normalizeAndParseCitation(citationString: string): NormalizedCitation {
  const normalized = normalizeCitation(citationString);
  const parsed = parseCitation(citationString);

  return {
    original: citationString,
    normalized,
    caseName: parsed.caseName,
    volume: parsed.volume,
    reporter: parsed.reporter,
    page: parsed.page,
    court: parsed.court,
    year: parsed.year,
    isValid: !!(parsed.caseName || (parsed.volume && parsed.reporter && parsed.page)),
    parseErrors: [],
  };
}

/**
 * Execute Step 1: Existence Check
 *
 * Flow:
 * 1. Normalize citation
 * 2. Query CourtListener (primary) with rate limiting
 * 3. If federal and not found, check RECAP for unpublished
 * 4. If still not found and federal, check PACER (costs ~$0.10)
 * 5. Return verification result
 *
 * NOTE: Case.law removed - API was sunset September 5, 2024
 */
export async function executeExistenceCheck(
  citationString: string,
  caseName?: string
): Promise<ExistenceCheckOutput> {
  const startTime = Date.now();
  const sourcesChecked: Array<'courtlistener' | 'pacer' | 'recap'> = [];

  // Step 1: Normalize citation
  const normalizedCitation = normalizeAndParseCitation(citationString);

  // Initialize result
  let result: ExistenceCheckOutput = {
    step: 1,
    name: 'existence_check',
    citationInput: citationString,
    citationNormalized: normalizedCitation.normalized,
    result: 'NOT_FOUND',
    sourcesChecked: [],
    isPublished: true,
    confidence: 0,
    proceedToStep2: false,
  };

  try {
    // =========================================================================
    // STEP 1A: CourtListener (PRIMARY)
    // Rate limited: 60/minute, 5,000/hour
    // =========================================================================
    const hasToken = await waitForToken('courtlistener', 10000);
    if (!hasToken) {
      log.warn('[CIV Step 1] CourtListener rate limit hit, waiting...');
      await waitForToken('courtlistener', 30000);
    }

    // Also check hourly limit
    await waitForToken('courtlistener_hourly', 1000);

    const courtListenerResult = await courtListenerVerify(
      normalizedCitation.normalized,
      caseName || normalizedCitation.caseName
    );
    sourcesChecked.push('courtlistener');

    if (courtListenerResult.success && courtListenerResult.data?.exists) {
      // Found in CourtListener
      result = {
        ...result,
        result: courtListenerResult.data.isPublished ? 'VERIFIED' : 'UNPUBLISHED',
        courtlistenerId: courtListenerResult.data.courtlistenerId,
        courtlistenerUrl: courtListenerResult.data.courtlistenerUrl,
        isPublished: courtListenerResult.data.isPublished ?? true,
        precedentialStatus: courtListenerResult.data.precedentialStatus,
        confidence: 1.0,
        proceedToStep2: courtListenerResult.data.isPublished ?? true,
      };

      // Store in VPI cache
      await storeCitationInVPI(citationString, normalizedCitation, result, courtListenerResult.data);

      result.sourcesChecked = sourcesChecked;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // =========================================================================
    // STEP 1B: Check RECAP (part of CourtListener) for unpublished federal
    // =========================================================================
    const isFederal = isFederalCitation(normalizedCitation.reporter || '', normalizedCitation.court);

    if (isFederal) {
      const recapResult = await searchRECAP(
        caseName || normalizedCitation.caseName || citationString
      );
      sourcesChecked.push('recap');

      if (recapResult.success && recapResult.data?.found) {
        result = {
          ...result,
          result: 'UNPUBLISHED',
          isPublished: false,
          precedentialStatus: 'Unpublished',
          confidence: 0.85,
          proceedToStep2: false, // Unpublished - per Decision 4, refuse all
        };

        result.sourcesChecked = sourcesChecked;
        result.durationMs = Date.now() - startTime;
        return result;
      }
    }

    // =========================================================================
    // STEP 1C: PACER (FALLBACK - Unpublished Federal Only)
    // Only attempt PACER if:
    // 1. CourtListener didn't find it
    // 2. It looks like a federal citation
    // 3. PACER is configured
    // COST: ~$0.10 per lookup
    // =========================================================================
    if (isFederal && isPACERConfigured()) {
      log.info('[CIV Step 1] Citation not in CourtListener, checking PACER (federal unpublished)...');

      // Rate limit PACER to control costs
      const hasPacerToken = await waitForToken('pacer', 5000);
      if (!hasPacerToken) {
        log.warn('[CIV Step 1] PACER rate limit hit, skipping PACER lookup');
      } else {
        const pacerResult = await lookupPACER(citationString);
        sourcesChecked.push('pacer');

        if (pacerResult.found) {
          result = {
            ...result,
            result: 'UNPUBLISHED',
            isPublished: false,
            precedentialStatus: 'Unpublished',
            confidence: 0.9,
            proceedToStep2: false, // Per binding decision #4: Refuse all unpublished
            pacerCaseId: pacerResult.caseId,
            pacerUrl: pacerResult.url,
            pacerCost: pacerResult.cost,
          };

          result.sourcesChecked = sourcesChecked;
          result.durationMs = Date.now() - startTime;
          return result;
        }
      }
    }

    // =========================================================================
    // EXISTENCE FAILED - Citation not found in any source
    // =========================================================================
    result = {
      ...result,
      result: 'NOT_FOUND',
      sourcesChecked,
      confidence: 0,
      proceedToStep2: false,
      durationMs: Date.now() - startTime,
    };

    return result;
  } catch (error) {
    log.error('[CIV Step 1] Existence check error:', error);

    return {
      ...result,
      result: 'NOT_FOUND',
      sourcesChecked,
      confidence: 0,
      proceedToStep2: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Determine if citation is from a federal court
 */
function isFederalCitation(reporter: string, court?: string): boolean {
  const federalReporters = [
    'U.S.',
    'S. Ct.',
    'S.Ct.',
    'L. Ed.',
    'L.Ed.',
    'F.',
    'F.2d',
    'F.3d',
    'F.4th',
    'F. Supp.',
    'F.Supp.',
    'F. Supp. 2d',
    'F. Supp. 3d',
    'B.R.',
    'Fed. Cl.',
    'Fed.Cl.',
    'Fed. Appx.', // Federal Appendix (unpublished)
  ];

  const federalCourts = [
    'Supreme Court',
    'SCOTUS',
    'Circuit',
    'Cir.',
    'District Court',
    'D.',
    'E.D.',
    'W.D.',
    'N.D.',
    'S.D.',
    'C.D.',
    'M.D.',
  ];

  // Check reporter
  for (const fedReporter of federalReporters) {
    if (reporter.includes(fedReporter)) {
      return true;
    }
  }

  // Check court
  if (court) {
    for (const fedCourt of federalCourts) {
      if (court.includes(fedCourt)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Store verified citation in VPI database
 */
async function storeCitationInVPI(
  originalCitation: string,
  normalized: NormalizedCitation,
  result: ExistenceCheckOutput,
  sourceData: {
    caseName?: string;
    court?: string;
    year?: number;
    dateDecided?: string;
    courtlistenerId?: string;
    courtlistenerUrl?: string;
    isPublished?: boolean;
    precedentialStatus?: string;
  }
): Promise<void> {
  try {
    await createOrUpdateCitation({
      citationString: originalCitation,
      caseName: sourceData.caseName || normalized.caseName || 'Unknown',
      court: sourceData.court || normalized.court,
      year: sourceData.year || normalized.year,
      volume: normalized.volume,
      reporter: normalized.reporter,
      startingPage: normalized.page,
      decisionDate: sourceData.dateDecided,
      courtlistenerId: result.courtlistenerId || sourceData.courtlistenerId,
      courtlistenerUrl: result.courtlistenerUrl || sourceData.courtlistenerUrl,
      isPublished: result.isPublished,
      precedentialStatus: result.precedentialStatus || sourceData.precedentialStatus,
    });
  } catch (error) {
    // Non-fatal - log but continue
    log.error('[CIV Step 1] Failed to store citation in VPI:', error);
  }
}

/**
 * Batch existence check for multiple citations
 * Processes in parallel with configurable concurrency
 */
export async function batchExistenceCheck(
  citations: Array<{ citation: string; caseName?: string }>,
  concurrencyLimit: number = 5
): Promise<ExistenceCheckOutput[]> {
  const results: ExistenceCheckOutput[] = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < citations.length; i += concurrencyLimit) {
    const batch = citations.slice(i, i + concurrencyLimit);

    // BUG-FIX: Use Promise.allSettled to prevent one citation error from killing entire batch.
    // Promise.all rejects if ANY promise rejects — one transient network error loses all citations.
    const batchSettled = await Promise.allSettled(
      batch.map(({ citation, caseName }) => executeExistenceCheck(citation, caseName))
    );

    for (const settled of batchSettled) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // Failed citation gets a safe NOT_FOUND result instead of crashing the batch
        results.push({
          result: 'NOT_FOUND' as const,
          citationNormalized: '',
          sourcesChecked: [],
          confidence: 0,
          proceedToStep2: false,
          durationMs: 0,
          error: settled.reason instanceof Error ? settled.reason.message : 'Batch citation check failed',
        } as ExistenceCheckOutput);
      }
    }

    // Brief pause between batches to avoid rate limit issues
    if (i + concurrencyLimit < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
