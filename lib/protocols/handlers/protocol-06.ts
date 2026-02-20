// ============================================================
// lib/protocols/handlers/protocol-06.ts
// Protocol 6 — Subsequent History Check
// Detects citations to overruled, superseded, vacated, or
// otherwise abrogated authority. Citing bad law is a serious
// professional responsibility issue — triggers CRITICAL + HOLD.
// Source: D9 C-1 | SP-13 AO-1
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-06');
export const VERSION = '1.0.0';

/**
 * Negative treatment statuses that indicate the authority is no longer good law.
 * These are values that may appear in metadata.treatmentStatus from
 * CourtListener, PACER, or internal verification enrichment.
 */
const NEGATIVE_TREATMENT_STATUSES = new Set([
  'overruled',
  'superseded',
  'abrogated',
  'vacated',
  'reversed',
  'overruled in part',
  'superseded by statute',
  'abrogated by',
  'disapproved',
  'no longer good law',
]);

/**
 * Regex patterns that indicate negative subsequent history in citation text.
 * These catch inline Shepard's/KeyCite-style notations and parenthetical
 * history notes that attorneys sometimes include in draft citations.
 */
const NEGATIVE_HISTORY_PATTERNS = [
  /\boverruled\s+by\b/i,
  /\bsuperseded\s+by\b/i,
  /\babrogated\s+by\b/i,
  /\bvacated\b/i,
  /\breversed\s+by\b/i,
  /\boverruled\s+in\s+part\b/i,
  /\bdisapproved\s+(?:of\s+)?by\b/i,
  /\bno\s+longer\s+good\s+law\b/i,
  /\boverruled\s+on\s+other\s+grounds\b/i,
  /\babrogated\s+on\s+other\s+grounds\b/i,
];

export async function handleProtocol6(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata;
  const citationText = context.citation.text || '';

  // ── Check 1: Explicit metadata flags ──
  const isOverruled = metadata?.isOverruled === true;
  const isSuperseded = metadata?.isSuperseded === true;

  // ── Check 2: Treatment status field ──
  const treatmentStatus = (metadata?.treatmentStatus as string || '').toLowerCase().trim();
  const hasBadTreatment = treatmentStatus.length > 0
    && NEGATIVE_TREATMENT_STATUSES.has(treatmentStatus);

  // ── Check 3: Subsequent history field ──
  const subsequentHistory = (metadata?.subsequentHistory as string || '').toLowerCase();
  const hasBadSubsequentHistory = subsequentHistory.length > 0
    && NEGATIVE_HISTORY_PATTERNS.some(pattern => pattern.test(subsequentHistory));

  // ── Check 4: Citation text patterns ──
  const hasBadTextIndicator = citationText.length > 0
    && NEGATIVE_HISTORY_PATTERNS.some(pattern => pattern.test(citationText));

  const triggered = isOverruled || isSuperseded || hasBadTreatment || hasBadSubsequentHistory || hasBadTextIndicator;

  if (!triggered) {
    return {
      protocolNumber: 6,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // Build a human-readable summary of what was detected
  const reasons: string[] = [];
  if (isOverruled) reasons.push('metadata flag: overruled');
  if (isSuperseded) reasons.push('metadata flag: superseded');
  if (hasBadTreatment) reasons.push(`treatment status: "${treatmentStatus}"`);
  if (hasBadSubsequentHistory) reasons.push(`subsequent history: "${subsequentHistory.substring(0, 120)}"`);
  if (hasBadTextIndicator) reasons.push('negative treatment language in citation text');

  const caseName = context.citation.caseName || context.citation.text || 'Unknown citation';

  logger.info('protocol.p6.bad_law_detected', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    caseName,
    reasons: reasons.join('; '),
  });

  return {
    protocolNumber: 6,
    triggered: true,
    severity: 'CRITICAL',
    actionTaken: context.detectionOnly ? 'BAD_LAW_DETECTED_DETECTION_ONLY' : 'HOLD_TRIGGERED',
    aisEntry: {
      category: 'BAD_LAW',
      protocolNumber: 6,
      severity: 'CRITICAL',
      title: 'Citation to Overruled/Superseded Authority',
      description: `"${caseName}" appears to cite authority that is no longer good law. Detected: ${reasons.join('; ')}. Citing overruled or superseded authority may constitute a violation of professional responsibility rules and could result in sanctions.`,
      citationId: context.citation.id,
      recommendation: 'Remove or replace this citation immediately. Verify current treatment using Shepard\'s Citations or KeyCite before filing. If the case has been overruled on different grounds than those cited, add an explicit parenthetical noting the limited scope of the negative treatment.',
    },
    holdRequired: !context.detectionOnly,
    handlerVersion: VERSION,
  };
}
