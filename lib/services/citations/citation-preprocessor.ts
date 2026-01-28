// /lib/services/citations/citation-preprocessor.ts
// Preprocesses text before citation extraction
// Task E-14 | Version 1.0 — January 28, 2026

/**
 * Unicode normalization patterns
 */
const UNICODE_REPLACEMENTS: [RegExp, string][] = [
  // Section symbols
  [/§/g, "§"], // Keep standard section symbol
  [/\u00A7/g, "§"], // Section sign
  [/\u2063/g, ""], // Invisible separator

  // Dashes and hyphens
  [/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-"], // Various dashes to hyphen
  [/\u2212/g, "-"], // Minus sign

  // Quotes
  [/[\u201C\u201D]/g, '"'], // Curly double quotes
  [/[\u2018\u2019]/g, "'"], // Curly single quotes
  [/[\u00AB\u00BB]/g, '"'], // Guillemets

  // Spaces
  [/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " "], // Various spaces to standard space

  // Periods
  [/\u2024/g, "."], // One dot leader

  // Parentheses
  [/\uFF08/g, "("], // Fullwidth left paren
  [/\uFF09/g, ")"], // Fullwidth right paren
];

/**
 * Slip opinion suffix patterns to remove
 */
const SLIP_OP_PATTERNS = [
  /,?\s*slip\s+op\.?\s*$/i,
  /,?\s*slip\s+opinion\s*$/i,
  /\s*\(slip\s+op\.?\)\s*$/i,
];

/**
 * Normalize text for citation extraction
 */
export function preprocessForCitations(text: string): string {
  let normalized = text;

  // 1. Apply Unicode normalizations
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // 2. Normalize multiple spaces
  normalized = normalized.replace(/\s{2,}/g, " ");

  // 3. Fix common OCR errors
  normalized = normalized
    .replace(/0([FSU]\.)/g, "O$1") // 0 → O before reporter abbreviations
    .replace(/l(\.\d)/g, "1$1") // lowercase L → 1 before decimal
    .replace(/\bl\b/g, "1") // standalone l → 1 (common in page numbers)
    .replace(/(\d)l(\d)/g, "$11$2"); // l between digits → 1

  // 4. Normalize citation spacing
  normalized = normalized
    .replace(/(\d)\s+([A-Z][a-z]*\.\s*\d)/g, "$1 $2") // Normalize "477 U.S. 317"
    .replace(/(\d)([A-Z][a-z]*\.)/g, "$1 $2") // Add space between number and reporter
    .replace(/([A-Z][a-z]*\.)(\d)/g, "$1 $2"); // Add space between reporter and page

  // 5. Remove slip opinion suffixes (they confuse Eyecite)
  for (const pattern of SLIP_OP_PATTERNS) {
    normalized = normalized.replace(pattern, "");
  }

  return normalized;
}

/**
 * Check if text likely contains citations
 */
export function likelyContainsCitations(text: string): boolean {
  // Quick heuristic checks
  const patterns = [
    /\d+\s+[A-Z][a-z]*\.\s*\d+/, // Reporter pattern: "477 U.S. 317"
    /\d+\s+[A-Z]\.\d[a-z]\s+\d+/, // Federal reporter: "123 F.3d 456"
    /[Vv]\.?\s/, // "v." or "v " suggesting case name
    /§\s*\d+/, // Section symbol
    /[Aa]rt\.\s*\d+/, // Article
    /[Ii]d\.\s+at/, // Id. at
    /[Ss]upra/, // Supra
    /La\.\s*R\.\s*S\./, // Louisiana Revised Statutes
    /Cal\.\s*[A-Z]/, // California codes
    /U\.\s*S\.\s*C\./, // U.S. Code
  ];

  return patterns.some((p) => p.test(text));
}

/**
 * Extract likely citation spans for pre-filtering
 */
export function findCitationCandidates(
  text: string
): Array<{ start: number; end: number; text: string }> {
  const candidates: Array<{ start: number; end: number; text: string }> = [];

  // Pattern for citation-like text (rough match)
  const roughPattern =
    /(?:[A-Z][a-zA-Z'.,-]+\s+v\.?\s+[A-Z][a-zA-Z'.,-]+,?\s*)?\d+\s+[A-Z][a-z]*\.?\s*\d*[a-z]*\s+\d+(?:\s*\([^)]+\))?/g;

  let match;
  while ((match = roughPattern.exec(text)) !== null) {
    candidates.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }

  return candidates;
}

/**
 * Clean HTML entities and tags from text
 */
export function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&sect;/g, "§")
    .replace(/<[^>]+>/g, ""); // Strip HTML tags
}

/**
 * Full preprocessing pipeline
 */
export function fullPreprocess(text: string): string {
  let processed = text;

  // 1. Clean HTML entities
  processed = cleanHtmlEntities(processed);

  // 2. Apply citation-specific preprocessing
  processed = preprocessForCitations(processed);

  return processed;
}
