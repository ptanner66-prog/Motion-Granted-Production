import { createLogger } from '@/lib/security/logger';

const log = createLogger('courtlistener-relevance-scorer');

/**
 * Topical Relevance Scorer for CourtListener Search Results
 *
 * CHEN CITATION RELEVANCE FIX (2026-02-05)
 *
 * Scores CourtListener search results for TOPICAL RELEVANCE to the specific
 * legal proposition they're being cited for.
 *
 * This is a CODE function (not an AI call) — uses keyword matching, statutory
 * reference detection, and procedural context analysis.
 *
 * Scoring:
 * - 0.9-1.0: Case directly addresses the exact legal issue
 * - 0.7-0.89: Case discusses the legal principle in a related context
 * - 0.5-0.69: Case mentions statutory article but in different procedural context
 * - 0.0-0.49: Case has nothing to do with the legal issue
 *
 * REJECTION THRESHOLD: 0.70 — Below this, the case is NOT added to the citation bank.
 *
 * VERSION: 2026-02-05-CHEN-RELEVANCE-FIX
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RelevanceInput {
  /** Case name from CourtListener */
  caseName: string;
  /** Citation string */
  citation: string;
  /** Court identifier */
  court: string;
  /** Snippet or excerpt text from CourtListener search result */
  snippet: string;
  /** Full text if available */
  fullText?: string;
}

export interface PropositionContext {
  /** The legal proposition being supported */
  proposition: string;
  /** The motion type (e.g., "motion_to_compel_discovery") */
  motionType: string;
  /** Statutory basis articles */
  statutoryBasis: string[];
  /** Element name for this proposition */
  elementName?: string;
}

