/**
 * CIV Step 1: Existence Check
 *
 * Multi-source triangulation to verify citation exists in legal databases.
 * Catches hallucinated citations before any further processing.
 *
 * Sources:
 * 1. CourtListener (PRIMARY) - 10M+ cases
 * 2. Case.law (FALLBACK) - Harvard Law School collection
 * 3. RECAP (UNPUBLISHED) - Federal PACER documents
 */

import { verifyCitationExists as courtListenerVerify, searchRECAP } from '@/lib/courtlistener/client';
import { verifyCitationExists as caseLawVerify } from '@/lib/caselaw/client';
import { normalizeCitation, parseCitation, createOrUpdateCitation } from '../database';
import type { ExistenceCheckOutput, NormalizedCitation } from '../types';

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
 * 2. Query CourtListener (primary)
 * 3. If found in CourtListener, validate with Case.law
 * 4. If not in CourtListener, try Case.law
 * 5. If federal and not found, check RECAP for unpublished
 * 6. Return verification result
 */
export async function executeExistenceCheck(
  citationString: string,
  caseName?: string
): Promise<ExistenceCheckOutput> {
  const startTime = Date.now();
  const sourcesChecked: Array<'courtlistener' | 'caselaw' | 'recap'> = [];

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
    // Step 2: Query CourtListener (PRIMARY)
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

      // Step 3: Validate with Case.law for additional confidence
      const caseLawResult = await caseLawVerify(
        normalizedCitation.normalized,
        caseName || normalizedCitation.caseName
      );
      sourcesChecked.push('caselaw');

      if (caseLawResult.success && caseLawResult.data?.exists) {
        result.caselawId = caseLawResult.data.caselawId;
        result.caselawUrl = caseLawResult.data.caselawUrl;
        // Both sources agree - highest confidence
        result.confidence = 1.0;
      }

      // Store in VPI cache
      await storeCitationInVPI(citationString, normalizedCitation, result, courtListenerResult.data);

      result.sourcesChecked = sourcesChecked;
      return result;
    }

    // Step 4: Not in CourtListener - try Case.law
    const caseLawResult = await caseLawVerify(
      normalizedCitation.normalized,
      caseName || normalizedCitation.caseName
    );
    sourcesChecked.push('caselaw');

    if (caseLawResult.success && caseLawResult.data?.exists) {
      // Found in Case.law but not CourtListener (CourtListener may have lag)
      result = {
        ...result,
        result: 'VERIFIED',
        caselawId: caseLawResult.data.caselawId,
        caselawUrl: caseLawResult.data.caselawUrl,
        isPublished: true, // Case.law primarily has published opinions
        confidence: 0.95, // Slightly lower confidence since only one source
        proceedToStep2: true,
      };

      // Store in VPI cache
      await storeCitationInVPI(citationString, normalizedCitation, result, caseLawResult.data);

      result.sourcesChecked = sourcesChecked;
      return result;
    }

    // Step 5: Check if federal court - try RECAP for unpublished
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
        return result;
      }
    }

    // Step 6: Not found anywhere
    result = {
      ...result,
      result: 'NOT_FOUND',
      sourcesChecked,
      confidence: 0,
      proceedToStep2: false,
    };

    return result;
  } catch (error) {
    console.error('Existence check error:', error);

    return {
      ...result,
      result: 'NOT_FOUND',
      sourcesChecked,
      confidence: 0,
      proceedToStep2: false,
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
    caselawId?: string;
    caselawUrl?: string;
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
      caselawId: result.caselawId || sourceData.caselawId,
      caselawUrl: result.caselawUrl || sourceData.caselawUrl,
      isPublished: result.isPublished,
      precedentialStatus: result.precedentialStatus || sourceData.precedentialStatus,
    });
  } catch (error) {
    // Non-fatal - log but continue
    console.error('Failed to store citation in VPI:', error);
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

  // Process in batches
  for (let i = 0; i < citations.length; i += concurrencyLimit) {
    const batch = citations.slice(i, i + concurrencyLimit);

    const batchResults = await Promise.all(
      batch.map(({ citation, caseName }) => executeExistenceCheck(citation, caseName))
    );

    results.push(...batchResults);
  }

  return results;
}
