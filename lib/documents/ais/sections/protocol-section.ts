// ============================================================
// lib/documents/ais/sections/protocol-section.ts
// AIS Protocol Section Renderer
// Source: D9 E-1 | SP-13 AQ-1
//
// BINDING NOTE: Execution priority (dispatcher.ts) and display ordering
// (this file) are intentionally different. Execution priority determines
// which protocol short-circuits first. Display ordering determines
// readability for the attorney. Do not synchronize them.
// ============================================================

import type { ProtocolManifestEntry, AISEntry } from '../../../protocols/types';

// D9-012: AIS display ordering — severity DESC, then protocol number ASC
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export function renderProtocolSection(
  manifest: ProtocolManifestEntry[],
  triggeredEntries: AISEntry[]
): string {
  const notEvaluated = manifest.filter(m => m.status === 'NOT_EVALUATED');

  // Decision 9 Option C: conditional manifest
  if (notEvaluated.length === 0) {
    if (triggeredEntries.length === 0) {
      return 'All 23 quality protocols evaluated. No issues found.';
    }
    return renderTriggeredFindings(triggeredEntries);
  }

  // Some protocols not evaluated — show full manifest
  return renderFullManifest(manifest, triggeredEntries);
}

function renderTriggeredFindings(entries: AISEntry[]): string {
  // Sort: RESOURCE_LIMIT first, then severity DESC, then protocol number ASC
  const sorted = [...entries].sort((a, b) => {
    if (a.category === 'RESOURCE_LIMIT' && b.category !== 'RESOURCE_LIMIT') return -1;
    if (b.category === 'RESOURCE_LIMIT' && a.category !== 'RESOURCE_LIMIT') return 1;
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return a.protocolNumber - b.protocolNumber;
  });

  const lines: string[] = ['QUALITY PROTOCOL FINDINGS', ''];
  for (const entry of sorted) {
    lines.push(`[${entry.severity}] Protocol ${entry.protocolNumber}: ${entry.title}`);
    lines.push(entry.description);
    if (entry.recommendation) {
      lines.push(`Recommendation: ${entry.recommendation}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderFullManifest(
  manifest: ProtocolManifestEntry[],
  triggeredEntries: AISEntry[]
): string {
  const lines: string[] = ['QUALITY PROTOCOL MANIFEST', ''];

  // Triggered findings first
  if (triggeredEntries.length > 0) {
    lines.push(renderTriggeredFindings(triggeredEntries));
    lines.push('---', '');
  }

  // Full 23-entry manifest
  lines.push('PROTOCOL EVALUATION STATUS:');
  for (const entry of manifest.sort((a, b) => a.protocolNumber - b.protocolNumber)) {
    const symbol = entry.status === 'EVALUATED_CLEAN' ? '\u2713'
      : entry.status === 'EVALUATED_TRIGGERED' ? '!'
      : '\u25CB';
    const suffix = entry.status === 'NOT_EVALUATED' ? ` (${entry.reason})` : '';
    lines.push(`  ${symbol} Protocol ${entry.protocolNumber}: ${entry.protocolName}${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Generate per-phase + cumulative summary for AIS.
 * D9-019: Display format:
 *   Phase V.1: 3 findings (1 WARNING, 2 INFO)
 *   Phase VII.1: 1 finding (1 CRITICAL)
 *   Cumulative: 4 findings (1 CRITICAL, 1 WARNING, 2 INFO)
 */
export function renderPhaseSummary(
  phaseResults: Array<{ phase: string; entries: AISEntry[] }>
): string {
  const lines: string[] = ['PROTOCOL FINDINGS BY PHASE', ''];

  let totalCritical = 0;
  let totalWarning = 0;
  let totalInfo = 0;

  for (const { phase, entries } of phaseResults) {
    if (entries.length === 0) continue;

    const critical = entries.filter(e => e.severity === 'CRITICAL').length;
    const warning = entries.filter(e => e.severity === 'WARNING').length;
    const info = entries.filter(e => e.severity === 'INFO').length;

    totalCritical += critical;
    totalWarning += warning;
    totalInfo += info;

    const parts: string[] = [];
    if (critical > 0) parts.push(`${critical} CRITICAL`);
    if (warning > 0) parts.push(`${warning} WARNING`);
    if (info > 0) parts.push(`${info} INFO`);

    lines.push(`Phase ${phase}: ${entries.length} finding${entries.length !== 1 ? 's' : ''} (${parts.join(', ')})`);
  }

  const totalFindings = totalCritical + totalWarning + totalInfo;
  if (totalFindings > 0) {
    const parts: string[] = [];
    if (totalCritical > 0) parts.push(`${totalCritical} CRITICAL`);
    if (totalWarning > 0) parts.push(`${totalWarning} WARNING`);
    if (totalInfo > 0) parts.push(`${totalInfo} INFO`);
    lines.push(`Cumulative: ${totalFindings} finding${totalFindings !== 1 ? 's' : ''} (${parts.join(', ')})`);
  }

  return lines.join('\n');
}
