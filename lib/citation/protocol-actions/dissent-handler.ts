// ============================================================
// lib/citation/protocol-actions/dissent-handler.ts
// Protocol 21 — Dissenting Opinion Detection
// Source: D9 C-10 | SP-13 AO-10
//
// Extracted from phase-executors.ts inline logic into standalone handler.
// Dispatched via PROT-ORC-A at Step 6.5.
// P21 is highest priority in execution order and triggers HOLD.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../../protocols/types';

const logger = createLogger('protocol-21');
export const VERSION = '1.0.0';

export async function handleProtocol21(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const isDissent = context.verificationResult?.metadata?.isDissent === true;

  if (!isDissent) {
    return {
      protocolNumber: 21,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  logger.info('protocol.p21.dissent_detected', {
    orderId: context.orderId,
    citationId: context.citation.id,
  });

  return {
    protocolNumber: 21,
    triggered: true,
    severity: 'CRITICAL',
    actionTaken: 'DISSENT_FLAGGED',
    aisEntry: {
      category: 'BAD_LAW',
      protocolNumber: 21,
      severity: 'CRITICAL',
      title: 'Dissenting Opinion Cited',
      description: 'The cited opinion is a dissent, not a majority opinion. Citing a dissent without clear disclosure could undermine credibility and may constitute misrepresentation of authority.',
      citationId: context.citation.id,
      recommendation: 'Remove this citation or add explicit disclosure that it is a dissent. A dissent may be cited for persuasive value with proper attribution.',
    },
    holdRequired: true, // P21 is highest priority — triggers HOLD
    handlerVersion: VERSION,
  };
}
