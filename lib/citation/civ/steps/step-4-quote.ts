/**
 * CIV Step 4: Quote Verification
 *
 * Verify that direct quotes attributed to the case are accurate.
 * Uses fuzzy matching with 90%+ similarity threshold.
 */

import type { QuoteVerificationOutput, QuoteVerificationResult } from '../types';
import { validateEllipsis } from '@/lib/civ/ellipsis-validator';

/**
 * Execute Step 4: Quote Verification
 *
 * Only runs if there's a direct quote in the draft.
 * Uses fuzzy matching to allow minor variations.
 */
export async function executeQuoteVerification(
  quoteInDraft: string | undefined,
  opinionText: string | undefined
): Promise<QuoteVerificationOutput> {
  const result: QuoteVerificationOutput = {
    step: 4,
    name: 'quote_verification',
    result: 'N/A',
    actionTaken: 'NONE',
    proceedToStep5: true,
  };

  // If no quote in draft, skip this step
  if (!quoteInDraft || !quoteInDraft.trim()) {
    return result;
  }

  // If no opinion text available, flag
  if (!opinionText) {
    result.result = 'NOT_FOUND';
    result.quoteInDraft = quoteInDraft;
    result.actionTaken = 'FLAGGED';
    result.proceedToStep5 = true;
    return result;
  }

  result.quoteInDraft = quoteInDraft;

  // Search for the quote in the opinion
  const matchResult = findBestMatch(quoteInDraft, opinionText);

  result.similarityScore = matchResult.similarity;
  result.quoteInOpinion = matchResult.matchedText;

  // Determine result based on similarity thresholds per spec
  if (matchResult.similarity >= 0.95) {
    result.result = 'MATCH';
    result.actionTaken = 'NONE';
  } else if (matchResult.similarity >= 0.90) {
    result.result = 'CLOSE_MATCH';
    result.actionTaken = 'AUTO_CORRECTED';
    result.correctedQuote = matchResult.matchedText;
  } else if (matchResult.similarity >= 0.80) {
    result.result = 'PARTIAL_MATCH';
    // Per spec: auto-paraphrase or flag
    result.actionTaken = 'PARAPHRASED';
    result.correctedQuote = matchResult.matchedText;
  } else {
    result.result = 'NOT_FOUND';
    result.actionTaken = 'FLAGGED';
  }

  // CV-109: Ellipsis validation on the quoted text
  if (quoteInDraft && quoteInDraft.includes('...')) {
    try {
      const ellipsisResult = validateEllipsis(quoteInDraft, opinionText);
      if (!ellipsisResult.valid) {
        const errors = ellipsisResult.issues
          .filter(i => i.severity === 'ERROR')
          .map(i => i.suggestion);
        result.ellipsisIssues = errors;
        // Downgrade from MATCH to CLOSE_MATCH if there are ellipsis issues
        if (result.result === 'MATCH') {
          result.result = 'CLOSE_MATCH';
          result.actionTaken = 'FLAGGED';
        }
      }
      if (ellipsisResult.issues.length > 0) {
        result.ellipsisWarnings = ellipsisResult.issues
          .filter(i => i.severity === 'WARNING')
          .map(i => i.suggestion);
      }
    } catch (ellipsisError) {
      // BUG-FIX: Unhandled validateEllipsis error could crash Step 4 entirely.
      // Default to conservative: flag the quote as having issues.
      result.ellipsisIssues = ['Ellipsis validation error — flagged for manual review'];
      if (result.result === 'MATCH') {
        result.result = 'CLOSE_MATCH';
        result.actionTaken = 'FLAGGED';
      }
    }
  }

  result.proceedToStep5 = true;
  return result;
}

/**
 * Find the best matching passage in the opinion text
 */