export interface RelevanceResult {
  /** Relevance score 0.0-1.0 */
  score: number;
  /** Human-readable reasoning for the score */
  reasoning: string;
  /** Specific passages from the case that relate to the proposition */
  relevant_passages: string[];
  /** Whether this passes the 0.70 threshold */
  passes_threshold: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const TOPICAL_RELEVANCE_THRESHOLD = 0.70;

// ============================================================================
// MOTION TYPE KEYWORD REGISTRY
// ============================================================================

/**
 * Keywords that indicate a case is topically relevant to a given motion type.
 * These are used to score procedural context alignment.
 *
 * Each keyword set includes statutory articles, key legal terms, and
 * procedural posture indicators specific to that motion type.
 */
const MOTION_TYPE_KEYWORDS: Record<string, string[]> = {
  'motion_to_compel_discovery': [
    'discovery', 'interrogatories', 'requests for production', 'deposition',
    'compel', 'art. 1469', 'art. 1461', 'art. 1462', 'art. 1424', 'art. 1422',
    'art. 1458', 'art. 1471', 'good faith conference', 'discovery sanctions',
    'failure to respond', 'propounded', 'discovery dispute', 'relevance',
    'proportionality', 'motion to compel', 'scope of discovery',
    'discovery order', 'compelling production', 'response deadline',
    'waiver of objections', 'inadequate response', 'privilege log',
    'work product', 'attorney-client privilege',
  ],
  'MCOMPEL': [
    'discovery', 'interrogatories', 'requests for production', 'deposition',
    'compel', 'art. 1469', 'art. 1461', 'art. 1462', 'art. 1424', 'art. 1422',
    'art. 1458', 'art. 1471', 'good faith conference', 'discovery sanctions',
    'failure to respond', 'propounded', 'discovery dispute', 'relevance',
    'proportionality', 'motion to compel', 'scope of discovery',
  ],
  'motion_for_summary_judgment': [
    'summary judgment', 'genuine issue', 'material fact', 'art. 966',
    'art. 967', 'no genuine dispute', 'entitled to judgment', 'movant',
    'burden of proof', 'summary judgment motion', 'movant burden',
    'opposing party', 'affidavit', 'deposition testimony', 'genuine issue',
    'motion for summary judgment', 'judgment as a matter of law',
  ],
  'MSJ': [
    'summary judgment', 'genuine issue', 'material fact', 'art. 966',
    'art. 967', 'no genuine dispute', 'entitled to judgment', 'movant',
    'burden of proof', 'motion for summary judgment',
  ],
  'motion_to_dismiss': [
    'exception', 'peremptory exception', 'no cause of action', 'prescription',
    'art. 927', 'art. 934', 'art. 931', 'failure to state', 'dismiss',
    'exception of no cause', 'dilatory exception', 'declinatory exception',
    'motion to dismiss', 'cause of action', 'failure to state a claim',
  ],
  'MTD_12B6': [
    'exception', 'peremptory exception', 'no cause of action', 'prescription',
    'art. 927', 'art. 934', 'art. 931', 'failure to state', 'dismiss',
    'exception of no cause', 'cause of action',
  ],
  'motion_to_strike': [
    'strike', 'motion to strike', 'scandalous', 'impertinent', 'redundant',
    'immaterial', 'prejudicial', 'expert testimony', 'daubert',
    'art. 1154', 'strike pleading', 'strike affidavit',
  ],
  'MSTRIKE': [
    'strike', 'motion to strike', 'scandalous', 'impertinent',
    'art. 1154', 'strike pleading',
  ],
  'motion_to_continue': [
    'continuance', 'motion to continue', 'good cause', 'postpone',
    'scheduling', 'trial date', 'unavailability', 'art. 1602',
  ],
  'MTC': [
    'continuance', 'motion to continue', 'good cause', 'postpone',
    'art. 1602',
  ],
  'motion_for_extension': [
    'extension', 'extension of time', 'deadline', 'time limit',
    'additional time', 'enlarge time',
  ],
  'MEXT': [
    'extension', 'extension of time', 'deadline', 'additional time',
  ],
  'motion_for_pro_hac_vice': [
    'pro hac vice', 'admission', 'out-of-state', 'foreign attorney',
    'associate local counsel', 'practice of law',
  ],
  'MPRO_HAC': [
    'pro hac vice', 'admission', 'out-of-state', 'associate local counsel',
  ],
};

/**
 * Subject matter areas that indicate IRRELEVANT cases.
 * If a case's content matches these patterns but NOT the motion type keywords,
 * it's likely topically irrelevant.
 */
const IRRELEVANT_SUBJECT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bdefamation\b/i, label: 'defamation' },
  { pattern: /\battorney\s+disciplin/i, label: 'attorney_discipline' },
  { pattern: /\bbar\s+association/i, label: 'bar_discipline' },
  { pattern: /\bethics\s+board/i, label: 'ethics_board' },
  { pattern: /\bworkers?\s+comp/i, label: 'workers_comp' },
  { pattern: /\bunemployment\s+comp/i, label: 'unemployment' },
  { pattern: /\bbankruptcy\b/i, label: 'bankruptcy' },
  { pattern: /\bchild\s+custody/i, label: 'custody' },
  { pattern: /\bdivorce\b/i, label: 'divorce' },
  { pattern: /\bcriminal\s+sentenc/i, label: 'criminal_sentencing' },
  { pattern: /\bhabeas\s+corpus/i, label: 'habeas_corpus' },
  { pattern: /\bprobation\s+revoc/i, label: 'probation' },
  { pattern: /\bzoning\b/i, label: 'zoning' },
  { pattern: /\btax\s+assessment/i, label: 'tax' },
  { pattern: /\bimmigration\b/i, label: 'immigration' },
  { pattern: /\badoption\b/i, label: 'adoption' },
];

/**
 * Case name patterns that strongly indicate irrelevant subject matter
 * for civil procedure motions.
 */
const IRRELEVANT_CASE_NAME_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bAttorney\s+Disciplinary\s+Board\b/i, label: 'attorney_discipline' },
  { pattern: /\bBoard\s+of\s+Ethics\b/i, label: 'ethics_board' },
  { pattern: /\bIn\s+re\s+Disciplinary/i, label: 'discipline' },
  { pattern: /\bWorkers?\s+Compensation/i, label: 'workers_comp' },
  { pattern: /\bState\s+(?:of\s+Louisiana\s+)?v\./i, label: 'criminal' },
  { pattern: /\bUnited\s+States\s+v\./i, label: 'criminal_federal' },
  { pattern: /\bPeople\s+v\./i, label: 'criminal' },
  { pattern: /\bCommonwealth\s+v\./i, label: 'criminal' },
];

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Score a CourtListener search result for topical relevance to a legal proposition.
 *
 * This is the main scoring function. It analyzes:
 * 1. Presence of motion-type-specific keywords in the case text
 * 2. Presence of cited statutory articles in the case text
 * 3. Procedural posture alignment (is this the same type of motion?)
 * 4. Subject matter red flags (defamation, ethics, criminal, etc.)
 * 5. Case name relevance indicators
 *
 * @returns RelevanceResult with score 0.0-1.0 and reasoning
 */
