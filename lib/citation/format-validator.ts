/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Citation Format Validator (Task 33)
 *
 * Citation Format Rules - Decisions 2-3 from Stress Testing
 *
 * Decision 2: NO short-form citations. Always use full Bluebook format.
 * Decision 3: NO "Id." citations. Full citation required every time.
 * Note: Pinpoint pages NOT required unless claiming specific page reference.
 *
 * Source: Chunk 5, Task 33 - Binding Citation Decisions
 */

// ============================================================================
// TYPES
// ============================================================================

export type FormatViolation =
  | 'SHORT_FORM'
  | 'ID_CITATION'
  | 'IBID_CITATION'
  | 'SUPRA_CITATION'
  | 'INFRA_CITATION'
  | 'MISSING_REPORTER'
  | 'MISSING_VOLUME'
  | 'MISSING_PAGE'
  | 'MISSING_YEAR'
  | 'MISSING_COURT'
  | 'INVALID_YEAR_FORMAT'
  | 'INVALID_VOLUME_FORMAT'
  | 'INVALID_PAGE_FORMAT';

export interface FormatValidationResult {
  isValid: boolean;
  violations: FormatViolation[];
  suggestions: string[];
  originalCitation: string;
  normalizedCitation?: string;
}

export interface CitationComponents {
  caseName?: string;
  volume?: string;
  reporter?: string;
  page?: string;
  pinpoint?: string;
  court?: string;
  year?: string;
  hasFullFormat: boolean;
}

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

// Patterns for detecting short-form citations
const SHORT_FORM_PATTERNS = [
  /^\d+\s+\w+\.?\s+at\s+\d+/i, // "123 F.3d at 456"
  /^[A-Z][a-z]+,\s+\d+\s+\w+/i, // "Smith, 123 F.3d" (short case name)
  /^[A-Z][a-z]+\s+at\s+\d+/i, // "Smith at 456"
];

// Patterns for "Id." and similar citations
const ID_PATTERNS = [
  /^Id\.?\s*$/i, // "Id." or "Id"
  /^Id\.?\s+at\s+\d+/i, // "Id. at 456"
  /^Id\.?\s*,?\s*at\s+\d+/i, // "Id., at 456"
];

// Pattern for "Ibid." citations
const IBID_PATTERNS = [
  /^Ibid\.?\s*$/i, // "Ibid." or "Ibid"
  /^Ibid\.?\s+at\s+\d+/i, // "Ibid. at 456"
];

// Pattern for "Supra" citations
const SUPRA_PATTERNS = [
  /\bsupra\b/i, // Contains "supra"
  /supra\s+note\s+\d+/i, // "supra note 5"
  /supra\s+at\s+\d+/i, // "supra at 456"
];

// Pattern for "Infra" citations
const INFRA_PATTERNS = [
  /\binfra\b/i, // Contains "infra"
  /infra\s+note\s+\d+/i, // "infra note 5"
  /infra\s+at\s+\d+/i, // "infra at 456"
];

// Full Bluebook case citation pattern
// Format: Case Name, Volume Reporter Page (Court Year)
const FULL_CITATION_PATTERN =
  /^(.+?),\s*(\d+)\s+([A-Za-z0-9.\s]+?)\s+(\d+)(?:,\s*(\d+))?\s*\(([^)]+?\s+)?(\d{4})\)$/;

