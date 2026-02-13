/**
 * @deprecated LEGACY PATH B — Use lib/civ/ (Path A) instead.
 * This file is retained for reference only. Do not import in new code.
 * See CIV Pipeline Master Plan, Part 11: Dual Code Path Audit.
 *
 * Step 4: Quote Verification with Fuzzy Matching
 *
 * CIV Spec Section 7
 *
 * TRIGGER: Only runs if motion contains direct quote from citation.
 *
 * Uses Levenshtein distance for fuzzy matching:
 * - ≥95% similarity = EXACT_MATCH (proceed)
 * - 90-94% = CLOSE_MATCH (auto-correct the quote)
 * - 80-89% = PARTIAL_MATCH (FLAG for review or auto-paraphrase)
 * - <80% = NOT_FOUND (remove quote or find alternative)
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export type QuoteMatchResult = 'EXACT_MATCH' | 'CLOSE_MATCH' | 'PARTIAL_MATCH' | 'NOT_FOUND';

export type QuoteAction = 'PROCEED' | 'AUTO_CORRECT' | 'FLAG' | 'REMOVE';

export interface Step4Result {
  result: QuoteMatchResult;
  similarity_score: number; // 0-100
  original_quote: string;
  matched_text: string | null;
  corrected_quote: string | null;
  action: QuoteAction;
  levenshtein_distance: number;
  match_location?: {
    start_index: number;
    end_index: number;
  };
  context_before?: string;
  context_after?: string;
  duration_ms: number;
  error?: string;
}

// ============================================================================
// SIMILARITY THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  EXACT_MATCH: 95,      // ≥95% = exact match
  CLOSE_MATCH: 90,      // 90-94% = close match (auto-correct)
  PARTIAL_MATCH: 80,    // 80-89% = partial match (flag)
  // <80% = not found
};

// ============================================================================
// LEVENSHTEIN DISTANCE
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Optimized with early termination for very different strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Early termination for empty strings
  if (m === 0) return n;
  if (n === 0) return m;

  // Create matrix
  const d: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize first column
  for (let i = 0; i <= m; i++) {
    d[i][0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

/**
 * Calculate similarity percentage (0-100) from Levenshtein distance
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  if (str1.length === 0 || str2.length === 0) return 0;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  const similarity = ((maxLength - distance) / maxLength) * 100;

  return Math.round(similarity * 100) / 100; // Round to 2 decimal places
}

// ============================================================================
// QUOTE NORMALIZATION
// ============================================================================

/**
 * Normalize quote for comparison
 * - Normalize whitespace
 * - Remove smart quotes, em-dashes
 * - Normalize punctuation
 */
export function normalizeQuote(quote: string): string {
  let normalized = quote;

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Convert smart quotes to straight quotes
  normalized = normalized.replace(/[""]/g, '"');
  normalized = normalized.replace(/['']/g, "'");

  // Convert em-dashes and en-dashes to hyphens
  normalized = normalized.replace(/[—–]/g, '-');

  // Normalize ellipses
  normalized = normalized.replace(/…/g, '...');
  normalized = normalized.replace(/\.\s*\.\s*\./g, '...');

  // Remove citation brackets like [sic], [emphasis added]
  normalized = normalized.replace(/\[[^\]]*\]/g, '');

  // Normalize case for comparison (keep original for display)
  normalized = normalized.toLowerCase();

  return normalized;
}

// ============================================================================
// QUOTE MATCHING
// ============================================================================

/**
 * Find the best match for a quote in the opinion text
 * Uses sliding window approach for efficiency
 */