export function scoreRelevance(
  input: RelevanceInput,
  context: PropositionContext
): RelevanceResult {
  const textToAnalyze = buildAnalysisText(input);
  const textLower = textToAnalyze.toLowerCase();
  const caseNameLower = (input.caseName || '').toLowerCase();

  // Track scoring components
  let totalScore = 0;
  const reasons: string[] = [];
  const relevantPassages: string[] = [];

  // ──────────────────────────────────────────────────────────────────
  // COMPONENT 1: Statutory Article Matching (0-30 points)
  // ──────────────────────────────────────────────────────────────────
  const statutoryScore = scoreStatutoryPresence(textLower, context.statutoryBasis);
  totalScore += statutoryScore.points;
  if (statutoryScore.points > 0) {
    reasons.push(statutoryScore.reason);
    relevantPassages.push(...statutoryScore.passages);
  }

  // ──────────────────────────────────────────────────────────────────
  // COMPONENT 2: Motion Type Keyword Matching (0-35 points)
  // ──────────────────────────────────────────────────────────────────
  const keywordScore = scoreKeywordPresence(textLower, context.motionType);
  totalScore += keywordScore.points;
  if (keywordScore.points > 0) {
    reasons.push(keywordScore.reason);
  }

  // ──────────────────────────────────────────────────────────────────
  // COMPONENT 3: Procedural Posture Matching (0-20 points)
  // ──────────────────────────────────────────────────────────────────
  const posturalScore = scoreProceduralPosture(textLower, context.motionType);
  totalScore += posturalScore.points;
  if (posturalScore.points > 0) {
    reasons.push(posturalScore.reason);
  }

  // ──────────────────────────────────────────────────────────────────
  // COMPONENT 4: Subject Matter Red Flags (-40 penalty)
  // ──────────────────────────────────────────────────────────────────
  const redFlagPenalty = scoreRedFlags(textLower, caseNameLower, context.motionType);
  totalScore += redFlagPenalty.points; // Will be negative
  if (redFlagPenalty.points < 0) {
    reasons.push(redFlagPenalty.reason);
  }

  // ──────────────────────────────────────────────────────────────────
  // COMPONENT 5: Proposition Text Matching (0-15 points)
  // ──────────────────────────────────────────────────────────────────
  const propositionScore = scorePropositionAlignment(textLower, context.proposition);
  totalScore += propositionScore.points;
  if (propositionScore.points > 0) {
    reasons.push(propositionScore.reason);
  }

  // ──────────────────────────────────────────────────────────────────
  // NORMALIZE: Convert 0-100 point scale to 0.0-1.0
  // ──────────────────────────────────────────────────────────────────
  const normalizedScore = Math.max(0, Math.min(1, totalScore / 100));
  const passesThreshold = normalizedScore >= TOPICAL_RELEVANCE_THRESHOLD;

  const result: RelevanceResult = {
    score: Math.round(normalizedScore * 1000) / 1000, // 3 decimal places
    reasoning: reasons.join('; ') || 'No relevance signals detected',
    relevant_passages: relevantPassages.slice(0, 3), // Top 3 passages
    passes_threshold: passesThreshold,
  };

  // Log
  const statusIcon = passesThreshold ? '✅' : '⛔';
  log.info(`[RelevanceScorer] ${statusIcon} ${input.caseName?.substring(0, 50)}... → ${result.score} (${passesThreshold ? 'PASS' : 'REJECT'})`);
  if (!passesThreshold) {
    log.info(`[RelevanceScorer]   Reason: ${result.reasoning.substring(0, 200)}`);
  }

  return result;
}

// ============================================================================
// SCORING COMPONENTS
// ============================================================================

interface ScoreComponent {
  points: number;
  reason: string;
  passages: string[];
}

/**
 * Score the presence of the cited statutory articles in the case text.
 * This is the strongest relevance signal — if the case discusses the
 * exact statute cited in the proposition, it's likely relevant.
 */
