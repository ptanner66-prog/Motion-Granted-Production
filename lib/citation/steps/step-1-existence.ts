/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Step 1: Existence Check with Multi-Source Triangulation
 *
 * CIV Spec Section 4: Deterministic citation lookup
 * - Primary: CourtListener API
 * - Fallback: PACER (for unpublished federal cases)
 *
 * NO AI used in Step 1 - deterministic lookup only.
 */

import { getCourtListenerClient } from '@/lib/workflow/courtlistener-client';
import { verifyCitationWithPACER, isFederalCitation } from '@/lib/citation/pacer-client';
import { courtlistenerCircuit } from '@/lib/circuit-breaker';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export interface Step1Result {
  result: 'VERIFIED' | 'NOT_FOUND' | 'UNPUBLISHED' | 'ERROR';
  courtlistener_id: string | null;
  courtlistener_url: string | null;
  pacer_used: boolean;
  pacer_result?: {
    found: boolean;
    case_id?: string;
    recap_available: boolean;
  };
  confidence: number; // Always 1.0 for existence check (deterministic)
  proceed_to_step_2: boolean;
  normalized_citation: string;
  original_citation: string;
  opinion_text?: string;
  case_name?: string;
  court?: string;
  date_filed?: string;
  source: 'courtlistener' | 'pacer' | 'recap' | 'not_found';
  error?: string;
  duration_ms: number;
}

// ============================================================================
// CITATION NORMALIZATION
// ============================================================================

/**
 * Normalize citation format for consistent lookup
 * - Standardize whitespace
 * - Normalize reporter abbreviations (F. 3d → F.3d)
 * - Standardize party connector (vs. → v.)
 * - Normalize year format
 */
export function normalizeCitation(citation: string): string {
  let normalized = citation.trim();

  // Standardize whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  // Standardize party connector
  normalized = normalized.replace(/\bvs\.?\b/gi, 'v.');

  // Normalize reporter abbreviations
  // F. 3d → F.3d
  normalized = normalized.replace(/F\.\s*3d/gi, 'F.3d');
  normalized = normalized.replace(/F\.\s*2d/gi, 'F.2d');
  normalized = normalized.replace(/F\.\s*Supp\.\s*3d/gi, 'F. Supp. 3d');
  normalized = normalized.replace(/F\.\s*Supp\.\s*2d/gi, 'F. Supp. 2d');
  normalized = normalized.replace(/F\.\s*App['']?x/gi, "F. App'x");

  // Supreme Court reporters
  normalized = normalized.replace(/U\.\s*S\./gi, 'U.S.');
  normalized = normalized.replace(/S\.\s*Ct\./gi, 'S. Ct.');
  normalized = normalized.replace(/L\.\s*Ed\.\s*2d/gi, 'L. Ed. 2d');

  // State reporters
  normalized = normalized.replace(/Cal\.\s*(\d+)th/gi, 'Cal.$1th');
  normalized = normalized.replace(/Cal\.\s*App\.\s*(\d+)th/gi, 'Cal. App. $1th');
  normalized = normalized.replace(/N\.\s*Y\.\s*(\d+)d/gi, 'N.Y.$1d');
  normalized = normalized.replace(/N\.\s*E\.\s*(\d+)d/gi, 'N.E.$1d');

  // Remove extra spaces around periods
  normalized = normalized.replace(/\s+\./g, '.');
  normalized = normalized.replace(/\.\s+/g, '. ').replace(/\. $/g, '.');

  // Normalize parenthetical year format
  normalized = normalized.replace(/\(\s*(\d{4})\s*\)/g, '($1)');
  normalized = normalized.replace(/\(([^)]+?)\s+(\d{4})\s*\)/g, '($1 $2)');

  // Final cleanup
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Extract citation components for analysis
 */