export function findBestMatch(
  quote: string,
  opinionText: string,
  windowPadding: number = 50
): {
  bestMatch: string | null;
  similarity: number;
  distance: number;
  startIndex: number;
  endIndex: number;
} {
  const normalizedQuote = normalizeQuote(quote);
  const normalizedOpinion = normalizeQuote(opinionText);

  if (normalizedQuote.length === 0) {
    return { bestMatch: null, similarity: 0, distance: normalizedOpinion.length, startIndex: -1, endIndex: -1 };
  }

  // Try exact match first
  const exactIndex = normalizedOpinion.indexOf(normalizedQuote);
  if (exactIndex !== -1) {
    return {
      bestMatch: opinionText.slice(exactIndex, exactIndex + quote.length),
      similarity: 100,
      distance: 0,
      startIndex: exactIndex,
      endIndex: exactIndex + normalizedQuote.length,
    };
  }

  // Sliding window fuzzy match
  const windowSize = normalizedQuote.length;
  let bestMatch: string | null = null;
  let bestSimilarity = 0;
  let bestDistance = Infinity;
  let bestStartIndex = -1;

  // Allow window to be smaller or larger than quote
  const minWindow = Math.max(Math.floor(windowSize * 0.7), 10);
  const maxWindow = Math.min(Math.ceil(windowSize * 1.3), normalizedOpinion.length);

  for (let size = minWindow; size <= maxWindow; size += Math.ceil((maxWindow - minWindow) / 5) || 1) {
    for (let i = 0; i <= normalizedOpinion.length - size; i += Math.max(1, Math.floor(size / 10))) {
      const window = normalizedOpinion.slice(i, i + size);
      const similarity = calculateSimilarity(normalizedQuote, window);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestDistance = levenshteinDistance(normalizedQuote, window);
        bestStartIndex = i;
        bestMatch = opinionText.slice(i, i + size);
      }

      // Early exit if we find a good enough match
      if (similarity >= THRESHOLDS.EXACT_MATCH) {
        return {
          bestMatch: opinionText.slice(i, i + size),
          similarity,
          distance: levenshteinDistance(normalizedQuote, window),
          startIndex: i,
          endIndex: i + size,
        };
      }
    }
  }

  return {
    bestMatch,
    similarity: bestSimilarity,
    distance: bestDistance,
    startIndex: bestStartIndex,
    endIndex: bestStartIndex + (bestMatch?.length || 0),
  };
}

// ============================================================================
// QUOTE VERIFICATION
// ============================================================================

/**
 * Step 4: Verify a direct quote from a case
 *
 * @param quoteText - The quote as it appears in the motion
 * @param opinionText - The full opinion text to search
 * @param citationText - The citation for logging
 * @param orderId - Order ID for logging
 * @param options - Additional options
 */
