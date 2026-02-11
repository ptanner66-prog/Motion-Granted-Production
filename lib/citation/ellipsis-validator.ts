/**
 * Ellipsis Validator
 *
 * CV-109: Validates that ellipses in quoted legal text are used properly.
 *
 * Legal citation rules for ellipses (Bluebook Rule 5.3):
 * 1. Ellipsis (...) indicates omission of words within a sentence
 * 2. Four dots (. . . .) indicate omission at the end of a sentence or between sentences
 * 3. Omissions must not change the meaning of the quoted text
 * 4. Material alterations must be indicated with brackets [...]
 *
 * This validator checks:
 * - Ellipsis usage is syntactically correct
 * - Omitted material doesn't change the meaning (when source text is available)
 * - Warns on excessive ellipsis usage (may indicate cherry-picking)
 */

export interface EllipsisValidationResult {
  valid: boolean;
  issues: EllipsisIssue[];
  ellipsisCount: number;
  quotedTextLength: number;
  omissionRatio: number;
}

export interface EllipsisIssue {
  type: 'SYNTAX_ERROR' | 'MEANING_CHANGE' | 'EXCESSIVE_OMISSION' | 'MISSING_BRACKETS' | 'IMPROPER_FOUR_DOT';
  severity: 'ERROR' | 'WARNING';
  position: number;
  context: string;
  suggestion: string;
}

// Regex patterns for ellipsis forms
const THREE_DOT_ELLIPSIS = /\.{3}|\.\s\.\s\./g;
const FOUR_DOT_ELLIPSIS = /\.{4}|\.\s\.\s\.\s\./g;
const BRACKET_ELLIPSIS = /\[\.{3}\]|\[\.\s\.\s\.\]/g;

// Max acceptable omission ratio (more than 40% omitted = excessive)
const EXCESSIVE_OMISSION_THRESHOLD = 0.40;

/**
 * Validate ellipsis usage in a quoted text.
 *
 * @param quotedText - The quoted text as it appears in the draft
 * @param sourceText - The original source text (optional, enables meaning-change detection)
 * @returns Validation result with any issues found
 */
export function validateEllipsis(
  quotedText: string,
  sourceText?: string
): EllipsisValidationResult {
  const issues: EllipsisIssue[] = [];

  // Count ellipsis instances
  const threeDotsMatches = quotedText.match(THREE_DOT_ELLIPSIS) || [];
  const fourDotsMatches = quotedText.match(FOUR_DOT_ELLIPSIS) || [];
  const bracketMatches = quotedText.match(BRACKET_ELLIPSIS) || [];
  const ellipsisCount = threeDotsMatches.length + fourDotsMatches.length + bracketMatches.length;

  // No ellipses — nothing to validate
  if (ellipsisCount === 0) {
    return {
      valid: true,
      issues: [],
      ellipsisCount: 0,
      quotedTextLength: quotedText.length,
      omissionRatio: 0,
    };
  }

  // Check 1: Syntax validation
  checkEllipsisSyntax(quotedText, issues);

  // Check 2: Four-dot usage (should only appear at sentence boundaries)
  checkFourDotUsage(quotedText, issues);

  // Check 3: Excessive omission
  if (sourceText) {
    const omissionRatio = estimateOmissionRatio(quotedText, sourceText);
    if (omissionRatio > EXCESSIVE_OMISSION_THRESHOLD) {
      issues.push({
        type: 'EXCESSIVE_OMISSION',
        severity: 'WARNING',
        position: 0,
        context: `Approximately ${Math.round(omissionRatio * 100)}% of the source text has been omitted`,
        suggestion:
          'Extensive ellipsis usage may suggest cherry-picking. Consider whether a shorter, complete quotation ' +
          'would be more persuasive, or paraphrase with citation instead.',
      });
    }
  }

  // Check 4: Meaning change detection (when source is available)
  if (sourceText) {
    checkMeaningPreservation(quotedText, sourceText, issues);
  }

  return {
    valid: issues.filter(i => i.severity === 'ERROR').length === 0,
    issues,
    ellipsisCount,
    quotedTextLength: quotedText.length,
    omissionRatio: sourceText ? estimateOmissionRatio(quotedText, sourceText) : 0,
  };
}

/**
 * Check ellipsis syntax correctness.
 */
