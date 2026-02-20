// ============================================================
// lib/protocols/handlers/protocol-23.ts
// Protocol 23 — Amended Opinion Detection
// Source: D9 C-16 | SP-13 AO-16
//
// Detects when a cited opinion has been amended or corrected by
// the issuing court. When a court amends its opinion, the amended
// version supersedes the original. Citing the original rather
// than the amended version could reference language that has been
// changed, corrected, or withdrawn by the court.
//
// INFO severity — the attorney should verify they are citing
// the most current version of the opinion.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-23');
export const VERSION = '1.0.0';

/**
 * Textual indicators in citation text or case name that suggest
 * the opinion has been amended or corrected.
 */
const AMENDED_TEXT_PATTERNS: RegExp[] = [
  /\bas\s+amended\b/i,
  /\bamended\s+opinion\b/i,
  /\bcorrected\s+opinion\b/i,
  /\bmodified\s+opinion\b/i,
  /\bopinion\s+(?:as\s+)?amended\b/i,
  /\bopinion\s+(?:as\s+)?corrected\b/i,
  /\bopinion\s+(?:as\s+)?modified\b/i,
  /\bamendment\s+to\s+(?:the\s+)?opinion\b/i,
  /\bslip\s+op(?:inion)?\.?\s+(?:as\s+)?amended\b/i,
  /\b(?:order|opinion)\s+nunc\s+pro\s+tunc\b/i,
  /\bsubstituted\s+opinion\b/i,
  /\breissued\s+opinion\b/i,
];

/**
 * Metadata fields Protocol 23 inspects for amended status.
 */
interface AmendedMetadata {
  isAmended?: boolean;
  amendedDate?: string;
  originalDate?: string;
  amendmentType?: string;
  supersededBy?: string;
  [key: string]: unknown;
}

export async function handleProtocol23(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata as AmendedMetadata | undefined;
  const citationText = context.citation.text || '';
  const caseName = context.citation.caseName || '';

  // ── Check 1: Explicit isAmended flag in verification metadata ──
  if (metadata?.isAmended === true) {
    const amendedDate = metadata.amendedDate || '';
    const amendmentType = metadata.amendmentType || 'amended';

    logger.info('protocol.p23.amended_metadata', {
      orderId: context.orderId,
      citationId: context.citation.id,
      amendedDate,
      amendmentType,
    });

    const dateClause = amendedDate ? ` on ${amendedDate}` : '';
    const displayName = caseName || citationText || context.citation.id;

    return {
      protocolNumber: 23,
      triggered: true,
      severity: 'INFO',
      actionTaken: 'AMENDED_OPINION_FLAGGED',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 23,
        severity: 'INFO',
        title: 'Amended Opinion Detected',
        description: `The opinion in "${displayName}" was ${amendmentType}${dateClause}. The amended version supersedes the original. Ensure the brief cites the most current version of this opinion.`,
        citationId: context.citation.id,
        recommendation: `Verify that the cited language and holding come from the amended version of this opinion${amendedDate ? ` (${amendmentType} ${amendedDate})` : ''}. If citing from the original version, update the citation and verify that the relevant language was not changed by the amendment.`,
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // ── Check 2: Citation text contains amendment indicators ──
  const citationMatch = findAmendedIndicator(citationText);
  if (citationMatch) {
    logger.info('protocol.p23.amended_text_pattern', {
      orderId: context.orderId,
      citationId: context.citation.id,
      matchedPattern: citationMatch,
    });

    return buildAmendedTextResult(context, citationMatch, 'citation text');
  }

  // ── Check 3: Case name contains amendment indicators ──
  if (caseName) {
    const caseNameMatch = findAmendedIndicator(caseName);
    if (caseNameMatch) {
      logger.info('protocol.p23.amended_case_name', {
        orderId: context.orderId,
        citationId: context.citation.id,
        matchedPattern: caseNameMatch,
      });

      return buildAmendedTextResult(context, caseNameMatch, 'case name');
    }
  }

  // ── Check 4: Metadata supersededBy field ──
  if (metadata?.supersededBy) {
    logger.info('protocol.p23.superseded_by', {
      orderId: context.orderId,
      citationId: context.citation.id,
      supersededBy: metadata.supersededBy,
    });

    const displayName = caseName || citationText || context.citation.id;

    return {
      protocolNumber: 23,
      triggered: true,
      severity: 'INFO',
      actionTaken: 'AMENDED_SUPERSEDED_BY',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 23,
        severity: 'INFO',
        title: 'Amended Opinion Detected — Superseded Version',
        description: `The opinion in "${displayName}" has been superseded by an amended version: ${metadata.supersededBy}. The brief should cite the most current version.`,
        citationId: context.citation.id,
        recommendation: `Update this citation to reference the amended version (${metadata.supersededBy}). Verify that the propositions drawn from this case remain accurate in the amended opinion.`,
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // No amended signals detected
  return {
    protocolNumber: 23,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Searches text for any matching amended opinion indicator pattern.
 * Returns the matched text or null if none found.
 */
function findAmendedIndicator(text: string): string | null {
  for (const pattern of AMENDED_TEXT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Builds an INFO-level result when amendment is detected via text patterns.
 */
function buildAmendedTextResult(
  context: ProtocolContext,
  matchedPattern: string,
  source: string,
): ProtocolResult {
  const displayName = context.citation.caseName || context.citation.text || context.citation.id;

  return {
    protocolNumber: 23,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'AMENDED_OPINION_TEXT_INDICATOR',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 23,
      severity: 'INFO',
      title: 'Amended Opinion Detected',
      description: `The ${source} for "${displayName}" contains amendment-indicating language ("${matchedPattern}"). This opinion may have been amended or corrected since its original issuance.`,
      citationId: context.citation.id,
      recommendation: 'Verify that the cited language comes from the most current version of this opinion. Check whether the amendment affected the specific holding or language relied upon in the brief.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
