// ============================================================
// lib/protocols/handlers/protocol-03.ts
// Protocol 3 — Quote Verification
// Source: D9 C-1 | SP-13 AO-1
//
// Triggers when the verification result indicates QUOTE_NOT_FOUND —
// the case itself was found and verified, but a specific quoted
// passage attributed to that case could not be located in the
// opinion text. This is a strong signal of AI hallucination or
// misattribution and warrants attorney review.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-03');
export const VERSION = '1.0.0';

export async function handleProtocol3(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const { verificationResult, citation } = context;

  if (verificationResult.status !== 'QUOTE_NOT_FOUND') {
    return notTriggered();
  }

  const citationLabel = citation.caseName || citation.text || 'Unknown citation';
  const propositionText = verificationResult.metadata?.proposition as string | undefined;

  logger.info('protocol.p3.quote_not_found', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: citation.id,
    caseName: citationLabel,
    hasProposition: String(!!propositionText),
    confidence: verificationResult.confidence,
  });

  // Build description with proposition context if available
  const propositionSnippet = propositionText
    ? ` The attributed text was: "${truncate(propositionText, 150)}".`
    : '';

  const confidenceNote = verificationResult.confidence !== undefined
    ? ` Verification confidence: ${Math.round(verificationResult.confidence * 100)}%.`
    : '';

  return {
    protocolNumber: 3,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'QUOTE_MISMATCH_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 3,
      severity: 'WARNING',
      title: 'Quoted Text Not Found in Opinion',
      description: `The case "${citationLabel}" was located in the legal database, but the quoted passage attributed to this opinion could not be found in the full text.${propositionSnippet}${confidenceNote} This may indicate a fabricated quote, a paraphrase presented as a direct quote, or attribution to the wrong opinion.`,
      citationId: citation.id,
      recommendation: 'Verify the quoted language against the original opinion. If the quote cannot be confirmed, rephrase as a paraphrase with appropriate attribution or remove the quotation marks.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 3,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Truncates text to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
