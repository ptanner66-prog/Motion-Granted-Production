// ============================================================
// lib/citation/protocol-actions/plurality-handler.ts
// Protocol 20 — Plurality Opinion Detection
// Source: D9 C-10 | SP-13 AO-10
//
// Extracted from phase-executors.ts inline logic into standalone handler.
// Dispatched via PROT-ORC-A at Step 6.5.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../../protocols/types';

const logger = createLogger('protocol-20');
export const VERSION = '1.0.0';

export async function handleProtocol20(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const isPlurality = context.verificationResult?.metadata?.isPlurality === true;

  if (!isPlurality) {
    return {
      protocolNumber: 20,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  logger.info('protocol.p20.plurality_detected', {
    orderId: context.orderId,
    citationId: context.citation.id,
  });

  return {
    protocolNumber: 20,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'PLURALITY_FLAGGED',
    aisEntry: {
      category: 'BAD_LAW',
      protocolNumber: 20,
      severity: 'WARNING',
      title: 'Plurality Opinion Cited',
      description: 'The cited opinion is a plurality opinion (no majority). Plurality opinions may be persuasive but are not binding precedent in most jurisdictions.',
      citationId: context.citation.id,
      recommendation: 'Verify that the cited proposition has majority support. Consider supplementing with a binding authority.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