export async function verifyQuote(
  quoteText: string,
  opinionText: string,
  citationText: string,
  orderId: string,
  options?: {
    logToDb?: boolean;
  }
): Promise<Step4Result> {
  const startTime = Date.now();

  const result: Step4Result = {
    result: 'NOT_FOUND',
    similarity_score: 0,
    original_quote: quoteText,
    matched_text: null,
    corrected_quote: null,
    action: 'REMOVE',
    levenshtein_distance: 0,
    duration_ms: 0,
  };

  try {
    // Skip empty quotes
    if (!quoteText.trim()) {
      result.error = 'Empty quote provided';
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Skip if opinion text is empty
    if (!opinionText.trim()) {
      result.error = 'Empty opinion text provided';
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // Find best match
    const match = findBestMatch(quoteText, opinionText);

    result.similarity_score = match.similarity;
    result.levenshtein_distance = match.distance;
    result.matched_text = match.bestMatch;

    if (match.startIndex >= 0) {
      result.match_location = {
        start_index: match.startIndex,
        end_index: match.endIndex,
      };

      // Get context
      const contextLength = 100;
      result.context_before = opinionText.slice(
        Math.max(0, match.startIndex - contextLength),
        match.startIndex
      ).trim();
      result.context_after = opinionText.slice(
        match.endIndex,
        Math.min(opinionText.length, match.endIndex + contextLength)
      ).trim();
    }

    // Determine result and action based on similarity
    if (match.similarity >= THRESHOLDS.EXACT_MATCH) {
      result.result = 'EXACT_MATCH';
      result.action = 'PROCEED';
      result.corrected_quote = null; // No correction needed
    } else if (match.similarity >= THRESHOLDS.CLOSE_MATCH) {
      result.result = 'CLOSE_MATCH';
      result.action = 'AUTO_CORRECT';
      result.corrected_quote = match.bestMatch; // Use the actual text from the opinion
    } else if (match.similarity >= THRESHOLDS.PARTIAL_MATCH) {
      result.result = 'PARTIAL_MATCH';
      result.action = 'FLAG';
      result.corrected_quote = match.bestMatch; // Suggest the matched text for review
    } else {
      result.result = 'NOT_FOUND';
      result.action = 'REMOVE';
      result.corrected_quote = null;
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.result = 'NOT_FOUND';
    result.action = 'FLAG'; // Flag errors for review rather than auto-remove

    console.error('[Step4] Quote verification error:', result.error);
  }

  result.duration_ms = Date.now() - startTime;

  // Log to database if requested
  if (options?.logToDb) {
    await logStep4Result(orderId, citationText, result);
  }

  console.log(`[Step4] Quote (${quoteText.slice(0, 30)}...): ${result.result} (${result.similarity_score}% match, ${result.duration_ms}ms)`);

  return result;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Verify multiple quotes from the same case
 */
export async function verifyQuotesBatch(
  quotes: Array<{
    quoteText: string;
    opinionText: string;
    citationText: string;
  }>,
  orderId: string,
  options?: {
    logToDb?: boolean;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, Step4Result>> {
  const results = new Map<string, Step4Result>();

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i];
    const result = await verifyQuote(
      quote.quoteText,
      quote.opinionText,
      quote.citationText,
      orderId,
      { logToDb: options?.logToDb }
    );

    results.set(quote.quoteText, result);

    if (options?.onProgress) {
      options.onProgress(i + 1, quotes.length);
    }
  }

  return results;
}

// ============================================================================
// QUOTE EXTRACTION
// ============================================================================

/**
 * Extract quoted text from a legal document
 * Looks for text within quotation marks with citations
 */
export function extractQuotesWithCitations(text: string): Array<{
  quote: string;
  citationContext: string;
  position: number;
}> {
  const quotes: Array<{ quote: string; citationContext: string; position: number }> = [];

  // Pattern for quoted text followed by citation-like patterns
  const quotePattern = /"([^"]+)"\s*(?:\([^)]+\)|[\d]+\s+[A-Z][a-z.]+\s+[\d]+)/g;

  let match;
  while ((match = quotePattern.exec(text)) !== null) {
    quotes.push({
      quote: match[1],
      citationContext: match[0],
      position: match.index,
    });
  }

  // Also look for block quotes (indented text with citations)
  const blockQuotePattern = /(?:^|\n)\s{4,}([^\n]+(?:\n\s{4,}[^\n]+)*)\s*(?:\([^)]+\)|[\d]+\s+[A-Z][a-z.]+\s+[\d]+)/gm;

  while ((match = blockQuotePattern.exec(text)) !== null) {
    quotes.push({
      quote: match[1].replace(/\n\s{4,}/g, ' ').trim(),
      citationContext: match[0].trim(),
      position: match.index,
    });
  }

  return quotes;
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logStep4Result(
  orderId: string,
  citationText: string,
  result: Step4Result
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('citation_verification_log').insert({
      order_id: orderId,
      citation_text: citationText,
      step_number: 4,
      step_name: 'quote_verification',
      status: result.result,
      action: result.action,
      confidence: result.similarity_score / 100,
      duration_ms: result.duration_ms,
      error_message: result.error,
      raw_response: {
        original_quote: result.original_quote,
        matched_text: result.matched_text,
        corrected_quote: result.corrected_quote,
        similarity_score: result.similarity_score,
        levenshtein_distance: result.levenshtein_distance,
        match_location: result.match_location,
        context_before: result.context_before?.slice(0, 200),
        context_after: result.context_after?.slice(0, 200),
      },
    });
  } catch (error) {
    console.error('[Step4] Failed to log result to database:', error);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a quote needs verification
 * Returns true if the text appears to contain a direct quote
 */
export function hasDirectQuote(text: string): boolean {
  // Check for quoted text of reasonable length
  const quotePattern = /"[^"]{20,}"/;
  return quotePattern.test(text);
}

/**
 * Get recommended action text for each result type
 */
export function getActionRecommendation(result: Step4Result): string {
  switch (result.action) {
    case 'PROCEED':
      return 'Quote verified. Proceed with citation.';
    case 'AUTO_CORRECT':
      return `Minor discrepancy detected. Auto-correcting to: "${result.corrected_quote?.slice(0, 100)}..."`;
    case 'FLAG':
      return `Quote requires review. Similarity: ${result.similarity_score}%. Consider paraphrasing or verifying source.`;
    case 'REMOVE':
      return 'Quote not found in source. Remove quote or verify citation.';
    default:
      return 'Unknown action required.';
  }
}

export default {
  verifyQuote,
  verifyQuotesBatch,
  levenshteinDistance,
  calculateSimilarity,
  normalizeQuote,
  findBestMatch,
  extractQuotesWithCitations,
  hasDirectQuote,
  getActionRecommendation,
};