export function extractCitationComponents(citation: string): {
  volume?: string;
  reporter?: string;
  page?: string;
  court?: string;
  year?: number;
  caseName?: string;
} {
  // Pattern: [Case Name,] Volume Reporter Page (Court Year)
  const fullPattern = /^(?:(.+?),?\s+)?(\d+)\s+([A-Za-z.\s']+\d*[a-z]*\.?)\s+(\d+)(?:\s*,?\s*(\d+))?(?:\s*\((.+?)?\s*(\d{4})\))?/i;
  const match = citation.match(fullPattern);

  if (!match) {
    return {};
  }

  return {
    caseName: match[1]?.trim(),
    volume: match[2],
    reporter: match[3]?.trim(),
    page: match[4],
    court: match[6]?.trim(),
    year: match[7] ? parseInt(match[7]) : undefined,
  };
}

// ============================================================================
// EXISTENCE CHECK
// ============================================================================

/**
 * Step 1: Check if citation exists
 *
 * 1. Query CourtListener API (primary)
 * 2. If NOT_FOUND and federal court, query PACER (fallback)
 * 3. Return deterministic result with confidence 1.0
 */
export async function checkCitationExistence(
  citation: string,
  orderId: string,
  options?: {
    skipPacer?: boolean;
    logToDb?: boolean;
  }
): Promise<Step1Result> {
  const startTime = Date.now();
  const normalizedCitation = normalizeCitation(citation);
  const isFederal = isFederalCitation(normalizedCitation);

  const result: Step1Result = {
    result: 'NOT_FOUND',
    courtlistener_id: null,
    courtlistener_url: null,
    pacer_used: false,
    confidence: 1.0, // Deterministic lookup
    proceed_to_step_2: false,
    normalized_citation: normalizedCitation,
    original_citation: citation,
    source: 'not_found',
    duration_ms: 0,
  };

  try {
    // Stage 1: Query CourtListener
    const courtListenerClient = getCourtListenerClient();

    const clResult = await courtlistenerCircuit.execute(async () => {
      return courtListenerClient.checkCitationExists(normalizedCitation);
    });

    if (clResult.found && clResult.citations.length > 0) {
      const firstCitation = clResult.citations[0];

      result.result = 'VERIFIED';
      result.courtlistener_id = String(firstCitation.cluster_id);
      result.courtlistener_url = `https://www.courtlistener.com${firstCitation.absolute_url}`;
      result.case_name = firstCitation.case_name;
      result.court = firstCitation.court;
      result.date_filed = firstCitation.date_filed;
      result.source = 'courtlistener';
      result.proceed_to_step_2 = true;

      // Try to get opinion text for Step 2
      try {
        const opinionResult = await courtListenerClient.getOpinionText(firstCitation.cluster_id);
        if (opinionResult.retrieved && opinionResult.plainText) {
          result.opinion_text = opinionResult.plainText;
        }
      } catch (opinionError) {
        console.warn(`[Step1] Could not retrieve opinion text: ${opinionError}`);
        // Not fatal - we still have existence confirmed
      }

      // Check if unpublished
      if (firstCitation.status && firstCitation.status.toLowerCase().includes('unpublished')) {
        result.result = 'UNPUBLISHED';
      }
    } else if (clResult.error) {
      console.warn(`[Step1] CourtListener error: ${clResult.error}`);
      // Continue to PACER fallback if federal
    }

    // Stage 2: PACER fallback for federal citations not found in CourtListener
    if (result.result === 'NOT_FOUND' && isFederal && !options?.skipPacer) {
      console.log(`[Step1] Citation not in CourtListener, trying PACER: ${normalizedCitation}`);
      result.pacer_used = true;

      try {
        const pacerResult = await verifyCitationWithPACER(normalizedCitation);

        const isRecap = pacerResult.source === 'RECAP';
        result.pacer_result = {
          found: pacerResult.found,
          case_id: pacerResult.caseNumber,
          recap_available: isRecap,
        };

        if (pacerResult.found) {
          result.result = isRecap ? 'VERIFIED' : 'UNPUBLISHED';
          result.source = isRecap ? 'recap' : 'pacer';
          result.proceed_to_step_2 = true;

          if (pacerResult.caseName) {
            result.case_name = pacerResult.caseName;
          }
          if (pacerResult.court) {
            result.court = pacerResult.court;
          }
          // Note: PACER doesn't return opinion text directly
          // It would need to be fetched separately via documentUrl if available
        }
      } catch (pacerError) {
        console.error(`[Step1] PACER lookup failed: ${pacerError}`);
        result.error = `PACER lookup failed: ${pacerError instanceof Error ? pacerError.message : 'Unknown error'}`;
        // Don't fail the whole step - just mark as not found
      }
    }

    result.duration_ms = Date.now() - startTime;

    // Log to database if requested
    if (options?.logToDb) {
      await logStep1Result(orderId, citation, result);
    }

    console.log(`[Step1] ${normalizedCitation}: ${result.result} (${result.source}, ${result.duration_ms}ms)`);
    return result;

  } catch (error) {
    result.result = 'ERROR';
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.duration_ms = Date.now() - startTime;

    console.error(`[Step1] Error checking citation existence: ${result.error}`);

    if (options?.logToDb) {
      await logStep1Result(orderId, citation, result);
    }

    return result;
  }
}

/**
 * Batch existence check for multiple citations
 * Uses parallel processing with concurrency control
 */
export async function checkCitationExistenceBatch(
  citations: string[],
  orderId: string,
  options?: {
    concurrency?: number;
    skipPacer?: boolean;
    logToDb?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, Step1Result>> {
  const concurrency = options?.concurrency ?? 5;
  const results = new Map<string, Step1Result>();

  // Process in batches to respect rate limits
  for (let i = 0; i < citations.length; i += concurrency) {
    const batch = citations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(citation =>
        checkCitationExistence(citation, orderId, {
          skipPacer: options?.skipPacer,
          logToDb: options?.logToDb,
        })
      )
    );

    // Store results
    batch.forEach((citation, index) => {
      results.set(citation, batchResults[index]);
    });

    // Progress callback
    if (options?.onProgress) {
      options.onProgress(Math.min(i + concurrency, citations.length), citations.length);
    }

    // Small delay between batches to prevent rate limiting
    if (i + concurrency < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep1Result(
  orderId: string,
  citation: string,
  result: Step1Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citation,
      normalized_citation: result.normalized_citation,
      step_number: 1,
      step_name: 'existence_check',
      status: result.result,
      source: result.source,
      courtlistener_id: result.courtlistener_id,
      courtlistener_url: result.courtlistener_url,
      pacer_used: result.pacer_used,
      confidence: result.confidence,
      duration_ms: result.duration_ms,
      error_message: result.error,
      raw_response: {
        pacer_result: result.pacer_result,
        case_name: result.case_name,
        court: result.court,
        date_filed: result.date_filed,
      },
    });
  } catch (error) {
    console.error('[Step1] Failed to log result to database:', error);
    // Don't throw - logging failure shouldn't break the pipeline
  }
}

// ============================================================================
// CACHE HELPERS
// ============================================================================

/**
 * Check if we have a cached existence result
 * CourtListener responses can be cached indefinitely (VPI)
 */
export async function getCachedExistenceResult(
  normalizedCitation: string
): Promise<Step1Result | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('verified_citations')
      .select('*')
      .eq('normalized_citation', normalizedCitation)
      .eq('vpi_verified', true)
      .single();

    if (error || !data) {
      return null;
    }

    // Return cached result
    return {
      result: 'VERIFIED',
      courtlistener_id: data.courtlistener_id,
      courtlistener_url: data.courtlistener_url,
      pacer_used: false,
      confidence: 1.0,
      proceed_to_step_2: true,
      normalized_citation: normalizedCitation,
      original_citation: data.original_citation,
      case_name: data.case_name,
      court: data.court,
      source: 'courtlistener',
      duration_ms: 0, // Cached result
    };
  } catch {
    return null;
  }
}

/**
 * Cache a verified citation for future lookups
 */
export async function cacheExistenceResult(
  result: Step1Result,
  orderId: string
): Promise<void> {
  if (result.result !== 'VERIFIED' && result.result !== 'UNPUBLISHED') {
    return; // Only cache successful verifications
  }

  try {
    const supabase = await createClient();

    await supabase.from('verified_citations').upsert({
      normalized_citation: result.normalized_citation,
      original_citation: result.original_citation,
      courtlistener_id: result.courtlistener_id,
      courtlistener_url: result.courtlistener_url,
      case_name: result.case_name,
      court: result.court,
      date_filed: result.date_filed,
      vpi_verified: true,
      first_verified_order_id: orderId,
      verification_count: 1,
    }, {
      onConflict: 'normalized_citation',
      ignoreDuplicates: false,
    });
  } catch (error) {
    console.error('[Step1] Failed to cache result:', error);
    // Don't throw - caching failure shouldn't break the pipeline
  }
}

export default {
  checkCitationExistence,
  checkCitationExistenceBatch,
  normalizeCitation,
  extractCitationComponents,
  getCachedExistenceResult,
  cacheExistenceResult,
};
