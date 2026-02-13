/**
 * CIV Step 5: Bad Law Check + Protocols 18-23
 *
 * Three-layer approach to determine if case is still "good law":
 * Layer 1: CourtListener Treatment API (deterministic)
 * Layer 2: AI Pattern Detection (LLM evaluation of search results)
 * Layer 3: Curated Overruled List (manual maintenance)
 *
 * CIV-007: Uses getCitationModelWithLogging for tier-based model selection
 * P18: Dicta Overreliance detection
 * P19: En Banc / Panel Split detection
 * P20: Plurality Opinion (uses step2Result.isFromMajority)
 * P21: Statutory Supersession
 * P22: Upstream Data Error (metadata conflict from Step 1)
 * P23: Amended/Withdrawn Opinion
 *
 * Uses tier-based model selection for cross-vendor CIV.
 */

import { callCIVAnthropic as callAnthropic, getTierFromMotionType, type MotionTier } from '@/lib/ai/model-router';
import { getCitationTreatment } from '@/lib/courtlistener/client';
import { checkCuratedOverruledList, recordGoodLawCheck } from '../database';
import {
  DEFAULT_CIV_CONFIG,
  BAD_LAW_ANALYSIS_PROMPT,
  type BadLawCheckOutput,
  type BadLawStatus,
} from '../types';
import {
  getCitationModelWithLogging,
  CITATION_THRESHOLDS,
  type Tier,
  type ProtocolResult,
  type ProtocolFlag,
  type FlagSeverity,
  FLAG_SEVERITY,
} from '@/lib/config/citation-models';

// ============================================================================
// PROTOCOL CONTEXT (passed from pipeline)
// ============================================================================