// Reporter abbreviation patterns
const REPORTER_PATTERNS = [
  // Federal
  /\bU\.?S\.?\b/i,
  /\bS\.?\s*Ct\.?\b/i,
  /\bL\.?\s*Ed\.?\s*2?d?\b/i,
  /\bF\.?\s*2?d?\b/i,
  /\bF\.?\s*3d\b/i,
  /\bF\.?\s*4th\b/i,
  /\bF\.?\s*Supp\.?\s*2?d?\s*3?d?\b/i,
  /\bFed\.?\s*Appx\.?\b/i,
  // State
  /\bCal\.?\s*\d*[a-z]*\b/i,
  /\bCal\.?\s*Rptr\.?\s*2?d?\s*3?d?\b/i,
  /\bN\.?Y\.?\s*\d*[a-z]*\b/i,
  /\bN\.?Y\.?S\.?\s*\d*[a-z]*\b/i,
  /\bN\.?E\.?\s*\d*[a-z]*\b/i,
  /\bN\.?W\.?\s*\d*[a-z]*\b/i,
  /\bS\.?E\.?\s*\d*[a-z]*\b/i,
  /\bS\.?W\.?\s*\d*[a-z]*\b/i,
  /\bP\.?\s*\d*[a-z]*\b/i,
  /\bA\.?\s*\d*[a-z]*\b/i,
  /\bSo\.?\s*\d*[a-z]*\b/i,
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate citation format against Bluebook rules
 * Enforces Decision 2 (no short forms) and Decision 3 (no Id.)
 */
export function validateCitationFormat(citation: string): FormatValidationResult {
  const violations: FormatViolation[] = [];
  const suggestions: string[] = [];
  const trimmedCitation = citation.trim();

  // Check for Id. citations (Decision 3)
  if (isIdCitation(trimmedCitation)) {
    violations.push('ID_CITATION');
    suggestions.push('Replace "Id." with full citation. Decision 3: Full citation required every time.');
  }

  // Check for Ibid. citations
  if (isIbidCitation(trimmedCitation)) {
    violations.push('IBID_CITATION');
    suggestions.push('Replace "Ibid." with full citation. Full citation required every time.');
  }

  // Check for Supra citations
  if (isSupraCitation(trimmedCitation)) {
    violations.push('SUPRA_CITATION');
    suggestions.push('Replace "supra" reference with full citation.');
  }

  // Check for Infra citations
  if (isInfraCitation(trimmedCitation)) {
    violations.push('INFRA_CITATION');
    suggestions.push('Replace "infra" reference with full citation.');
  }

  // Check for short-form citations (Decision 2)
  if (isShortFormCitation(trimmedCitation)) {
    violations.push('SHORT_FORM');
    suggestions.push('Replace short-form citation with full Bluebook format. Decision 2: Always use full format.');
  }

  // If we already found violations for short forms or Id, skip component validation
  if (violations.length === 0) {
    // Validate citation components
    const componentViolations = validateCitationComponents(trimmedCitation);
    violations.push(...componentViolations.violations);
    suggestions.push(...componentViolations.suggestions);
  }

  return {
    isValid: violations.length === 0,
    violations,
    suggestions,
    originalCitation: citation,
    normalizedCitation: violations.length === 0 ? normalizeCitation(trimmedCitation) : undefined,
  };
}

/**
 * Check if citation is an Id. citation
 */
function isIdCitation(citation: string): boolean {
  return ID_PATTERNS.some(pattern => pattern.test(citation));
}

/**
 * Check if citation is an Ibid. citation
 */
function isIbidCitation(citation: string): boolean {
  return IBID_PATTERNS.some(pattern => pattern.test(citation));
}

/**
 * Check if citation contains supra reference
 */
function isSupraCitation(citation: string): boolean {
  return SUPRA_PATTERNS.some(pattern => pattern.test(citation));
}

/**
 * Check if citation contains infra reference
 */
function isInfraCitation(citation: string): boolean {
  return INFRA_PATTERNS.some(pattern => pattern.test(citation));
}

/**
 * Check if citation is a short-form citation
 */
function isShortFormCitation(citation: string): boolean {
  // First check explicit short-form patterns
  if (SHORT_FORM_PATTERNS.some(pattern => pattern.test(citation))) {
    return true;
  }

  // Check if it's missing case name "v."
  const hasVersus = /\s+v\.\s+/i.test(citation) || /^In\s+re\s+/i.test(citation);
  const hasReporter = REPORTER_PATTERNS.some(pattern => pattern.test(citation));
  const hasYear = /\(\d{4}\)/.test(citation);

  // If it has reporter but no "v." and no year, it's likely short form
  if (hasReporter && !hasVersus && !hasYear) {
    return true;
  }

  // Check for "at" without full citation context
  if (/\bat\s+\d+/.test(citation) && !hasYear) {
    return true;
  }

  return false;
}

/**
 * Validate individual citation components
 */
function validateCitationComponents(citation: string): {
  violations: FormatViolation[];
  suggestions: string[];
} {
  const violations: FormatViolation[] = [];
  const suggestions: string[] = [];

  // Extract components
  const components = extractCitationComponents(citation);

  // Check for missing volume
  if (!components.volume && !isStatutoryCitation(citation)) {
    violations.push('MISSING_VOLUME');
    suggestions.push('Add volume number before reporter.');
  }

  // Check for missing reporter
  if (!components.reporter && !isStatutoryCitation(citation)) {
    violations.push('MISSING_REPORTER');
    suggestions.push('Add reporter abbreviation (e.g., F.3d, U.S., Cal.Rptr.).');
  }

  // Check for missing page
  if (!components.page && !isStatutoryCitation(citation)) {
    violations.push('MISSING_PAGE');
    suggestions.push('Add starting page number after reporter.');
  }

  // Check for missing year
  if (!components.year) {
    violations.push('MISSING_YEAR');
    suggestions.push('Add year in parentheses at end of citation.');
  }

  // Validate year format
  if (components.year && !isValidYear(components.year)) {
    violations.push('INVALID_YEAR_FORMAT');
    suggestions.push('Year must be 4 digits (e.g., 2023).');
  }

  // Validate volume format
  if (components.volume && !isValidVolume(components.volume)) {
    violations.push('INVALID_VOLUME_FORMAT');
    suggestions.push('Volume must be a number.');
  }

  return { violations, suggestions };
}

/**
 * Extract components from a citation string
 */
export function extractCitationComponents(citation: string): CitationComponents {
  const components: CitationComponents = {
    hasFullFormat: false,
  };

  // Try to match full Bluebook format
  const fullMatch = citation.match(FULL_CITATION_PATTERN);
  if (fullMatch) {
    components.caseName = fullMatch[1].trim();
    components.volume = fullMatch[2];
    components.reporter = fullMatch[3].trim();
    components.page = fullMatch[4];
    components.pinpoint = fullMatch[5];
    components.court = fullMatch[6]?.trim();
    components.year = fullMatch[7];
    components.hasFullFormat = true;
    return components;
  }

  // Extract individual components with fallback patterns
  // Volume
  const volumeMatch = citation.match(/\b(\d+)\s+[A-Z]/);
  if (volumeMatch) {
    components.volume = volumeMatch[1];
  }

  // Reporter
  for (const pattern of REPORTER_PATTERNS) {
    const reporterMatch = citation.match(pattern);
    if (reporterMatch) {
      components.reporter = reporterMatch[0];
      break;
    }
  }

  // Page (number after reporter)
  const pageMatch = citation.match(/[A-Za-z.]+\s+(\d+)/);
  if (pageMatch && components.reporter) {
    // Find page number after reporter
    const reporterIndex = citation.indexOf(components.reporter);
    const afterReporter = citation.slice(reporterIndex + components.reporter.length);
    const pageAfterReporter = afterReporter.match(/^\s*(\d+)/);
    if (pageAfterReporter) {
      components.page = pageAfterReporter[1];
    }
  }

  // Year
  const yearMatch = citation.match(/\(([^)]*?)(\d{4})\)/);
  if (yearMatch) {
    components.court = yearMatch[1].trim() || undefined;
    components.year = yearMatch[2];
  }

  // Case name
  const caseNameMatch = citation.match(/^(.+?),\s*\d/);
  if (caseNameMatch) {
    components.caseName = caseNameMatch[1].trim();
  }

  return components;
}

