// ============================================================
// lib/protocols/handlers/protocol-02.ts
// Protocol 2 — Citation Mismatch Detection
// Source: D9 C-1 | SP-13 AO-1
//
// Triggers when the verification result indicates a MISMATCH —
// the citation was found in the legal database but the metadata
// (case name, date, court, etc.) does not match what appears in
// the draft. This is distinct from NOT_FOUND (Protocol 7) and
// QUOTE_NOT_FOUND (Protocol 3).
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-02');
export const VERSION = '1.0.0';

export async function handleProtocol2(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const { verificationResult, citation } = context;

  if (verificationResult.status !== 'MISMATCH') {
    return notTriggered();
  }

  // Build a descriptive mismatch summary from available metadata
  const mismatchDetails = buildMismatchDetails(context);

  logger.info('protocol.p2.citation_mismatch', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: citation.id,
    caseName: citation.caseName || citation.text,
    confidence: verificationResult.confidence,
  });

  const citationLabel = citation.caseName || citation.text || 'Unknown citation';
  const confidenceNote = verificationResult.confidence !== undefined
    ? ` (confidence: ${Math.round(verificationResult.confidence * 100)}%)`
    : '';

  return {
    protocolNumber: 2,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'CITATION_MISMATCH_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 2,
      severity: 'WARNING',
      title: 'Citation Mismatch Detected',
      description: `Citation "${citationLabel}" was found in the legal database but contains metadata discrepancies${confidenceNote}. ${mismatchDetails}The citation text in the draft does not fully match the authoritative database record.`,
      citationId: citation.id,
      recommendation: 'Review this citation against the original source. Correct any discrepancies in case name, reporter volume, page number, year, or court before filing.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 2,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Builds a human-readable summary of what mismatched, using available metadata.
 */
function buildMismatchDetails(context: ProtocolContext): string {
  const metadata = context.verificationResult.metadata;
  if (!metadata) return '';

  const details: string[] = [];

  if (metadata.court) {
    details.push(`court: ${metadata.court}`);
  }

  if (metadata.isAmended) {
    details.push('the case has been amended since the cited version');
  }

  if (metadata.isEnBanc) {
    details.push('the case was decided en banc');
  }

  if (details.length === 0) return '';

  return `Noted discrepancies: ${details.join('; ')}. `;
}
