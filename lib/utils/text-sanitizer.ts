/**
 * Text Sanitizer — Motion Granted (SP20: XSS-001, XSS-002, XSS-003)
 *
 * Sanitizes user-provided text before it enters the document generation pipeline.
 * Prevents XSS in generated DOCX/XML documents and ensures clean rendering.
 *
 * Used by: lib/documents/*, lib/generators/*
 */

/**
 * Escape XML special characters for safe inclusion in DOCX/XML content.
 * The `docx` library handles escaping internally for TextRun values, but this
 * function is provided for any code path that constructs raw XML strings.
 */
export function escapeXml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip HTML tags from user input. Removes script and style blocks first,
 * then strips remaining tags.
 */
export function stripHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}

/**
 * Full sanitization pipeline for user-provided text going into documents.
 * Strips HTML, normalizes whitespace, and removes control characters.
 */
export function sanitizeForDocument(text: string): string {
  if (!text) return '';
  let sanitized = text;
  // Step 1: Strip any HTML tags (including script/style blocks)
  sanitized = stripHtmlTags(sanitized);
  // Step 2: Normalize whitespace (collapse multiple spaces, trim)
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  // Step 3: Remove control characters (keep newlines \x0A, carriage returns \x0D, and tabs \x09)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized;
}

/**
 * Sanitize party names. More restrictive than general text sanitization:
 * only allows letters, numbers, spaces, hyphens, apostrophes, periods,
 * commas, parentheses, and ampersands (for firm names like "Smith & Jones").
 */
export function sanitizePartyName(name: string): string {
  if (!name) return '';
  let sanitized = stripHtmlTags(name);
  // Allow only characters commonly found in legal party names
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-'.,()&]/g, '');
  return sanitized.trim();
}

/**
 * Sanitize an array of party names.
 */
export function sanitizePartyNames(names: string[]): string[] {
  return names.map(sanitizePartyName);
}

/**
 * Sanitize section content (headings and body text from AI-generated output).
 * Less aggressive than party names — preserves most punctuation and legal symbols.
 */
export function sanitizeSectionContent(text: string): string {
  if (!text) return '';
  let sanitized = stripHtmlTags(text);
  // Remove control characters but preserve newlines and tabs (used in formatting)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized;
}
