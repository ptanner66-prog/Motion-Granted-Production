/**
 * Citation Deduplication — SP21 Production Fix (BUG #7)
 *
 * Fixes the Eyecite truncation problem where partial citation strings
 * (e.g., "210 So. 3") are extracted alongside complete ones ("210 So. 3d 447"),
 * inflating citation counts with false positives.
 *
 * FIVE FIXES (SP21):
 * 1. Series continuation detection — "210 So. 3" is NOT complete when followed by "d" (→ "3d")
 * 2. Intelligent prefix-based deduplication with truncation classification
 * 3. Substring deduplication for non-prefix partial matches
 * 4. Minimum completeness threshold (volume + reporter + page)
 * 5. Generic strict deduplication with removal reason tracking
 *
 * CRITICAL: Statutory citations MUST NOT go through this pipeline.
 * This is for CASE LAW citations only.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedCitation {
  raw: string;
  volume?: string;
  reporter?: string;
  page?: string;
  pinpoint?: string;
  isComplete: boolean;
  isDuplicate: boolean;
  duplicateOf?: string;
}

export interface DeduplicationResult {
  unique: ExtractedCitation[];
  duplicatesRemoved: ExtractedCitation[];
  incompleteRemoved: ExtractedCitation[];
  stats: {
    inputCount: number;
    uniqueCount: number;
    duplicatesRemoved: number;
    incompleteRemoved: number;
  };
}

/** Classification of why a citation was removed during deduplication. */
export type RemovalReason =
  | 'SERIES_TRUNCATION'
  | 'PREFIX_TRUNCATION'
  | 'SUBSTRING_OF_LONGER_CITATION'
  | 'EXACT_DUPLICATE'
  | 'INCOMPLETE';

/** A record tracking a removed citation and why it was removed. */
export interface RemovalRecord<T> {
  item: T;
  citation: string;
  reason: RemovalReason;
  duplicateOf?: string;
}

