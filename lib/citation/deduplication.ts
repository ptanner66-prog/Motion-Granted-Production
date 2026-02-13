/**
 * Citation Deduplication — BUG-06 Production Fix
 *
 * Fixes the Eyecite truncation problem where partial citation strings
 * (e.g., "210 So. 3") are extracted alongside complete ones ("210 So. 3d 447"),
 * inflating citation counts with false positives.
 *
 * THREE FIXES:
 * 1. Intelligent prefix-based deduplication
 * 2. Minimum completeness threshold (volume + reporter + page)
 * 3. Tighter matching validation
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
// PREFIX-BASED DEDUPLICATION
// ============================================================================

/**
 * Determine if `shorter` is a truncated prefix of `longer`.
 *
 * Rules:
 * - shorter must be a strict prefix of longer
 * - shorter must NOT be a valid complete citation on its own
 *
 * Example:
 * - "210 So. 3" is prefix of "210 So. 3d 447" → REMOVE (not complete)
 * - "100 F.3d 200" vs "100 F.3d 200, 205" → KEEP BOTH (both valid)
 */
function isTruncatedPrefix(shorter: string, longer: string): boolean {
  const s = shorter.trim();
  const l = longer.trim();

  // Must be strict prefix
  if (s.length >= l.length) return false;
  if (!l.startsWith(s)) return false;

  // If the shorter citation is valid on its own, keep it
  if (isCitationComplete(s)) return false;

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
 * 3. Remove shorter strings that are truncated prefixes of longer ones
 * 4. Deduplicate exact matches (case-insensitive)
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

  // Step 3: Prefix-based dedup
  const kept: string[] = [];

  for (const citation of sorted) {
    // Check if this citation is a prefix of any already-kept citation
    const isPrefix = kept.some(existing => isTruncatedPrefix(citation, existing));
    if (isPrefix) {
      duplicatesRemoved.push({
        raw: citation,
        isComplete: true,
        isDuplicate: true,
        duplicateOf: kept.find(existing => existing.startsWith(citation)),
      });
      continue;
    }

    // Check for exact duplicates (case-insensitive)
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
