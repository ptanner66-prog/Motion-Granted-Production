// ============================================================
// lib/protocols/handlers/protocol-05.ts
// Protocol 5 — New Citation Detection (Mini Phase IV)
// BINDING (Decision 1, 02/11): Does NOT increment loop counter
// Source: D9 C-4 | SP-13 AO-4
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-05');
export const VERSION = '1.0.0';

export async function handleProtocol5(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const isRevisionPhase = context.phase === 'VII.1' || context.phase === 'IX.1';
  const isNewCitation = context.citation.addedDuringRevision === true;

  if (!isRevisionPhase || !isNewCitation) {
    return {
      protocolNumber: 5,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  logger.info('protocol.p5.new_citation_detected', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
  });

  return {
    protocolNumber: 5,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'MINI_PHASE_IV_ROUTE',
    aisEntry: {
      category: 'WORKFLOW',
      protocolNumber: 5,
      severity: 'INFO',
      title: 'New Citation Detected During Revision',
      description: 'A citation added during revision was routed through Mini Phase IV (VII.1 verification + Phase VII regrade) as a sub-process within the current revision loop.',
      citationId: context.citation.id,
      recommendation: 'No attorney action required. This citation has been verified through the standard pipeline.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
