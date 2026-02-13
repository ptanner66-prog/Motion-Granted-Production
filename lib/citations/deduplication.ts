/**
 * Citation Deduplication — BUG-06 + BUG-07 Production Fix
 *
 * Fixes the Eyecite truncation problem where partial citation strings
 * (e.g., "185 So. 3") are extracted alongside complete ones ("185 So. 3d 94"),
 * inflating citation counts with false positives.
 *
 * BUG-07 FIX: The original prefix-based dedup failed when a truncated citation
 * appeared "complete" — e.g., "185 So. 3" parsed as volume=185, reporter=So., page=3.
 * In reality, "3" is part of the reporter series "3d", not a page number.
 * Fixed by detecting reporter series continuation characters (d, th, nd, rd) and
 * adding substring-based dedup as a second pass.
 *
 * FOUR FIXES:
 * 1. Reporter series continuation detection (new — BUG-07)
 * 2. Intelligent prefix-based deduplication
 * 3. Substring-based deduplication (new — BUG-07)
 * 4. Minimum completeness threshold (volume + reporter + page)
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

// ============================================================================
// CITATION COMPLETENESS CHECK
// ============================================================================

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
// REPORTER SERIES SUFFIXES
// ============================================================================

/**
 * Reporter series suffix pattern.
 * Matches continuation characters that indicate the shorter citation's apparent
 * "page number" is actually part of a reporter series designator.
 *
 * Examples:
 * - "185 So. 3" + "d 94"  → "3d" is the series, not page 3 → TRUNCATION
 * - "100 A. 2"  + "d 300" → "2d" is the series, not page 2 → TRUNCATION
 * - "50 P. 3"   + "d 100" → "3d" is the series, not page 3 → TRUNCATION
 * - "200 F. 4"  + "th 200"→ "4th" is the series, not page 4 → TRUNCATION
 *
 * Must be followed by a space (to distinguish "3d 94" from "300" digit continuation).
 */
const SERIES_CONTINUATION_PATTERN = /^(?:d|th|nd|rd)\s/i;

// ============================================================================
// PREFIX-BASED DEDUPLICATION
// ============================================================================

/**
 * Determine if `shorter` is a truncated prefix of `longer`.
 *
 * Rules:
 * - shorter must be a strict prefix of longer
 * - If the continuation forms a reporter series suffix (d, th, nd, rd),
 *   it's a truncation even if the shorter appears "complete" (BUG-07 fix)
 * - Otherwise, shorter must NOT be a valid complete citation on its own
 *
 * Examples:
 * - "185 So. 3" prefix of "185 So. 3d 94"     → REMOVE (series continuation "d")
 * - "226 So. 3" prefix of "226 So. 3d 462"    → REMOVE (series continuation "d")
 * - "100 A. 2" prefix of "100 A. 2d 300"      → REMOVE (series continuation "d")
 * - "100 F.3d 200" vs "100 F.3d 200, 205"     → KEEP BOTH (both valid, comma continuation)
 * - "100 F.3d 2" vs "100 F.3d 200"            → KEEP BOTH (both valid, digit continuation)
 */
function isTruncatedPrefix(shorter: string, longer: string): boolean {
  const s = shorter.trim();
  const l = longer.trim();

  // Must be strict prefix
  if (s.length >= l.length) return false;
  if (!l.startsWith(s)) return false;

  // BUG-07 FIX: Check if the continuation forms a reporter series suffix.
  // E.g., "185 So. 3" + "d 94" means "3d" is the reporter series, not page 3.
  // This must be checked BEFORE the completeness check, because the shorter
  // citation falsely appears "complete" (volume=185, reporter=So., page=3).
  const continuation = l.slice(s.length);
  if (SERIES_CONTINUATION_PATTERN.test(continuation)) {
    return true;
  }

  // If the shorter citation is valid on its own, keep it
  if (isCitationComplete(s)) return false;

  return true;
}

// ============================================================================
// SUBSTRING-BASED DEDUPLICATION
// ============================================================================

/**
 * Determine if `shorter` is a non-prefix substring of `longer`.
 * This catches cases where partial extractions aren't strict prefixes
 * but are still contained within a longer citation.
 *
 * Only applies when the shorter citation is NOT independently complete.
 *
 * Example:
 * - "So. 3d 94" is substring of "185 So. 3d 94" → REMOVE (not complete on its own)
 * - "185 So. 3d 94" is NOT substring-removed by "185 So. 3d 94 (La. 2020)" → KEEP (complete)
 */
function isSubstringOf(shorter: string, longer: string): boolean {
  const s = shorter.trim().toLowerCase();
  const l = longer.trim().toLowerCase();

  // Must be strictly shorter
  if (s.length >= l.length) return false;

  // Must be contained within the longer string
  if (!l.includes(s)) return false;

  // If it's a prefix, isTruncatedPrefix already handles it
  if (l.startsWith(s)) return false;

  // Only remove if the shorter citation is NOT independently complete
  if (isCitationComplete(shorter.trim())) return false;

  return true;
}

// ============================================================================
// MAIN DEDUPLICATION
// ============================================================================

/**
 * Deduplicate case law citations extracted by Eyecite.
 *
 * Process:
 * 1. Remove citations that fail completeness check
 * 2. Sort by length (longest first)
 * 3. Remove shorter strings that are truncated prefixes of longer ones (with series detection)
 * 4. Remove non-prefix substrings of longer citations
 * 5. Deduplicate exact matches (case-insensitive)
 *
 * BUG-07 additions: Steps 3 now detects reporter series continuations ("3d", "4th"),
 * and Step 4 adds substring-based dedup for non-prefix partial extractions.
 */
