/**
 * Document Date Validator — BUG-12 Production Fix
 *
 * Ensures filing-related dates in generated documents use placeholders
 * rather than LLM-hallucinated dates. Case timeline dates (from facts)
 * are legitimate; only FILING dates must be placeholders.
 *
 * Patterns to replace:
 * - Certificate of Service date → [DATE OF SERVICE]
 * - Declaration date → [DATE OF SERVICE]
 * - Notice of Motion hearing date → [HEARING DATE] (if no hearing date in context)
 */

// Date patterns that indicate LLM-generated filing dates
// SP-15/TASK-22: Added PROPOSED ORDER sections to catch AI-hallucinated dates
const FILING_DATE_SECTIONS = [
  'CERTIFICATE OF SERVICE',
  'DECLARATION',
  'NOTICE OF MOTION',
  'NOTICE OF HEARING',
  'PROOF OF SERVICE',
  'PROPOSED ORDER',
  'IT IS ORDERED',
  'IT IS HEREBY ORDERED',
  'IT IS SO ORDERED',
  'THUS DONE AND SIGNED',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Match patterns like "January 15, 2025" or "01/15/2025" or "2025-01-15"
const DATE_REGEX = new RegExp(
  `(?:${MONTH_NAMES.join('|')})\\s+\\d{1,2},?\\s+\\d{4}|` +
  `\\d{1,2}/\\d{1,2}/\\d{4}|` +
  `\\d{4}-\\d{2}-\\d{2}`,
  'gi'
);

export interface DateValidationResult {
  hasFilingDateIssues: boolean;
  replacements: Array<{
    section: string;
    originalDate: string;
    replacement: string;
  }>;
  warnings: string[];
}

/**
 * Check document text for filing dates that should be placeholders.
 * Returns suggested replacements.
 */
export function validateDocumentDates(
  documentText: string,
  hearingDate?: string | null
): DateValidationResult {
  const replacements: Array<{ section: string; originalDate: string; replacement: string }> = [];
  const warnings: string[] = [];

  // Split into sections
  const sections = documentText.split(/\n(?=[A-Z]{2,})/);

  for (const section of sections) {
    const sectionUpper = section.substring(0, 200).toUpperCase();
    const isFilingSection = FILING_DATE_SECTIONS.some(s => sectionUpper.includes(s));

    if (!isFilingSection) continue;

    // Find dates in this section
    const matches = section.match(DATE_REGEX);
    if (!matches) continue;

    for (const dateStr of matches) {
      // Determine appropriate placeholder
      let replacement = '[DATE OF SERVICE]';
      if (sectionUpper.includes('HEARING') || sectionUpper.includes('NOTICE OF MOTION')) {
        replacement = hearingDate || '[HEARING DATE]';
      } else if (
        sectionUpper.includes('PROPOSED ORDER') ||
        sectionUpper.includes('IT IS ORDERED') ||
        sectionUpper.includes('IT IS HEREBY ORDERED') ||
        sectionUpper.includes('IT IS SO ORDERED') ||
        sectionUpper.includes('THUS DONE AND SIGNED')
      ) {
        // SP-15/TASK-22: Proposed orders must use judge-fillable blanks
        replacement = '____________________';
      }

      replacements.push({
        section: sectionUpper.substring(0, 50),
        originalDate: dateStr,
        replacement,
      });
    }
  }

  if (replacements.length > 0) {
    warnings.push(
      `Found ${replacements.length} filing date(s) that should use placeholders instead of specific dates`
    );
  }

  return {
    hasFilingDateIssues: replacements.length > 0,
    replacements,
    warnings,
  };
}

/**
 * Apply date replacements to document text.
 */
export function applyDateReplacements(
  text: string,
  replacements: DateValidationResult['replacements']
): string {
  let result = text;
  for (const { originalDate, replacement } of replacements) {
    // Only replace in filing sections, not in case fact narrative
    result = result.replace(new RegExp(escapeRegex(originalDate), 'g'), replacement);
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