function scoreStatutoryPresence(
  textLower: string,
  statutoryBasis: string[]
): ScoreComponent {
  if (statutoryBasis.length === 0) {
    return { points: 10, reason: 'No statutory basis specified (neutral)', passages: [] };
  }

  let matchCount = 0;
  const matchedRefs: string[] = [];
  const passages: string[] = [];

  for (const ref of statutoryBasis) {
    // Build flexible match patterns for this statutory reference
    const patterns = buildStatutoryMatchPatterns(ref);

    for (const pattern of patterns) {
      if (pattern.test(textLower)) {
        matchCount++;
        matchedRefs.push(ref);

        // Extract passage context
        const match = textLower.match(pattern);
        if (match && match.index !== undefined) {
          const start = Math.max(0, match.index - 50);
          const end = Math.min(textLower.length, match.index + match[0].length + 50);
          passages.push(textLower.substring(start, end).trim());
        }
        break; // Only count each ref once
      }
    }
  }

  if (matchCount === 0) {
    return {
      points: 0,
      reason: `No statutory refs found (looked for: ${statutoryBasis.join(', ')})`,
      passages: [],
    };
  }

  const ratio = matchCount / statutoryBasis.length;
  const points = Math.round(ratio * 30);

  return {
    points,
    reason: `Statutory match: ${matchedRefs.join(', ')} found (${matchCount}/${statutoryBasis.length})`,
    passages,
  };
}

/**
 * Build flexible regex patterns to match a statutory reference in text.
 * Handles variations like "Art. 1469", "Article 1469", "art. 1469", etc.
 */
function buildStatutoryMatchPatterns(ref: string): RegExp[] {
  const patterns: RegExp[] = [];

  // Extract article number from reference
  const artMatch = ref.match(/(?:Art\.?|art\.?|Article)\s*(\d+)/i);
  if (artMatch) {
    const artNum = artMatch[1];
    patterns.push(new RegExp(`(?:art\\.?|article)\\s*${artNum}\\b`, 'i'));
  }

  // Extract La. R.S. section
  const rsMatch = ref.match(/La\.?\s*R\.?S\.?\s*(\d+:\d+)/i);
  if (rsMatch) {
    const section = rsMatch[1].replace(':', '\\s*:\\s*');
    patterns.push(new RegExp(`la\\.?\\s*r\\.?s\\.?\\s*${section}`, 'i'));
    patterns.push(new RegExp(`revised\\s+statut\\w*\\s*${section}`, 'i'));
  }

  // Extract section number from § references
  const secMatch = ref.match(/§\s*(\d+)/);
  if (secMatch) {
    patterns.push(new RegExp(`§\\s*${secMatch[1]}\\b`, 'i'));
  }

  // Fallback: try matching the whole reference loosely
  if (patterns.length === 0) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.push(new RegExp(escaped, 'i'));
  }

  return patterns;
}

/**
 * Score the presence of motion-type-specific keywords.
 * More keyword matches = higher relevance score.
 */
function scoreKeywordPresence(
  textLower: string,
  motionType: string
): ScoreComponent {
  const keywords = MOTION_TYPE_KEYWORDS[motionType] || [];

  if (keywords.length === 0) {
    return { points: 15, reason: 'No keyword set for motion type (neutral)', passages: [] };
  }

  let matchCount = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of keywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      matchCount++;
      matchedKeywords.push(keyword);
    }
  }

  if (matchCount === 0) {
    return {
      points: 0,
      reason: `No motion-type keywords found (0/${keywords.length} for ${motionType})`,
      passages: [],
    };
  }

  // Score: 1-3 matches = 10pts, 4-6 = 20pts, 7+ = 30pts, 10+ = 35pts
  let points: number;
  if (matchCount >= 10) points = 35;
  else if (matchCount >= 7) points = 30;
  else if (matchCount >= 4) points = 20;
  else points = 10;

  return {
    points,
    reason: `${matchCount} motion keywords matched: ${matchedKeywords.slice(0, 5).join(', ')}${matchCount > 5 ? '...' : ''}`,
    passages: [],
  };
}

/**
 * Score procedural posture alignment.
 * Does the case involve the same type of procedural motion?
 */
