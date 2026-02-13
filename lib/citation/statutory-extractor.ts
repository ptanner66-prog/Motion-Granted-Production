/**
 * Statutory Citation Extractor — BUG-08 Production Fix
 *
 * Extracts statutory citations (La. C.C.P., U.S.C., Cal. Code, etc.)
 * from motion text. These operate on a SEPARATE pipeline from case law
 * citations (Eyecite-extracted).
 *
 * SCOPE: Extraction + count ONLY for v1.
 * Verification against legislative databases is a FUTURE ENHANCEMENT.
 *
 * PIPELINE SEPARATION: Statutes MUST NOT go through case law dedup logic.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StatutoryCitation {
  raw: string;            // Full matched text
  jurisdiction: 'LA' | 'CA' | 'FEDERAL' | 'OTHER';
  type: string;           // e.g., "La. C.C.P.", "U.S.C.", "Cal. Civ. Proc."
  article?: string;       // Article or section number
  verified: boolean;      // Always false for v1 (no legislative DB verification)
}

export interface StatutoryExtractionResult {
  citations: StatutoryCitation[];
  count: number;
  byJurisdiction: Record<string, number>;
  byType: Record<string, StatutoryCitation[]>;
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Louisiana statutory patterns
 */
const LA_PATTERNS: Array<{ regex: RegExp; type: string }> = [
  // La. C.C.P. Art. XXXX (Code of Civil Procedure)
  {
    regex: /(?:La\.?\s*C\.?\s*C\.?\s*P\.?\s*(?:Art(?:icle)?\.?\s*)?|Louisiana\s+Code\s+of\s+Civil\s+Procedure\s+(?:Art(?:icle)?\.?\s*)?|CCP\s+(?:art\.?\s*)?)(\d+(?:\.\d+)?)/gi,
    type: 'La. C.C.P.',
  },
  // La. R.S. XX:XXXX (Revised Statutes)
  {
    regex: /(?:La\.?\s*R\.?\s*S\.?\s*|Louisiana\s+Revised\s+Statut(?:es|e)\s+)(\d+:\d+(?:\.\d+)?)/gi,
    type: 'La. R.S.',
  },
  // La. C.C. Art. XXXX (Civil Code)
  {
    regex: /(?:La\.?\s*C\.?\s*C\.?\s*(?:Art(?:icle)?\.?\s*)?|Louisiana\s+Civil\s+Code\s+(?:Art(?:icle)?\.?\s*)?)(\d+(?:\.\d+)?)/gi,
    type: 'La. C.C.',
  },
  // La. C.E. Art. XXXX (Code of Evidence)
  {
    regex: /(?:La\.?\s*C\.?\s*E\.?\s*(?:Art(?:icle)?\.?\s*)?|Louisiana\s+Code\s+of\s+Evidence\s+(?:Art(?:icle)?\.?\s*)?)(\d+(?:\.\d+)?)/gi,
    type: 'La. C.E.',
  },
];

/**
 * California statutory patterns
 */
const CA_PATTERNS: Array<{ regex: RegExp; type: string }> = [
  // Cal. Code Civ. Proc. § XXXX
  {
    regex: /(?:Cal\.?\s*(?:Code\s+)?Civ\.?\s*Proc\.?\s*(?:§|Section|Sec\.?)?\s*|C\.?\s*C\.?\s*P\.?\s*(?:§|Section|Sec\.?)?\s*)(\d+(?:\.\d+)?)/gi,
    type: 'Cal. Civ. Proc.',
  },
  // Cal. Evid. Code § XXXX
  {
    regex: /(?:Cal\.?\s*Evid\.?\s*Code\s*(?:§|Section|Sec\.?)?\s*)(\d+(?:\.\d+)?)/gi,
    type: 'Cal. Evid. Code',
  },
  // Cal. Gov. Code § XXXX
  {
    regex: /(?:Cal\.?\s*Gov(?:ernment)?\.?\s*Code\s*(?:§|Section|Sec\.?)?\s*)(\d+(?:\.\d+)?)/gi,
    type: 'Cal. Gov. Code',
  },
  // Cal. Fam. Code § XXXX
  {
    regex: /(?:Cal\.?\s*Fam(?:ily)?\.?\s*Code\s*(?:§|Section|Sec\.?)?\s*)(\d+(?:\.\d+)?)/gi,
    type: 'Cal. Fam. Code',
  },
];

/**
 * Federal statutory patterns
 */
const FEDERAL_PATTERNS: Array<{ regex: RegExp; type: string }> = [
  // XX U.S.C. § XXXX
  {
    regex: /(\d+)\s*U\.?\s*S\.?\s*C\.?\s*(?:§|Section|Sec\.?)?\s*(\d+(?:[a-z])?(?:\(\w+\))*)/gi,
    type: 'U.S.C.',
  },
  // XX C.F.R. § XXXX
  {
    regex: /(\d+)\s*C\.?\s*F\.?\s*R\.?\s*(?:§|Section|Sec\.?)?\s*(\d+(?:\.\d+)?)/gi,
    type: 'C.F.R.',
  },
  // Fed. R. Civ. P. XX
  {
    regex: /(?:Fed\.?\s*R\.?\s*Civ\.?\s*P\.?\s*|Federal\s+Rule(?:s)?\s+of\s+Civil\s+Procedure\s+(?:Rule\s+)?)(\d+(?:\([a-z]\))?)/gi,
    type: 'Fed. R. Civ. P.',
  },
  // Fed. R. Evid. XXX
  {
    regex: /(?:Fed\.?\s*R\.?\s*Evid\.?\s*|Federal\s+Rule(?:s)?\s+of\s+Evidence\s+(?:Rule\s+)?)(\d+)/gi,
    type: 'Fed. R. Evid.',
  },
];

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract all statutory citations from text.
 *
 * @param text - Motion body text
 * @returns StatutoryExtractionResult with all found statutes
 */
export function extractStatutoryCitations(text: string): StatutoryExtractionResult {
  const citations: StatutoryCitation[] = [];
  const seen = new Set<string>(); // Dedup by normalized key

  function addCitations(
    patterns: Array<{ regex: RegExp; type: string }>,
    jurisdiction: StatutoryCitation['jurisdiction']
  ) {
    for (const { regex, type } of patterns) {
      // Reset regex state
      const re = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;

      while ((match = re.exec(text)) !== null) {
        const raw = match[0].trim();
        const article = match[1] || (match[2] ? `${match[1]}:${match[2]}` : undefined);

        // Deduplicate by type + article number
        const key = `${type}:${article || raw}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        citations.push({
          raw,
          jurisdiction,
          type,
          article,
          verified: false,
        });
      }
    }
  }

  // Extract from each jurisdiction
  addCitations(LA_PATTERNS, 'LA');
  addCitations(CA_PATTERNS, 'CA');
  addCitations(FEDERAL_PATTERNS, 'FEDERAL');

  // Build summary
  const byJurisdiction: Record<string, number> = {};
  const byType: Record<string, StatutoryCitation[]> = {};

  for (const citation of citations) {
    byJurisdiction[citation.jurisdiction] = (byJurisdiction[citation.jurisdiction] || 0) + 1;
    if (!byType[citation.type]) byType[citation.type] = [];
    byType[citation.type].push(citation);
  }

  return {
    citations,
    count: citations.length,
    byJurisdiction,
    byType,
  };
}
