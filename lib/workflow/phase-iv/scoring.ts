/**
 * Citation Scoring Module
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * Implements authority, recency, and relevance scoring per Chen's spec:
 * - Authority: Court hierarchy scoring (LA Supreme = 100, LA Appeal = 85, etc.)
 * - Recency: Date-based bonuses (2024-2026 = +25, etc.)
 * - Relevance: Proposition match scoring (STRONG = 30, MODERATE = 20, etc.)
 *
 * Total Score = (Authority × 0.40) + (Recency × 0.20) + (Relevance × 0.40)
 */

import {
  AUTHORITY_SCORES,
  RECENCY_BONUSES,
  RELEVANCE_SCORES,
  SCORE_WEIGHTS,
  type PropositionMatch,
  type RawCandidate,
  type ScoredCitation,
} from '@/types/citation-research';

// ============================================================================
// AUTHORITY SCORING
// ============================================================================

/**
 * Calculate authority score based on court hierarchy
 *
 * | Court | Score | Authority Type |
 * |-------|-------|----------------|
 * | Louisiana Supreme Court | 100 | Binding |
 * | Louisiana Court of Appeal | 85 | Binding |
 * | US Supreme Court | 95 | Binding (federal issues) |
 * | Fifth Circuit | 65 | Persuasive |
 * | LA Federal District Courts | 50 | Persuasive |
 * | Other Federal | 30 | Persuasive |
 */
export function calculateAuthorityScore(court: string, courtCode: string): number {
  // Normalize inputs
  const normalizedCourt = court.toLowerCase().trim();
  const normalizedCode = courtCode.toLowerCase().trim();

  // Check by court code first (most reliable)
  if (normalizedCode in AUTHORITY_SCORES) {
    return AUTHORITY_SCORES[normalizedCode];
  }

  // Check by court name patterns
  if (normalizedCourt.includes('supreme court of louisiana') || normalizedCode === 'la' || normalizedCode === 'lasc') {
    return 100;
  }

  if (normalizedCourt.includes('louisiana court of appeal') || normalizedCourt.includes('louisiana app') || normalizedCode === 'lactapp') {
    return 85;
  }

  if (normalizedCourt.includes('supreme court of the united states') || normalizedCode === 'scotus') {
    return 95;
  }

  if (normalizedCourt.includes('fifth circuit') || normalizedCode === 'ca5') {
    return 65;
  }

  // Louisiana Federal District Courts
  if (normalizedCode === 'laed' || normalizedCode === 'lamd' || normalizedCode === 'lawd') {
    return 50;
  }

  if (normalizedCourt.includes('eastern district of louisiana') ||
      normalizedCourt.includes('middle district of louisiana') ||
      normalizedCourt.includes('western district of louisiana')) {
    return 50;
  }

  // Other federal courts
  if (normalizedCourt.includes('circuit') || normalizedCourt.includes('district')) {
    return 30;
  }

  // Default for unknown courts
  return AUTHORITY_SCORES['default'] || 30;
}

/**
 * Determine if a court's authority is binding or persuasive for Louisiana
 */
export function determineAuthorityLevel(court: string, courtCode: string): 'binding' | 'persuasive' {
  const normalizedCourt = court.toLowerCase().trim();
  const normalizedCode = courtCode.toLowerCase().trim();

  // Louisiana Supreme Court - binding
  if (normalizedCode === 'la' || normalizedCode === 'lasc' ||
      normalizedCourt.includes('supreme court of louisiana')) {
    return 'binding';
  }

  // Louisiana Court of Appeal - binding (published opinions)
  if (normalizedCode === 'lactapp' || normalizedCourt.includes('louisiana court of appeal')) {
    return 'binding';
  }

  // US Supreme Court - binding on federal issues
  if (normalizedCode === 'scotus' || normalizedCourt.includes('supreme court of the united states')) {
    return 'binding';
  }

  // Everything else is persuasive
  return 'persuasive';
}

// ============================================================================
// RECENCY SCORING
// ============================================================================

/**
 * Calculate recency score based on case date
 *
 * | Date Range | Bonus |
 * |------------|-------|
 * | 2024-2026 | +25 |
 * | 2020-2023 | +20 |
 * | 2015-2019 | +15 |
 * | 2010-2014 | +10 |
 * | 2000-2009 | +5 |
 * | Pre-2000 | +0 |
 */
