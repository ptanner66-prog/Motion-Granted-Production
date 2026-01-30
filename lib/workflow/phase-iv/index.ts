/**
 * Phase IV Orchestrator — Legal-Grade Citation Research
 *
 * Chen Megaprompt Specification — January 30, 2026
 *
 * Phase IV becomes THREE sub-phases:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PHASE IV-A: ELEMENT EXTRACTION                      (~15 sec)  │
 * │  Extract 4-6 legal elements that need citation support          │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PHASE IV-B: PARALLEL TARGETED SEARCH                (~10 sec)  │
 * │  Search THREE tiers IN PARALLEL via Promise.all                 │
 * │  OUTPUT: 30-60 raw candidate citations                          │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PHASE IV-C: HOLDING VERIFICATION + SCORING          (~30 sec)  │
 * │  Verify holdings, score, select TOP 8-15 citations              │
 * └─────────────────────────────────────────────────────────────────┘
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  type PhaseIVInput,
  type PhaseIVOutput,
  type MotionTypeCode,
  MOTION_STATUTORY_BANKS,
} from '@/types/citation-research';
import { extractElements, buildElementPriorityMap } from './element-extraction';
import { executeParallelSearch } from './parallel-search';
import { verifyHoldings } from './holding-verification';
import { countByCourtType } from './scoring';
import { validateCourtListenerConfig } from '@/lib/courtlistener/client';

// ============================================================================
// GRACEFUL DEGRADATION HELPER
// ============================================================================

/**
 * Flag an order for manual review in Supabase
 *
 * Instead of hard-failing when citation count is low, we flag the order
 * for manual review by a human attorney.
 */
async function flagForManualReview(
  orderId: string,
  reason: string,
  citationCount: number
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[Phase IV] Cannot flag for manual review: Supabase not configured');
    return false;
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    const qualityNotes = `[AUTO-FLAGGED] Phase IV Citation Research: ${reason}. ` +
      `Citations found: ${citationCount}. ` +
      `Flagged at: ${new Date().toISOString()}. ` +
      `Requires attorney review before delivery.`;

    const { error } = await supabase
      .from('orders')
      .update({
        needs_manual_review: true,
        quality_notes: qualityNotes,
      })
      .eq('id', orderId);

    if (error) {
      console.error('[Phase IV] Failed to flag order for manual review:', error);
      return false;
    }

    console.warn(`[Phase IV] ⚠️ Order ${orderId} flagged for manual review: ${reason}`);
    return true;
  } catch (error) {
    console.error('[Phase IV] Error flagging for manual review:', error);
    return false;
  }
}

// ============================================================================
// VERSION TRACKING
// ============================================================================

const PHASE_IV_VERSION = '2026-01-30-CHEN-TIMEOUT-FIX';
const PHASE_IV_GUARANTEE = 'LEGAL_GRADE_CITATION_RESEARCH';

// ============================================================================
// PHASE IV ORCHESTRATOR
// ============================================================================

/**
 * Execute Legal-Grade Citation Research (Phase IV)
 *
 * This orchestrates the three sub-phases:
 * - Phase IV-A: Element Extraction (~15 sec)
 * - Phase IV-B: Parallel Targeted Search (~10 sec)
 * - Phase IV-C: Holding Verification + Scoring (~30 sec)
 *
 * Total target: < 60 seconds
 */
