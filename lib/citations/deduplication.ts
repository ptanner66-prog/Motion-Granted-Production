/**
 * Eyecite Citation Deduplication
 *
 * Deduplicates citations by base reference (volume + reporter + start page).
 * Pinpoint references like "123 So.3d 456, 460" and "123 So.3d 456, 462"
 * are treated as the same case, reducing duplicate CIV verification calls.
 *
 * SP-14 TASK-20
 */

export interface ParsedCitation {
  volume: string;
  reporter: string;
  page: string;
  pinpoint?: string;
  raw: string;
}

export interface DeduplicatedCitation {
  baseCitation: string;
  pinpoints: string[];
  occurrences: number;
  raw: string;
}

/**
 * Parse a citation string into its components.
 * Returns null for non-standard formats (no crash).
 *
 * Matches patterns like:
 * - "123 So.3d 456"        → volume=123, reporter=So.3d, page=456
 * - "123 So.3d 456, 460"   → volume=123, reporter=So.3d, page=456, pinpoint=460
 * - "456 F.3d 789, 792"    → volume=456, reporter=F.3d, page=789, pinpoint=792
 * - "100 La. App. 3d 200"  → volume=100, reporter=La. App. 3d, page=200
 */
export function parseCitation(raw: string): ParsedCitation | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match: volume reporter page [, pinpoint]
  // Reporter can contain letters, dots, spaces, and numbers (e.g., "So.3d", "F. Supp. 2d", "La. App. 3d")
  const match = trimmed.match(/^(\d+)\s+([A-Za-z][A-Za-z0-9.\s]*?)\s+(\d+)(?:\s*,\s*(\d+))?/);
  if (!match) return null;

  return {
    volume: match[1],
    reporter: match[2].trim(),
    page: match[3],
    pinpoint: match[4] || undefined,
    raw: trimmed,
  };
}

/**
 * Deduplicate citations by base reference.
 *
 * "123 So.3d 456, 460" and "123 So.3d 456, 462" → single citation "123 So.3d 456"
 * with pinpoints [460, 462] preserved.
 *
 * @param citations - Array of raw citation strings from eyecite extraction
 * @returns Deduplicated citations with pinpoints preserved
 */
export function deduplicateCitations(citations: string[]): DeduplicatedCitation[] {
  if (!Array.isArray(citations) || citations.length === 0) {
    return [];
  }

  const parsed = citations
    .map(c => parseCitation(c))
    .filter((p): p is ParsedCitation => p !== null);

  // Group by base citation (volume + reporter + start page)
  const groups = new Map<string, ParsedCitation[]>();

  for (const citation of parsed) {
    const baseKey = `${citation.volume} ${citation.reporter} ${citation.page}`;
    const existing = groups.get(baseKey);
    if (existing) {
      existing.push(citation);
    } else {
      groups.set(baseKey, [citation]);
    }
  }

  // Return deduplicated list with pinpoints preserved
  return Array.from(groups.entries()).map(([baseKey, instances]) => ({
    baseCitation: baseKey,
    pinpoints: instances
      .map(i => i.pinpoint)
      .filter((p): p is string => p !== undefined),
    occurrences: instances.length,
    raw: instances[0].raw,
  }));
}
