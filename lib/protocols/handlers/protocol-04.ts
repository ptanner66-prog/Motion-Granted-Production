// ============================================================
// lib/protocols/handlers/protocol-04.ts
// Protocol 4 — Parallel Citation Check
// Source: D9 C-1 | SP-13 AO-1
//
// Checks whether a case citation includes parallel citations
// (i.e., the same case reported in multiple reporters). Legal
// convention and many court rules require parallel citations
// when available (e.g., official + regional + Supreme Court
// reporters). This protocol flags citations that appear to
// reference only a single reporter, suggesting that parallel
// citations should be added for completeness.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-04');
export const VERSION = '1.0.0';

/**
 * Common legal reporter abbreviation patterns.
 * Each pattern matches a volume-reporter-page reference such as "123 F.3d 456".
 */
const REPORTER_PATTERN =
  /\d+\s+(?:U\.?\s*S\.?|S\.?\s*Ct\.?|L\.?\s*Ed\.?\s*(?:2d)?|F\.?\s*(?:2d|3d|4th)?|F\.?\s*Supp\.?\s*(?:2d|3d)?|F\.?\s*App(?:'|')x|So\.?\s*(?:2d|3d)?|S\.?\s*W\.?\s*(?:2d|3d)?|N\.?\s*W\.?\s*(?:2d)?|N\.?\s*E\.?\s*(?:2d|3d)?|S\.?\s*E\.?\s*(?:2d)?|P\.?\s*(?:2d|3d)?|A\.?\s*(?:2d|3d)?|Cal\.?\s*(?:2d|3d|4th|5th)?|N\.?\s*Y\.?\s*(?:2d|3d)?|Ill\.?\s*(?:2d)?|Wis\.?\s*(?:2d)?|La\.?\s*Ann\.?|Rob\.?|Mart\.?\s*\((?:N\.?\s*S\.?\)|O\.?\s*S\.?\))?)\s+\d+/gi;

/**
 * Citations that inherently do not require parallel citations.
 * Statutory sources, regulations, and certain specialty reporters are excluded.
 */
const EXCLUDED_PATTERNS: RegExp[] = [
  // Statutory/regulatory — Protocol 1 handles these
  /§\s*\d/,
  /\d+\s+U\.?\s*S\.?\s*C\.?\s*[§A]?\s*\d/i,
  /\d+\s+C\.?\s*F\.?\s*R\.?\s*[§.]?\s*\d/i,
  /Rev\.\s*Stat\./i,
  // Federal Rules
  /\bFed\.\s*R\.\s*(Civ\.|Crim\.|Evid\.|App\.)\s*P\./i,
  // Unpublished / non-precedential — no parallel cite expected
  /\bF\.?\s*App(?:'|')x\b/i,
  /\d+\s+WL\s+\d+/i,
  /\d+\s+LEXIS\s+\d+/i,
];

export async function handleProtocol4(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const citationText = context.citation.text || '';

  if (!citationText.trim()) {
    return notTriggered();
  }

  // Skip non-case-law citations and unpublished opinions
  if (EXCLUDED_PATTERNS.some(pattern => pattern.test(citationText))) {
    return notTriggered();
  }

  // Count distinct reporter references in the citation text
  const reporterMatches = findReporterReferences(citationText);

  if (reporterMatches.length === 0) {
    // No recognizable reporter pattern found — cannot evaluate
    return notTriggered();
  }

  if (reporterMatches.length >= 2) {
    // Already has parallel citations — no action needed
    return notTriggered();
  }

  // Only one reporter reference found — suggest adding parallel citations
  const reporterUsed = reporterMatches[0];
  const suggestedParallels = suggestParallelReporters(reporterUsed);

  logger.info('protocol.p4.single_reporter', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    reporterUsed,
    citationText: citationText.substring(0, 200),
  });

  const citationLabel = context.citation.caseName || citationText.substring(0, 120);
  const suggestionNote = suggestedParallels
    ? ` Common parallel reporters for this source include: ${suggestedParallels}.`
    : '';

  return {
    protocolNumber: 4,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'PARALLEL_CITATION_SUGGESTED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 4,
      severity: 'INFO',
      title: 'Parallel Citation May Be Available',
      description: `Citation "${citationLabel}" references only one reporter (${reporterUsed}). Many courts require or prefer parallel citations when available.${suggestionNote}`,
      citationId: context.citation.id,
      recommendation: 'Consider adding parallel citations if available. Check local court rules for parallel citation requirements.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 4,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Extracts distinct reporter references from citation text.
 * Returns an array of the reporter abbreviation portions matched.
 */
function findReporterReferences(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  // Reset the regex since it has the global flag
  REPORTER_PATTERN.lastIndex = 0;
  while ((match = REPORTER_PATTERN.exec(text)) !== null) {
    // Extract the reporter abbreviation from the match (strip volume and page numbers)
    const fullMatch = match[0].trim();
    // Normalize and extract the reporter portion between volume and page
    const reporterName = extractReporterName(fullMatch);
    if (reporterName && !matches.includes(reporterName)) {
      matches.push(reporterName);
    }
  }

  return matches;
}

/**
 * Extracts the reporter abbreviation from a full volume-reporter-page string.
 * E.g., "550 U.S. 544" -> "U.S."
 */
function extractReporterName(volumeReporterPage: string): string {
  // Remove leading volume number and trailing page number
  const stripped = volumeReporterPage
    .replace(/^\d+\s+/, '')   // strip leading volume
    .replace(/\s+\d+$/, '');  // strip trailing page
  return stripped.trim();
}

/**
 * Suggests common parallel reporters based on the reporter found.
 * Returns a human-readable string of suggestions, or empty string if none.
 */
function suggestParallelReporters(reporter: string): string {
  const normalized = reporter.replace(/\s+/g, ' ').replace(/\./g, '').toLowerCase().trim();

  // U.S. Supreme Court reporters
  if (/^u\s*s$/.test(normalized)) return 'S. Ct., L. Ed. 2d';
  if (/^s\s*ct/.test(normalized)) return 'U.S., L. Ed. 2d';
  if (/^l\s*ed/.test(normalized)) return 'U.S., S. Ct.';

  // Louisiana reporters
  if (/^so\s*(2d|3d)?$/.test(normalized)) return 'La. Ann. (if Louisiana Supreme Court)';
  if (/^la\s*ann/.test(normalized)) return 'So. 2d or So. 3d';

  // Federal Circuit reporters
  if (/^f\s*(2d|3d|4th)?$/.test(normalized)) return 'U.S. (if cert. granted), S. Ct.';
  if (/^f\s*supp/.test(normalized)) return 'parallel reporter if available';

  return '';
}