export function calculateRecencyScore(dateFiled: string): number {
  if (!dateFiled) {
    return 0;
  }

  let year: number;
  try {
    const date = new Date(dateFiled);
    year = date.getFullYear();

    // Validate year is reasonable
    if (isNaN(year) || year < 1800 || year > 2030) {
      return 0;
    }
  } catch {
    return 0;
  }

  // Find the appropriate recency bonus
  for (const range of RECENCY_BONUSES) {
    if (year >= range.startYear && year <= range.endYear) {
      return range.bonus;
    }
  }

  return 0;
}

/**
 * Get the year from a date string for display
 */
export function getYearFromDate(dateFiled: string): number | null {
  if (!dateFiled) return null;

  try {
    const date = new Date(dateFiled);
    const year = date.getFullYear();
    return isNaN(year) ? null : year;
  } catch {
    return null;
  }
}

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Calculate relevance score based on proposition match
 *
 * | Proposition Match | Score |
 * |-------------------|-------|
 * | STRONG — Holding directly supports | 30 |
 * | MODERATE — Holding supports, not direct | 20 |
 * | WEAK — Tangentially related | 10 |
 * | NO_SUPPORT — Doesn't support | 0 (exclude) |
 */
export function calculateRelevanceScore(propositionMatch: PropositionMatch): number {
  return RELEVANCE_SCORES[propositionMatch] || 0;
}

// ============================================================================
// TOTAL SCORE CALCULATION
// ============================================================================

/**
 * Calculate total weighted score
 *
 * Total = (Authority × 0.40) + (Recency × 0.20) + (Relevance × 0.40)
 *
 * Maximum possible scores:
 * - Authority: 100 × 0.40 = 40
 * - Recency: 25 × 0.20 = 5 (normalized to 100 scale = 25)
 * - Relevance: 30 × 0.40 = 12 (normalized to 100 scale = 40)
 *
 * Practical max with current weights: ~75-85 for recent LA Supreme Court cases
 */
export function calculateTotalScore(
  authorityScore: number,
  recencyScore: number,
  relevanceScore: number
): number {
  // Normalize recency to 0-100 scale (max recency bonus is 25)
  const normalizedRecency = (recencyScore / 25) * 100;

  // Normalize relevance to 0-100 scale (max relevance score is 30)
  const normalizedRelevance = (relevanceScore / 30) * 100;

  const total = (
    (authorityScore * SCORE_WEIGHTS.authority) +
    (normalizedRecency * SCORE_WEIGHTS.recency) +
    (normalizedRelevance * SCORE_WEIGHTS.relevance)
  );

  // Round to 1 decimal place
  return Math.round(total * 10) / 10;
}

// ============================================================================
// SCORING PIPELINE
// ============================================================================

/**
 * Score a raw candidate citation
 *
 * This applies authority and recency scoring. Relevance scoring requires
 * holding verification which happens in phase IV-C.
 */
export function scoreCandidate(
  candidate: RawCandidate,
  propositionMatch: PropositionMatch,
  relevantHolding: string
): ScoredCitation {
  const authorityScore = calculateAuthorityScore(candidate.court, candidate.courtCode);
  const recencyScore = calculateRecencyScore(candidate.dateFiled);
  const relevanceScore = calculateRelevanceScore(propositionMatch);
  const totalScore = calculateTotalScore(authorityScore, recencyScore, relevanceScore);

  return {
    // Identification
    id: candidate.id,
    clusterId: candidate.clusterId,
    caseName: candidate.caseName,
    citation: candidate.citation,

    // CourtListener verification (REQUIRED)
    courtlistener_id: candidate.id,
    courtlistener_cluster_id: candidate.clusterId,
    verification_timestamp: new Date().toISOString(),
    verification_method: 'search',

    // Court metadata
    court: candidate.court,
    courtCode: candidate.courtCode,
    dateFiled: candidate.dateFiled,
    absoluteUrl: candidate.absoluteUrl,

    // Element mapping
    forElement: candidate.forElement,
    proposition: '',  // To be filled by Claude in verification
    relevantHolding,
    authorityLevel: determineAuthorityLevel(candidate.court, candidate.courtCode),

    // Verification results
    propositionMatch,
    goodLawStatus: 'GOOD_LAW',  // Default, to be updated if negative treatment found

    // Scoring
    authorityScore,
    recencyScore,
    relevanceScore,
    totalScore,

    // Selection
    selected: false,
    selectionReason: undefined,
  };
}

// ============================================================================
// SELECTION ALGORITHM
// ============================================================================

/**
 * Select top citations based on scoring and element coverage
 *
 * Selection rules per Chen's spec:
 * 1. Critical elements get 2 citations each (first priority)
 * 2. Important elements get 1-2 citations each (second priority)
 * 3. Fill remaining slots with highest-scored supporting citations
 * 4. Cap at 15 total citations (more is bloat, not quality)
 * 5. Minimum 6 citations (less means research failed)
 */