export async function executeLegalGradeResearch(
  input: PhaseIVInput,
  anthropicClient: Anthropic
): Promise<PhaseIVOutput> {
  const executionId = `p4-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const start = Date.now();

  console.log('╔' + '═'.repeat(72) + '╗');
  console.log('║  PHASE IV: LEGAL-GRADE CITATION RESEARCH                             ║');
  console.log('║  VERSION: ' + PHASE_IV_VERSION.padEnd(60) + '║');
  console.log('║  EXECUTION ID: ' + executionId.padEnd(55) + '║');
  console.log('╚' + '═'.repeat(72) + '╝');
  console.log(`[Phase IV] Order ID: ${input.orderId}`);
  console.log(`[Phase IV] Motion Type: ${input.motionType}`);
  console.log(`[Phase IV] Jurisdiction: ${input.jurisdiction}`);
  console.log(`[Phase IV] Tier: ${input.tier}`);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PREREQUISITE: Validate CourtListener API
    // ═══════════════════════════════════════════════════════════════════════
    const configCheck = await validateCourtListenerConfig();
    if (!configCheck.configured) {
      throw new Error(`CourtListener not configured: ${configCheck.error}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE IV-A: ELEMENT EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n[Phase IV] ═══ PHASE IV-A: ELEMENT EXTRACTION ═══`);
    const phaseAStart = Date.now();

    const elementResult = await extractElements({
      motionType: input.motionType,
      jurisdiction: input.jurisdiction,
      statementOfFacts: input.statementOfFacts,
      phaseIIOutput: input.phaseIIOutput,
      phaseIIIOutput: input.phaseIIIOutput,
    }, anthropicClient);

    const phaseADuration = Date.now() - phaseAStart;

    if (!elementResult.success || elementResult.elements.length === 0) {
      throw new Error(`Element extraction failed: ${elementResult.error || 'No elements extracted'}`);
    }

    console.log(`[Phase IV-A] Elements: ${elementResult.totalElements}`);
    console.log(`[Phase IV-A] Critical: ${elementResult.criticalElements}`);
    console.log(`[Phase IV-A] Duration: ${phaseADuration}ms`);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE IV-B: PARALLEL TARGETED SEARCH
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n[Phase IV] ═══ PHASE IV-B: PARALLEL TARGETED SEARCH ═══`);
    const phaseBStart = Date.now();

    const searchResult = await executeParallelSearch({
      elements: elementResult.elements,
      jurisdiction: input.jurisdiction,
      maxCandidatesPerElement: 10,
    });

    const phaseBDuration = Date.now() - phaseBStart;

    // GRACEFUL DEGRADATION: Flag for manual review instead of hard throw
    if (!searchResult.success || searchResult.candidates.length === 0) {
      const reason = 'No candidates found from CourtListener search';
      await flagForManualReview(input.orderId, reason, 0);
      throw new Error(`Phase IV failed: ${reason}. Order flagged for manual review.`);
    }

    console.log(`[Phase IV-B] Candidates: ${searchResult.totalCandidates}`);
    console.log(`[Phase IV-B] Searches: ${searchResult.searchesExecuted} (parallel)`);
    console.log(`[Phase IV-B] Duration: ${phaseBDuration}ms`);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE IV-C: HOLDING VERIFICATION + SCORING
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n[Phase IV] ═══ PHASE IV-C: HOLDING VERIFICATION + SCORING ═══`);
    const phaseCStart = Date.now();

    const verificationResult = await verifyHoldings({
      candidates: searchResult.candidates,
      elements: elementResult.elements,
      jurisdiction: input.jurisdiction,
    }, anthropicClient);

    const phaseCDuration = Date.now() - phaseCStart;

    // ═══════════════════════════════════════════════════════════════════════
    // GRACEFUL DEGRADATION: Citation count thresholds
    // ═══════════════════════════════════════════════════════════════════════
    const citationCount = verificationResult.selectedCitations.length;

    if (citationCount === 0) {
      // FATAL: No citations at all - flag and throw
      const reason = 'No citations survived verification (all NO_SUPPORT or failed)';
      await flagForManualReview(input.orderId, reason, 0);
      throw new Error(`Phase IV failed: ${reason}. Order flagged for manual review.`);
    } else if (citationCount >= 1 && citationCount <= 3) {
      // INSUFFICIENT: Flag and throw - too few for quality document
      const reason = `Insufficient citations (${citationCount}/6 minimum)`;
      await flagForManualReview(input.orderId, reason, citationCount);
      throw new Error(`Phase IV failed: ${reason}. Order flagged for manual review.`);
    } else if (citationCount >= 4 && citationCount <= 5) {
      // MARGINAL: Flag but continue - document can proceed with warning
      const reason = `Marginal citation count (${citationCount}/6 target)`;
      await flagForManualReview(input.orderId, reason, citationCount);
      console.warn(`[Phase IV-C] ⚠️ ${reason} - proceeding with flagged order`);
    } else {
      // 6+ citations - proceed normally
      console.log(`[Phase IV-C] ✓ Citation count OK: ${citationCount} citations`);
    }

    console.log(`[Phase IV-C] Verified: ${verificationResult.totalVerified}`);
    console.log(`[Phase IV-C] Selected: ${verificationResult.totalSelected}`);
    console.log(`[Phase IV-C] Avg Score: ${verificationResult.averageScore}`);
    console.log(`[Phase IV-C] Duration: ${phaseCDuration}ms`);

    // ═══════════════════════════════════════════════════════════════════════
    // FINAL VALIDATION & OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    const selectedCitations = verificationResult.selectedCitations;
    const counts = countByCourtType(selectedCitations);

    // Get statutory bank for this motion type
    const statutoryBank = MOTION_STATUTORY_BANKS[input.motionType] || [];

    // NUCLEAR VALIDATION: Every citation MUST have courtlistener_id
    for (const citation of selectedCitations) {
      if (!citation.courtlistener_id) {
        throw new Error(`FATAL: Citation "${citation.caseName}" missing courtlistener_id`);
      }
    }

    const totalDuration = Date.now() - start;

    // ═══════════════════════════════════════════════════════════════════════
    // REPORT
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║              LEGAL-GRADE CITATION RESEARCH — COMPLETE                  ║`);
    console.log(`╚════════════════════════════════════════════════════════════════════════╝`);
    console.log(`
PHASE IV-A: Element Extraction
- Elements extracted: ${elementResult.totalElements}
- Custom elements added: ${elementResult.customElements}
- Duration: ${phaseADuration}ms

PHASE IV-B: Parallel Search
- Searches executed: ${searchResult.searchesExecuted} (parallel)
- Candidates found: ${searchResult.totalCandidates}
- Duration: ${phaseBDuration}ms

PHASE IV-C: Holding Verification
- Candidates verified: ${verificationResult.totalVerified}
- Citations selected: ${verificationResult.totalSelected}
- Average score: ${verificationResult.averageScore}
- Duration: ${phaseCDuration}ms

FINAL CITATION BANK:
- Total: ${selectedCitations.length} citations
- Binding (LA courts): ${counts.binding}
- Persuasive (Federal): ${counts.persuasive}
- Louisiana: ${counts.louisiana}
- Federal: ${counts.federal}
- Element coverage: ${verificationResult.elementCoverage.size}/${elementResult.totalElements}

Total Duration: ${totalDuration}ms
`);

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    // With graceful degradation, 4+ citations is considered success
    // (4-5 will have needs_manual_review=true in Supabase)
    return {
      success: selectedCitations.length >= 4,

      // Citation banks
      caseCitationBank: selectedCitations,
      statutoryCitationBank: statutoryBank,

      // Metrics
      totalCitations: selectedCitations.length,
      bindingCount: counts.binding,
      persuasiveCount: counts.persuasive,
      louisianaCitations: counts.louisiana,
      federalCitations: counts.federal,

      // Element coverage
      elementsCovered: verificationResult.elementCoverage.size,
      totalElements: elementResult.totalElements,

      // Timing
      phaseADuration,
      phaseBDuration,
      phaseCDuration,
      totalDuration,

      // Verification proof
      verificationProof: {
        searchesPerformed: searchResult.searchesExecuted,
        candidatesFound: searchResult.totalCandidates,
        candidatesVerified: verificationResult.totalVerified,
        citationsSelected: verificationResult.totalSelected,
        allCitationsVerified: true,
        verificationSource: 'CourtListener API',
        verificationTimestamp: new Date().toISOString(),
      },

      // Version tracking
      _phaseIV_meta: {
        version: PHASE_IV_VERSION,
        executionId,
        executedAt: new Date().toISOString(),
        codeGuarantee: PHASE_IV_GUARANTEE,
      },

      // With graceful degradation: 4-5 citations = warning, <4 would have thrown
      error: selectedCitations.length < 6
        ? `Marginal citation count: ${selectedCitations.length}/6 target (order flagged for review)`
        : undefined,
    };
  } catch (error) {
    console.error('[Phase IV] FATAL ERROR:', error);

    return {
      success: false,
      caseCitationBank: [],
      statutoryCitationBank: [],
      totalCitations: 0,
      bindingCount: 0,
      persuasiveCount: 0,
      louisianaCitations: 0,
      federalCitations: 0,
      elementsCovered: 0,
      totalElements: 0,
      phaseADuration: 0,
      phaseBDuration: 0,
      phaseCDuration: 0,
      totalDuration: Date.now() - start,
      verificationProof: {
        searchesPerformed: 0,
        candidatesFound: 0,
        candidatesVerified: 0,
        citationsSelected: 0,
        allCitationsVerified: true,
        verificationSource: 'CourtListener API',
        verificationTimestamp: new Date().toISOString(),
      },
      _phaseIV_meta: {
        version: PHASE_IV_VERSION,
        executionId,
        executedAt: new Date().toISOString(),
        codeGuarantee: PHASE_IV_GUARANTEE,
      },
      error: error instanceof Error ? error.message : 'Phase IV failed',
    };
  }
}

