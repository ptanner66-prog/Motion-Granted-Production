/**
 * Step 5: Bad Law Check (3-Layer)
 *
 * CIV Spec Section 8, API Architecture Spec Section 3.1
 *
 * LAYER 1 (Deterministic): Query CourtListener API for treatment field
 * LAYER 2 (Curated): Check overruled_cases database table
 * LAYER 3 (AI Analysis): Use Haiku/Sonnet to analyze citing cases
 *
 * Composite status: GOOD_LAW, CAUTION, NEGATIVE_TREATMENT, OVERRULED
 */

import { getCourtListenerClient } from '@/lib/workflow/courtlistener-client';
import { askClaude } from '@/lib/automation/claude';
import { createClient } from '@/lib/supabase/server';
import { courtlistenerCircuit } from '@/lib/circuit-breaker';
import type { MotionTier } from '@/types/workflow';

// ============================================================================
// TYPES
// ============================================================================

export type BadLawStatus = 'GOOD_LAW' | 'CAUTION' | 'NEGATIVE_TREATMENT' | 'OVERRULED';

export interface Layer1Result {
  source: 'courtlistener';
  treatment: string | null;
  citing_cases_count: number;
  negative_citations: number;
  positive_citations: number;
  has_subsequent_history: boolean;
  error?: string;
}

export interface Layer2Result {
  source: 'overruled_cases';
  match: boolean;
  overruled_by?: string;
  overruled_date?: string;
  overruling_citation?: string;
  notes?: string;
}

export interface Layer3Result {
  source: 'ai_analysis';
  confidence: number;
  reasoning: string;
  negative_treatment_found: boolean;
  concerning_citations: string[];
  recommendation: string;
  model_used: string;
  cost: number;
  tokens_used: number;
}