export function selectTopCitations(
  scoredCitations: ScoredCitation[],
  elementPriorities: Map<string, 'critical' | 'important' | 'supporting'>,
  minCitations: number = 6,
  maxCitations: number = 15
): ScoredCitation[] {
  // Filter out NO_SUPPORT citations
  const validCitations = scoredCitations.filter(c => c.propositionMatch !== 'NO_SUPPORT');

  // Sort by total score descending
  const sorted = [...validCitations].sort((a, b) => b.totalScore - a.totalScore);

  const selected: ScoredCitation[] = [];
  const elementCounts = new Map<string, number>();

  // Phase 1: Select 2 citations for each critical element
  for (const [element, priority] of elementPriorities) {
    if (priority !== 'critical') continue;

    const elementCitations = sorted.filter(
      c => c.forElement === element && !selected.includes(c)
    );

    for (let i = 0; i < 2 && i < elementCitations.length && selected.length < maxCitations; i++) {
      const citation = elementCitations[i];
      citation.selected = true;
      citation.selectionReason = 'critical_element_support';
      selected.push(citation);
      elementCounts.set(element, (elementCounts.get(element) || 0) + 1);
    }
  }

  // Phase 2: Select 1-2 citations for each important element
  for (const [element, priority] of elementPriorities) {
    if (priority !== 'important') continue;

    const currentCount = elementCounts.get(element) || 0;
    if (currentCount >= 2) continue;

    const elementCitations = sorted.filter(
      c => c.forElement === element && !selected.includes(c)
    );

    const toSelect = Math.min(2 - currentCount, elementCitations.length);
    for (let i = 0; i < toSelect && selected.length < maxCitations; i++) {
      const citation = elementCitations[i];
      citation.selected = true;
      citation.selectionReason = 'important_element_support';
      selected.push(citation);
      elementCounts.set(element, (elementCounts.get(element) || 0) + 1);
    }
  }

  // Phase 3: Fill remaining slots with highest-scored citations
  const remaining = sorted.filter(c => !selected.includes(c));
  for (const citation of remaining) {
    if (selected.length >= maxCitations) break;

    citation.selected = true;
    citation.selectionReason = 'high_score_fill';
    selected.push(citation);
    elementCounts.set(citation.forElement, (elementCounts.get(citation.forElement) || 0) + 1);
  }

  // Check minimum
  if (selected.length < minCitations) {
    console.warn(`[Scoring] Only ${selected.length} citations selected, below minimum of ${minCitations}`);
  }

  return selected;
}

// ============================================================================
// SORTING UTILITIES
// ============================================================================

/**
 * Sort citations by Louisiana preference, then by score
 *
 * Louisiana courts should appear before federal courts.
 */
export function sortByLouisianaPreference(citations: ScoredCitation[]): ScoredCitation[] {
  return [...citations].sort((a, b) => {
    // Priority: LA Supreme > LA App > 5th Cir > District > Other
    const getPriority = (c: ScoredCitation) => {
      const court = (c.court || '').toLowerCase();
      const code = (c.courtCode || '').toLowerCase();

      if (code === 'la' || code === 'lasc' || court.includes('supreme court of louisiana')) return 1;
      if (code === 'lactapp' || court.includes('louisiana court of appeal')) return 2;
      if (code === 'scotus') return 3;  // US Supreme Court
      if (code === 'ca5' || court.includes('fifth circuit')) return 4;
      if (['laed', 'lamd', 'lawd'].includes(code)) return 5;
      return 6;
    };

    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    // Same priority — sort by total score descending
    return b.totalScore - a.totalScore;
  });
}

/**
 * Count citations by court type
 */
export function countByCourtType(citations: ScoredCitation[]): {
  louisiana: number;
  federal: number;
  binding: number;
  persuasive: number;
} {
  let louisiana = 0;
  let federal = 0;
  let binding = 0;
  let persuasive = 0;

  for (const c of citations) {
    const code = (c.courtCode || '').toLowerCase();
    const court = (c.court || '').toLowerCase();

    const isLouisiana = code === 'la' || code === 'lasc' || code === 'lactapp' ||
      court.includes('louisiana');

    if (isLouisiana) {
      louisiana++;
    } else {
      federal++;
    }

    if (c.authorityLevel === 'binding') {
      binding++;
    } else {
      persuasive++;
    }
  }

  return { louisiana, federal, binding, persuasive };
}
