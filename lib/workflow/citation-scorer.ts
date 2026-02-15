/**
 * CITATION RELEVANCE SCORER
 *
 * TASK-07: Fix flat relevance scoring.
 *
 * Audit Evidence (Pelican order):
 * All 4 citations in the bank had relevanceScore: 50.
 * 110 candidates evaluated, 4 selected — all identical scores.
 * The selection algorithm effectively chose at random.
 *
 * Root Cause Analysis:
 * Either (a) the scoring function returns a default, or
 * (b) the scoring logic collapses all scores to the same value.
 *
 * Solution:
 * Multi-factor scoring with differentiated weights.
 *
 * @module citation-scorer
 */

import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CitationCandidate {
  caseName: string;
  citation: string;
  courtlistenerId: string;
  snippet: string;
  court: string;
  decisionDate: string;
  jurisdiction?: string;
  searchElement: string;         // Which legal element this supports
  searchBatchId: string;         // Which research batch found this
}

export interface ScoringContext {
  motionType: string;
  jurisdiction: string;          // Filing jurisdiction (e.g., 'LA_STATE')
  filingCourt: string;           // Specific court (e.g., '19jdc')
  tier: 'A' | 'B' | 'C' | 'D';
  legalElements: string[];       // Elements being argued
}

export interface ScoredCitation extends CitationCandidate {
  relevanceScore: number;        // 0-100
  scoreBreakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  textualRelevance: number;      // 0-40 points
  jurisdictionalWeight: number;  // 0-25 points
  recency: number;               // 0-15 points
  courtLevel: number;            // 0-15 points
  elementMatch: number;          // 0-5 points (bonus)
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Court level hierarchy (higher = more authoritative)
const COURT_LEVELS: Record<string, number> = {
  'lasc': 15,          // Louisiana Supreme Court
  'casc': 15,          // California Supreme Court
  'ussc': 15,          // US Supreme Court
  '5th_cir': 12,       // 5th Circuit Court of Appeals
  '9th_cir': 12,       // 9th Circuit
  'la_app_1': 10,      // Louisiana 1st Circuit App
  'la_app_2': 10,
  'la_app_3': 10,
  'la_app_4': 10,
  'la_app_5': 10,
  'ca_app': 10,        // California Court of Appeal
  'district': 8,       // Federal district courts
  'state_trial': 5,    // State trial courts (rarely cited)
};

// Recency scoring (years since decision)
const RECENCY_SCORING = [
  { maxYears: 2, points: 15 },   // Last 2 years
  { maxYears: 5, points: 12 },   // 2-5 years
  { maxYears: 10, points: 9 },   // 5-10 years
  { maxYears: 20, points: 6 },   // 10-20 years
  { maxYears: Infinity, points: 3 }, // Older
];

// Louisiana Circuit mapping for jurisdiction scoring
const LA_CIRCUIT_MAP: Record<string, string> = {
  '19jdc': '1st', '23jdc': '1st', '18jdc': '1st', '21jdc': '1st', '22jdc': '1st',
  '4jdc': '2nd', '2jdc': '2nd',
  '14jdc': '3rd', '15jdc': '3rd', '16jdc': '3rd',
  'cdc': '4th',
  '24jdc': '5th', '29jdc': '5th', '40jdc': '5th',
};

// Adjacent circuits for partial bonus
const ADJACENT_CIRCUITS: Record<string, string[]> = {
  '1st': ['4th', '5th'],
  '2nd': ['3rd'],
  '3rd': ['2nd', '5th'],
  '4th': ['1st', '5th'],
  '5th': ['1st', '3rd', '4th'],
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a citation candidate based on multiple relevance factors.
 *
 * Scoring breakdown (100 points max):
 * - Textual Relevance: 0-40 points (keyword matching, semantic similarity)
 * - Jurisdictional Weight: 0-25 points (circuit matching, LASC bonus)
 * - Recency: 0-15 points (how recent the decision)
 * - Court Level: 0-15 points (appellate > trial, supreme > intermediate)
 * - Element Match: 0-5 bonus points (directly addresses argued element)
 *
 * @param candidate - The citation candidate to score
 * @param context - Scoring context including jurisdiction and elements
 * @returns Scored citation with breakdown
 */
export function scoreCitation(
  candidate: CitationCandidate,
  context: ScoringContext
): ScoredCitation {
  const breakdown: ScoreBreakdown = {
    textualRelevance: 0,
    jurisdictionalWeight: 0,
    recency: 0,
    courtLevel: 0,
    elementMatch: 0,
    total: 0,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. TEXTUAL RELEVANCE (0-40 points)
  // ─────────────────────────────────────────────────────────────────────────

  breakdown.textualRelevance = calculateTextualRelevance(
    candidate.snippet,
    candidate.searchElement,
    context.motionType
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. JURISDICTIONAL WEIGHT (0-25 points)
  // ─────────────────────────────────────────────────────────────────────────

  breakdown.jurisdictionalWeight = calculateJurisdictionalWeight(
    candidate.court,
    context.filingCourt,
    context.jurisdiction
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. RECENCY (0-15 points)
  // ─────────────────────────────────────────────────────────────────────────

  breakdown.recency = calculateRecencyScore(candidate.decisionDate);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. COURT LEVEL (0-15 points)
  // ─────────────────────────────────────────────────────────────────────────

  breakdown.courtLevel = calculateCourtLevelScore(candidate.court);

  // ─────────────────────────────────────────────────────────────────────────
  // 5. ELEMENT MATCH BONUS (0-5 points)
  // ─────────────────────────────────────────────────────────────────────────

  if (context.legalElements.includes(candidate.searchElement)) {
    breakdown.elementMatch = 5;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOTAL
  // ─────────────────────────────────────────────────────────────────────────

  breakdown.total =
    breakdown.textualRelevance +
    breakdown.jurisdictionalWeight +
    breakdown.recency +
    breakdown.courtLevel +
    breakdown.elementMatch;

  // Clamp to 0-100
  breakdown.total = Math.max(0, Math.min(100, breakdown.total));

  return {
    ...candidate,
    relevanceScore: breakdown.total,
    scoreBreakdown: breakdown,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate textual relevance from snippet content.
 * Uses keyword matching and legal term density.
 */
function calculateTextualRelevance(
  snippet: string,
  searchElement: string,
  motionType: string
): number {
  if (!snippet) return 10; // Minimum score if no snippet

  const snippetLower = snippet.toLowerCase();
  let score = 10; // Base score for having a snippet

  // Legal keyword matching (element-specific)
  const elementKeywords: Record<string, string[]> = {
    'duty_of_loyalty': ['fiduciary', 'loyalty', 'duty', 'breach', 'employee'],
    'non_compete_enforceability': ['non-compete', 'noncompete', 'enforceable', '23:921', 'restrictive'],
    'non_solicitation': ['solicit', 'customer', 'client', 'prohibition'],
    'summary_judgment_standard': ['summary judgment', 'genuine issue', 'material fact', '966'],
    'breach_of_contract': ['breach', 'contract', 'damages', 'performance'],
    'competing_during_employment': ['compete', 'competing', 'during employment', 'while employed'],
    'legitimate_business_interest': ['protectable', 'legitimate', 'business interest', 'trade secret'],
  };

  const keywords = elementKeywords[searchElement] || [];
  let keywordMatches = 0;

  for (const keyword of keywords) {
    if (snippetLower.includes(keyword)) {
      keywordMatches++;
    }
  }

  // More keyword matches = higher score
  score += Math.min(keywordMatches * 6, 24); // Max 24 points from keywords

  // Snippet length bonus (longer = more detailed analysis)
  if (snippet.length > 500) score += 3;
  else if (snippet.length > 200) score += 1;

  // Motion type relevance
  if (motionType.toLowerCase().includes('summary judgment') &&
      snippetLower.includes('summary judgment')) {
    score += 3;
  }

  return Math.min(score, 40);
}

/**
 * Calculate jurisdictional weight based on court matching.
 */
function calculateJurisdictionalWeight(
  caseCourt: string,
  filingCourt: string,
  jurisdiction: string
): number {
  const caseCourtLower = caseCourt.toLowerCase();

  // Louisiana Supreme Court always gets max bonus
  if (caseCourtLower.includes('supreme') && caseCourtLower.includes('louisiana')) {
    return 25;
  }

  // California Supreme Court for CA filings
  if (jurisdiction.includes('CA') &&
      caseCourtLower.includes('supreme') &&
      caseCourtLower.includes('california')) {
    return 25;
  }

  // Determine filing circuit
  const filingCircuit = LA_CIRCUIT_MAP[filingCourt];

  if (!filingCircuit) {
    // Non-Louisiana or unknown court
    return 10; // Base score
  }

  // Extract case circuit from court name
  const caseCircuit = extractCircuitFromCourt(caseCourtLower);

  if (caseCircuit === filingCircuit) {
    // Same circuit = full bonus
    return 20;
  }

  if (ADJACENT_CIRCUITS[filingCircuit]?.includes(caseCircuit)) {
    // Adjacent circuit = partial bonus
    return 12;
  }

  // Different circuit in same state
  if (caseCourtLower.includes('louisiana') || caseCourtLower.includes('la.')) {
    return 8;
  }

  // Out of state
  return 5;
}

/**
 * Extract circuit number from court name.
 */
function extractCircuitFromCourt(courtName: string): string {
  const circuitMatch = courtName.match(/(\d+)(?:st|nd|rd|th)\s*(?:circuit|cir)/i);
  if (circuitMatch) {
    const num = parseInt(circuitMatch[1]);
    const suffix = getOrdinalSuffix(num);
    return `${num}${suffix}`;
  }

  // Try to match "First Circuit", "Second Circuit", etc.
  const wordMatch = courtName.match(/(first|second|third|fourth|fifth)/i);
  if (wordMatch) {
    const wordToNum: Record<string, string> = {
      'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th'
    };
    return wordToNum[wordMatch[1].toLowerCase()] || '';
  }

  return '';
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Calculate recency score based on decision date.
 */
function calculateRecencyScore(decisionDate: string): number {
  if (!decisionDate) return 5; // Unknown date gets middle score

  const decisionYear = new Date(decisionDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const yearsOld = currentYear - decisionYear;

  for (const tier of RECENCY_SCORING) {
    if (yearsOld <= tier.maxYears) {
      return tier.points;
    }
  }

  return 3; // Very old case
}

/**
 * Calculate court level score.
 */
function calculateCourtLevelScore(court: string): number {
  const courtLower = court.toLowerCase();

  // Check for exact matches first
  for (const [key, score] of Object.entries(COURT_LEVELS)) {
    if (courtLower.includes(key)) {
      return score;
    }
  }

  // Heuristic matching
  if (courtLower.includes('supreme')) return 15;
  if (courtLower.includes('circuit') || courtLower.includes('appeal')) return 10;
  if (courtLower.includes('district')) return 8;

  return 5; // Unknown court type
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a batch of citations and detect scoring anomalies.
 *
 * Logs SCORING_ANOMALY if all candidates receive identical scores.
 */
export function scoreCitationBatch(
  candidates: CitationCandidate[],
  context: ScoringContext
): {
  scoredCitations: ScoredCitation[];
  hasAnomaly: boolean;
  anomalyReason?: string;
} {
  const scoredCitations = candidates.map(c => scoreCitation(c, context));

  // Check for flat scoring (all same score)
  const scores = scoredCitations.map(c => c.relevanceScore);
  const uniqueScores = new Set(scores);

  if (uniqueScores.size === 1 && candidates.length > 3) {
    // All candidates scored identically — this is anomalous
    const anomalyReason = `SCORING_ANOMALY: All ${candidates.length} candidates received identical score of ${scores[0]}`;

    logger.warn('[CITATION-SCORER] Flat scoring detected', {
      candidateCount: candidates.length,
      uniformScore: scores[0],
    });

    return {
      scoredCitations,
      hasAnomaly: true,
      anomalyReason,
    };
  }

  // Check for low variance
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev < 5 && candidates.length > 5) {
    logger.warn('[CITATION-SCORER] Low score variance', {
      stdDev,
      mean,
      candidateCount: candidates.length,
    });
  }

  return {
    scoredCitations,
    hasAnomaly: false,
  };
}