// ============================================================================
// MOTION TYPE MAPPING
// ============================================================================

/**
 * Map motion type string to MotionTypeCode
 */
export function mapMotionType(motionType: string): MotionTypeCode {
  const normalized = motionType.toUpperCase().replace(/\s+/g, '_');

  // Direct matches
  if (normalized === 'MCOMPEL' || normalized.includes('COMPEL')) return 'MCOMPEL';
  if (normalized === 'MTD_12B6' || normalized.includes('DISMISS')) return 'MTD_12B6';
  if (normalized === 'MSJ' || normalized.includes('SUMMARY')) return 'MSJ';
  if (normalized === 'MTC' || normalized.includes('CONTINUE')) return 'MTC';
  if (normalized === 'MSTRIKE' || normalized.includes('STRIKE')) return 'MSTRIKE';
  if (normalized === 'MEXT' || normalized.includes('EXTENSION')) return 'MEXT';
  if (normalized === 'MPRO_HAC' || normalized.includes('PRO_HAC')) return 'MPRO_HAC';

  return 'GENERIC';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  extractElements,
  buildElementPriorityMap,
} from './element-extraction';

export {
  executeParallelSearch,
} from './parallel-search';

export {
  verifyHoldings,
} from './holding-verification';

export {
  calculateAuthorityScore,
  calculateRecencyScore,
  calculateRelevanceScore,
  calculateTotalScore,
  scoreCandidate,
  selectTopCitations,
  sortByLouisianaPreference,
  countByCourtType,
  determineAuthorityLevel,
} from './scoring';
