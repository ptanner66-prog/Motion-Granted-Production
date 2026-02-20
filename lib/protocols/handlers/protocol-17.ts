// ============================================================
// lib/protocols/handlers/protocol-17.ts
// Protocol 17 — Duplicate Citation Detection
// Source: D9 C-10 | SP-13 AO-10
//
// Detects duplicate citations within the same order. Triggers
// when a citation shares an identical case name or very similar
// citation text with another citation already present.
// INFO severity — duplicates are a quality issue, not a legal risk.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-17');
export const VERSION = '1.0.0';

/**
 * Extended metadata fields Protocol 17 inspects for duplicate signals.
 */
interface DuplicateMetadata {
  duplicateOf?: string;
  duplicateCitations?: string[];
  [key: string]: unknown;
}

export async function handleProtocol17(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata as DuplicateMetadata | undefined;
  const citationText = context.citation.text || '';
  const caseName = context.citation.caseName || '';

  // ── Check 1: Explicit duplicate markers in metadata ──
  const explicitDuplicate = metadata?.duplicateOf;
  const duplicateList = metadata?.duplicateCitations;
  const hasDuplicateMarker = !!explicitDuplicate || (Array.isArray(duplicateList) && duplicateList.length > 0);

  if (hasDuplicateMarker) {
    const duplicateRef = explicitDuplicate || duplicateList?.join(', ') || 'unknown';

    logger.info('protocol.p17.explicit_duplicate', {
      orderId: context.orderId,
      citationId: context.citation.id,
      duplicateOf: duplicateRef,
    });

    return {
      protocolNumber: 17,
      triggered: true,
      severity: 'INFO',
      actionTaken: 'DUPLICATE_CITATION_FLAGGED',
      aisEntry: {
        category: 'QUALITY',
        protocolNumber: 17,
        severity: 'INFO',
        title: 'Duplicate Citation Detected',
        description: `Citation "${caseName || citationText || context.citation.id}" appears to be a duplicate of: ${duplicateRef}. Duplicate citations reduce brief quality and may signal over-reliance on a single authority.`,
        citationId: context.citation.id,
        recommendation: 'Review the brief for redundant citations. Consider consolidating duplicate references or removing the repeated citation to improve readability.',
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // ── Check 2: Pattern-based duplicate detection on citation text ──
  // Some duplicates are not explicitly marked but can be detected
  // by checking if the citation text contains a self-referencing pattern
  // (e.g., the same reporter volume/page cited multiple times).
  if (citationText && caseName) {
    const isDuplicate = detectDuplicatePattern(citationText, caseName);

    if (isDuplicate) {
      logger.info('protocol.p17.pattern_duplicate', {
        orderId: context.orderId,
        citationId: context.citation.id,
        caseName,
      });

      return {
        protocolNumber: 17,
        triggered: true,
        severity: 'INFO',
        actionTaken: 'DUPLICATE_CITATION_PATTERN',
        aisEntry: {
          category: 'QUALITY',
          protocolNumber: 17,
          severity: 'INFO',
          title: 'Possible Duplicate Citation',
          description: `Citation "${caseName}" may be duplicated in the brief based on text pattern analysis. Multiple references to the same case with identical citation strings suggest unintentional duplication.`,
          citationId: context.citation.id,
          recommendation: 'Verify this citation is not duplicated elsewhere in the brief. If intentionally cited multiple times for different propositions, no action is needed.',
        },
        holdRequired: false,
        handlerVersion: VERSION,
      };
    }
  }

  // No duplicate signals detected
  return {
    protocolNumber: 17,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Detects common patterns that indicate a citation may be a duplicate.
 *
 * Checks for:
 * 1. Citation text containing "see also [same case name]" or "accord [same case name]"
 *    which can indicate redundant self-references produced by AI
 * 2. Repeated reporter references (e.g., same volume/page appearing twice)
 */
function detectDuplicatePattern(citationText: string, caseName: string): boolean {
  if (!caseName || caseName.length < 3) return false;

  const normalizedCaseName = caseName.toLowerCase().trim();
  const normalizedText = citationText.toLowerCase().trim();

  // Check if the citation text references the same case via "see also" or "accord"
  const crossRefPatterns = [
    /\bsee also\b/i,
    /\baccord\b/i,
    /\bcf\.\b/i,
    /\bsee\s+generally\b/i,
  ];

  for (const pattern of crossRefPatterns) {
    if (pattern.test(citationText)) {
      // If the cross-reference signal word is present AND the case name appears
      // after it, this is likely a self-referencing duplicate
      const matchIndex = normalizedText.search(pattern);
      const textAfterSignal = normalizedText.slice(matchIndex);
      if (textAfterSignal.includes(normalizedCaseName)) {
        return true;
      }
    }
  }

  // Check for repeated reporter volume/page patterns within the same citation text
  // e.g., "123 F.3d 456" appearing more than once
  const reporterPattern = /\d+\s+(?:F\.\d+d?|S\.\s*Ct\.|U\.S\.|L\.\s*Ed\.\s*\d*d?|So\.\s*\d*d?|A\.\d+d?)\s+\d+/gi;
  const reporterMatches = citationText.match(reporterPattern);
  if (reporterMatches && reporterMatches.length >= 2) {
    const normalized = reporterMatches.map(m => m.replace(/\s+/g, ' ').toLowerCase());
    const unique = new Set(normalized);
    if (unique.size < normalized.length) {
      return true; // Same reporter reference appears more than once
    }
  }

  return false;
}
