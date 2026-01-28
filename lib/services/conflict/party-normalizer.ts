// /lib/services/conflict/party-normalizer.ts
// Party name normalization and fuzzy matching
// VERSION: 1.0 — January 28, 2026

import { CONFLICT_THRESHOLDS } from '@/types/conflict';

/**
 * Common legal suffixes to normalize
 */
const LEGAL_SUFFIXES = [
  'inc', 'incorporated', 'inc.',
  'llc', 'l.l.c.', 'l.l.c',
  'llp', 'l.l.p.', 'l.l.p',
  'corp', 'corporation', 'corp.',
  'co', 'company', 'co.',
  'ltd', 'limited', 'ltd.',
  'lp', 'l.p.', 'l.p',
  'pc', 'p.c.', 'p.c',
  'pa', 'p.a.', 'p.a',
  'pllc', 'p.l.l.c.',
  'na', 'n.a.', 'n.a',
  'dba', 'd.b.a.', 'd/b/a', 'doing business as',
  'aka', 'a.k.a.', 'a/k/a', 'also known as',
  'fka', 'f.k.a.', 'f/k/a', 'formerly known as',
];

/**
 * Common titles and honorifics to remove
 */
const TITLES = [
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'dr', 'dr.', 'doctor',
  'prof', 'prof.', 'professor',
  'esq', 'esq.', 'esquire',
  'jr', 'jr.', 'junior',
  'sr', 'sr.', 'senior',
  'ii', 'iii', 'iv', 'v',
];

/**
 * Normalize a party name for comparison
 */
export function normalizePartyName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  let normalized = name.toLowerCase().trim();

  // Remove punctuation except spaces
  normalized = normalized.replace(/[^\w\s]/g, ' ');

  // Remove titles
  for (const title of TITLES) {
    normalized = normalized.replace(new RegExp(`\\b${title}\\b`, 'gi'), '');
  }

  // Remove legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\b`, 'gi'), '');
  }

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
export function calculateSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizePartyName(name1);
  const normalized2 = normalizePartyName(name2);

  if (!normalized1 || !normalized2) return 0;
  if (normalized1 === normalized2) return 1;

  // Skip if either name is too short
  if (normalized1.length < CONFLICT_THRESHOLDS.MIN_NAME_LENGTH ||
      normalized2.length < CONFLICT_THRESHOLDS.MIN_NAME_LENGTH) {
    return 0;
  }

  const maxLength = Math.max(normalized1.length, normalized2.length);
  const distance = levenshteinDistance(normalized1, normalized2);
  const similarity = 1 - (distance / maxLength);

  return Math.round(similarity * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Check if two names match based on different criteria
 */
export function checkNameMatch(name1: string, name2: string): {
  isMatch: boolean;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'none';
  similarity: number;
} {
  // Check exact match (case-insensitive)
  if (name1.toLowerCase().trim() === name2.toLowerCase().trim()) {
    return { isMatch: true, matchType: 'exact', similarity: 1.0 };
  }

  // Check normalized match
  const normalized1 = normalizePartyName(name1);
  const normalized2 = normalizePartyName(name2);

  if (normalized1 === normalized2 && normalized1.length > 0) {
    return { isMatch: true, matchType: 'normalized', similarity: 0.99 };
  }

  // Check fuzzy match
  const similarity = calculateSimilarity(name1, name2);

  if (similarity >= CONFLICT_THRESHOLDS.FUZZY_MATCH_SOFT) {
    return { isMatch: true, matchType: 'fuzzy', similarity };
  }

  return { isMatch: false, matchType: 'none', similarity };
}

/**
 * Generate potential aliases for a name
 */
export function generateAliases(name: string): string[] {
  const aliases: string[] = [];
  const normalized = normalizePartyName(name);

  if (!normalized) return aliases;

  // Add the normalized version
  aliases.push(normalized);

  // Split into parts
  const parts = normalized.split(' ').filter(p => p.length > 1);

  if (parts.length >= 2) {
    // First Last
    aliases.push(`${parts[0]} ${parts[parts.length - 1]}`);

    // Last, First
    aliases.push(`${parts[parts.length - 1]} ${parts[0]}`);

    // First initial + Last
    aliases.push(`${parts[0][0]} ${parts[parts.length - 1]}`);
  }

  // Remove duplicates
  return [...new Set(aliases)];
}

/**
 * Extract individual names from a party string that may contain multiple parties
 */
export function extractIndividualParties(partyString: string): string[] {
  if (!partyString) return [];

  const parties: string[] = [];

  // Split by common separators
  const separators = [' and ', ' & ', '; ', ', et al', ' et al.', ' et al'];
  let remaining = partyString;

  for (const sep of separators) {
    if (remaining.toLowerCase().includes(sep.toLowerCase())) {
      const splitParts = remaining.split(new RegExp(sep, 'i'));
      for (const part of splitParts) {
        const trimmed = part.trim();
        if (trimmed && trimmed.length >= CONFLICT_THRESHOLDS.MIN_NAME_LENGTH) {
          parties.push(trimmed);
        }
      }
      return parties;
    }
  }

  // No separators found, return original
  const trimmed = partyString.trim();
  if (trimmed && trimmed.length >= CONFLICT_THRESHOLDS.MIN_NAME_LENGTH) {
    parties.push(trimmed);
  }

  return parties;
}
