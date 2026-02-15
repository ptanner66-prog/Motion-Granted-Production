/**
 * CITATION DEDUPLICATOR
 *
 * TASK-11: Fix citation verification deduplication.
 *
 * Audit Evidence (Pelican order):
 * Phase V.1 showed 8 entries, but only 4 unique citations.
 * Duplicates had truncated strings: "267 So. 3" instead of "267 So. 3d 655"
 * The pipeline was double-counting from citation bank AND draft text.
 *
 * Solution:
 * - Normalize citation strings before comparison
 * - Deduplicate by normalized form
 * - Track occurrence count
 * - Flag truncated citations as FORMAT_WARNING
 *
 * @module citation-deduplicator
 */

// =======================================================================
// TYPES
// =======================================================================

export interface RawCitation {
  citation: string;
  caseName?: string;
  source: 'bank' | 'draft';
  context?: string;
}

export interface NormalizedCitation {
  normalized: string;
  original: string;
  caseName?: string;
  source: 'bank' | 'draft';
  occurrenceCount: number;
  hasFormatWarning: boolean;
  formatWarning?: string;
}

export interface DeduplicationResult {
  uniqueCitations: NormalizedCitation[];
  duplicatesRemoved: number;
  formatWarnings: string[];
}

// =======================================================================
// NORMALIZATION
// =======================================================================

/**
 * Normalize a citation string for comparison.
 *
 * Handles:
 * - Whitespace variations: "So. 3d" vs "So.3d"
 * - Case variations
 * - Trailing whitespace
 * - Missing "d" in reporter: "So. 3" -> flagged but matches "So. 3d"
 */
export function normalizeCitation(citation: string): {
  normalized: string;
  hasFormatWarning: boolean;
  formatWarning?: string;
} {
  let normalized = citation.trim().toLowerCase();
  let hasFormatWarning = false;
  let formatWarning: string | undefined;

  // Standardize whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  // Standardize reporter abbreviations
  normalized = normalized
    .replace(/so\.\s*2d/g, 'so.2d')
    .replace(/so\.\s*3d/g, 'so.3d')
    .replace(/f\.\s*2d/g, 'f.2d')
    .replace(/f\.\s*3d/g, 'f.3d')
    .replace(/f\.\s*supp\.\s*2d/g, 'f.supp.2d')
    .replace(/f\.\s*supp\.\s*3d/g, 'f.supp.3d');

  // Check for truncated citations (missing 'd' in '3d')
  const truncatedMatch = normalized.match(/so\.\s*(\d)(?!\d)/);
  if (truncatedMatch && !normalized.includes('so.2d') && !normalized.includes('so.3d')) {
    hasFormatWarning = true;
    formatWarning = `Truncated citation: missing 'd' in 'So. ${truncatedMatch[1]}d'`;
    // Attempt to fix for matching purposes
    normalized = normalized.replace(/so\.\s*3(?!\d)/g, 'so.3d');
    normalized = normalized.replace(/so\.\s*2(?!\d)/g, 'so.2d');
  }

  // Check for missing page number
  const pageMatch = normalized.match(/\d+\s+so\.[23]d\s*$/);
  if (pageMatch) {
    hasFormatWarning = true;
    formatWarning = (formatWarning || '') + ' Missing page number.';
  }

  return { normalized, hasFormatWarning, formatWarning };
}

// =======================================================================
// DEDUPLICATION
// =======================================================================

/**
 * Deduplicate citations from multiple sources.
 *
 * @param citations - Raw citations from bank and draft
 * @returns Deduplicated citations with occurrence counts
 */
export function deduplicateCitations(
  citations: RawCitation[]
): DeduplicationResult {
  const seen = new Map<string, NormalizedCitation>();
  const formatWarnings: string[] = [];
  let duplicatesRemoved = 0;

  for (const raw of citations) {
    const { normalized, hasFormatWarning, formatWarning } = normalizeCitation(raw.citation);

    if (seen.has(normalized)) {
      // Duplicate — increment count
      const existing = seen.get(normalized)!;
      existing.occurrenceCount++;
      duplicatesRemoved++;

      // Keep the longer/better version
      if (raw.citation.length > existing.original.length) {
        existing.original = raw.citation;
        existing.caseName = raw.caseName || existing.caseName;
      }
    } else {
      // New citation
      seen.set(normalized, {
        normalized,
        original: raw.citation,
        caseName: raw.caseName,
        source: raw.source,
        occurrenceCount: 1,
        hasFormatWarning,
        formatWarning,
      });

      if (hasFormatWarning && formatWarning) {
        formatWarnings.push(`${raw.citation}: ${formatWarning}`);
      }
    }
  }

  return {
    uniqueCitations: Array.from(seen.values()),
    duplicatesRemoved,
    formatWarnings,
  };
}

/**
 * Merge citations from bank and draft, deduplicating.
 */
export function mergeCitationSources(
  bankCitations: { citation: string; caseName?: string }[],
  draftCitations: { citation: string; caseName?: string }[]
): DeduplicationResult {
  const allCitations: RawCitation[] = [
    ...bankCitations.map(c => ({ ...c, source: 'bank' as const })),
    ...draftCitations.map(c => ({ ...c, source: 'draft' as const })),
  ];

  return deduplicateCitations(allCitations);
}