function findBestMatch(
  targetQuote: string,
  opinionText: string
): { similarity: number; matchedText: string } {
  // Normalize both texts for comparison
  const normalizedTarget = normalizeText(targetQuote);
  const normalizedOpinion = normalizeText(opinionText);

  // Try exact match first (case-insensitive)
  if (normalizedOpinion.includes(normalizedTarget)) {
    // Find the original text that matches
    const matchIndex = normalizedOpinion.indexOf(normalizedTarget);
    const originalText = findOriginalText(opinionText, matchIndex, normalizedTarget.length);
    return { similarity: 1.0, matchedText: originalText };
  }

  // Break target into sentences/clauses for sliding window search
  const targetWords = normalizedTarget.split(/\s+/);
  const windowSize = targetWords.length;

  // Search for best matching window in opinion
  const opinionWords = normalizedOpinion.split(/\s+/);

  let bestSimilarity = 0;
  let bestMatchStart = 0;
  let bestMatchLength = windowSize;

  // Slide through opinion with windows of similar size
  for (let i = 0; i <= opinionWords.length - Math.floor(windowSize * 0.7); i++) {
    // Try windows of varying sizes around target length
    for (const sizeMod of [0, -2, 2, -5, 5]) {
      const currentWindowSize = Math.max(3, windowSize + sizeMod);
      if (i + currentWindowSize > opinionWords.length) continue;

      const window = opinionWords.slice(i, i + currentWindowSize).join(' ');
      const similarity = calculateSimilarity(normalizedTarget, window);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatchStart = i;
        bestMatchLength = currentWindowSize;
      }
    }
  }

  // Reconstruct the matched text from original opinion
  const matchedText = reconstructMatchedText(opinionText, bestMatchStart, bestMatchLength);

  return { similarity: bestSimilarity, matchedText };
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]/g, '')
    .trim();
}

/**
 * Calculate similarity between two strings using Levenshtein-based approach
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  // Quick check for very different lengths
  const lengthRatio = Math.min(len1, len2) / Math.max(len1, len2);
  if (lengthRatio < 0.5) return lengthRatio * 0.5;

  // Use Levenshtein distance
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(len1, len2);

  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Use two rows for space efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;

    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }

    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Find original text at a position in normalized text
 */
function findOriginalText(original: string, normalizedIndex: number, length: number): string {
  // This is an approximation - in practice we'd need more sophisticated mapping
  const normalizedOriginal = normalizeText(original);
  const words = original.split(/\s+/);
  const normalizedWords = normalizedOriginal.split(/\s+/);

  // Find the starting word index
  let charCount = 0;
  let startWordIndex = 0;

  for (let i = 0; i < normalizedWords.length; i++) {
    if (charCount >= normalizedIndex) {
      startWordIndex = i;
      break;
    }
    charCount += normalizedWords[i].length + 1; // +1 for space
  }

  // Find the ending word index
  charCount = 0;
  let endWordIndex = normalizedWords.length;

  for (let i = startWordIndex; i < normalizedWords.length; i++) {
    charCount += normalizedWords[i].length + 1;
    if (charCount >= length) {
      endWordIndex = i + 1;
      break;
    }
  }

  return words.slice(startWordIndex, endWordIndex).join(' ');
}

/**
 * Reconstruct matched text from original opinion by word positions
 */
function reconstructMatchedText(
  opinionText: string,
  startWordIndex: number,
  wordCount: number
): string {
  const words = opinionText.split(/\s+/);

  const startIndex = Math.max(0, startWordIndex);
  const endIndex = Math.min(words.length, startIndex + wordCount);

  return words.slice(startIndex, endIndex).join(' ');
}

/**
 * Check if variations are acceptable per spec
 * Acceptable: punctuation, capitalization, ellipses, minor non-substantive words
 * Unacceptable: meaning changes, missing key words, wrong attribution
 */
export function isAcceptableVariation(original: string, found: string): boolean {
  const normOriginal = normalizeText(original);
  const normFound = normalizeText(found);

  const similarity = calculateSimilarity(normOriginal, normFound);

  // Must meet minimum threshold
  if (similarity < 0.80) return false;

  // Check for substantive word preservation
  const importantWords = extractImportantWords(original);
  const foundWords = new Set(normFound.split(/\s+/));

  let importantWordMatches = 0;
  for (const word of importantWords) {
    if (foundWords.has(normalizeText(word))) {
      importantWordMatches++;
    }
  }

  // At least 80% of important words must be present
  return importantWordMatches >= importantWords.length * 0.8;
}

/**
 * Extract important words (nouns, verbs, legal terms)
 */
function extractImportantWords(text: string): string[] {
  // Simple extraction - words longer than 4 chars that aren't common
  const commonWords = new Set([
    'the', 'and', 'that', 'this', 'with', 'have', 'from', 'they', 'been', 'which',
    'were', 'said', 'each', 'their', 'will', 'other', 'when', 'there', 'what',
    'about', 'would', 'make', 'could', 'been', 'more', 'these', 'some', 'than',
  ]);

  return text
    .split(/\s+/)
    .filter(word => word.length > 4 && !commonWords.has(word.toLowerCase()));
}
