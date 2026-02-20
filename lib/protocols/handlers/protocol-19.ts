// ============================================================
// lib/protocols/handlers/protocol-19.ts
// Protocol 19 — En Banc Detection
// Source: D9 C-12 | SP-13 AO-12
//
// Detects when a cited opinion was decided en banc (by the full
// court rather than a standard 3-judge appellate panel). En banc
// decisions carry heightened authority and are significant for
// brief quality — they indicate the full circuit weighed in.
//
// INFO severity — this is informational, not a problem. En banc
// status is a quality signal that strengthens the citation.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-19');
export const VERSION = '1.0.0';

/**
 * Textual patterns in citation text that indicate an en banc decision.
 * Courts use various notations to designate en banc opinions.
 */
const EN_BANC_TEXT_PATTERNS: RegExp[] = [
  /\ben\s+banc\b/i,
  /\b\(en\s+banc\)\b/i,
  /\bsitting\s+en\s+banc\b/i,
  /\bfull\s+court\b/i,
  /\brehearing\s+en\s+banc\b/i,
  /\bgranted\s+en\s+banc\s+review\b/i,
];

export async function handleProtocol19(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata;
  const citationText = context.citation.text || '';
  const caseName = context.citation.caseName || '';

  // ── Check 1: Explicit en banc flag in verification metadata ──
  if (metadata?.isEnBanc === true) {
    logger.info('protocol.p19.en_banc_metadata', {
      orderId: context.orderId,
      citationId: context.citation.id,
      court: metadata.court || 'unknown',
    });

    return buildEnBancResult(
      context,
      'EN_BANC_METADATA_FLAG',
      `Citation "${caseName || citationText || context.citation.id}" was decided en banc by ${metadata.court || 'the full court'}. En banc decisions carry heightened authority as the full bench participated in the decision.`,
    );
  }

  // ── Check 2: Citation text contains en banc indicators ──
  const textMatch = findEnBancIndicator(citationText);
  if (textMatch) {
    logger.info('protocol.p19.en_banc_text_pattern', {
      orderId: context.orderId,
      citationId: context.citation.id,
      matchedPattern: textMatch,
    });

    return buildEnBancResult(
      context,
      'EN_BANC_TEXT_INDICATOR',
      `Citation "${caseName || context.citation.id}" contains en banc designation ("${textMatch}"). En banc decisions are decided by the full court and carry greater weight than standard panel decisions.`,
    );
  }

  // ── Check 3: Case name contains en banc indicators ──
  if (caseName) {
    const caseNameMatch = findEnBancIndicator(caseName);
    if (caseNameMatch) {
      logger.info('protocol.p19.en_banc_case_name', {
        orderId: context.orderId,
        citationId: context.citation.id,
        matchedPattern: caseNameMatch,
      });

      return buildEnBancResult(
        context,
        'EN_BANC_CASE_NAME',
        `Case "${caseName}" appears to be an en banc decision based on its case name. En banc decisions are decided by the full appellate court and carry greater precedential weight.`,
      );
    }
  }

  // No en banc signals detected
  return {
    protocolNumber: 19,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Searches text for en banc indicator patterns.
 * Returns the matched text or null if none found.
 */
function findEnBancIndicator(text: string): string | null {
  for (const pattern of EN_BANC_TEXT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Builds an INFO-level Protocol 19 result for en banc detection.
 * En banc is informational — it strengthens rather than weakens the citation.
 */
function buildEnBancResult(
  context: ProtocolContext,
  actionTaken: string,
  description: string,
): ProtocolResult {
  return {
    protocolNumber: 19,
    triggered: true,
    severity: 'INFO',
    actionTaken,
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 19,
      severity: 'INFO',
      title: 'En Banc Decision Detected',
      description,
      citationId: context.citation.id,
      recommendation: 'No corrective action required. Consider noting the en banc status in the brief to emphasize the authority\'s weight. En banc decisions supersede prior panel decisions on the same issue within the same circuit.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
