// lib/conflicts/normalize.ts
// Party name normalization for conflict matching
// VERSION: 1.0.0

import type { NormalizedParty } from './types';

// Common legal suffixes to strip
const LEGAL_SUFFIXES = [
  'llc', 'llp', 'inc', 'corp', 'corporation', 'company', 'co',
  'ltd', 'limited', 'pllc', 'pc', 'pa', 'lp', 'gp',
  'individually', 'as trustee', 'as executor', 'et al', 'etal',
  'dba', 'd/b/a', 'doing business as', 'aka', 'a/k/a', 'also known as',
  'fka', 'f/k/a', 'formerly known as', 'nka', 'n/k/a', 'now known as'
];

// Common prefixes to strip
const LEGAL_PREFIXES = [
  'the', 'a', 'an', 'estate of', 'in re', 'in the matter of',
  'people of the state of', 'state of', 'united states of america',
  'united states', 'usa', 'us'
];

/**
 * Simple Soundex implementation for phonetic matching
 */
function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';

  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };

  let result = s[0];
  let prevCode = codes[s[0]] || '';

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || '';
    if (code && code !== prevCode) {
      result += code;
    }
    prevCode = code || prevCode;
  }

  return result.padEnd(4, '0');
}

/**
 * Normalize a party name for conflict matching
 */
export function normalizePartyName(name: string): NormalizedParty {
  const original = name.trim();

  // Lowercase and remove extra whitespace
  let normalized = original.toLowerCase().replace(/\s+/g, ' ');

  // Remove punctuation except apostrophes in names
  normalized = normalized.replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ');

  // Strip legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    const regex = new RegExp(`\\s+${suffix}\\s*$`, 'i');
    normalized = normalized.replace(regex, '');
  }

  // Strip legal prefixes
  for (const prefix of LEGAL_PREFIXES) {
    const regex = new RegExp(`^${prefix}\\s+`, 'i');
    normalized = normalized.replace(regex, '');
  }

  normalized = normalized.trim();

  // Tokenize
  const tokens = normalized.split(/\s+/).filter(t => t.length > 1);

  // Generate soundex codes for each token
  const soundexCodes = tokens.map(t => soundex(t));

  return {
    original,
    normalized,
    tokens,
    soundex: soundexCodes
  };
}

/**
 * Normalize a case number for exact matching
 */
export function normalizeCaseNumber(caseNumber: string): string {
  // Remove all whitespace and convert to uppercase
  let normalized = caseNumber.replace(/\s+/g, '').toUpperCase();

  // Standardize common separators
  normalized = normalized.replace(/[-–—]/g, '-');

  // Remove leading zeros in year (2024 vs 24)
  normalized = normalized.replace(/^(\d{2})(\d{2})-/, '$2-');

  return normalized;
}

/**
 * Calculate similarity score between two normalized parties
 * Returns 0-100
 */
export function calculatePartySimilarity(a: NormalizedParty, b: NormalizedParty): number {
  // Exact match
  if (a.normalized === b.normalized) return 100;

  // Token overlap
  const aTokenSet = new Set(a.tokens);
  const bTokenSet = new Set(b.tokens);
  const intersection = [...aTokenSet].filter(t => bTokenSet.has(t));
  const union = new Set([...aTokenSet, ...bTokenSet]);
  const jaccardSimilarity = union.size > 0 ? intersection.length / union.size : 0;

  // Soundex overlap (catches spelling variations)
  const aSoundexSet = new Set(a.soundex);
  const bSoundexSet = new Set(b.soundex);
  const soundexIntersection = [...aSoundexSet].filter(s => bSoundexSet.has(s));
  const soundexUnion = new Set([...aSoundexSet, ...bSoundexSet]);
  const soundexSimilarity = soundexUnion.size > 0 ? soundexIntersection.length / soundexUnion.size : 0;

  // Weighted average: 70% token match, 30% soundex
  const similarity = (jaccardSimilarity * 0.7 + soundexSimilarity * 0.3) * 100;

  return Math.round(similarity);
}
