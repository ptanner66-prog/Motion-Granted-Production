/**
 * VPI (Verified Precedent Index) Database Operations
 *
 * CRUD operations for the citation verification cache system.
 * All operations use service role client to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('citation-civ-database');
import type {
  PropositionType,
  HoldingVerificationResult,
  BadLawStatus,
  StabilityClass,
  CitationTrend,
  StrengthAssessment,
  VPICacheResult,
} from './types';

// Get admin client with service role
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Database not configured. Missing environment variables.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize citation string for consistent storage and lookup
 */
export function normalizeCitation(citationText: string): string {
  let normalized = citationText;

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Standardize vs./vs to v.
  normalized = normalized.replace(/\s+vs\.?\s+/gi, ' v. ');

  // Standardize reporter spacing (F. 3d -> F.3d)
  normalized = normalized.replace(/(\w)\.\s+(\d)/g, '$1.$2');

  return normalized;
}

/**
 * Hash proposition text for cache lookup
 */
export function hashProposition(propositionText: string): string {
  const normalized = propositionText.toLowerCase().trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Parse citation string into components
 */
export function parseCitation(citationText: string): {
  caseName?: string;
  volume?: number;
  reporter?: string;
  page?: number;
  court?: string;
  year?: number;
} {
  // Common citation pattern: Case Name, Volume Reporter Page (Court Year)
  // Example: "Jones v. Smith, 500 F.3d 100 (9th Cir. 2020)"

  const result: ReturnType<typeof parseCitation> = {};

  // Extract year (in parentheses at end)
  const yearMatch = citationText.match(/\(([^)]*\s)?(\d{4})\s*\)$/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[2], 10);
    // Try to extract court from same parentheses
    if (yearMatch[1]) {
      result.court = yearMatch[1].trim();
    }
  }

  // Extract case name (before the comma and volume)
  const caseNameMatch = citationText.match(/^([^,]+(?:,\s*(?:Inc\.|Corp\.|Co\.|LLC|Ltd\.)[^,]*)?),/i);
  if (caseNameMatch) {
    result.caseName = caseNameMatch[1].trim();
  }

  // Extract volume, reporter, page
  // Pattern: comma, then volume (number), reporter (letters/periods/numbers), page (number)
  const citationMatch = citationText.match(/,\s*(\d+)\s+([A-Za-z][A-Za-z0-9.\s]*?)\s+(\d+)/);
  if (citationMatch) {
    result.volume = parseInt(citationMatch[1], 10);
    result.reporter = citationMatch[2].trim();
    result.page = parseInt(citationMatch[3], 10);
  }

  return result;
}

// ============================================================================
// VERIFIED_CITATIONS TABLE OPERATIONS
// ============================================================================

export interface CreateCitationInput {
  citationString: string;
  caseName: string;
  court?: string;
  year?: number;
  volume?: number;
  reporter?: string;
  startingPage?: number;
  decisionDate?: string;
  courtlistenerId?: string;
  courtlistenerUrl?: string;
  caselawId?: string;
  caselawUrl?: string;
  isPublished?: boolean;
  precedentialStatus?: string;
}

export interface VerifiedCitation {
  id: string;
  citationString: string;
  normalizedCitation: string;
  caseName: string;
  volume?: number;
  reporter?: string;
  startingPage?: number;
  court?: string;
  decisionDate?: string;
  year?: number;
  courtlistenerId?: string;
  courtlistenerUrl?: string;
  caselawId?: string;
  caselawUrl?: string;
  isPublished: boolean;
  precedentialStatus?: string;
  timesVerified: number;
  firstVerifiedAt: string;
  lastVerifiedAt: string;
}

/**
 * Create or update a verified citation
 * If citation exists, increments verification count
 */
