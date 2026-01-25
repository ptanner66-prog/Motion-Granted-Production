/**
 * CIV Step 3: Dicta Detection
 *
 * Distinguish between HOLDING (binding precedent) and DICTA (judicial commentary).
 * Citing dicta as if it were holding is a common error.
 */

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CIV_CONFIG, DICTA_DETECTION_PROMPT, type DictaDetectionOutput, type DictaClassification, type PropositionType } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Execute Step 3: Dicta Detection
 *
 * Classifies the cited statement as HOLDING, DICTA, or UNCLEAR
 */
export async function executeDictaDetection(
  caseName: string,
  quotedOrParaphrasedText: string,
  surroundingContext: string,
  propositionType: PropositionType
): Promise<DictaDetectionOutput> {
  const config = DEFAULT_CIV_CONFIG;

  const result: DictaDetectionOutput = {
    step: 3,
    name: 'dicta_detection',
    classification: 'UNCLEAR',
    confidence: 0,
    reasoning: '',
    actionTaken: 'CONTINUE',
    proceedToStep4: true,
  };

  try {
    const prompt = DICTA_DETECTION_PROMPT
      .replace('{case_name}', caseName)
      .replace('{quoted_or_paraphrased_text}', quotedOrParaphrasedText)
      .replace('{surrounding_paragraphs}', surroundingContext || 'No additional context available.');

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

    const parsed = parseDictaResponse(content.text);

    result.classification = parsed.classification;
    result.confidence = parsed.confidence;
    result.reasoning = parsed.reasoning;

    // Determine action based on classification and proposition type
    result.actionTaken = determineAction(parsed.classification, propositionType);

    // Proceed to Step 4 unless blocked
    result.proceedToStep4 = result.actionTaken !== 'FLAG' ||
      (propositionType !== 'PRIMARY_STANDARD' && propositionType !== 'REQUIRED_ELEMENT');

    return result;
  } catch (error) {
    console.error('Dicta detection error:', error);
    result.reasoning = `Detection error: ${error instanceof Error ? error.message : 'Unknown'}`;
    return result;
  }
}

/**
 * Parse dicta detection response
 */
function parseDictaResponse(responseText: string): {
  classification: DictaClassification;
  confidence: number;
  reasoning: string;
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const classificationMap: Record<string, DictaClassification> = {
      HOLDING: 'HOLDING',
      DICTA: 'DICTA',
      UNCLEAR: 'UNCLEAR',
    };

    return {
      classification: classificationMap[parsed.CLASSIFICATION] || 'UNCLEAR',
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.CONFIDENCE) || 0)),
      reasoning: parsed.REASONING || 'No reasoning provided',
    };
  } catch (error) {
    console.error('Failed to parse dicta response:', error);
    return {
      classification: 'UNCLEAR',
      confidence: 0.5,
      reasoning: 'Failed to parse classification response',
    };
  }
}

/**
 * Determine action based on dicta classification and proposition type
 *
 * Per spec:
 * - HOLDING + Any = CONTINUE
 * - DICTA + PRIMARY_STANDARD/REQUIRED_ELEMENT = FLAG
 * - DICTA + SECONDARY = NOTE
 * - DICTA + CONTEXT = NOTE
 * - UNCLEAR + Any = Run adversarial check, then decide
 */
function determineAction(
  classification: DictaClassification,
  propositionType: PropositionType
): 'CONTINUE' | 'FLAG' | 'NOTE' {
  if (classification === 'HOLDING') {
    return 'CONTINUE';
  }

  if (classification === 'DICTA') {
    if (propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT') {
      return 'FLAG';
    }
    return 'NOTE';
  }

  // UNCLEAR - continue with note
  return 'NOTE';
}

/**
 * Extract relevant context around a quote from opinion text
 */
export function extractSurroundingContext(
  opinionText: string,
  targetText: string,
  contextChars: number = 2000
): string {
  const lowerOpinion = opinionText.toLowerCase();
  const lowerTarget = targetText.toLowerCase();

  // Find the target text in the opinion
  const index = lowerOpinion.indexOf(lowerTarget);

  if (index === -1) {
    // If exact match not found, try fuzzy matching
    const words = targetText.split(/\s+/).slice(0, 5);
    const searchPattern = words.join('.*?');
    const fuzzyMatch = opinionText.match(new RegExp(searchPattern, 'i'));

    if (fuzzyMatch && fuzzyMatch.index !== undefined) {
      const start = Math.max(0, fuzzyMatch.index - contextChars / 2);
      const end = Math.min(opinionText.length, fuzzyMatch.index + fuzzyMatch[0].length + contextChars / 2);
      return opinionText.substring(start, end);
    }

    return '';
  }

  // Extract context around the found text
  const start = Math.max(0, index - contextChars / 2);
  const end = Math.min(opinionText.length, index + targetText.length + contextChars / 2);

  return opinionText.substring(start, end);
}
