// ============================================================
// lib/protocols/handlers/protocol-11.ts
// Protocol 11 — API Unavailable / External Service Failure
// Source: D9 C-4 | SP-GOD-6
//
// Triggers when external API calls (CourtListener, PACER, OpenAI)
// fail during citation verification. Logs the failure, flags
// affected citations, and generates an AIS entry.
//
// This protocol does NOT trigger a HOLD — it adds a disclosure
// that certain citations could not be independently verified.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-11');
export const VERSION = '1.0.0';

/**
 * API services tracked by Protocol 11.
 */
export type ExternalService = 'courtlistener' | 'pacer' | 'openai' | 'google_scholar';

/**
 * Extended context for Protocol 11.
 * The verification result metadata may include service failure info.
 */
interface ServiceFailureMetadata {
  serviceFailures?: Array<{
    service: ExternalService;
    error: string;
    timestamp: string;
  }>;
  verificationDeferred?: boolean;
  [key: string]: unknown;
}

export async function handleProtocol11(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult.metadata as ServiceFailureMetadata | undefined;

  // Check if verification was deferred due to service unavailability
  const isDeferred = context.verificationResult.status === 'VERIFICATION_DEFERRED';
  const serviceFailures = metadata?.serviceFailures || [];
  const hasFailures = serviceFailures.length > 0 || isDeferred;

  if (!hasFailures) {
    return {
      protocolNumber: 11,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  const failedServices = serviceFailures.map(f => f.service).join(', ') || 'unknown';
  const citationId = context.citation.id;
  const caseName = context.citation.caseName || context.citation.text || 'Unknown citation';

  logger.info('protocol.p11.service_unavailable', {
    orderId: context.orderId,
    phase: context.phase,
    citationId,
    failedServices,
    isDeferred: String(isDeferred),
  });

  return {
    protocolNumber: 11,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'UNVERIFIED_CITATION_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 11,
      severity: 'WARNING',
      title: 'Citation Verification Incomplete — External Service Unavailable',
      description: `Citation "${caseName}" could not be fully verified because external verification service(s) were unavailable (${failedServices}). This citation should be independently verified before filing.`,
      citationId,
      recommendation: 'Independently verify this citation using Westlaw, LexisNexis, or another authoritative legal research platform before filing.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