function checkEllipsisSyntax(text: string, issues: EllipsisIssue[]): void {
  // Check for malformed ellipses (e.g., two dots, five dots)
  const malformedPattern = /(?<!\.)\.{2}(?!\.)|\.{5,}/g;
  let match;

  while ((match = malformedPattern.exec(text)) !== null) {
    issues.push({
      type: 'SYNTAX_ERROR',
      severity: 'ERROR',
      position: match.index,
      context: getContextAround(text, match.index),
      suggestion: 'Use three dots (...) for mid-sentence omission or four dots (....) for sentence-boundary omission.',
    });
  }

  // Check for ellipsis at the very start of a quote (usually wrong)
  if (/^\s*\.{3,4}/.test(text)) {
    issues.push({
      type: 'SYNTAX_ERROR',
      severity: 'WARNING',
      position: 0,
      context: text.slice(0, 50),
      suggestion:
        'Ellipsis at the beginning of a quotation is generally unnecessary if it is clear the quote ' +
        'begins mid-sentence. Per Bluebook Rule 5.3, initial ellipsis can be omitted when the context makes the omission clear.',
    });
  }
}

/**
 * Check that four-dot ellipses are used only at sentence boundaries.
 */
function checkFourDotUsage(text: string, issues: EllipsisIssue[]): void {
  // Four dots should appear only where a period + ellipsis (sentence end + omission) occurs
  const fourDotPattern = /\.{4}|\.\s\.\s\.\s\./g;
  let match;

  while ((match = fourDotPattern.exec(text)) !== null) {
    const beforeEllipsis = text.slice(0, match.index).trim();

    // The text before a four-dot ellipsis should end a complete thought
    // Simple heuristic: should follow a word (not punctuation like comma or semicolon)
    if (beforeEllipsis.length > 0) {
      const lastChar = beforeEllipsis.slice(-1);
      if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
        issues.push({
          type: 'IMPROPER_FOUR_DOT',
          severity: 'WARNING',
          position: match.index,
          context: getContextAround(text, match.index),
          suggestion:
            'Four-dot ellipsis indicates omission at a sentence boundary. ' +
            'Use three-dot ellipsis (...) for mid-sentence omissions.',
        });
      }
    }
  }
}

/**
 * Estimate how much of the source text was omitted in the quote.
 */
function estimateOmissionRatio(quotedText: string, sourceText: string): number {
  // Remove ellipses from quoted text to get the actual quoted content
  const strippedQuote = quotedText
    .replace(/\.{3,4}/g, '')
    .replace(/\[\.\s*\.\s*\.\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const sourceLength = sourceText.replace(/\s+/g, ' ').trim().length;
  const quotedLength = strippedQuote.length;

  if (sourceLength === 0) return 0;

  return Math.max(0, 1 - (quotedLength / sourceLength));
}

/**
 * Check if ellipsis omissions might change the meaning.
 * Uses simple heuristic: checks if negation words or key qualifiers were omitted.
 */
function checkMeaningPreservation(
  quotedText: string,
  sourceText: string,
  issues: EllipsisIssue[]
): void {
  // Extract the segments around each ellipsis
  const segments = quotedText.split(/\.{3,4}|\[\.\s*\.\s*\.\]/);

  if (segments.length < 2) return;

  // Find what was omitted between each pair of segments
  const normalizedSource = sourceText.toLowerCase();

  // Critical words that, if omitted, likely change meaning
  const criticalWords = ['not', 'no', 'never', 'unless', 'except', 'however', 'but', 'only', 'merely', 'limited'];

  for (let i = 0; i < segments.length - 1; i++) {
    const before = segments[i].trim().toLowerCase();
    const after = segments[i + 1].trim().toLowerCase();

    if (!before || !after) continue;

    // Find the omitted section in source
    const beforeIdx = normalizedSource.indexOf(before.slice(-30));
    const afterIdx = normalizedSource.indexOf(after.slice(0, 30), beforeIdx + 1);

    if (beforeIdx === -1 || afterIdx === -1) continue;

    const omittedSection = normalizedSource.slice(
      beforeIdx + before.slice(-30).length,
      afterIdx
    );

    // Check if any critical words are in the omitted section
    for (const word of criticalWords) {
      const wordPattern = new RegExp(`\\b${word}\\b`);
      if (wordPattern.test(omittedSection)) {
        const ellipsisPos = quotedText.indexOf(segments[i]) + segments[i].length;
        issues.push({
          type: 'MEANING_CHANGE',
          severity: 'ERROR',
          position: ellipsisPos,
          context: `Omitted text contains "${word}": "...${omittedSection.trim().slice(0, 80)}..."`,
          suggestion:
            `The word "${word}" was omitted, which may change the meaning of the quoted passage. ` +
            'Review the omission to ensure it does not misrepresent the source.',
        });
        break; // One issue per omission is enough
      }
    }
  }
}

/**
 * Get surrounding context for error reporting.
 */
function getContextAround(text: string, position: number, radius: number = 30): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}
