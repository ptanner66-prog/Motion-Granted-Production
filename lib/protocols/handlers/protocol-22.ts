// ============================================================
// lib/protocols/handlers/protocol-22.ts
// Protocol 22 — Upstream Authority Check
// Source: D9 C-15 | SP-13 AO-15
//
// Detects when a cited case has been distinguished or questioned
// by a higher (upstream) court. This is a significant legal
// quality issue — an authority that has been distinguished or
// questioned may still be valid law but its persuasive value
// is diminished and reliance on it without acknowledgment
// could undermine the brief's credibility.
//
// WARNING severity — requires attorney attention before filing.
// ============================================================

import { createLogger } from '../../logging/logger';
import type { ProtocolContext, ProtocolResult } from '../types';

const logger = createLogger('protocol-22');
export const VERSION = '1.0.0';

/**
 * Extended metadata fields Protocol 22 inspects for upstream treatment.
 */
interface UpstreamMetadata {
  upstreamTreatment?: string | UpstreamTreatmentDetail;
  distinguishedBy?: string | string[];
  questionedBy?: string | string[];
  criticizedBy?: string | string[];
  limitedBy?: string | string[];
  [key: string]: unknown;
}

interface UpstreamTreatmentDetail {
  treatment: string;
  court?: string;
  citation?: string;
  description?: string;
}

/**
 * Textual patterns in citation text or metadata that indicate
 * negative upstream treatment.
 */
const UPSTREAM_TREATMENT_PATTERNS: RegExp[] = [
  /\bdistinguished\s+by\b/i,
  /\bquestioned\s+by\b/i,
  /\bcriticized\s+by\b/i,
  /\blimited\s+by\b/i,
  /\bdisapproved\s+(?:of\s+)?by\b/i,
  /\bcalled\s+into\s+(?:question|doubt)\s+by\b/i,
  /\babrogated\s+(?:in\s+part\s+)?by\b/i,
  /\bsuperseded\s+(?:in\s+part\s+)?by\b/i,
  /\bundercut\s+by\b/i,
  /\bnarrowed\s+by\b/i,
];

/**
 * Treatment types ordered by severity, from most to least concerning.
 */
const TREATMENT_SEVERITY_MAP: Record<string, string> = {
  abrogated: 'abrogated (superseded)',
  superseded: 'superseded',
  disapproved: 'disapproved',
  questioned: 'questioned',
  criticized: 'criticized',
  limited: 'limited',
  distinguished: 'distinguished',
  narrowed: 'narrowed',
  undercut: 'undercut',
};

export async function handleProtocol22(
  context: ProtocolContext
): Promise<ProtocolResult> {
  const metadata = context.verificationResult?.metadata as UpstreamMetadata | undefined;
  const citationText = context.citation.text || '';
  const caseName = context.citation.caseName || '';
  const issues: string[] = [];

  // ── Check 1: Explicit upstreamTreatment field ──
  if (metadata?.upstreamTreatment) {
    const treatment = typeof metadata.upstreamTreatment === 'string'
      ? metadata.upstreamTreatment
      : metadata.upstreamTreatment.treatment;

    if (treatment) {
      issues.push(`upstream treatment: ${treatment}`);
    }
  }

  // ── Check 2: Specific treatment fields (distinguishedBy, questionedBy, etc.) ──
  const treatmentFields: Array<{ key: keyof UpstreamMetadata; label: string }> = [
    { key: 'distinguishedBy', label: 'distinguished by' },
    { key: 'questionedBy', label: 'questioned by' },
    { key: 'criticizedBy', label: 'criticized by' },
    { key: 'limitedBy', label: 'limited by' },
  ];

  for (const { key, label } of treatmentFields) {
    const value = metadata?.[key];
    if (value) {
      const cases = Array.isArray(value) ? value : [value];
      if (cases.length > 0) {
        issues.push(`${label}: ${cases.join(', ')}`);
      }
    }
  }

  // ── Check 3: Citation text contains upstream treatment language ──
  if (citationText) {
    for (const pattern of UPSTREAM_TREATMENT_PATTERNS) {
      const match = citationText.match(pattern);
      if (match) {
        // Avoid adding duplicates if the same treatment was already found via metadata
        const matchLower = match[0].toLowerCase();
        const alreadyFound = issues.some(issue => issue.toLowerCase().includes(matchLower.split(' ')[0]));
        if (!alreadyFound) {
          issues.push(`citation text indicates: "${match[0]}"`);
        }
      }
    }
  }

  // ── No upstream treatment issues found ──
  if (issues.length === 0) {
    return {
      protocolNumber: 22,
      triggered: false,
      severity: null,
      actionTaken: null,
      aisEntry: null,
      holdRequired: false,
      handlerVersion: VERSION,
    };
  }

  // ── Triggered: upstream treatment detected ──
  const issueList = issues.join('; ');
  const displayName = caseName || citationText || context.citation.id;

  // Determine the most severe treatment for the description
  const mostSevereTreatment = determineMostSevereTreatment(issues);

  logger.info('protocol.p22.upstream_treatment_detected', {
    orderId: context.orderId,
    citationId: context.citation.id,
    issueCount: issues.length,
    issues: issueList,
    mostSevereTreatment,
  });

  return {
    protocolNumber: 22,
    triggered: true,
    severity: 'WARNING',
    actionTaken: 'UPSTREAM_TREATMENT_FLAGGED',
    aisEntry: {
      category: 'BAD_LAW',
      protocolNumber: 22,
      severity: 'WARNING',
      title: `Upstream Authority Treatment — ${capitalize(mostSevereTreatment)}`,
      description: `Citation "${displayName}" has been ${mostSevereTreatment} by a higher court. Detected issues: ${issueList}. While the case may still be valid law on other points, reliance on it without acknowledging this treatment could undermine the brief's credibility.`,
      citationId: context.citation.id,
      recommendation: `Verify the current status of this authority on Westlaw (KeyCite) or LexisNexis (Shepard's). If the case has been ${mostSevereTreatment}, consider: (1) acknowledging the negative treatment and arguing it is distinguishable, (2) finding alternative authority, or (3) removing the citation if the point it supports is no longer good law.`,
    },
    holdRequired: false,
    handlerVersion: VERSION,
  };
}

/**
 * Determines the most severe upstream treatment from the list of issues.
 * Returns the treatment label (e.g., "questioned", "distinguished").
 */
function determineMostSevereTreatment(issues: string[]): string {
  const allText = issues.join(' ').toLowerCase();

  // Check treatments in severity order (most severe first)
  const severityOrder = [
    'abrogated', 'superseded', 'disapproved', 'questioned',
    'criticized', 'limited', 'distinguished', 'narrowed', 'undercut',
  ];

  for (const treatment of severityOrder) {
    if (allText.includes(treatment)) {
      return TREATMENT_SEVERITY_MAP[treatment] || treatment;
    }
  }

  return 'negatively treated';
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
