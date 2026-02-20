// ============================================================
// lib/protocols/handlers/protocol-08.ts
// Protocol 8 — Jurisdiction Mismatch
// Detects when a cited case comes from a court outside the
// target jurisdiction and is not from a higher/federal court
// whose decisions would be binding or persuasive.
// Source: D9 C-2 | SP-13 AO-2
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-08');
export const VERSION = '1.0.0';

/**
 * Federal courts whose decisions are universally citable.
 * The U.S. Supreme Court is binding everywhere. Circuit Courts
 * of Appeals are always legitimate persuasive authority even
 * outside their circuit.
 */
const UNIVERSAL_FEDERAL_COURTS = new Set([
  // Supreme Court
  'scotus',
  'supreme court',
  'u.s. supreme court',
  'united states supreme court',
  'supreme court of the united states',
  // Circuit Courts of Appeals (always valid persuasive authority)
  '1stcircuit', 'ca1', '1st cir',
  '2ndcircuit', 'ca2', '2nd cir',
  '3rdcircuit', 'ca3', '3rd cir',
  '4thcircuit', 'ca4', '4th cir',
  '5thcircuit', 'ca5', '5th cir',
  '6thcircuit', 'ca6', '6th cir',
  '7thcircuit', 'ca7', '7th cir',
  '8thcircuit', 'ca8', '8th cir',
  '9thcircuit', 'ca9', '9th cir',
  '10thcircuit', 'ca10', '10th cir',
  '11thcircuit', 'ca11', '11th cir',
  'dccircuit', 'cadc', 'd.c. cir',
  'fedcircuit', 'cafc', 'fed. cir',
  // Federal district courts (valid persuasive authority)
  'district court',
]);

/**
 * Maps jurisdiction identifiers to their associated state court identifiers.
 * A court is considered "in jurisdiction" if it appears in the jurisdiction's
 * list or in the UNIVERSAL_FEDERAL_COURTS set.
 */
const JURISDICTION_COURTS: Record<string, Set<string>> = {
  // Louisiana
  'LA': new Set([
    'la', 'lasc', 'la supreme court', 'louisiana supreme court',
    'la app', 'la ct app', 'louisiana court of appeal',
    'la 1st cir', 'la 2nd cir', 'la 3rd cir', 'la 4th cir', 'la 5th cir',
    'louisiana',
  ]),
  // California
  'CA': new Set([
    'cal', 'calctapp', 'ca supreme court', 'california supreme court',
    'cal ct app', 'california court of appeal',
    'cal app', 'cal. app.',
    'california',
  ]),
  // Federal 5th Circuit (covers LA, TX, MS)
  'FED_5TH': new Set([
    '5thcircuit', 'ca5', '5th cir',
    // District courts within the 5th Circuit
    'edla', 'mdla', 'wdla', 'ndtx', 'edtx', 'sdtx', 'wdtx', 'ndms', 'sdms',
    'e.d. la', 'm.d. la', 'w.d. la',
    'n.d. tex', 'e.d. tex', 's.d. tex', 'w.d. tex',
    'n.d. miss', 's.d. miss',
  ]),
  // Federal 9th Circuit (covers CA, AZ, NV, OR, WA, etc.)
  'FED_9TH': new Set([
    '9thcircuit', 'ca9', '9th cir',
    // District courts within the 9th Circuit
    'cdca', 'ndca', 'sdca', 'edca',
    'c.d. cal', 'n.d. cal', 's.d. cal', 'e.d. cal',
    'daz', 'dnv', 'dor', 'wdwa', 'edwa',
  ]),
};

/**
 * Regex patterns to identify federal courts from citation text.
 * Used as a fallback when metadata.court is not populated.
 */
const FEDERAL_COURT_PATTERN = /\b(?:U\.?S\.?\s*(?:Supreme|Dist|App)?|(?:\d+(?:st|nd|rd|th)\s+)?Cir(?:cuit)?\.?|S\.?\s*Ct\.?|F\.?\s*(?:2d|3d|4th|Supp))\b/i;

/**
 * Checks whether the cited court is considered "in jurisdiction" or
 * universally valid (federal courts).
 */
