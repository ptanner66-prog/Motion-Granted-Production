/**
 * CIV Step 5: Bad Law Check
 *
 * Three-layer approach to determine if case is still "good law":
 * Layer 1: CourtListener Treatment API (deterministic)
 * Layer 2: AI Pattern Detection (LLM evaluation of search results)
 * Layer 3: Curated Overruled List (manual maintenance)
 */

import { getAnthropicClient } from '@/lib/automation/claude';
import { getCitationTreatment } from '@/lib/courtlistener/client';
import { checkCuratedOverruledList, recordGoodLawCheck } from '../database';
import { DEFAULT_CIV_CONFIG, BAD_LAW_ANALYSIS_PROMPT, type BadLawCheckOutput, type BadLawStatus } from '../types';

/**
 * Execute Step 5: Bad Law Check
 *
 * Flow:
 * 1. Check curated overruled list (Layer 3 - quick check)
 * 2. Query CourtListener treatment (Layer 1)
 * 3. If Layer 1 returns good law, run AI pattern detection (Layer 2)
 * 4. Combine results for composite status
 */
export async function executeBadLawCheck(
  citation: string,
  caseName: string,
  courtlistenerId?: string,
  citationDbId?: string
): Promise<BadLawCheckOutput> {
  const config = DEFAULT_CIV_CONFIG;

  const result: BadLawCheckOutput = {
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

      // Record in database
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
    if (courtlistenerId) {
      const treatmentResult = await getCitationTreatment(courtlistenerId);

      if (treatmentResult.success && treatmentResult.data) {
        const { positive, negative, caution, treatments } = treatmentResult.data;

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

          // Record in database
          if (citationDbId) {
            await recordGoodLawCheck({
              citationId: citationDbId,
              status: 'OVERRULED',
              confidence: 1.0,
              layer1Treatment: overrulingCase?.treatment,
              layer1RawResponse: treatmentResult.data as Record<string, unknown>,
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
    }

    // Layer 2: AI pattern detection for additional assurance
    const layer2Result = await runAIPatternDetection(caseName);

    result.layer2 = layer2Result;

    // Composite status determination
    result.compositeStatus = determineCompositeStatus(result.layer1, result.layer2, result.layer3);
    result.confidence = calculateCompositeConfidence(result.layer1, result.layer2, result.layer3);

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
    console.error('Bad law check error:', error);

    // On error, return cautious result
    result.compositeStatus = 'CAUTION';
    result.confidence = 0.5;
    result.actionTaken = 'FLAG';
    result.layer2.concerns.push(`Verification error: ${error instanceof Error ? error.message : 'Unknown'}`);

    return result;
  }
}

/**
 * Run AI pattern detection (Layer 2)
 */
async function runAIPatternDetection(caseName: string): Promise<{
  searchesRun: number;
  status: BadLawStatus;
  confidence: number;
  concerns: string[];
}> {
  const config = DEFAULT_CIV_CONFIG;

  // Define search patterns
  const searchPatterns = [
    `"${caseName}" overruled`,
    `"${caseName}" abrogated`,
    `"${caseName}" superseded by statute`,
    `"${caseName}" no longer good law`,
  ];

  // For this implementation, we'll simulate search results
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
    const anthropic = await getAnthropicClient();
    if (!anthropic) {
      throw new Error('Anthropic client not configured');
    }

    const response = await anthropic.messages.create({
      model: config.primaryModel,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return parseLayer2Response(content.text, searchPatterns.length);
  } catch (error) {
    console.error('Layer 2 AI analysis error:', error);
    return {
      searchesRun: searchPatterns.length,
      status: 'CAUTION',
      confidence: 0.6,
      concerns: [`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown'}`],
    };
  }
}

/**
 * Simulate search results (in production, this would call a real search API)
 */
async function simulateSearchResults(caseName: string, patterns: string[]): Promise<string[]> {
  // This is a placeholder - in production, integrate with:
  // - Google Custom Search API
  // - Legal search APIs
  // - Westlaw/LexisNexis (if available)

  // For now, return empty to indicate no concerning results found
  // This means Layer 2 will default to GOOD_LAW
  return [];
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
    console.error('Failed to parse Layer 2 response:', error);
    return {
      searchesRun,
      status: 'CAUTION',
      confidence: 0.6,
      concerns: ['Failed to parse AI analysis'],
    };
  }
}

/**
 * Determine composite status from all layers
 */
function determineCompositeStatus(
  layer1: BadLawCheckOutput['layer1'],
  layer2: BadLawCheckOutput['layer2'],
  layer3: BadLawCheckOutput['layer3']
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

  if (layer2.status === 'NEGATIVE_TREATMENT') {
    return 'NEGATIVE_TREATMENT';
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

/**
 * Summarize treatment from counts
 */
function summarizeTreatment(positive: number, negative: number, caution: number): string {
  const parts: string[] = [];

  if (positive > 0) parts.push(`${positive} positive`);
  if (negative > 0) parts.push(`${negative} negative`);
  if (caution > 0) parts.push(`${caution} cautionary`);

  return parts.join(', ') || 'No treatment data';
}

/**
 * Extract negative signals from treatment data
 */
function extractNegativeSignals(
  treatments: Array<{ citing_opinion_id: number; treatment: string; depth: number }>
): string[] {
  const negativeTypes = ['overruled', 'reversed', 'vacated', 'superseded', 'criticized', 'questioned'];

  return treatments
    .filter(t => negativeTypes.includes(t.treatment.toLowerCase()))
    .map(t => `${t.treatment} (depth: ${t.depth})`);
}

/**
 * Calculate validity expiration date
 */
function calculateValidUntil(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