export async function createOrUpdateCitation(
  input: CreateCitationInput
): Promise<{ success: boolean; data?: VerifiedCitation; error?: string }> {
  const supabase = getAdminClient();
  const normalized = normalizeCitation(input.citationString);

  try {
    // Check if exists
    const { data: existing, error: selectError } = await supabase
      .from('verified_citations')
      .select('*')
      .eq('normalized_citation', normalized)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      return { success: false, error: selectError.message };
    }

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('verified_citations')
        .update({
          times_verified: existing.times_verified + 1,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Update external IDs if provided and not already set
          courtlistener_id: existing.courtlistener_id || input.courtlistenerId,
          courtlistener_url: existing.courtlistener_url || input.courtlistenerUrl,
          caselaw_id: existing.caselaw_id || input.caselawId,
          caselaw_url: existing.caselaw_url || input.caselawUrl,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        data: mapDbToVerifiedCitation(updated),
      };
    }

    // Create new
    const { data: created, error: insertError } = await supabase
      .from('verified_citations')
      .insert({
        citation_string: input.citationString,
        normalized_citation: normalized,
        case_name: input.caseName,
        volume: input.volume,
        reporter: input.reporter,
        starting_page: input.startingPage,
        court: input.court,
        decision_date: input.decisionDate,
        year: input.year,
        courtlistener_id: input.courtlistenerId,
        courtlistener_url: input.courtlistenerUrl,
        caselaw_id: input.caselawId,
        caselaw_url: input.caselawUrl,
        is_published: input.isPublished ?? true,
        precedential_status: input.precedentialStatus,
        times_verified: 1,
        first_verified_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return {
      success: true,
      data: mapDbToVerifiedCitation(created),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

/**
 * Get citation by normalized string
 */
export async function getCitationByNormalized(
  citationString: string
): Promise<{ success: boolean; data?: VerifiedCitation; error?: string }> {
  const supabase = getAdminClient();
  const normalized = normalizeCitation(citationString);

  const { data, error } = await supabase
    .from('verified_citations')
    .select('*')
    .eq('normalized_citation', normalized)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: true, data: undefined };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: mapDbToVerifiedCitation(data) };
}

// ============================================================================
// PROPOSITION_VERIFICATIONS TABLE OPERATIONS
// ============================================================================

export interface RecordVerificationInput {
  citationId: string;
  propositionText: string;
  propositionType: PropositionType;
  jurisdictionContext?: string;
  motionTypeContext?: string;
  verificationResult: HoldingVerificationResult;
  confidenceScore: number;
  holdingVsDicta?: 'HOLDING' | 'DICTA' | 'UNCLEAR';
  supportingQuote?: string;
  reasoning?: string;
  stage1Result?: string;
  stage1Confidence?: number;
  stage2Triggered?: boolean;
  stage2Result?: string;
  stage2Confidence?: number;
  aiModelUsed?: string;
  sourceOrderId?: string;
}

/**
 * Record a proposition verification result
 */
export async function recordPropositionVerification(
  input: RecordVerificationInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const supabase = getAdminClient();
  const propositionHash = hashProposition(input.propositionText);

  try {
    const { data, error } = await supabase
      .from('proposition_verifications')
      .insert({
        citation_id: input.citationId,
        proposition_text: input.propositionText,
        proposition_hash: propositionHash,
        proposition_type: input.propositionType,
        jurisdiction_context: input.jurisdictionContext,
        motion_type_context: input.motionTypeContext,
        verification_result: input.verificationResult,
        confidence_score: input.confidenceScore,
        holding_vs_dicta: input.holdingVsDicta,
        supporting_quote: input.supportingQuote,
        reasoning: input.reasoning,
        stage_1_result: input.stage1Result,
        stage_1_confidence: input.stage1Confidence,
        stage_2_triggered: input.stage2Triggered || false,
        stage_2_result: input.stage2Result,
        stage_2_confidence: input.stage2Confidence,
        ai_model_used: input.aiModelUsed,
        source_order_id: input.sourceOrderId,
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

/**
 * Check VPI cache for a proposition-citation combination
 */
export async function checkVPICache(
  propositionText: string,
  jurisdictionContext?: string
): Promise<{ success: boolean; data?: VPICacheResult; error?: string }> {
  const supabase = getAdminClient();
  const propositionHash = hashProposition(propositionText);

  try {
    let query = supabase
      .from('proposition_verifications')
      .select(`
        id,
        verification_result,
        confidence_score,
        supporting_quote,
        reasoning,
        verified_at,
        verified_citations!inner (
          citation_string
        )
      `)
      .eq('proposition_hash', propositionHash)
      .gte('confidence_score', 0.85)
      .order('verified_at', { ascending: false })
      .limit(1);

    if (jurisdictionContext) {
      query = query.eq('jurisdiction_context', jurisdictionContext);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: { found: false } };
      }
      return { success: false, error: error.message };
    }

    // Log cache hit
    await logCacheHit(data.id);

    // Handle verified_citations as array
    const citations = data.verified_citations as { citation_string: string }[] | null;
    const citationString = citations?.[0]?.citation_string || '';

    return {
      success: true,
      data: {
        found: true,
        cachedVerification: {
          verificationId: data.id,
          result: data.verification_result as HoldingVerificationResult,
          confidence: data.confidence_score,
          citationString,
          supportingQuote: data.supporting_quote,
          reasoning: data.reasoning,
          verifiedAt: data.verified_at,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cache lookup failed',
    };
  }
}

// ============================================================================
// GOOD_LAW_CHECKS TABLE OPERATIONS
// ============================================================================

export interface RecordGoodLawCheckInput {
  citationId: string;
  status: BadLawStatus;
  confidence?: number;
  layer1Treatment?: string;
  layer1RawResponse?: Record<string, unknown>;
  layer2Status?: BadLawStatus;
  layer2Confidence?: number;
  layer2Concerns?: string[];
  layer3InList?: boolean;
  layer3OverruledBy?: string;
  overruledByCitation?: string;
  overruledDate?: string;
}

/**
 * Record a good law check result
 */
export async function recordGoodLawCheck(
  input: RecordGoodLawCheckInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const supabase = getAdminClient();

  // Calculate validity (180 days per spec)
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 180);

  try {
    const { data, error } = await supabase
      .from('good_law_checks')
      .insert({
        citation_id: input.citationId,
        check_date: new Date().toISOString(),
        status: input.status,
        confidence: input.confidence,
        layer_1_treatment: input.layer1Treatment,
        layer_1_raw_response: input.layer1RawResponse,
        layer_2_status: input.layer2Status,
        layer_2_confidence: input.layer2Confidence,
        layer_2_concerns: input.layer2Concerns,
        layer_3_in_list: input.layer3InList || false,
        layer_3_overruled_by: input.layer3OverruledBy,
        valid_until: validUntil.toISOString(),
        overruled_by_citation: input.overruledByCitation,
        overruled_date: input.overruledDate,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

/**
 * Get latest good law check for a citation (if still valid)
 */
export async function getValidGoodLawCheck(
  citationId: string
): Promise<{
  success: boolean;
  data?: {
    status: BadLawStatus;
    confidence: number;
    checkDate: string;
    validUntil: string;
  };
  error?: string;
}> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('good_law_checks')
    .select('status, confidence, check_date, valid_until')
    .eq('citation_id', citationId)
    .gt('valid_until', new Date().toISOString())
    .order('check_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: true, data: undefined };
    }
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      status: data.status as BadLawStatus,
      confidence: data.confidence,
      checkDate: data.check_date,
      validUntil: data.valid_until,
    },
  };
}

// ============================================================================
// AUTHORITY_STRENGTH_ASSESSMENTS TABLE OPERATIONS
// ============================================================================

export interface RecordStrengthAssessmentInput {
  citationId: string;
  caseAgeYears?: number;
  totalCitations?: number;
  citationsLast5Years?: number;
  citationsLast10Years?: number;
  citationTrend?: CitationTrend;
  distinguishCount?: number;
  distinguishRate?: number;
  criticismCount?: number;
  stabilityClass?: StabilityClass;
  strengthScore?: number;
  assessment?: StrengthAssessment;
  notes?: string;
}

/**
 * Record an authority strength assessment
 */
export async function recordStrengthAssessment(
  input: RecordStrengthAssessmentInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const supabase = getAdminClient();

  try {
    const { data, error } = await supabase
      .from('authority_strength_assessments')
      .insert({
        citation_id: input.citationId,
        assessed_at: new Date().toISOString(),
        case_age_years: input.caseAgeYears,
        total_citations: input.totalCitations,
        citations_last_5_years: input.citationsLast5Years,
        citations_last_10_years: input.citationsLast10Years,
        citation_trend: input.citationTrend,
        distinguish_count: input.distinguishCount,
        distinguish_rate: input.distinguishRate,
        criticism_count: input.criticismCount,
        stability_class: input.stabilityClass,
        strength_score: input.strengthScore,
        assessment: input.assessment,
        notes: input.notes,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

// ============================================================================
// CIV_VERIFICATION_RUNS TABLE OPERATIONS
// ============================================================================

/**
 * Start a new CIV verification run
 */
export async function startVerificationRun(
  orderId: string,
  phase: 'V.1' | 'VII.1' | 'IX.1',
  totalCitations: number
): Promise<{ success: boolean; data?: { runId: string }; error?: string }> {
  const supabase = getAdminClient();

  try {
    const { data, error } = await supabase
      .from('civ_verification_runs')
      .insert({
        order_id: orderId,
        run_phase: phase,
        started_at: new Date().toISOString(),
        total_citations: totalCitations,
        status: 'in_progress',
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { runId: data.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

/**
 * Update verification run with results
 */
export async function completeVerificationRun(
  runId: string,
  results: {
    verifiedCount: number;
    flaggedCount: number;
    rejectedCount: number;
    blockedCount: number;
    averageConfidence: number;
    totalApiCalls: number;
    totalCostEstimate: number;
    fullResults: unknown;
    error?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = getAdminClient();

  try {
    const { error } = await supabase
      .from('civ_verification_runs')
      .update({
        completed_at: new Date().toISOString(),
        verified_count: results.verifiedCount,
        flagged_count: results.flaggedCount,
        rejected_count: results.rejectedCount,
        blocked_count: results.blockedCount,
        average_confidence: results.averageConfidence,
        total_api_calls: results.totalApiCalls,
        total_cost_estimate: results.totalCostEstimate,
        results: results.fullResults,
        status: results.error ? 'failed' : 'completed',
        error_message: results.error,
      })
      .eq('id', runId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
    };
  }
}

// ============================================================================
// CURATED_OVERRULED_CASES TABLE OPERATIONS
// ============================================================================

/**
 * Check if a citation is in the curated overruled list
 */
export async function checkCuratedOverruledList(
  citationString: string
): Promise<{
  success: boolean;
  data?: {
    isOverruled: boolean;
    overruledBy?: string;
    notes?: string;
  };
  error?: string;
}> {
  const supabase = getAdminClient();
  const normalized = normalizeCitation(citationString);

  // Check both original and normalized
  const { data, error } = await supabase
    .from('curated_overruled_cases')
    .select('overruled_by_citation, notes')
    .or(`citation.eq.${citationString},citation.eq.${normalized}`)
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: true, data: { isOverruled: false } };
    }
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      isOverruled: true,
      overruledBy: data.overruled_by_citation,
      notes: data.notes,
    },
  };
}

// ============================================================================
// CACHE HIT LOGGING
// ============================================================================

/**
 * Log a cache hit for analytics
 */
async function logCacheHit(propositionVerificationId: string): Promise<void> {
  const supabase = getAdminClient();

  try {
    await supabase.from('civ_cache_hits').insert({
      proposition_verification_id: propositionVerificationId,
      hit_at: new Date().toISOString(),
      tokens_saved_estimate: 2000, // Rough estimate
      cost_saved_estimate: 0.04, // Rough estimate based on Sonnet pricing
    });
  } catch {
    // Non-fatal - just log to console
    log.error('Failed to log cache hit');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapDbToVerifiedCitation(dbRow: Record<string, unknown>): VerifiedCitation {
  return {
    id: dbRow.id as string,
    citationString: dbRow.citation_string as string,
    normalizedCitation: dbRow.normalized_citation as string,
    caseName: dbRow.case_name as string,
    volume: dbRow.volume as number | undefined,
    reporter: dbRow.reporter as string | undefined,
    startingPage: dbRow.starting_page as number | undefined,
    court: dbRow.court as string | undefined,
    decisionDate: dbRow.decision_date as string | undefined,
    year: dbRow.year as number | undefined,
    courtlistenerId: dbRow.courtlistener_id as string | undefined,
    courtlistenerUrl: dbRow.courtlistener_url as string | undefined,
    caselawId: dbRow.caselaw_id as string | undefined,
    caselawUrl: dbRow.caselaw_url as string | undefined,
    isPublished: (dbRow.is_published as boolean) ?? true,
    precedentialStatus: dbRow.precedential_status as string | undefined,
    timesVerified: (dbRow.times_verified as number) || 1,
    firstVerifiedAt: dbRow.first_verified_at as string,
    lastVerifiedAt: dbRow.last_verified_at as string,
  };
}