export interface Step5Result {
  status: BadLawStatus;
  layer_1_result: Layer1Result;
  layer_2_result: Layer2Result;
  layer_3_result: Layer3Result | null;
  overruled_by: string | null;
  overruled_date: string | null;
  confidence: number;
  recommendation: string;
  duration_ms: number;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODELS = {
  TIER_A_B: 'claude-haiku-4-5-20250929',
  TIER_C: 'claude-sonnet-4-5-20250929',
};

// Treatment indicators from CourtListener
const NEGATIVE_TREATMENTS = [
  'overruled',
  'reversed',
  'vacated',
  'superseded',
  'abrogated',
  'disapproved',
  'criticized',
  'questioned',
  'limited',
  'distinguished negatively',
];

const CAUTION_TREATMENTS = [
  'distinguished',
  'modified',
  'clarified',
  'limited',
  'harmonized',
];

// ============================================================================
// LAYER 1: COURTLISTENER TREATMENT CHECK
// ============================================================================

async function checkLayer1(
  citationText: string,
  courtlistenerId: string | null
): Promise<Layer1Result> {
  const result: Layer1Result = {
    source: 'courtlistener',
    treatment: null,
    citing_cases_count: 0,
    negative_citations: 0,
    positive_citations: 0,
    has_subsequent_history: false,
  };

  if (!courtlistenerId) {
    result.error = 'No CourtListener ID provided';
    return result;
  }

  try {
    const client = getCourtListenerClient();

    // Get citing cases and treatment info
    const citingResponse = await courtlistenerCircuit.execute(async () => {
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/clusters/${courtlistenerId}/citing/`,
        {
          headers: {
            'Authorization': `Token ${process.env.COURTLISTENER_API_KEY}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }
      return response.json();
    });

    // Count and analyze citing cases
    const citingCases = citingResponse.results || [];
    result.citing_cases_count = citingCases.length;

    // Check for negative treatment indicators
    for (const citingCase of citingCases) {
      const treatmentText = (citingCase.treatment || '').toLowerCase();

      if (NEGATIVE_TREATMENTS.some(t => treatmentText.includes(t))) {
        result.negative_citations++;
        if (!result.treatment) {
          result.treatment = treatmentText;
        }
      } else {
        result.positive_citations++;
      }
    }

    // Check cluster for subsequent history
    const clusterResponse = await courtlistenerCircuit.execute(async () => {
      const response = await fetch(
        `https://www.courtlistener.com/api/rest/v4/clusters/${courtlistenerId}/`,
        {
          headers: {
            'Authorization': `Token ${process.env.COURTLISTENER_API_KEY}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`CourtListener API error: ${response.status}`);
      }
      return response.json();
    });

    if (clusterResponse.sub_opinions?.length > 0 || clusterResponse.precedential_status === 'Unpublished') {
      result.has_subsequent_history = true;
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Step5] Layer 1 error:', result.error);
  }

  return result;
}

// ============================================================================
// LAYER 2: CURATED OVERRULED CASES DATABASE
// ============================================================================

async function checkLayer2(
  citationText: string,
  caseName: string | null
): Promise<Layer2Result> {
  const result: Layer2Result = {
    source: 'overruled_cases',
    match: false,
  };

  try {
    const supabase = await createClient();

    // Normalize citation for comparison
    const normalizedCitation = citationText.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedCaseName = caseName?.toLowerCase().replace(/\s+/g, ' ').trim();

    // Check overruled_cases table (created in Chunk 1)
    const { data, error } = await supabase
      .from('overruled_cases')
      .select('*')
      .or(`original_citation.ilike.%${normalizedCitation}%,case_name.ilike.%${normalizedCaseName || ''}%`);

    if (error) {
      console.error('[Step5] Layer 2 database error:', error);
      return result;
    }

    if (data && data.length > 0) {
      const match = data[0];
      result.match = true;
      result.overruled_by = match.overruled_by_case;
      result.overruled_date = match.overruled_date;
      result.overruling_citation = match.overruling_citation;
      result.notes = match.notes;
    }

  } catch (error) {
    console.error('[Step5] Layer 2 error:', error);
  }

  return result;
}

// ============================================================================
// LAYER 3: AI ANALYSIS OF CITING CASES
// ============================================================================

async function checkLayer3(
  citationText: string,
  caseName: string | null,
  opinionText: string | null,
  layer1Result: Layer1Result,
  tier: MotionTier
): Promise<Layer3Result | null> {
  // Skip Layer 3 if Layer 1 found clear negative treatment or Layer 2 found overruling
  if (layer1Result.negative_citations > 3) {
    return null; // Already have enough evidence
  }

  const model = tier === 'C' ? MODELS.TIER_C : MODELS.TIER_A_B;

  try {
    const prompt = `You are a legal research expert analyzing whether a case is still good law.

CASE BEING ANALYZED:
Citation: ${citationText}
${caseName ? `Case Name: ${caseName}` : ''}

COURTLISTENER DATA:
- Total citing cases: ${layer1Result.citing_cases_count}
- Negative citations found: ${layer1Result.negative_citations}
- Positive citations found: ${layer1Result.positive_citations}
${layer1Result.treatment ? `- Treatment noted: ${layer1Result.treatment}` : ''}

${opinionText ? `CASE EXCERPT:
${opinionText.slice(0, 5000)}...` : ''}

TASK: Analyze whether this case is still good law. Consider:
1. Has the holding been narrowed or limited by subsequent courts?
2. Has the legal standard been modified by statute or later decisions?
3. Are there jurisdictional limitations on the holding?
4. Has the underlying legal theory been questioned?

Respond with ONLY a JSON object:
{
  "negative_treatment_found": <boolean>,
  "confidence": <number 0.0-1.0>,
  "reasoning": "<detailed analysis>",
  "concerning_citations": ["<list any concerning citing cases>"],
  "recommendation": "GOOD_LAW" | "CAUTION" | "NEGATIVE_TREATMENT" | "DO_NOT_CITE"
}`;

    const response = await askClaude({
      prompt,
      maxTokens: 32000,
      systemPrompt: 'You are a legal research expert. Respond with valid JSON only.',
      model,
    });

    if (!response.success || !response.result?.content) {
      return null;
    }

    const jsonMatch = response.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      source: 'ai_analysis',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
      negative_treatment_found: parsed.negative_treatment_found || false,
      concerning_citations: parsed.concerning_citations || [],
      recommendation: parsed.recommendation || 'CAUTION',
      model_used: model,
      cost: 0, // Cost tracking handled at higher level
      tokens_used: response.result.tokensUsed || 0,
    };

  } catch (error) {
    console.error('[Step5] Layer 3 error:', error);
    return null;
  }
}

// ============================================================================
// COMPOSITE STATUS DETERMINATION
// ============================================================================

function determineCompositeStatus(
  layer1: Layer1Result,
  layer2: Layer2Result,
  layer3: Layer3Result | null
): { status: BadLawStatus; confidence: number; recommendation: string } {
  // OVERRULED: Layer 2 match is definitive
  if (layer2.match) {
    return {
      status: 'OVERRULED',
      confidence: 1.0,
      recommendation: `Case overruled by ${layer2.overruled_by}. Do not cite as binding authority.`,
    };
  }

  // Check Layer 1 for clear negative treatment
  const negativeRatio = layer1.citing_cases_count > 0
    ? layer1.negative_citations / layer1.citing_cases_count
    : 0;

  if (layer1.treatment && NEGATIVE_TREATMENTS.some(t => layer1.treatment!.includes(t))) {
    if (layer1.treatment.includes('overruled') || layer1.treatment.includes('reversed')) {
      return {
        status: 'OVERRULED',
        confidence: 0.9,
        recommendation: `Case appears to be ${layer1.treatment}. Verify before citing.`,
      };
    }
    return {
      status: 'NEGATIVE_TREATMENT',
      confidence: 0.85,
      recommendation: `Case has negative treatment (${layer1.treatment}). Consider alternative authority.`,
    };
  }

  // High negative citation ratio
  if (negativeRatio > 0.3 && layer1.negative_citations >= 3) {
    return {
      status: 'NEGATIVE_TREATMENT',
      confidence: 0.8,
      recommendation: `${layer1.negative_citations} negative citations found. Review citing cases.`,
    };
  }

  // Check Layer 3 AI analysis
  if (layer3) {
    if (layer3.negative_treatment_found && layer3.confidence > 0.7) {
      return {
        status: 'NEGATIVE_TREATMENT',
        confidence: layer3.confidence,
        recommendation: layer3.reasoning,
      };
    }

    if (layer3.recommendation === 'DO_NOT_CITE') {
      return {
        status: 'NEGATIVE_TREATMENT',
        confidence: layer3.confidence,
        recommendation: layer3.reasoning,
      };
    }

    if (layer3.recommendation === 'CAUTION' || layer3.concerning_citations.length > 0) {
      return {
        status: 'CAUTION',
        confidence: layer3.confidence,
        recommendation: layer3.reasoning,
      };
    }
  }

  // Some negative citations but not definitive
  if (layer1.negative_citations > 0 || layer1.has_subsequent_history) {
    return {
      status: 'CAUTION',
      confidence: 0.7,
      recommendation: 'Case has some subsequent history. Verify current status before citing.',
    };
  }

  // GOOD LAW: No negative indicators found
  return {
    status: 'GOOD_LAW',
    confidence: layer1.citing_cases_count > 0 ? 0.9 : 0.7,
    recommendation: 'No negative treatment found. Case appears to be good law.',
  };
}

// ============================================================================
// MAIN BAD LAW CHECK FUNCTION
// ============================================================================

/**
 * Step 5: 3-Layer Bad Law Check
 *
 * @param citationText - The citation being checked
 * @param courtlistenerId - CourtListener cluster ID (from Step 1)
 * @param caseName - Case name
 * @param opinionText - Opinion text (optional, for Layer 3)
 * @param tier - Motion tier
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function checkBadLaw(
  citationText: string,
  courtlistenerId: string | null,
  caseName: string | null,
  opinionText: string | null,
  tier: MotionTier,
  orderId: string,
  options?: {
    skipLayer3?: boolean;
    logToDb?: boolean;
  }
): Promise<Step5Result> {
  const startTime = Date.now();

  const result: Step5Result = {
    status: 'GOOD_LAW',
    layer_1_result: {
      source: 'courtlistener',
      treatment: null,
      citing_cases_count: 0,
      negative_citations: 0,
      positive_citations: 0,
      has_subsequent_history: false,
    },
    layer_2_result: {
      source: 'overruled_cases',
      match: false,
    },
    layer_3_result: null,
    overruled_by: null,
    overruled_date: null,
    confidence: 0,
    recommendation: '',
    duration_ms: 0,
  };

  try {
    // Run Layer 1 and Layer 2 in parallel
    const [layer1, layer2] = await Promise.all([
      checkLayer1(citationText, courtlistenerId),
      checkLayer2(citationText, caseName),
    ]);

    result.layer_1_result = layer1;
    result.layer_2_result = layer2;

    // Check if we found overruling
    if (layer2.match) {
      result.overruled_by = layer2.overruled_by || null;
      result.overruled_date = layer2.overruled_date || null;
    }

    // Run Layer 3 if needed and not skipped
    if (!options?.skipLayer3 && !layer2.match) {
      const layer3 = await checkLayer3(citationText, caseName, opinionText, layer1, tier);
      result.layer_3_result = layer3;
    }

    // Determine composite status
    const composite = determineCompositeStatus(
      result.layer_1_result,
      result.layer_2_result,
      result.layer_3_result
    );

    result.status = composite.status;
    result.confidence = composite.confidence;
    result.recommendation = composite.recommendation;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.status = 'CAUTION'; // Conservative on error
    result.confidence = 0;
    result.recommendation = `Error during bad law check: ${result.error}. Manual review recommended.`;

    console.error('[Step5] Bad law check error:', result.error);
  }

  result.duration_ms = Date.now() - startTime;

  // Log to database if requested
  if (options?.logToDb) {
    await logStep5Result(orderId, citationText, result);
  }

  console.log(`[Step5] ${citationText.slice(0, 40)}...: ${result.status} (${Math.round(result.confidence * 100)}%, ${result.duration_ms}ms)`);

  return result;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep5Result(
  orderId: string,
  citationText: string,
  result: Step5Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citationText,
      step_number: 5,
      step_name: 'bad_law_check',
      status: result.status,
      confidence: result.confidence,
      duration_ms: result.duration_ms,
      models_used: result.layer_3_result ? [result.layer_3_result.model_used] : [],
      total_cost: result.layer_3_result?.cost || 0,
      total_tokens: result.layer_3_result?.tokens_used || 0,
      error_message: result.error,
      raw_response: {
        layer_1: result.layer_1_result,
        layer_2: result.layer_2_result,
        layer_3: result.layer_3_result,
        overruled_by: result.overruled_by,
        overruled_date: result.overruled_date,
        recommendation: result.recommendation,
      },
    });
  } catch (error) {
    console.error('[Step5] Failed to log result to database:', error);
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Check multiple citations for bad law
 */
export async function checkBadLawBatch(
  citations: Array<{
    citationText: string;
    courtlistenerId: string | null;
    caseName: string | null;
    opinionText: string | null;
  }>,
  tier: MotionTier,
  orderId: string,
  options?: {
    concurrency?: number;
    skipLayer3?: boolean;
    logToDb?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, Step5Result>> {
  const concurrency = options?.concurrency ?? 3;
  const results = new Map<string, Step5Result>();

  for (let i = 0; i < citations.length; i += concurrency) {
    const batch = citations.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(c =>
        checkBadLaw(
          c.citationText,
          c.courtlistenerId,
          c.caseName,
          c.opinionText,
          tier,
          orderId,
          { skipLayer3: options?.skipLayer3, logToDb: options?.logToDb }
        )
      )
    );

    batch.forEach((c, index) => {
      results.set(c.citationText, batchResults[index]);
    });

    if (options?.onProgress) {
      options.onProgress(Math.min(i + concurrency, citations.length), citations.length);
    }

    // Delay between batches for rate limiting
    if (i + concurrency < citations.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

export default {
  checkBadLaw,
  checkBadLawBatch,
};
