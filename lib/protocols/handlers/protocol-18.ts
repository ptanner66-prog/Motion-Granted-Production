// ============================================================
// lib/protocols/handlers/protocol-18.ts
// Protocol 18 — Dicta Detection
// Source: D9 C-11 | SP-13 AO-11
//
// Detects when a cited portion of an opinion is dicta (non-binding
// commentary by the court) rather than the holding. Dicta can be
// persuasive but is not binding authority and should not be
// presented as such in a legal brief.
//
// WARNING severity — citing dicta as holding is a substantive
// legal quality issue that could undermine the motion's arguments.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-18');
export const VERSION = '1.0.0';

/**
 * Extended metadata fields Protocol 18 inspects for dicta signals.
 */
interface DictaMetadata {
  isDicta?: boolean;
  dictaConfidence?: number;
  proposition?: string;
  opinionText?: string;
  [key: string]: unknown;
}

/**
 * Textual indicators that a proposition is drawn from dicta rather
 * than the court's holding. These phrases commonly appear in briefs
 * or in the opinion itself when the cited language is obiter dictum.
 */
const DICTA_PROPOSITION_INDICATORS: RegExp[] = [
  /\bin\s+dicta\b/i,
  /\bobiter\s+dict(?:um|a)\b/i,
  /\bthe\s+court\s+noted\s+(?:in\s+passing\s+)?that\b/i,
  /\bnoted\s+(?:in\s+passing\s+)?that\b/i,
  /\bobserved\s+(?:in\s+passing\s+)?that\b/i,
  /\bsuggested\s+(?:in\s+passing\s+)?that\b/i,
  /\bremarked\s+that\b/i,
  /\bcommented\s+that\b/i,
  /\bdictum\b/i,
  /\bdicta\b/i,
  /\bby\s+way\s+of\s+dicta\b/i,
  /\bnon-binding\s+(?:observation|commentary|language)\b/i,
  /\bnot\s+(?:part\s+of\s+)?the\s+holding\b/i,
  /\bunnecessary\s+to\s+(?:the\s+)?(?:decision|holding|disposition)\b/i,
];

/**
 * Textual indicators within the opinion text itself that the surrounding
 * passage is dicta.
 */
const OPINION_DICTA_INDICATORS: RegExp[] = [
  /\bwe\s+need\s+not\s+(?:decide|reach|address)\b/i,
  /\bwe\s+do\s+not\s+(?:decide|reach|address)\b/i,
  /\beven\s+if\s+we\s+were\s+to\s+(?:reach|address|consider)\b/i,
  /\bassuming\s+(?:without\s+deciding|arguendo)\b/i,
  /\bin\s+passing,?\s+we\s+(?:note|observe)\b/i,
  /\bwe\s+note\s+(?:in\s+passing|parenthetically)\b/i,
  /\bthis\s+issue\s+(?:is|was)\s+not\s+(?:before\s+us|properly\s+presented|raised)\b/i,
];

export async function handleProtocol18(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata as DictaMetadata | undefined;
  const propositionText = metadata?.proposition || '';
  const opinionText = metadata?.opinionText || '';

  // ── Check 1: Explicit dicta flag in metadata ──
  if (metadata?.isDicta === true) {
    const confidence = metadata.dictaConfidence ?? 1.0;

    logger.info('protocol.p18.explicit_dicta', {
      orderId: context.orderId,
      citationId: context.citation.id,
      confidence,
    });

    return buildTriggeredResult(
      context,
      'DICTA_METADATA_FLAG',
      `Citation "${context.citation.caseName || context.citation.text || context.citation.id}" has been identified as dicta (confidence: ${(confidence * 100).toFixed(0)}%). Dicta is non-binding commentary and should not be presented as the court's holding.`,
    );
  }

  // ── Check 2: Proposition text contains dicta indicators ──
  if (propositionText) {
    const propositionMatch = findDictaIndicator(propositionText, DICTA_PROPOSITION_INDICATORS);
    if (propositionMatch) {
      logger.info('protocol.p18.proposition_dicta_indicator', {
        orderId: context.orderId,
        citationId: context.citation.id,
        indicator: propositionMatch,
      });

      return buildTriggeredResult(
        context,
        'DICTA_PROPOSITION_INDICATOR',
        `The proposition attributed to "${context.citation.caseName || context.citation.id}" contains dicta-indicating language ("${propositionMatch}"). The cited language may be persuasive but non-binding commentary rather than the court's holding.`,
      );
    }
  }

  // ── Check 3: Opinion text around the cited proposition contains dicta signals ──
  if (opinionText && propositionText) {
    const opinionMatch = findDictaIndicator(opinionText, OPINION_DICTA_INDICATORS);
    if (opinionMatch) {
      // Only trigger if the dicta indicator appears near the proposition
      // in the opinion text (within ~500 characters), to avoid false positives
      // from dicta language elsewhere in a long opinion.
      const propositionIndex = opinionText.toLowerCase().indexOf(
        propositionText.toLowerCase().slice(0, 40) // Use first 40 chars for fuzzy matching
      );
      if (propositionIndex >= 0) {
        const dictaIndex = opinionText.toLowerCase().indexOf(opinionMatch.toLowerCase());
        const distance = Math.abs(dictaIndex - propositionIndex);

        if (distance <= 500) {
          logger.info('protocol.p18.opinion_dicta_indicator', {
            orderId: context.orderId,
            citationId: context.citation.id,
            indicator: opinionMatch,
            proximityChars: distance,
          });

          return buildTriggeredResult(
            context,
            'DICTA_OPINION_CONTEXT',
            `The opinion text near the cited proposition in "${context.citation.caseName || context.citation.id}" contains dicta-indicating language ("${opinionMatch}"). The cited passage may be obiter dictum rather than binding authority.`,
          );
        }
      }
    }
  }

  // No dicta signals detected
  return {
    protocolNumber: 18,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Searches text for any matching dicta indicator pattern.
 * Returns the matched text or null if none found.
 */
function findDictaIndicator(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Builds a triggered Protocol 18 result with WARNING severity.
 */
function buildTriggeredResult(
  context: ProtocolContext,
  actionTaken: string,
  description: string,
): ProtocolResult {
  return {
    protocolNumber: 18,
    triggered: true,
    severity: 'WARNING',
    actionTaken,
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 18,
      severity: 'WARNING',
      title: 'Dicta Detected — Non-Binding Authority',
      description,
      citationId: context.citation.id,
      recommendation: 'Review this citation to determine if the language cited is from the court\'s holding or from dicta. If dicta, consider either: (1) reframing the citation to acknowledge its persuasive-only status (e.g., "The court observed in dicta that..."), or (2) replacing it with binding authority.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
