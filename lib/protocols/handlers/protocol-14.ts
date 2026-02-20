// ============================================================
// lib/protocols/handlers/protocol-14.ts
// Protocol 14 — Reporter Verification
// Source: D9 C-7 | SP-13 AO-7
//
// Checks whether the reporter abbreviation in a citation
// matches a known, valid reporter. Unknown reporters may
// indicate fabricated citations, typos, or hallucinated
// case references.
//
// Maintained list of common federal and state reporters plus
// Westlaw/LEXIS neutral citations.
//
// Triggers INFO when the reporter is not recognized.
// Does NOT trigger a HOLD.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-14');
export const VERSION = '1.0.0';

/**
 * Comprehensive set of recognized reporter abbreviations.
 * Covers federal reporters, Supreme Court reporters, regional
 * reporters, state-specific reporters, and electronic databases.
 */
const KNOWN_REPORTERS: ReadonlySet<string> = new Set([
  // Supreme Court
  'U.S.',
  'S.Ct.',
  'S. Ct.',
  'L.Ed.',
  'L.Ed.2d',
  'L. Ed.',
  'L. Ed. 2d',

  // Federal Reporters
  'F.',
  'F.2d',
  'F.3d',
  'F.4th',

  // Federal Supplement
  'F.Supp.',
  'F.Supp.2d',
  'F.Supp.3d',
  'F. Supp.',
  'F. Supp. 2d',
  'F. Supp. 3d',

  // Federal Rules Decisions
  'F.R.D.',

  // Bankruptcy Reporter
  'B.R.',

  // Federal Appendix
  'F.App\'x',
  'Fed.Appx.',
  'Fed. Appx.',

  // Regional Reporters — Atlantic
  'A.',
  'A.2d',
  'A.3d',

  // Regional Reporters — North Eastern
  'N.E.',
  'N.E.2d',
  'N.E.3d',

  // Regional Reporters — North Western
  'N.W.',
  'N.W.2d',

  // Regional Reporters — Pacific
  'P.',
  'P.2d',
  'P.3d',

  // Regional Reporters — South Eastern
  'S.E.',
  'S.E.2d',

  // Regional Reporters — South Western
  'S.W.',
  'S.W.2d',
  'S.W.3d',

  // Regional Reporters — Southern
  'So.',
  'So.2d',
  'So.3d',

  // State-Specific Reporters
  'Cal.Rptr.',
  'Cal.Rptr.2d',
  'Cal.Rptr.3d',
  'Cal. Rptr.',
  'Cal. Rptr. 2d',
  'Cal. Rptr. 3d',
  'N.Y.S.',
  'N.Y.S.2d',
  'N.Y.S.3d',
  'Ill.Dec.',
  'Ill. Dec.',

  // Electronic/Neutral Citations
  'WL',
  'LEXIS',
]);

/**
 * Regex pattern to extract reporter abbreviation from standard citation format.
 * Matches the middle component of "volume reporter page" patterns.
 *
 * Strategy: Extract the text between the volume number and page number,
 * then normalize and look it up in the known reporters set.
 */
const CITATION_PARTS_PATTERN = /\b(\d{1,4})\s+(.+?)\s+(\d{1,5})\b/;

/**
 * Pattern for Westlaw/LEXIS format: "year WL/LEXIS number"
 */
const ELECTRONIC_PATTERN = /\b\d{4}\s+(WL|LEXIS)\s+\d+\b/;

export async function handleProtocol14(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const citationText = context.citation.text || '';

  // No text to evaluate — not triggered
  if (citationText.trim().length === 0) {
    return notTriggered();
  }

  // Check for electronic citation format first (WL, LEXIS)
  if (ELECTRONIC_PATTERN.test(citationText)) {
    return notTriggered();
  }

  // Extract the reporter from the citation text
  const extractedReporter = extractReporter(citationText);

  if (extractedReporter === null) {
    // Could not parse citation structure — skip (P13 handles format issues)
    return notTriggered();
  }

  // Check if the extracted reporter is recognized
  if (isKnownReporter(extractedReporter)) {
    return notTriggered();
  }

  const caseName = context.citation.caseName || citationText.slice(0, 80) || 'Unknown citation';

  logger.info('protocol.p14.unknown_reporter', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    extractedReporter,
  });

  return {
    protocolNumber: 14,
    triggered: true,
    severity: 'INFO',
    actionTaken: 'UNKNOWN_REPORTER_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 14,
      severity: 'INFO',
      title: 'Unknown Reporter Abbreviation',
      description: `Citation "${caseName}" contains reporter abbreviation "${extractedReporter}" which is not in the recognized reporters list. This may indicate a typo, an uncommon reporter, or a fabricated citation reference.`,
      citationId: context.citation.id,
      recommendation: 'Verify that the reporter abbreviation is correct. If this is a valid but uncommon reporter, no further action is needed. If the reporter appears fabricated, investigate the citation for hallucination.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 14,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Extracts the reporter abbreviation from citation text.
 * Returns null if the citation structure cannot be parsed.
 *
 * Given "123 F.3d 456", returns "F.3d".
 * Given "456 U.S. 789, 792", returns "U.S.".
 * Given "Smith v. Jones, 123 F.3d 456 (5th Cir. 2020)", returns "F.3d".
 */
function extractReporter(text: string): string | null {
  const match = CITATION_PARTS_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  // The reporter is the middle group — trim whitespace
  const rawReporter = match[2].trim();

  // The reporter may have trailing comma content (e.g., "F.3d 456, 460"
  // would be parsed differently). Clean up by taking only the reporter portion.
  // Split on spaces and take contiguous reporter tokens.
  const tokens = rawReporter.split(/\s+/);

  // Build the reporter by taking tokens that look like abbreviations
  // (contain dots or are known series like "2d", "3d", "4th")
  const reporterTokens: string[] = [];
  for (const token of tokens) {
    if (token.includes('.') || /^\d[a-z]{1,2}$/.test(token)) {
      reporterTokens.push(token);
    } else if (reporterTokens.length === 0) {
      // First token might be a single-word reporter like "WL"
      reporterTokens.push(token);
    } else {
      break;
    }
  }

  if (reporterTokens.length === 0) {
    return null;
  }

  return reporterTokens.join(' ');
}

/**
 * Checks if the extracted reporter matches any known reporter.
 * Performs exact match first, then tries common normalization
 * (collapsing spaces around dots).
 */
function isKnownReporter(reporter: string): boolean {
  // Direct match
  if (KNOWN_REPORTERS.has(reporter)) {
    return true;
  }

  // Normalize: remove spaces around dots and retry
  const normalized = reporter.replace(/\s*\.\s*/g, '.');
  if (KNOWN_REPORTERS.has(normalized)) {
    return true;
  }

  // Normalize: add spaces after dots and retry
  const spaced = reporter.replace(/\.(\S)/g, '. $1');
  if (KNOWN_REPORTERS.has(spaced)) {
    return true;
  }

  // Try without trailing dot
  if (KNOWN_REPORTERS.has(reporter + '.')) {
    return true;
  }

  // Try with trailing dot removed
  if (reporter.endsWith('.') && KNOWN_REPORTERS.has(reporter.slice(0, -1))) {
    return true;
  }

  return false;
}