function scoreProceduralPosture(
  textLower: string,
  motionType: string
): ScoreComponent {
  // Map motion types to procedural posture indicators
  const postureMap: Record<string, string[]> = {
    'motion_to_compel_discovery': ['motion to compel', 'compelled discovery', 'compelling production', 'discovery dispute', 'discovery order'],
    'MCOMPEL': ['motion to compel', 'compelled discovery', 'compelling production', 'discovery dispute', 'discovery order'],
    'motion_for_summary_judgment': ['summary judgment', 'motion for summary', 'summary judgment motion', 'granted summary'],
    'MSJ': ['summary judgment', 'motion for summary', 'granted summary'],
    'motion_to_dismiss': ['peremptory exception', 'motion to dismiss', 'exception of no cause', 'dismissed the petition'],
    'MTD_12B6': ['peremptory exception', 'motion to dismiss', 'exception of no cause'],
    'motion_to_strike': ['motion to strike', 'striking the', 'stricken'],
    'MSTRIKE': ['motion to strike', 'striking the'],
    'motion_to_continue': ['motion to continue', 'continuance', 'motion for continuance'],
    'MTC': ['continuance', 'motion to continue'],
  };

  const indicators = postureMap[motionType] || [];
  if (indicators.length === 0) {
    return { points: 10, reason: 'No procedural posture data (neutral)', passages: [] };
  }

  let matchCount = 0;
  for (const indicator of indicators) {
    if (textLower.includes(indicator.toLowerCase())) {
      matchCount++;
    }
  }

  if (matchCount === 0) {
    return {
      points: 0,
      reason: `No procedural posture match for ${motionType}`,
      passages: [],
    };
  }

  const points = matchCount >= 3 ? 20 : matchCount >= 2 ? 15 : 10;

  return {
    points,
    reason: `Procedural posture match: ${matchCount} indicators found for ${motionType}`,
    passages: [],
  };
}

/**
 * Score subject matter red flags.
 * Returns NEGATIVE points if the case appears to be about a completely
 * different area of law.
 *
 * A defamation case cited for a discovery motion gets penalized here.
 */
function scoreRedFlags(
  textLower: string,
  caseNameLower: string,
  motionType: string
): ScoreComponent {
  // Check case name patterns first (strongest signal)
  for (const { pattern, label } of IRRELEVANT_CASE_NAME_PATTERNS) {
    if (pattern.test(caseNameLower)) {
      // Exception: if the motion type keywords are ALSO present, it might be relevant
      // (e.g., a criminal case that discusses discovery rules in dictum)
      const keywords = MOTION_TYPE_KEYWORDS[motionType] || [];
      const keywordHits = keywords.filter(k => textLower.includes(k.toLowerCase())).length;

      if (keywordHits < 3) {
        return {
          points: -40,
          reason: `RED FLAG: Case name pattern "${label}" indicates irrelevant subject matter`,
          passages: [],
        };
      }
    }
  }

  // Check content patterns
  let irrelevantSignalCount = 0;
  const flaggedSubjects: string[] = [];

  for (const { pattern, label } of IRRELEVANT_SUBJECT_PATTERNS) {
    if (pattern.test(textLower)) {
      irrelevantSignalCount++;
      flaggedSubjects.push(label);
    }
  }

  // Only penalize if irrelevant signals outnumber relevant signals
  if (irrelevantSignalCount > 0) {
    const keywords = MOTION_TYPE_KEYWORDS[motionType] || [];
    const relevantHits = keywords.filter(k => textLower.includes(k.toLowerCase())).length;

    if (relevantHits < irrelevantSignalCount * 2) {
      // Irrelevant signals dominate — penalize
      const penalty = Math.min(40, irrelevantSignalCount * 15);
      return {
        points: -penalty,
        reason: `RED FLAG: Irrelevant subject matter detected (${flaggedSubjects.join(', ')}) with only ${relevantHits} relevant keyword hits`,
        passages: [],
      };
    }
  }

  return { points: 0, reason: '', passages: [] };
}

/**
 * Score alignment between the case text and the specific proposition text.
 * Looks for key terms from the proposition in the case content.
 */