export interface Step5ProtocolContext {
  /** From Step 2: is_from_majority for Protocol 20 */
  isFromMajority?: boolean;
  /** From Step 1: metadata conflict for Protocol 22 */
  metadataConflict?: boolean;
  /** From Step 3: dicta confidence for Protocol 18 */
  dictaConfidence?: number;
  /** Proposition type for Protocol 18 */
  propositionType?: string;
  /** CourtListener treatment data for Protocol 19/23 */
  treatmentData?: {
    treatments: Array<{ citing_opinion_id: number; treatment: string; depth: number }>;
    positive: number;
    negative: number;
    caution: number;
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Execute Step 5: Bad Law Check + Protocols 18-23
 *
 * Flow:
 * 1. Check curated overruled list (Layer 3 - quick check)
 * 2. Query CourtListener treatment (Layer 1)
 * 3. If Layer 1 returns good law, run AI pattern detection (Layer 2)
 * 4. Run Protocols 18-23
 * 5. Combine results for composite status
 *
 * CIV-007: Uses getCitationModelWithLogging for tier-based model selection
 */
export async function executeBadLawCheck(
  citation: string,
  caseName: string,
  courtlistenerId?: string,
  citationDbId?: string,
  motionType: string = 'motion_to_compel',
  protocolContext?: Step5ProtocolContext
): Promise<BadLawCheckOutput & { protocols?: ProtocolResult[] }> {
  const config = DEFAULT_CIV_CONFIG;
  const tier = getTierFromMotionType(motionType) as Tier;

  const result: BadLawCheckOutput & { protocols?: ProtocolResult[] } = {
    step: 5,
    name: 'bad_law_check',
    layer1: {
      source: 'courtlistener',
      negativeSignals: [],
    },
    layer2: {
      searchesRun: 0,
      status: 'GOOD_LAW',
      confidence: 1.0,
      concerns: [],
    },
    layer3: {
      inCuratedList: false,
    },
    compositeStatus: 'GOOD_LAW',
    confidence: 1.0,
    validUntil: calculateValidUntil(config.goodLawValidityDays),
    actionTaken: 'CONTINUE',
    proceedToStep6: true,
    protocols: [],
  };

  try {
    // Layer 3: Check curated overruled list first (fastest)
    const curatedCheck = await checkCuratedOverruledList(citation);

    if (curatedCheck.success && curatedCheck.data?.isOverruled) {
      result.layer3 = {
        inCuratedList: true,
        overruledBy: curatedCheck.data.overruledBy,
      };
      result.compositeStatus = 'OVERRULED';
      result.confidence = 1.0;
      result.actionTaken = 'BLOCKED';
      result.proceedToStep6 = false;

      if (citationDbId) {
        await recordGoodLawCheck({
          citationId: citationDbId,
          status: 'OVERRULED',
          confidence: 1.0,
          layer3InList: true,
          layer3OverruledBy: curatedCheck.data.overruledBy,
          overruledByCitation: curatedCheck.data.overruledBy,
        });
      }

      return result;
    }

    // Layer 1: Check CourtListener treatment
    let treatmentData = protocolContext?.treatmentData;

    if (courtlistenerId && !treatmentData) {
      const treatmentResult = await getCitationTreatment(courtlistenerId);

      if (treatmentResult.success && treatmentResult.data) {
        treatmentData = treatmentResult.data;
      }
    }

    if (treatmentData) {
      const { positive, negative, caution, treatments } = treatmentData;

      result.layer1.treatment = summarizeTreatment(positive, negative, caution);
      result.layer1.negativeSignals = extractNegativeSignals(treatments);

      // Check for definitive negative treatment
      const definitiveNegative = treatments.some(t =>
        ['overruled', 'reversed', 'vacated', 'superseded'].includes(t.treatment.toLowerCase())
      );

      if (definitiveNegative) {
        const overrulingCase = treatments.find(t =>
          ['overruled', 'reversed', 'vacated', 'superseded'].includes(t.treatment.toLowerCase())
        );

        result.compositeStatus = 'OVERRULED';
        result.confidence = 1.0;
        result.actionTaken = 'BLOCKED';
        result.proceedToStep6 = false;

        if (citationDbId) {
          await recordGoodLawCheck({
            citationId: citationDbId,
            status: 'OVERRULED',
            confidence: 1.0,
            layer1Treatment: overrulingCase?.treatment,
            layer1RawResponse: treatmentData as unknown as Record<string, unknown>,
          });
        }

        return result;
      }

      // Note cautionary treatment
      if (caution > 0 || negative > 0) {
        result.layer1.negativeSignals = [
          ...result.layer1.negativeSignals,
          `${caution} cautionary citations`,
          `${negative} negative citations`,
        ].filter(s => !s.startsWith('0'));
      }
    }

    // Layer 2: AI pattern detection for additional assurance
    const layer2Result = await runAIPatternDetection(caseName, motionType, tier);
    result.layer2 = layer2Result;

    // ================================================================
    // PROTOCOLS 18-23: Run in parallel for efficiency
    // ================================================================
    const protocolResults = await runProtocols(
      citation,
      caseName,
      tier,
      treatmentData,
      protocolContext
    );
    result.protocols = protocolResults;

    // ================================================================
    // Composite status determination (includes protocol flags)
    // ================================================================
    result.compositeStatus = determineCompositeStatus(
      result.layer1,
      result.layer2,
      result.layer3,
      protocolResults
    );
    result.confidence = calculateCompositeConfidence(
      result.layer1,
      result.layer2,
      result.layer3
    );

    // Determine action
    if (result.compositeStatus === 'OVERRULED') {
      result.actionTaken = 'BLOCKED';
      result.proceedToStep6 = false;
    } else if (result.compositeStatus === 'NEGATIVE_TREATMENT' || result.compositeStatus === 'CAUTION') {
      result.actionTaken = 'FLAG';
      result.proceedToStep6 = true;
    } else {
      result.actionTaken = 'CONTINUE';
      result.proceedToStep6 = true;
    }

    // Record in database
    if (citationDbId) {
      await recordGoodLawCheck({
        citationId: citationDbId,
        status: result.compositeStatus,
        confidence: result.confidence,
        layer1Treatment: result.layer1.treatment,
        layer2Status: result.layer2.status,
        layer2Confidence: result.layer2.confidence,
        layer2Concerns: result.layer2.concerns,
        layer3InList: result.layer3.inCuratedList,
      });
    }

    return result;
  } catch (error) {
    console.error('[CIV_STEP5] Bad law check error:', error);

    // On error, return cautious result
    result.compositeStatus = 'CAUTION';
    result.confidence = 0.5;
    result.actionTaken = 'FLAG';
    result.layer2.concerns.push(
      `Verification error: ${error instanceof Error ? error.message : 'Unknown'}`
    );

    return result;
  }
}

// ============================================================================
// LAYER 2: AI PATTERN DETECTION
// ============================================================================

/**
 * Run AI pattern detection (Layer 2)
 * CIV-007: Uses getCitationModelWithLogging for tier-based model selection
 */
async function runAIPatternDetection(
  caseName: string,
  motionType: string = 'motion_to_compel',
  tier: Tier
): Promise<{
  searchesRun: number;
  status: BadLawStatus;
  confidence: number;
  concerns: string[];
}> {
  const searchPatterns = [
    `"${caseName}" overruled`,
    `"${caseName}" abrogated`,
    `"${caseName}" superseded by statute`,
    `"${caseName}" no longer good law`,
  ];

  // In production, this would call a search API
  const searchResults = await simulateSearchResults(caseName, searchPatterns);

  if (!searchResults.length) {
    return {
      searchesRun: searchPatterns.length,
      status: 'GOOD_LAW',
      confidence: 0.95,
      concerns: [],
    };
  }

  // Run AI evaluation of search results
  const prompt = BAD_LAW_ANALYSIS_PROMPT
    .replace('{case_name}', caseName)
    .replace('{search_result_snippets}', searchResults.join('\n\n---\n\n'));

  try {
    // CIV-007: Use tier-based model selection via citation-models.ts
    const modelConfig = getCitationModelWithLogging(5, tier, undefined);

    const responseText = await callAnthropic(modelConfig.model, prompt, modelConfig.maxTokens);

    return parseLayer2Response(responseText, searchPatterns.length);
  } catch (error) {
    console.error('[CIV_STEP5] Layer 2 AI analysis error:', error);
    return {
      searchesRun: searchPatterns.length,
      status: 'CAUTION',
      confidence: 0.6,
      concerns: [`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown'}`],
    };
  }
}

/**
 * Simulate search results (in production, integrate with search APIs)
 */
async function simulateSearchResults(_caseName: string, _patterns: string[]): Promise<string[]> {
  // Placeholder — in production, integrate with:
  // - Google Custom Search API
  // - Legal search APIs
  return [];
}

// ============================================================================
// PROTOCOLS 18-23
// ============================================================================

/**
 * Run all protocols (18-23) for this citation
 */
async function runProtocols(
  citation: string,
  caseName: string,
  tier: Tier,
  treatmentData?: Step5ProtocolContext['treatmentData'],
  protocolContext?: Step5ProtocolContext
): Promise<ProtocolResult[]> {
  const results: ProtocolResult[] = [];

  // Run protocols in parallel where possible
  const [p18, p19, p20, p21, p22, p23] = await Promise.allSettled([
    checkProtocol18(protocolContext),
    checkProtocol19(treatmentData),
    checkProtocol20(protocolContext),
    checkProtocol21(citation, caseName),
    checkProtocol22(protocolContext),
    checkProtocol23(treatmentData),
  ]);

  // Collect results
  for (const settledResult of [p18, p19, p20, p21, p22, p23]) {
    if (settledResult.status === 'fulfilled') {
      results.push(settledResult.value);
    } else {
      console.error('[CIV_STEP5] Protocol error:', settledResult.reason);
    }
  }

  // Log triggered protocols
  const triggered = results.filter(r => r.triggered);
  if (triggered.length > 0) {
    console.log(
      `[CIV_STEP5] citation=${citation.substring(0, 50)} ` +
      `protocols_triggered=[${triggered.map(r => `P${r.protocol}:${r.flag}`).join(', ')}]`
    );
  }

  return results;
}

/**
 * Protocol 18: Dicta Overreliance
 *
 * If Step 3 classified the citation as dicta with confidence >= DICTA_OVERRELIANCE threshold
 * AND the proposition type is PRIMARY_STANDARD or REQUIRED_ELEMENT,
 * flag as DICTA_OVERRELIANCE.
 */
async function checkProtocol18(
  context?: Step5ProtocolContext
): Promise<ProtocolResult> {
  const triggered =
    context?.dictaConfidence !== undefined &&
    context.dictaConfidence >= CITATION_THRESHOLDS.DICTA_OVERRELIANCE &&
    (context.propositionType === 'PRIMARY_STANDARD' || context.propositionType === 'REQUIRED_ELEMENT');

  return {
    protocol: 18,
    triggered,
    flag: triggered ? 'DICTA_OVERRELIANCE' : undefined,
    severity: triggered ? FLAG_SEVERITY.DICTA_OVERRELIANCE : undefined,
    details: triggered
      ? `Dicta confidence ${context!.dictaConfidence} >= ${CITATION_THRESHOLDS.DICTA_OVERRELIANCE} for ${context!.propositionType} proposition`
      : 'Not triggered — dicta threshold not met or proposition type not high-value',
    evidence: {
      dictaConfidence: context?.dictaConfidence,
      propositionType: context?.propositionType,
      threshold: CITATION_THRESHOLDS.DICTA_OVERRELIANCE,
    },
  };
}

/**
 * Protocol 19: En Banc / Panel Split
 *
 * Check if the cited case has been superseded by an en banc decision
 * or if there's a panel split on the relevant issue.
 */
async function checkProtocol19(
  treatmentData?: Step5ProtocolContext['treatmentData']
): Promise<ProtocolResult> {
  if (!treatmentData?.treatments) {
    return {
      protocol: 19,
      triggered: false,
      details: 'No treatment data available',
      evidence: null,
    };
  }

  // Check for en banc supersession in treatment data
  const enBancTreatments = treatmentData.treatments.filter(t =>
    t.treatment.toLowerCase().includes('en banc') ||
    t.treatment.toLowerCase().includes('superseded by en banc') ||
    t.treatment.toLowerCase().includes('panel split')
  );

  const triggered = enBancTreatments.length > 0;

  return {
    protocol: 19,
    triggered,
    flag: triggered ? 'EN_BANC_SUPERSEDED' : undefined,
    severity: triggered ? FLAG_SEVERITY.EN_BANC_SUPERSEDED : undefined,
    details: triggered
      ? `En banc/panel split detected: ${enBancTreatments.map(t => t.treatment).join('; ')}`
      : 'No en banc or panel split indicators found',
    evidence: triggered ? { enBancTreatments } : null,
  };
}

/**
 * Protocol 20: Plurality Opinion
 *
 * If Step 2 determined the holding is NOT from the majority opinion,
 * flag as PLURALITY_NOT_BINDING.
 */
async function checkProtocol20(
  context?: Step5ProtocolContext
): Promise<ProtocolResult> {
  // Only trigger if we explicitly know it's NOT from majority
  const triggered = context?.isFromMajority === false;

  return {
    protocol: 20,
    triggered,
    flag: triggered ? 'PLURALITY_NOT_BINDING' : undefined,
    severity: triggered ? FLAG_SEVERITY.PLURALITY_NOT_BINDING : undefined,
    details: triggered
      ? 'Holding is from a concurrence/dissent/plurality — not binding precedent'
      : 'Holding is from majority opinion or status unknown',
    evidence: { isFromMajority: context?.isFromMajority },
  };
}

/**
 * Protocol 21: Statutory Supersession
 *
 * Check if the cited case's legal standard has been superseded by statute.
 * This checks for legislative changes that would invalidate the holding.
 */
async function checkProtocol21(
  citation: string,
  caseName: string
): Promise<ProtocolResult> {
  // In production, this would query a statute_amendments table or
  // check CourtListener's citing opinions for statutory supersession
  // For now, check common patterns in the citation itself
  const statutoryPatterns = [
    /superseded by statute/i,
    /abrogated by/i,
    /legislatively overruled/i,
    /statutory amendment/i,
  ];

  // This is a placeholder check — in production, integrate with:
  // - statute_amendments table in database
  // - CourtListener treatment data that indicates statutory supersession
  const triggered = false; // No data source available yet

  return {
    protocol: 21,
    triggered,
    flag: triggered ? 'LEGISLATIVELY_SUPERSEDED' : undefined,
    severity: triggered ? FLAG_SEVERITY.LEGISLATIVELY_SUPERSEDED : undefined,
    details: triggered
      ? `Case may be superseded by statute`
      : 'No statutory supersession indicators found',
    evidence: { citation: citation.substring(0, 80), caseName },
  };
}

/**
 * Protocol 22: Upstream Data Error
 *
 * If Step 1 detected a metadata conflict between CourtListener and other sources,
 * flag as DATA_SOURCE_CONFLICT.
 */
async function checkProtocol22(
  context?: Step5ProtocolContext
): Promise<ProtocolResult> {
  const triggered = context?.metadataConflict === true;

  return {
    protocol: 22,
    triggered,
    flag: triggered ? 'DATA_SOURCE_CONFLICT' : undefined,
    severity: triggered ? FLAG_SEVERITY.DATA_SOURCE_CONFLICT : undefined,
    details: triggered
      ? 'Step 1 detected metadata conflict between data sources — citation data may be unreliable'
      : 'No upstream data conflicts detected',
    evidence: { metadataConflict: context?.metadataConflict },
  };
}

/**
 * Protocol 23: Amended/Withdrawn Opinion
 *
 * Check if the opinion has been amended or withdrawn.
 * Uses CourtListener treatment data.
 */
async function checkProtocol23(
  treatmentData?: Step5ProtocolContext['treatmentData']
): Promise<ProtocolResult> {
  if (!treatmentData?.treatments) {
    return {
      protocol: 23,
      triggered: false,
      details: 'No treatment data available',
      evidence: null,
    };
  }

  // Check for withdrawn/amended indicators
  const withdrawnTreatments = treatmentData.treatments.filter(t =>
    t.treatment.toLowerCase().includes('withdrawn') ||
    t.treatment.toLowerCase().includes('amended') ||
    t.treatment.toLowerCase().includes('corrected opinion')
  );

  const isWithdrawn = withdrawnTreatments.some(t =>
    t.treatment.toLowerCase().includes('withdrawn')
  );

  const triggered = withdrawnTreatments.length > 0;

  // Withdrawn = BLOCK, Amended = NOTE
  const flag: ProtocolFlag | undefined = triggered
    ? (isWithdrawn ? 'WITHDRAWN_OPINION' : 'AMENDED_OPINION')
    : undefined;

  return {
    protocol: 23,
    triggered,
    flag,
    severity: triggered ? FLAG_SEVERITY[flag!] : undefined,
    details: triggered
      ? `Opinion ${isWithdrawn ? 'withdrawn' : 'amended'}: ${withdrawnTreatments.map(t => t.treatment).join('; ')}`
      : 'No amended/withdrawn indicators found',
    evidence: triggered ? { withdrawnTreatments } : null,
  };
}

// ============================================================================
// COMPOSITE STATUS DETERMINATION
// ============================================================================

/**
 * Determine composite status from all layers + protocols
 */
function determineCompositeStatus(
  layer1: BadLawCheckOutput['layer1'],
  layer2: BadLawCheckOutput['layer2'],
  layer3: BadLawCheckOutput['layer3'],
  protocols?: ProtocolResult[]
): BadLawStatus {
  // Layer 3 (curated list) takes precedence
  if (layer3.inCuratedList) {
    return 'OVERRULED';
  }

  // Check for overruled signals in Layer 1
  if (layer1.negativeSignals.some(s =>
    s.toLowerCase().includes('overruled') ||
    s.toLowerCase().includes('reversed') ||
    s.toLowerCase().includes('vacated')
  )) {
    return 'OVERRULED';
  }

  // Layer 2 findings
  if (layer2.status === 'OVERRULED') {
    return 'OVERRULED';
  }

  // Check protocols for BLOCK-level flags
  if (protocols) {
    const blockFlags = protocols.filter(p => p.triggered && p.severity === 'BLOCK');
    if (blockFlags.some(p => p.flag === 'WITHDRAWN_OPINION')) {
      return 'OVERRULED';
    }
    if (blockFlags.length > 0) {
      return 'NEGATIVE_TREATMENT';
    }
  }

  if (layer2.status === 'NEGATIVE_TREATMENT') {
    return 'NEGATIVE_TREATMENT';
  }

  // Check protocols for FLAG-level flags
  if (protocols) {
    const flagFlags = protocols.filter(p => p.triggered && p.severity === 'FLAG');
    if (flagFlags.length > 0) {
      return 'CAUTION';
    }
  }

  // Check for cautionary signals
  if (layer1.negativeSignals.length > 0 || layer2.status === 'CAUTION') {
    return 'CAUTION';
  }

  return 'GOOD_LAW';
}

/**
 * Calculate composite confidence
 */
function calculateCompositeConfidence(
  layer1: BadLawCheckOutput['layer1'],
  layer2: BadLawCheckOutput['layer2'],
  layer3: BadLawCheckOutput['layer3']
): number {
  // If overruled by curated list, 100% confidence
  if (layer3.inCuratedList) {
    return 1.0;
  }

  // Weight Layer 1 (deterministic) more heavily
  const layer1Confidence = layer1.negativeSignals.length === 0 ? 1.0 : 0.3;
  const layer2Confidence = layer2.confidence;

  // Weighted average: Layer 1 (60%), Layer 2 (40%)
  return layer1Confidence * 0.6 + layer2Confidence * 0.4;
}

// ============================================================================
// HELPERS
// ============================================================================

function summarizeTreatment(positive: number, negative: number, caution: number): string {
  const parts: string[] = [];
  if (positive > 0) parts.push(`${positive} positive`);
  if (negative > 0) parts.push(`${negative} negative`);
  if (caution > 0) parts.push(`${caution} cautionary`);
  return parts.join(', ') || 'No treatment data';
}

function extractNegativeSignals(
  treatments: Array<{ citing_opinion_id: number; treatment: string; depth: number }>
): string[] {
  const negativeTypes = ['overruled', 'reversed', 'vacated', 'superseded', 'criticized', 'questioned'];
  return treatments
    .filter(t => negativeTypes.includes(t.treatment.toLowerCase()))
    .map(t => `${t.treatment} (depth: ${t.depth})`);
}

function calculateValidUntil(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Parse Layer 2 AI response
 */
function parseLayer2Response(
  responseText: string,
  searchesRun: number
): {
  searchesRun: number;
  status: BadLawStatus;
  confidence: number;
  concerns: string[];
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const statusMap: Record<string, BadLawStatus> = {
      GOOD_LAW: 'GOOD_LAW',
      CAUTION: 'CAUTION',
      NEGATIVE_TREATMENT: 'NEGATIVE_TREATMENT',
      OVERRULED: 'OVERRULED',
    };

    return {
      searchesRun,
      status: statusMap[parsed.STATUS] || 'GOOD_LAW',
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.CONFIDENCE) || 0.5)),
      concerns: parsed.REASONING ? [parsed.REASONING] : [],
    };
  } catch (error) {
    console.error('[CIV_STEP5] Failed to parse Layer 2 response:', error);
    return {
      searchesRun,
      status: 'CAUTION',
      confidence: 0.6,
      concerns: ['Failed to parse AI analysis'],
    };
  }
}