/**
 * Check if citation is statutory (different validation rules)
 */
function isStatutoryCitation(citation: string): boolean {
  const statutoryPatterns = [
    /\bU\.?S\.?C\.?\b/i, // U.S.C.
    /\bC\.?F\.?R\.?\b/i, // C.F.R.
    /\bStat\.?\b/i, // Stat.
    /\b§\s*\d+/i, // Section symbol
    /\bPub\.?\s*L\.?\b/i, // Pub. L.
    /\bCal\.?\s*[A-Z][a-z]+\.?\s*Code\b/i, // Cal. Civ. Code, etc.
    /\bFed\.?\s*R\.?\s*(Civ|Crim|App|Evid)\.?\s*P\.?\b/i, // Federal Rules
  ];

  return statutoryPatterns.some(pattern => pattern.test(citation));
}

/**
 * Validate year is reasonable
 */
function isValidYear(year: string): boolean {
  const yearNum = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  return yearNum >= 1776 && yearNum <= currentYear;
}

/**
 * Validate volume is a number
 */
function isValidVolume(volume: string): boolean {
  return /^\d+$/.test(volume);
}

/**
 * Normalize citation to standard format
 */
function normalizeCitation(citation: string): string {
  return citation
    .replace(/\s+/g, ' ')
    .replace(/,\s+/g, ', ')
    .replace(/\.\s+/g, '. ')
    .trim();
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate multiple citations at once
 */
export function batchValidateCitations(
  citations: string[]
): Map<string, FormatValidationResult> {
  const results = new Map<string, FormatValidationResult>();

  for (const citation of citations) {
    results.set(citation, validateCitationFormat(citation));
  }

  return results;
}

/**
 * Filter out invalid citations from a list
 */
export function filterValidCitations(
  citations: string[]
): { valid: string[]; invalid: Array<{ citation: string; result: FormatValidationResult }> } {
  const valid: string[] = [];
  const invalid: Array<{ citation: string; result: FormatValidationResult }> = [];

  for (const citation of citations) {
    const result = validateCitationFormat(citation);
    if (result.isValid) {
      valid.push(citation);
    } else {
      invalid.push({ citation, result });
    }
  }

  return { valid, invalid };
}

// ============================================================================
// SUGGESTION GENERATION
// ============================================================================

/**
 * Generate a corrected citation suggestion
 */
export function suggestCorrection(
  citation: string,
  components: CitationComponents
): string | null {
  if (components.hasFullFormat) {
    return null; // Already correct format
  }

  // Cannot generate suggestion without case name
  if (!components.caseName) {
    return null;
  }

  // Build suggested citation
  const parts: string[] = [components.caseName];

  if (components.volume && components.reporter && components.page) {
    parts.push(`, ${components.volume} ${components.reporter} ${components.page}`);
  }

  if (components.pinpoint) {
    parts.push(`, ${components.pinpoint}`);
  }

  if (components.year) {
    const courtPart = components.court ? `${components.court} ` : '';
    parts.push(` (${courtPart}${components.year})`);
  }

  return parts.join('');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateCitationFormat,
  extractCitationComponents,
  batchValidateCitations,
  filterValidCitations,
  suggestCorrection,
  isStatutoryCitation,
};