function scorePropositionAlignment(
  textLower: string,
  proposition: string
): ScoreComponent {
  if (!proposition) {
    return { points: 5, reason: 'No proposition text (neutral)', passages: [] };
  }

  // Extract meaningful words from the proposition (skip stop words)
  const SCORE_STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'must', 'that', 'which',
    'who', 'whom', 'this', 'these', 'those', 'it', 'its', 'of', 'in',
    'for', 'on', 'at', 'to', 'from', 'by', 'with', 'as', 'or', 'and',
    'but', 'not', 'no', 'nor', 'if', 'then', 'than', 'so', 'very',
  ]);

  const propWords = proposition
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !SCORE_STOP_WORDS.has(w));

  if (propWords.length === 0) {
    return { points: 5, reason: 'No meaningful proposition words', passages: [] };
  }

  let matchCount = 0;
  for (const word of propWords) {
    if (textLower.includes(word)) {
      matchCount++;
    }
  }

  const ratio = matchCount / propWords.length;

  if (ratio === 0) {
    return { points: 0, reason: 'No proposition term overlap', passages: [] };
  }

  const points = Math.round(ratio * 15);

  return {
    points,
    reason: `Proposition alignment: ${matchCount}/${propWords.length} terms matched (${Math.round(ratio * 100)}%)`,
    passages: [],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a combined text for analysis from available case information.
 */
function buildAnalysisText(input: RelevanceInput): string {
  const parts: string[] = [];

  if (input.caseName) parts.push(input.caseName);
  if (input.snippet) parts.push(input.snippet);
  if (input.fullText) parts.push(input.fullText.substring(0, 5000)); // Cap for performance

  return parts.join(' ');
}

/**
 * Batch-score multiple candidates against a proposition.
 * Returns only candidates that pass the threshold.
 */
export function filterByRelevance(
  candidates: Array<RelevanceInput & { id: number; [key: string]: unknown }>,
  context: PropositionContext,
): Array<{ candidate: RelevanceInput & { id: number; [key: string]: unknown }; result: RelevanceResult }> {
  const results: Array<{ candidate: RelevanceInput & { id: number; [key: string]: unknown }; result: RelevanceResult }> = [];
  let rejected = 0;

  for (const candidate of candidates) {
    const result = scoreRelevance(candidate, context);

    if (result.passes_threshold) {
      results.push({ candidate, result });
    } else {
      rejected++;
      log.info(`[RelevanceScorer] ⛔ REJECTED: "${candidate.caseName?.substring(0, 50)}..." — score ${result.score} < ${TOPICAL_RELEVANCE_THRESHOLD}`);
      log.info(`[RelevanceScorer]   Reason: ${result.reasoning.substring(0, 200)}`);
    }
  }

  log.info(`[RelevanceScorer] Batch result: ${results.length} passed, ${rejected} rejected out of ${candidates.length} candidates`);

  return results;
}

// ============================================================================
// SP-06 CIV-006: THREE-AXIS RELEVANCE SCORING
// ============================================================================
//
// Scores CourtListener search results on three weighted axes:
//   Keyword match: 40%  |  Court level: 30%  |  Recency: 30%
//
// BINDING WEIGHTS — do not modify these ratios.
// ============================================================================

/** Minimum fields required for three-axis scoring */
export interface SearchResultCandidate {
  id: number;
  clusterId: number;
  caseName: string;
  citation: string;
  court: string;
  dateFiled: string;
  snippet?: string;
  forElement: string;
  relevanceScore?: number;
}

/** A search result scored by the three-axis model */
export interface ScoredSearchResult {
  /** The original candidate data */
  candidate: SearchResultCandidate;
  /** Composite relevance score (0-1) */
  relevanceScore: number;
  /** Per-axis breakdown */
  breakdown: {
    keywordScore: number;     // 0-1
    courtLevelScore: number;  // 0-1
    recencyScore: number;     // 0-1
  };
}

export interface SearchScoringContext {
  /** Terms to match against case text */
  queryTerms: string[];
  /** Statutory basis reference (double-weighted in keyword scoring) */
  statutoryBasis?: string;
  /** Jurisdiction (e.g., 'LA') */
  jurisdiction: string;
  /** Filing court type */
  filingCourt: 'state' | 'federal';
  /** Filing circuit for same-circuit binding analysis */
  filingCircuit?: string;
}

/**
 * Score CourtListener search results for relevance.
 *
 * Weights (BINDING — do not modify):
 * - Keyword match: 40%
 * - Court level: 30%
 * - Recency: 30%
 *
 * @param candidates - CourtListener search result candidates
 * @param context - The search context (query terms, jurisdiction, filing court)
 * @returns Scored and sorted results (highest relevance first)
 */
export function scoreSearchResults(
  candidates: SearchResultCandidate[],
  context: SearchScoringContext
): ScoredSearchResult[] {
  const scored = candidates.map(candidate => {
    const keywordScore = calculateKeywordScore(candidate, context);
    const courtLevelScore = calculateCourtLevelScore(candidate, context);
    const recencyScore = calculateRecencyScore(candidate);

    const relevanceScore =
      (keywordScore * 0.40) +
      (courtLevelScore * 0.30) +
      (recencyScore * 0.30);

    return {
      candidate,
      relevanceScore: Math.round(relevanceScore * 1000) / 1000,
      breakdown: { keywordScore, courtLevelScore, recencyScore },
    };
  });

  // Sort by relevance score descending
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Filter scored results below a minimum relevance threshold.
 *
 * @param scored - Scored results from scoreSearchResults()
 * @param minScore - Minimum relevance score (0-1). Default 0.3
 * @returns Filtered results above threshold
 */
export function filterByMinimumScore(
  scored: ScoredSearchResult[],
  minScore: number = 0.3
): ScoredSearchResult[] {
  const filtered = scored.filter(s => s.relevanceScore >= minScore);
  const rejected = scored.length - filtered.length;
  if (rejected > 0) {
    log.info(`[SearchScorer] Filtered out ${rejected} results below ${minScore} threshold`);
  }
  return filtered;
}

// ============================================================================
// THREE-AXIS SCORING COMPONENTS
// ============================================================================

function calculateKeywordScore(
  candidate: { caseName: string; snippet?: string; court: string },
  context: SearchScoringContext
): number {
  const text = [
    candidate.caseName || '',
    candidate.snippet || '',
  ].join(' ').toLowerCase();

  let matchCount = 0;
  let totalTerms = context.queryTerms.length;

  for (const term of context.queryTerms) {
    if (text.includes(term.toLowerCase())) {
      matchCount++;
    }
  }

  // Statutory basis match is worth double
  if (context.statutoryBasis) {
    totalTerms++;
    if (text.includes(context.statutoryBasis.toLowerCase())) {
      matchCount += 2; // Double weight for statute match
    }
  }

  return totalTerms > 0 ? Math.min(matchCount / totalTerms, 1.0) : 0;
}

function calculateCourtLevelScore(
  candidate: { court: string },
  context: SearchScoringContext
): number {
  const court = (candidate.court || '').toLowerCase();

  // U.S. Supreme Court — binding everywhere
  if (court.includes('u.s. supreme') || court.includes('united states supreme') || court === 'scotus') {
    return 1.0;
  }

  // Louisiana authority matrix (state court filing)
  if (context.jurisdiction === 'LA' && context.filingCourt === 'state') {
    if (court.includes('supreme') && court.includes('louisiana')) return 1.0;
    if ((court.includes('court of appeal') || court === 'lactapp') && court.includes('louisiana')) {
      return 0.80; // Without circuit info, use middle ground
    }
    if (court.includes('fifth circuit') || court.includes('5th circuit') || court === 'ca5') return 0.75;
    if (court.includes('supreme') && !court.includes('louisiana')) return 0.40;
    return 0.30;
  }

  // Louisiana authority matrix (federal court filing)
  if (context.jurisdiction === 'LA' && context.filingCourt === 'federal') {
    if (court.includes('fifth circuit') || court.includes('5th circuit') || court === 'ca5') return 0.95;
    if (court.includes('supreme') && court.includes('louisiana')) return 0.85;
    if ((court.includes('court of appeal') || court === 'lactapp') && court.includes('louisiana')) return 0.65;
    return 0.30;
  }

  // Generic fallback for other jurisdictions
  if (court.includes('supreme')) return 0.80;
  if (court.includes('court of appeal') || court.includes('circuit')) return 0.60;
  return 0.30;
}

function calculateRecencyScore(
  candidate: { dateFiled: string }
): number {
  const dateFiled = candidate.dateFiled;
  if (!dateFiled) return 0.30; // Unknown date = low score

  const filedDate = new Date(dateFiled);
  if (isNaN(filedDate.getTime())) return 0.30;

  const now = new Date();
  const yearsAgo = (now.getTime() - filedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (yearsAgo <= 5) return 1.0;
  if (yearsAgo <= 10) return 0.85;
  if (yearsAgo <= 20) return 0.70;
  if (yearsAgo <= 30) return 0.50;
  return 0.30;
}
