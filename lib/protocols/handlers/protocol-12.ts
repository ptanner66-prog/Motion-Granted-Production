// ============================================================
// lib/protocols/handlers/protocol-12.ts
// Protocol 12 — Page Limit Check (Citation Length)
// Source: D9 C-5 | SP-13 AO-5
//
// Detects excessively long citation text that may indicate
// formatting issues, copy-paste errors, or embedded content
// that does not belong in a citation string.
//
// Threshold: 500 characters. Citations exceeding this length
// are flagged for review. Does NOT trigger a HOLD.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-12');
export const VERSION = '1.0.0';

/**
 * Maximum acceptable length for a single citation text string.
 * Citations longer than this threshold likely contain formatting
 * artifacts, embedded footnotes, or copy-paste errors.
 */
const MAX_CITATION_LENGTH = 500;

export async function handleProtocol12(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const citationText = context.citation.text || '';

  // No text to evaluate — not triggered
  if (citationText.length === 0) {
    return {
      protocolNumber: 12,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  const textLength = citationText.length;

  if (textLength <= MAX_CITATION_LENGTH) {
    return {
      protocolNumber: 12,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  const caseName = context.citation.caseName || context.citation.text?.slice(0, 80) || 'Unknown citation';

  logger.info('protocol.p12.excessive_length', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    textLength,
    threshold: MAX_CITATION_LENGTH,
  });

  return {
    protocolNumber: 12,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'CITATION_LENGTH_FLAGGED',
    aisEntry: {
      category: 'QUALITY',
      protocolNumber: 12,
      severity: 'INFO',
      title: 'Citation Text Exceeds Length Threshold',
      description: `Citation "${caseName}" has ${textLength} characters (threshold: ${MAX_CITATION_LENGTH}). This may indicate a formatting issue, embedded footnote content, or copy-paste error that should be reviewed before filing.`,
      citationId: context.citation.id,
      recommendation: 'Review this citation for formatting issues. Excessively long citation strings often contain embedded content that should be separated from the citation itself.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