export function deduplicateCitations(citations: string[]): DeduplicationResult {
  const incompleteRemoved: ExtractedCitation[] = [];
  const duplicatesRemoved: ExtractedCitation[] = [];
  const results: ExtractedCitation[] = [];

  // Step 1: Completeness check
  const completeCitations: string[] = [];
  for (const raw of citations) {
    if (isCitationComplete(raw)) {
      completeCitations.push(raw.trim());
    } else {
      incompleteRemoved.push({
        raw,
        isComplete: false,
        isDuplicate: false,
      });
    }
  }

  // Step 2: Sort by length descending (process longer citations first)
  const sorted = [...completeCitations].sort((a, b) => b.length - a.length);

  // Step 3: Prefix-based dedup + series continuation detection (BUG-07)
  const kept: string[] = [];

  for (const citation of sorted) {
    // Check if this citation is a truncated prefix of any already-kept citation
    const parentPrefix = kept.find(existing => isTruncatedPrefix(citation, existing));
    if (parentPrefix) {
      duplicatesRemoved.push({
        raw: citation,
        isComplete: true,
        isDuplicate: true,
        duplicateOf: parentPrefix,
      });
      continue;
    }

    // Step 4: Substring-based dedup (BUG-07) — catch non-prefix partial extractions
    const parentSubstring = kept.find(existing => isSubstringOf(citation, existing));
    if (parentSubstring) {
      duplicatesRemoved.push({
        raw: citation,
        isComplete: true,
        isDuplicate: true,
        duplicateOf: parentSubstring,
      });
      continue;
    }

    // Step 5: Check for exact duplicates (case-insensitive)
    const isDuplicate = kept.some(
      existing => existing.toLowerCase() === citation.toLowerCase()
    );
    if (isDuplicate) {
      duplicatesRemoved.push({
        raw: citation,
        isComplete: true,
        isDuplicate: true,
        duplicateOf: kept.find(
          existing => existing.toLowerCase() === citation.toLowerCase()
        ),
      });
      continue;
    }

    kept.push(citation);
  }

  // Build result entries
  for (const citation of kept) {
    results.push({
      raw: citation,
      isComplete: true,
      isDuplicate: false,
    });
  }

  return {
    unique: results,
    duplicatesRemoved,
    incompleteRemoved,
    stats: {
      inputCount: citations.length,
      uniqueCount: results.length,
      duplicatesRemoved: duplicatesRemoved.length,
      incompleteRemoved: incompleteRemoved.length,
    },
  };
}

/**
 * Enhanced deduplication with detailed removal tracking.
 * Use when you need to log or audit exactly which citations were removed and why.
 *
 * Accepts generic citation objects (must have a `citation` string field) and
 * returns both the deduplicated array and a removal log.
 *
 * @example
 * const { deduplicated, removed } = deduplicateCitationsStrict([
 *   { citation: '185 So. 3d 94', type: 'FULL_CASE' },
 *   { citation: '185 So. 3', type: 'FULL_CASE' },
 * ]);
 * // deduplicated: [{ citation: '185 So. 3d 94', type: 'FULL_CASE' }]
 * // removed: [{ citation: '185 So. 3', reason: 'SERIES_TRUNCATION', subsumedBy: '185 So. 3d 94' }]
 */
export function deduplicateCitationsStrict<T extends { citation: string }>(citations: T[]): {
  deduplicated: T[];
  removed: Array<{ citation: string; reason: string; subsumedBy: string }>;
} {
  if (!citations || citations.length <= 1) {
    return { deduplicated: citations || [], removed: [] };
  }

  const sorted = [...citations].sort((a, b) => b.citation.length - a.citation.length);
  const deduplicated: T[] = [];
  const removed: Array<{ citation: string; reason: string; subsumedBy: string }> = [];

  for (const cite of sorted) {
    const normalizedCite = cite.citation.trim().toLowerCase().replace(/\s+/g, ' ');

    // Check prefix with series detection
    const prefixParent = deduplicated.find(accepted =>
      isTruncatedPrefix(cite.citation, accepted.citation)
    );
    if (prefixParent) {
      const continuation = prefixParent.citation.trim().slice(cite.citation.trim().length);
      const reason = SERIES_CONTINUATION_PATTERN.test(continuation)
        ? 'SERIES_TRUNCATION'
        : 'PREFIX_TRUNCATION';
      removed.push({
        citation: cite.citation,
        reason,
        subsumedBy: prefixParent.citation,
      });
      continue;
    }

    // Check substring
    const substringParent = deduplicated.find(accepted =>
      isSubstringOf(cite.citation, accepted.citation)
    );
    if (substringParent) {
      removed.push({
        citation: cite.citation,
        reason: 'SUBSTRING_OF_LONGER_CITATION',
        subsumedBy: substringParent.citation,
      });
      continue;
    }

    // Check exact duplicate (normalized)
    const exactDup = deduplicated.find(accepted =>
      accepted.citation.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedCite
    );
    if (exactDup) {
      removed.push({
        citation: cite.citation,
        reason: 'EXACT_DUPLICATE',
        subsumedBy: exactDup.citation,
      });
      continue;
    }

    deduplicated.push(cite);
  }

  return { deduplicated, removed };
}
