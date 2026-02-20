// ============================================================
// lib/protocols/handlers/protocol-13.ts
// Protocol 13 — Citation Format Validation
// Source: D9 C-6 | SP-13 AO-6
//
// Validates that citation text conforms to standard legal
// citation format patterns. Detects common errors:
//   - Missing volume number
//   - Missing reporter abbreviation
//   - Missing page number
//   - Incorrect spacing around pinpoint "at" references
//
// Recognized patterns:
//   "123 F.3d 456"          — volume reporter page
//   "456 U.S. 789"          — volume reporter page
//   "2024 WL 12345"         — Westlaw citation
//   "123 F.3d 456, 460"     — with pinpoint
//   "123 F.3d 456 at 460"   — with "at" pinpoint
//
// Triggers WARNING when format issues are detected.
// Does NOT trigger a HOLD.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-13');
export const VERSION = '1.0.0';

/**
 * Standard legal citation pattern: volume reporter page
 * Matches patterns like "123 F.3d 456", "456 U.S. 789", "789 So.2d 123"
 */
const STANDARD_CITATION_PATTERN = /\b\d{1,4}\s+[A-Z][A-Za-z.\d]+(?:\s+[A-Za-z.\d]+)?\s+\d{1,5}\b/;

/**
 * Westlaw citation pattern: year WL number
 * Matches patterns like "2024 WL 12345"
 */
const WESTLAW_PATTERN = /\b\d{4}\s+WL\s+\d+\b/;

/**
 * Checks for a missing volume number (reporter without preceding digits).
 * E.g., "F.3d 456" without a volume number before the reporter.
 */
const MISSING_VOLUME_PATTERN = /(?:^|[^0-9])\b(F\.\d[a-z]{1,2}|F\.Supp\.\d?[a-z]*|U\.S\.|S\.Ct\.|L\.Ed\.\d?[a-z]*|So\.\d[a-z]+|A\.\d[a-z]+|N\.E\.\d[a-z]+|N\.W\.\d[a-z]+|S\.E\.\d[a-z]+|S\.W\.\d[a-z]+|P\.\d[a-z]+|Cal\.Rptr\.|N\.Y\.S\.)\s+\d/;

/**
 * Checks for a missing page number (volume + reporter but no page after).
 * E.g., "123 F.3d" without a page number following.
 */
const MISSING_PAGE_PATTERN = /\b\d{1,4}\s+(F\.\d[a-z]{1,2}|F\.Supp\.\d?[a-z]*|U\.S\.|S\.Ct\.|L\.Ed\.\d?[a-z]*|So\.\d[a-z]+|A\.\d[a-z]+|N\.E\.\d[a-z]+|N\.W\.\d[a-z]+|S\.E\.\d[a-z]+|S\.W\.\d[a-z]+|P\.\d[a-z]+|Cal\.Rptr\.|N\.Y\.S\.)\s*$/;

/**
 * Detects incorrect spacing around "at" in pinpoint citations.
 * Valid: "123 F.3d 456, 460" or "123 F.3d 456 at 460"
 * Invalid: "123 F.3d 456at460", "123 F.3d 456  at  460" (double spaces)
 */
const BAD_AT_SPACING_PATTERN = /\d(at)\d|\d\s{2,}at\s|\s+at\s{2,}\d/;

interface FormatIssue {
  code: string;
  description: string;
}

export async function handleProtocol13(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const citationText = context.citation.text || '';

  // No text to evaluate — not triggered
  if (citationText.trim().length === 0) {
    return notTriggered();
  }

  const issues = validateCitationFormat(citationText);

  if (issues.length === 0) {
    return notTriggered();
  }

  const caseName = context.citation.caseName || citationText.slice(0, 80) || 'Unknown citation';
  const issueDescriptions = issues.map(i => i.description).join('; ');

  logger.info('protocol.p13.format_issues', {
    orderId: context.orderId,
    phase: context.phase,
    citationId: context.citation.id,
    issueCount: issues.length,
    issueCodes: issues.map(i => i.code).join(','),
  });

  return {
    protocolNumber: 13,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'CITATION_FORMAT_FLAGGED',
    aisEntry: {
      category: 'CITATION',
      protocolNumber: 13,
      severity: 'WARNING',
      title: 'Citation Format Issues Detected',
      description: `Citation "${caseName}" has ${issues.length} format issue(s): ${issueDescriptions}.`,
      citationId: context.citation.id,
      recommendation: 'Review and correct the citation format before filing. Ensure the citation follows standard Bluebook format with volume number, reporter abbreviation, and page number.',
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

function notTriggered(): ProtocolResult {
  return {
    protocolNumber: 13,
    triggered: false,
    severity: null,
    actionTaken: null,
    aisEntry: null,
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Validates citation text against standard legal citation format patterns.
 * Returns an array of detected format issues (empty if no issues found).
 */
function validateCitationFormat(text: string): FormatIssue[] {
  const issues: FormatIssue[] = [];

  // If citation matches a known valid pattern, skip structural checks
  const hasStandardFormat = STANDARD_CITATION_PATTERN.test(text);
  const hasWestlawFormat = WESTLAW_PATTERN.test(text);

  if (hasStandardFormat || hasWestlawFormat) {
    // Citation has a recognizable base pattern — only check spacing issues
    if (BAD_AT_SPACING_PATTERN.test(text)) {
      issues.push({
        code: 'BAD_AT_SPACING',
        description: 'Incorrect spacing around "at" in pinpoint reference',
      });
    }
    return issues;
  }

  // No recognized base pattern — run structural checks

  // Check for missing volume number
  if (MISSING_VOLUME_PATTERN.test(text)) {
    issues.push({
      code: 'MISSING_VOLUME',
      description: 'Reporter abbreviation found without a preceding volume number',
    });
  }

  // Check for missing page number
  if (MISSING_PAGE_PATTERN.test(text)) {
    issues.push({
      code: 'MISSING_PAGE',
      description: 'Volume and reporter found without a following page number',
    });
  }

  // Check for spacing issues around "at"
  if (BAD_AT_SPACING_PATTERN.test(text)) {
    issues.push({
      code: 'BAD_AT_SPACING',
      description: 'Incorrect spacing around "at" in pinpoint reference',
    });
  }

  // If none of the specific structural checks triggered but we still
  // have no recognized pattern, flag as unrecognized format
  if (issues.length === 0) {
    // Only flag if the text looks like it should be a citation
    // (contains numbers and letters, not just a case name)
    const hasNumbers = /\d/.test(text);
    const hasLetters = /[a-zA-Z]/.test(text);
    if (hasNumbers && hasLetters) {
      issues.push({
        code: 'UNRECOGNIZED_FORMAT',
        description: 'Citation does not match any recognized legal citation format (e.g., "123 F.3d 456" or "2024 WL 12345")',
      });
    }
  }

  return issues;
}
