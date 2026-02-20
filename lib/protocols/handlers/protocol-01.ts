// ============================================================
// lib/protocols/handlers/protocol-01.ts
// Protocol 1 — Statutory Source Identification
// Source: D9 C-1 | SP-13 AO-1
//
// Detects whether a citation refers to a statute, code, or
// regulation rather than case law. Statutory sources follow
// different verification paths — this protocol flags them so
// downstream handlers (e.g., P7 cumulative failure) do not
// penalize unverifiable statutory references.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-01');
export const VERSION = '1.0.0';

/**
 * Patterns that indicate a statutory or regulatory source.
 * Each pattern is tested against the full citation text (case-insensitive).
 */
const STATUTORY_PATTERNS: RegExp[] = [
  // Section symbol (§) — universal statutory marker
  /§\s*\d/,
  // United States Code
  /\d+\s+U\.?\s*S\.?\s*C\.?\s*[§A]?\s*\d/i,
  // Code of Federal Regulations
  /\d+\s+C\.?\s*F\.?\s*R\.?\s*[§.]?\s*\d/i,
  // Revised Statutes
  /Rev\.\s*Stat\./i,
  // Annotated codes (e.g., "La. Code Civ. Proc. Ann.", "Cal. Penal Code Ann.")
  /Ann\.\s*(art|§|\d)/i,
  // Generic "Code" references (e.g., "La. Code Civ. Proc.", "U.C.C.", "Penal Code")
  /\b(Code\s+(Civ\.|Crim\.|Evid\.|Com\.|Penal)|(Civ\.|Crim\.|Evid\.|Com\.|Penal)\s+Code)\b/i,
  // State-specific code patterns (e.g., "La. R.S.", "Tex. Bus. & Com. Code", "N.Y. C.P.L.R.")
  /\bLa\.\s*R\.?\s*S\.?\s*\d/i,
  /\b[A-Z][a-z]+\.\s+(Bus\.|Fam\.|Gov't?|Ins\.|Lab\.|Prob\.|Tax)\s/i,
  // Public Law references
  /\bPub\.\s*L\.\s*No\.\s*\d/i,
  /\bP\.?\s*L\.?\s*\d+-\d+/,
  // Federal Rules (Civil Procedure, Criminal Procedure, Evidence, Appellate)
  /\bFed\.\s*R\.\s*(Civ\.|Crim\.|Evid\.|App\.)\s*P\./i,
  /\bF\.?\s*R\.?\s*(C\.?\s*P|Cr\.?\s*P|E|A\.?\s*P)\.\s*\d/i,
  // Statutes at Large
  /\d+\s+Stat\.\s+\d/i,
  // Uniform Commercial Code
  /\bU\.?\s*C\.?\s*C\.?\s*§?\s*\d/i,
];

export async function handleProtocol1(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const citationText = context.citation.text || '';

  if (!citationText.trim()) {
    return notTriggered();
  }

  const isStatutory = STATUTORY_PATTERNS.some(pattern => pattern.test(citationText));

  if (!isStatutory) {
    return notTriggered();
  }

  // Determine which statutory type was matched for a descriptive message
  const sourceType = identifyStatutoryType(citationText);

  logger.info('protocol.p1.statutory_source_detected', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    sourceType,
    citationText: citationText.substring(0, 200),
  });

  return {
    protocolNumber: 1,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'STATUTORY_SOURCE_IDENTIFIED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 1,
      severity: 'INFO',
      title: 'Statutory Source Identified',
      description: `Citation "${citationText.substring(0, 120)}" is a ${sourceType} reference, not case law. Statutory sources follow a different verification path and are not subject to case-law verification protocols.`,
      citationId: context.citation.id,
      recommendation: 'No attorney action required. Statutory citations are verified through code-database lookups rather than case-law databases.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 1,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Identifies the specific type of statutory source for descriptive logging.
 */
function identifyStatutoryType(text: string): string {
  if (/\d+\s+U\.?\s*S\.?\s*C\.?\s*[§A]?\s*\d/i.test(text)) return 'federal statute (U.S.C.)';
  if (/\d+\s+C\.?\s*F\.?\s*R\.?\s*[§.]?\s*\d/i.test(text)) return 'federal regulation (C.F.R.)';
  if (/\bFed\.\s*R\.\s*(Civ\.|Crim\.|Evid\.|App\.)\s*P\./i.test(text)) return 'federal rule';
  if (/\bF\.?\s*R\.?\s*(C\.?\s*P|Cr\.?\s*P|E|A\.?\s*P)\.\s*\d/i.test(text)) return 'federal rule';
  if (/\bPub\.\s*L\.\s*No\.\s*\d/i.test(text) || /\bP\.?\s*L\.?\s*\d+-\d+/.test(text)) return 'public law';
  if (/\d+\s+Stat\.\s+\d/i.test(text)) return 'Statutes at Large';
  if (/\bLa\.\s*R\.?\s*S\.?\s*\d/i.test(text)) return 'Louisiana Revised Statute';
  if (/Rev\.\s*Stat\./i.test(text)) return 'revised statute';
  if (/\bU\.?\s*C\.?\s*C\.?\s*§?\s*\d/i.test(text)) return 'Uniform Commercial Code';
  if (/Ann\.\s*(art|§|\d)/i.test(text)) return 'annotated code';
  if (/§\s*\d/.test(text)) return 'statutory provision';
  return 'statutory or regulatory source';
}