/** Result of strict deduplication with full removal tracking. */
export interface StrictDeduplicationResult<T> {
  unique: T[];
  removed: RemovalRecord<T>[];
  stats: {
    inputCount: number;
    uniqueCount: number;
    seriesTruncations: number;
    prefixTruncations: number;
    substringRemovals: number;
    exactDuplicates: number;
    incompleteRemovals: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Detects series continuation suffixes that indicate a citation was truncated
 * mid-reporter. For example, "210 So. 3" followed by "d" means the reporter
 * is "So. 3d", not "So. 3" with page "3".
 *
 * Matches: d (2d, 3d, 4th → "d"), th (4th), nd (2nd), rd (3rd), st (1st)
 * The pattern checks the remainder of the longer citation after the prefix.
 */
export const SERIES_CONTINUATION_PATTERN = /^(?:d|th|nd|rd|st)\s/i;

/**
 * Standard reporter abbreviation patterns.
 * A citation MUST contain: volume + reporter + page minimum.
 */
const REPORTER_PATTERNS = [
  // Federal
  /U\.S\./, /S\.\s*Ct\./, /L\.\s*Ed\./, /F\.(?:2d|3d|4th)?/, /F\.\s*Supp\.(?:\s*(?:2d|3d))?/,
  /B\.R\./, /Fed\.\s*Cl\./,
  // Regional
  /So\.\s*(?:2d|3d)?/, /S\.E\.(?:2d)?/, /N\.E\.(?:2d|3d)?/, /N\.W\.(?:2d)?/,
  /S\.W\.(?:2d|3d)?/, /A\.(?:2d|3d)?/, /P\.(?:2d|3d)?/,
  // State-specific
  /Cal\.\s*(?:2d|3d|4th|5th|App\.)?/, /N\.Y\.(?:S\.(?:2d|3d)?)?/,
  /La\./, /Wis\.(?:2d)?/, /Ill\.(?:2d)?/,
];

// ============================================================================
// CITATION COMPLETENESS CHECK
// ============================================================================

/**
 * Check if a citation string meets minimum completeness requirements.
 * A valid case citation MUST have: volume number + reporter abbreviation + page number.
 */
export function isCitationComplete(citation: string): boolean {
  const trimmed = citation.trim();

  // Must be at least ~8 chars to be a valid citation (e.g., "1 F.3d 2")
  if (trimmed.length < 6) return false;

  // Check for volume (leading number)
  const volumeMatch = trimmed.match(/^(\d+)\s/);
  if (!volumeMatch) return false;

  // Check for reporter abbreviation
  const hasReporter = REPORTER_PATTERNS.some(pattern => pattern.test(trimmed));
  if (!hasReporter) return false;

  // Check for page number (trailing number after reporter)
  // The citation should end with digits or have digits after the reporter
  const pageMatch = trimmed.match(/\d+\s*$/);
  if (!pageMatch) {
    // Also check for patterns like "210 So. 3d 447, 452" (pinpoint cite)
    const pinpointMatch = trimmed.match(/\d+(?:,\s*\d+)*\s*$/);
    if (!pinpointMatch) return false;
  }

  return true;
}

// ============================================================================
// SUBSTRING DETECTION
// ============================================================================

/**
 * Determine if `candidate` is a strict substring of `longer` (case-insensitive).
 * Used to catch partial citation extractions that appear within longer citations
 * but are not necessarily prefixes.
 *
 * @returns true if candidate is a strict, non-empty substring of longer
 */
export function isSubstringOf(candidate: string, longer: string): boolean {
  const c = candidate.trim().toLowerCase();
  const l = longer.trim().toLowerCase();
  if (c.length === 0 || c.length >= l.length) return false;
  return l.includes(c);
}

// ============================================================================
// PREFIX-BASED DEDUPLICATION WITH SERIES CONTINUATION
// ============================================================================

/**
 * Internal classification result for truncation analysis.
 * Returns the reason for truncation or false if not truncated.
 */
type TruncationClass = 'SERIES_TRUNCATION' | 'PREFIX_TRUNCATION' | false;

/**
 * Classify the relationship between a shorter and longer citation string.
 *
 * Checks if `shorter` is a truncated prefix of `longer`, distinguishing between:
 * - SERIES_TRUNCATION: "210 So. 3" → "210 So. 3d 447" (reporter series cut)
 * - PREFIX_TRUNCATION: "210 So." → "210 So. 3d 447" (incomplete, not a valid cite)
 * - false: Both are valid independent citations (e.g., "100 F.3d 200" vs "100 F.3d 200, 205")
 */
function classifyTruncation(shorter: string, longer: string): TruncationClass {
  const s = shorter.trim();
  const l = longer.trim();

  // Must be strict prefix
  if (s.length >= l.length) return false;
  if (!l.startsWith(s)) return false;

  // Check if the remainder starts with a series continuation.
  // This is the core SP21 fix: "210 So. 3" + "d 447" → the "3" is part of "3d",
  // NOT a page number. The shorter citation is a mid-reporter truncation.
  const remainder = l.slice(s.length);
  if (SERIES_CONTINUATION_PATTERN.test(remainder)) {
    return 'SERIES_TRUNCATION';
  }

  // If the shorter citation is structurally valid on its own, keep both.
  // Example: "100 F.3d 200" and "100 F.3d 200, 205" are both valid.
  if (isCitationComplete(s)) return false;

  return 'PREFIX_TRUNCATION';
}

/**
 * Determine if `shorter` is a truncated prefix of `longer`.
 *
 * Rules:
 * - shorter must be a strict prefix of longer
 * - Series continuations are always truncated (e.g., "210 So. 3" → "210 So. 3d 447")
 * - shorter must NOT be a valid complete citation on its own (otherwise keep both)
 *
 * Example:
 * - "210 So. 3" is prefix of "210 So. 3d 447" → REMOVE (series truncation)
 * - "210 So." is prefix of "210 So. 3d 447" → REMOVE (not complete)
 * - "100 F.3d 200" vs "100 F.3d 200, 205" → KEEP BOTH (both valid)
 */
export function isTruncatedPrefix(shorter: string, longer: string): boolean {
  return classifyTruncation(shorter, longer) !== false;
}

// ============================================================================
// STRICT GENERIC DEDUPLICATION
// ============================================================================

/**
 * Deduplicate items containing citation strings with full removal reason tracking.
 *
 * This is the generic version that works with any item type — pass a `getCitation`
 * accessor to extract the citation string from each item.
 *
 * Process:
 * 1. Remove citations that fail completeness check (INCOMPLETE)
 * 2. Sort by citation length descending (longest first)
 * 3. Remove series truncations (SERIES_TRUNCATION)
 * 4. Remove prefix truncations (PREFIX_TRUNCATION)
 * 5. Remove substring matches (SUBSTRING_OF_LONGER_CITATION)
 * 6. Remove exact duplicates case-insensitive (EXACT_DUPLICATE)
 *
 * @param items - Array of items to deduplicate
 * @param getCitation - Function to extract the citation string from an item
 * @returns StrictDeduplicationResult with unique items and detailed removal records
 */
export function deduplicateCitationsStrict<T>(
  items: T[],
  getCitation: (item: T) => string
): StrictDeduplicationResult<T> {
  const removed: RemovalRecord<T>[] = [];
  const stats = {
    inputCount: items.length,
    uniqueCount: 0,
    seriesTruncations: 0,
    prefixTruncations: 0,
    substringRemovals: 0,
    exactDuplicates: 0,
    incompleteRemovals: 0,
  };

  // Step 1: Completeness check
  const completeItems: Array<{ item: T; citation: string }> = [];
  for (const item of items) {
    const citation = getCitation(item).trim();
    if (isCitationComplete(citation)) {
      completeItems.push({ item, citation });
    } else {
      removed.push({ item, citation, reason: 'INCOMPLETE' });
      stats.incompleteRemovals++;
    }
  }

  // Step 2: Sort by citation length descending (process longer citations first)
  const sorted = [...completeItems].sort((a, b) => b.citation.length - a.citation.length);

  // Step 3–6: Multi-pass deduplication
  const kept: Array<{ item: T; citation: string }> = [];

  for (const entry of sorted) {
    let wasRemoved = false;

    // Check against all already-kept citations
    for (const existing of kept) {
      // 3/4: Prefix truncation check (includes series continuation)
      const truncation = classifyTruncation(entry.citation, existing.citation);
      if (truncation !== false) {
        const reason: RemovalReason = truncation;
        removed.push({
          item: entry.item,
          citation: entry.citation,
          reason,
          duplicateOf: existing.citation,
        });
        if (reason === 'SERIES_TRUNCATION') {
          stats.seriesTruncations++;
        } else {
          stats.prefixTruncations++;
        }
        wasRemoved = true;
        break;
      }

      // 5: Substring check — catch partial extractions that aren't simple prefixes
      if (isSubstringOf(entry.citation, existing.citation)) {
        removed.push({
          item: entry.item,
          citation: entry.citation,
          reason: 'SUBSTRING_OF_LONGER_CITATION',
          duplicateOf: existing.citation,
        });
        stats.substringRemovals++;
        wasRemoved = true;
        break;
      }

      // 6: Exact duplicate (case-insensitive)
      if (entry.citation.toLowerCase() === existing.citation.toLowerCase()) {
        removed.push({
          item: entry.item,
          citation: entry.citation,
          reason: 'EXACT_DUPLICATE',
          duplicateOf: existing.citation,
        });
        stats.exactDuplicates++;
        wasRemoved = true;
        break;
      }
    }

    if (!wasRemoved) {
      kept.push(entry);
    }
  }

  stats.uniqueCount = kept.length;

  return {
    unique: kept.map(k => k.item),
    removed,
    stats,
  };
}

// ============================================================================
// SIMPLE DEDUPLICATION (backward-compatible API)
// ============================================================================

/**
 * Deduplicate case law citations extracted by Eyecite.
 *
 * This is the simple string-based API preserved for backward compatibility.
 * For generic item deduplication with removal reasons, use `deduplicateCitationsStrict`.
 *
 * Process:
 * 1. Remove citations that fail completeness check
 * 2. Sort by length (longest first)
 * 3. Remove series truncations (SP21 fix for BUG #7)
 * 4. Remove shorter strings that are truncated prefixes of longer ones
 * 5. Remove substrings of longer citations
 * 6. Deduplicate exact matches (case-insensitive)
 */
export function deduplicateCitations(citations: string[]): DeduplicationResult {
  const strictResult = deduplicateCitationsStrict(
    citations,
    (s: string) => s
  );

  // Map strict results back to the legacy DeduplicationResult format
  const incompleteRemoved: ExtractedCitation[] = [];
  const duplicatesRemoved: ExtractedCitation[] = [];

  for (const record of strictResult.removed) {
    const entry: ExtractedCitation = {
      raw: record.citation,
      isComplete: record.reason !== 'INCOMPLETE',
      isDuplicate: record.reason !== 'INCOMPLETE',
      duplicateOf: record.duplicateOf,
    };

    if (record.reason === 'INCOMPLETE') {
      incompleteRemoved.push(entry);
    } else {
      duplicatesRemoved.push(entry);
    }
  }

  const unique: ExtractedCitation[] = strictResult.unique.map(raw => ({
    raw,
    isComplete: true,
    isDuplicate: false,
  }));

  return {
    unique,
    duplicatesRemoved,
    incompleteRemoved,
    stats: {
      inputCount: citations.length,
      uniqueCount: unique.length,
      duplicatesRemoved: duplicatesRemoved.length,
      incompleteRemoved: incompleteRemoved.length,
    },
  };
}
