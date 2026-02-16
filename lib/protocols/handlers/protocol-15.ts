// ============================================================
// lib/protocols/handlers/protocol-15.ts
// Protocol 15 — Pinpoint Citation Check (proposition-presence only)
// BINDING (Decision 3): No star pagination
// Source: D9 C-8 | SP-13 AO-8
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-15');
export const VERSION = '1.0.0';

const HIGH_SIMILARITY_THRESHOLD = 0.85;
const STANDARD_SIMILARITY_THRESHOLD = 0.70;
const SHORT_PROPOSITION_THRESHOLD = 10; // words

export async function handleProtocol15(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const hasPinpoint = detectPinpointReference(context.citation.text || '');

  if (!hasPinpoint) {
    return notTriggered();
  }

  const propositionText = context.verificationResult?.metadata?.proposition as string | undefined;
  if (!propositionText) {
    return notTriggered();
  }

  const opinionText = context.verificationResult?.metadata?.opinionText as string | undefined;
  if (!opinionText) {
    // Opinion text unavailable — cannot verify, INFO only
    logger.info('protocol.p15.opinion_unavailable', {
      orderId: context.orderId,
      citationId: context.citation.id,
    });
    return {
      protocolNumber: 15,
      triggered: true,
      severity: 'INFO',
      actionTaken: 'PINPOINT_UNVERIFIABLE_NO_TEXT',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 15,
        severity: 'INFO',
        title: 'Pinpoint Citation — Verification Unavailable',
        description: 'The pinpoint citation could not be verified because the full opinion text was not available from the legal database.',
        citationId: context.citation.id,
        recommendation: 'Verify the pinpoint page reference manually before filing.',
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // Proposition-presence check
  const wordCount = propositionText.split(/\s+/).length;
  const threshold = wordCount < SHORT_PROPOSITION_THRESHOLD
    ? HIGH_SIMILARITY_THRESHOLD
    : STANDARD_SIMILARITY_THRESHOLD;

  const found = searchPropositionInText(propositionText, opinionText, threshold);

  if (!found) {
    logger.info('protocol.p15.proposition_not_found', {
      orderId: context.orderId,
      citationId: context.citation.id,
    });
    return {
      protocolNumber: 15,
      triggered: true,
      severity: 'CRITICAL',
      actionTaken: 'PINPOINT_PROPOSITION_MISSING',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 15,
        severity: 'CRITICAL',
        title: 'Pinpoint Citation — Proposition Not Found',
        description: 'The cited proposition was not found in the full opinion text. This may indicate a fabricated or misattributed citation.',
        citationId: context.citation.id,
        recommendation: 'Verify this citation before filing. The cited proposition could not be located in the opinion.',
      },
      holdRequired: false, // P15 never triggers HOLD
      handlerVersion: VERSION,
    };
  }

  // Found but page unverifiable (no star pagination per Decision 3)
  return {
    protocolNumber: 15,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'PINPOINT_PROPOSITION_FOUND_PAGE_UNVERIFIABLE',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 15,
      severity: 'INFO',
      title: 'Pinpoint Citation — Page Unverifiable',
      description: 'The cited proposition was found in the opinion, but the specific page number could not be verified against reporter pagination.',
      citationId: context.citation.id,
      recommendation: 'Verify the page reference before filing.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 15,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function detectPinpointReference(text: string): boolean {
  // Matches patterns like "at 123", "at 456-57", "at *123"
  return /\bat\s+\*?\d+/.test(text);
}

function searchPropositionInText(
  proposition: string,
  opinionText: string,
  threshold: number
): boolean {
  // Word-overlap similarity
  const propWords = new Set(proposition.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const textWords = new Set(opinionText.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (propWords.size === 0) return false;

  let matches = 0;
  for (const word of propWords) {
    if (textWords.has(word)) matches++;
  }

  const similarity = matches / propWords.size;
  return similarity >= threshold;
}