function isCourtInJurisdiction(court: string, jurisdiction: string): boolean {
  const normalizedCourt = court.toLowerCase().trim();

  // Federal courts are always valid
  if (UNIVERSAL_FEDERAL_COURTS.has(normalizedCourt)) {
    return true;
  }

  // Check if the court name contains a federal court identifier
  for (const federalCourt of UNIVERSAL_FEDERAL_COURTS) {
    if (normalizedCourt.includes(federalCourt)) {
      return true;
    }
  }

  // Check jurisdiction-specific courts
  const jurisdictionCourts = JURISDICTION_COURTS[jurisdiction];
  if (!jurisdictionCourts) {
    // Unknown jurisdiction — cannot determine mismatch, do not trigger
    return true;
  }

  // Direct match
  if (jurisdictionCourts.has(normalizedCourt)) {
    return true;
  }

  // Partial match — check if any jurisdiction court identifier appears in the court name
  for (const jCourt of jurisdictionCourts) {
    if (normalizedCourt.includes(jCourt)) {
      return true;
    }
  }

  return false;
}

/**
 * Attempts to extract a court identifier from citation text when
 * metadata.court is not available.
 */
function extractCourtFromText(citationText: string): string | null {
  if (!citationText) return null;

  // Common reporter-based court identification patterns
  const patterns: Array<{ pattern: RegExp; court: string }> = [
    { pattern: /\bU\.?\s*S\.?\s+\d/i, court: 'scotus' },
    { pattern: /\bS\.?\s*Ct\.?\s+\d/i, court: 'scotus' },
    { pattern: /\bL\.?\s*Ed\.?\s/i, court: 'scotus' },
    { pattern: /\bF\.?\s*(?:2d|3d|4th)\s+\d/i, court: 'circuit' },
    { pattern: /\bF\.?\s*Supp/i, court: 'district court' },
    { pattern: /\bSo\.?\s*(?:2d|3d)\s+\d/i, court: 'la' },
    { pattern: /\bLa\.?\s+\d/i, court: 'lasc' },
    { pattern: /\bCal\.?\s*(?:App\.?)?\s*(?:2d|3d|4th|5th)?\s+\d/i, court: 'cal' },
    { pattern: /\bP\.?\s*(?:2d|3d)\s+\d/i, court: 'western state' },
    { pattern: /\bN\.?\s*[EW]\.?\s*(?:2d|3d)\s+\d/i, court: 'other state' },
    { pattern: /\bS\.?\s*[EW]\.?\s*(?:2d|3d)\s+\d/i, court: 'other state' },
    { pattern: /\bA\.?\s*(?:2d|3d)\s+\d/i, court: 'other state' },
  ];

  for (const { pattern, court } of patterns) {
    if (pattern.test(citationText)) {
      return court;
    }
  }

  return null;
}

export async function handleProtocol8(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata;
  const court = (metadata?.court as string) || extractCourtFromText(context.citation.text || '');

  // If we cannot determine the court, we cannot evaluate jurisdiction match
  if (!court) {
    return {
      protocolNumber: 8,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // Check if the court is in the target jurisdiction or is a universally valid federal court
  if (isCourtInJurisdiction(court, context.jurisdiction)) {
    return {
      protocolNumber: 8,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // Jurisdiction mismatch detected
  const caseName = context.citation.caseName || context.citation.text || 'Unknown citation';

  logger.info('protocol.p8.jurisdiction_mismatch', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    citedCourt: court,
    targetJurisdiction: context.jurisdiction,
  });

  return {
    protocolNumber: 8,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'JURISDICTION_MISMATCH_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 8,
      severity: 'WARNING',
      title: 'Jurisdiction Mismatch — Out-of-Jurisdiction Citation',
      description: `"${caseName}" appears to be from "${court}" which is outside the target jurisdiction (${context.jurisdiction}). Out-of-jurisdiction authority is only persuasive and may carry less weight with the court. Verify that binding authority from the target jurisdiction is not available for the same proposition.`,
      citationId: context.citation.id,
      recommendation: 'Consider replacing with binding authority from the target jurisdiction if available. If this is the best authority for the proposition, add a parenthetical explaining its persuasive value and ensure binding authority is also cited where possible.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
