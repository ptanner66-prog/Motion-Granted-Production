/**
 * Citation Diff — Motion Granted
 *
 * SP-12 AJ-3: Detects new citations introduced during Phase VIII revision
 * by comparing pre-revision and post-revision citation sets.
 *
 * New citations must be verified in Phase VIII.5 fabrication audit
 * to prevent hallucinated citations from entering the final deliverable.
 */

// Simple citation patterns (matches common legal citation formats)
const CITATION_PATTERNS = [
  // Case citations: Smith v. Jones, 123 F.3d 456 (5th Cir. 2020)
  /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+,\s+\d+\s+\w+\.?\s*\d*[a-z]*\s+\d+/g,
  // Statutory: La. C.C.P. art. 123, 28 U.S.C. § 1332
  /\b\d+\s+[A-Z]\.\s*[A-Z]\.\s*(?:P\.\s*)?(?:art\.|§)\s*\d+/g,
  // Federal Reporter: 123 F.3d 456, 456 U.S. 789
  /\b\d+\s+(?:F\.\d[a-z]*|U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.)\s+\d+/g,
];

/**
 * Extract all citations from text using pattern matching.
 *
 * @param text - Document text to extract citations from
 * @returns Set of normalized citation strings
 */
export function extractCitations(text: string): Set<string> {
  const citations = new Set<string>();

  for (const pattern of CITATION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        citations.add(normalizeCitation(match));
      }
    }
  }

  return citations;
}

/**
 * Detect new citations introduced during Phase VIII revision.
 *
 * @param preRevisionText - Draft content before Phase VIII revision
 * @param postRevisionText - Draft content after Phase VIII revision
 * @returns Array of new citation strings not present in pre-revision text
 */
export function detectNewCitations(
  preRevisionText: string,
  postRevisionText: string
): string[] {
  const preCitations = extractCitations(preRevisionText);
  const postCitations = extractCitations(postRevisionText);

  const newCitations: string[] = [];
  for (const cit of postCitations) {
    if (!preCitations.has(cit)) {
      newCitations.push(cit);
    }
  }

  return newCitations;
}

/**
 * Normalize citation text for comparison.
 * Collapses whitespace and uppercases for consistent matching.
 */
function normalizeCitation(citation: string): string {
  return citation
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
