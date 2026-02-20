// ============================================================
// lib/protocols/handlers/protocol-09.ts
// Protocol 9 — Date Verification
// Detects date-related anomalies in citations: future dates
// (likely hallucinated), very old citations (pre-1900), and
// date mismatches between citation text and metadata.
// Source: D9 C-2 | SP-13 AO-2
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-09');
export const VERSION = '1.0.0';

/**
 * The earliest year considered "normal" for legal citations.
 * Citations before this year are flagged as INFO — they may still
 * be valid (e.g., Marbury v. Madison, 1803) but warrant a check
 * that the legal principle has not been superseded.
 */
const HISTORIC_CITATION_YEAR = 1900;

/**
 * Regex patterns to extract years from citation text.
 * Matches common legal citation date formats:
 *   - Parenthetical year: (2021), (5th Cir. 2021), (La. App. 3 Cir. 2019)
 *   - Decided date: decided January 15, 2021
 */
const YEAR_IN_PARENS_PATTERN = /\((?:[^()]*?\b)?(\d{4})\)/g;
const DECIDED_DATE_PATTERN = /\bdecided\s+(?:\w+\s+\d{1,2},?\s+)?(\d{4})/i;
const STANDALONE_YEAR_PATTERN = /\b(1[6-9]\d{2}|2[01]\d{2})\b/g;

/**
 * Extracts the most likely decision year from citation text.
 * Prefers parenthetical years (standard legal citation format),
 * falls back to "decided" dates, then standalone years.
 */
function extractYearFromText(text: string): number | null {
  if (!text) return null;

  // Priority 1: Year in parentheses (standard legal citation format)
  const parenMatches: number[] = [];
  let match: RegExpExecArray | null;
  const parenRegex = new RegExp(YEAR_IN_PARENS_PATTERN.source, 'g');
  while ((match = parenRegex.exec(text)) !== null) {
    const year = parseInt(match[1], 10);
    if (year >= 1600 && year <= 2200) {
      parenMatches.push(year);
    }
  }
  // Use the last parenthetical year (usually the decision year in legal citations)
  if (parenMatches.length > 0) {
    return parenMatches[parenMatches.length - 1];
  }

  // Priority 2: "Decided [date] [year]" pattern
  const decidedMatch = DECIDED_DATE_PATTERN.exec(text);
  if (decidedMatch) {
    const year = parseInt(decidedMatch[1], 10);
    if (year >= 1600 && year <= 2200) {
      return year;
    }
  }

  // Priority 3: Standalone year (least reliable, used as fallback)
  const standaloneMatches: number[] = [];
  const standaloneRegex = new RegExp(STANDALONE_YEAR_PATTERN.source, 'g');
  while ((match = standaloneRegex.exec(text)) !== null) {
    standaloneMatches.push(parseInt(match[1], 10));
  }
  if (standaloneMatches.length > 0) {
    return standaloneMatches[standaloneMatches.length - 1];
  }

  return null;
}

/**
 * Parses a date from the metadata decisionDate field.
 * Handles ISO 8601 strings, plain "YYYY-MM-DD", and year-only values.
 */
function parseMetadataDate(value: unknown): { year: number; fullDate: Date | null } | null {
  if (!value) return null;

  const dateStr = String(value).trim();
  if (!dateStr) return null;

  // Try full date parse
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return { year: parsed.getFullYear(), fullDate: parsed };
  }

  // Try extracting a 4-digit year
  const yearMatch = dateStr.match(/\b(\d{4})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1600 && year <= 2200) {
      return { year, fullDate: null };
    }
  }

  return null;
}

export async function handleProtocol9(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata;
  const citationText = context.citation.text || '';

  // ── Gather date information from all available sources ──
  const metadataDate = parseMetadataDate(metadata?.decisionDate);
  const textYear = extractYearFromText(citationText);

  // If we have no date information at all, we cannot evaluate
  if (!metadataDate && textYear === null) {
    return notTriggered();
  }

  const currentYear = new Date().getFullYear();
  const effectiveYear = metadataDate?.year ?? textYear;

  if (effectiveYear === null) {
    return notTriggered();
  }

  const caseName = context.citation.caseName || context.citation.text || 'Unknown citation';

  // ── Check 1: Future date (CRITICAL — likely hallucinated) ──
  if (effectiveYear > currentYear) {
    logger.info('protocol.p9.future_date_detected', {
      orderId: context.orderId,
      phase: context.phase,
      citationId: context.citation.id,
      detectedYear: effectiveYear,
      currentYear,
      source: metadataDate ? 'metadata' : 'text',
    });

    return {
      protocolNumber: 9,
      triggered: true,
      severity: 'CRITICAL',
      actionTaken: 'FUTURE_DATE_FLAGGED',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 9,
        severity: 'CRITICAL',
        title: 'Citation Date Anomaly — Future Date Detected',
        description: `"${caseName}" has a decision date in year ${effectiveYear}, which is in the future (current year: ${currentYear}). This strongly suggests a hallucinated or fabricated citation.`,
        citationId: context.citation.id,
        recommendation: 'Verify this citation exists. A future decision date is a strong indicator of an AI-hallucinated citation. Remove if the case cannot be independently verified.',
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // ── Check 2: Date mismatch between metadata and citation text (WARNING) ──
  if (metadataDate && textYear !== null && metadataDate.year !== textYear) {
    logger.info('protocol.p9.date_mismatch', {
      orderId: context.orderId,
      phase: context.phase,
      citationId: context.citation.id,
      metadataYear: metadataDate.year,
      textYear,
    });

    return {
      protocolNumber: 9,
      triggered: true,
      severity: 'WARNING',
      actionTaken: 'DATE_MISMATCH_FLAGGED',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 9,
        severity: 'WARNING',
        title: 'Citation Date Mismatch',
        description: `"${caseName}" has a date discrepancy: the verified metadata shows year ${metadataDate.year}, but the citation text references year ${textYear}. This may indicate a typographical error or confusion between cases with similar names.`,
        citationId: context.citation.id,
        recommendation: 'Verify the correct decision year and update the citation text to match the authoritative source.',
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // ── Check 3: Very old citation (INFO — may be superseded) ──
  if (effectiveYear < HISTORIC_CITATION_YEAR) {
    logger.info('protocol.p9.historic_citation', {
      orderId: context.orderId,
      phase: context.phase,
      citationId: context.citation.id,
      detectedYear: effectiveYear,
    });

    return {
      protocolNumber: 9,
      triggered: true,
      severity: 'INFO',
      actionTaken: 'HISTORIC_CITATION_NOTED',
      aisEntry: {
        category: 'CITATION',
        protocolNumber: 9,
        severity: 'INFO',
        title: 'Historic Citation — Pre-1900 Authority',
        description: `"${caseName}" dates to ${effectiveYear}. While historic authority can be valid (particularly for foundational constitutional or common law principles), verify that the legal principle has not been modified or superseded by subsequent legislation or case law.`,
        citationId: context.citation.id,
        recommendation: 'Confirm this historic authority has not been superseded. Consider supplementing with more recent authority affirming the same principle.',
      },
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // All date checks passed
  return notTriggered();
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 9,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}
