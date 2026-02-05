/**
 * Proposition-Aware Query Builder for CourtListener
 *
 * CHEN CITATION RELEVANCE FIX (2026-02-05)
 *
 * Replaces the old simplifyQuery() which truncated to 5-8 words and stripped
 * statutory references. That caused irrelevant results (defamation cases cited
 * for discovery propositions).
 *
 * This builder constructs PROPOSITION-SPECIFIC queries that:
 * - Preserve statutory references (Art. 1469, La. C.C.P., La. R.S., etc.)
 * - Include the core legal concept tied to a specific proposition
 * - Filter to Louisiana courts
 * - Limit to 15 words max (CourtListener works best with focused queries)
 *
 * VERSION: 2026-02-05-CHEN-RELEVANCE-FIX
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LegalProposition {
  /** The legal proposition text (e.g., "Defendant failed to respond to discovery within 30 days") */
  proposition: string;
  /** Statutory bases (e.g., ["La. C.C.P. Art. 1469", "La. C.C.P. Art. 1461"]) */
  statutory_basis: string[];
  /** Jurisdiction (e.g., "Louisiana", "19th Judicial District Court") */
  jurisdiction: string;
  /** Motion type (e.g., "motion_to_compel_discovery", "motion_for_summary_judgment") */
  motion_type: string;
}

// ============================================================================
// STATUTORY REFERENCE PATTERNS
// ============================================================================

/**
 * Patterns that MUST be preserved in queries — these are the statutory anchors
 * that drive relevant results from CourtListener.
 */
const STATUTORY_PATTERNS = [
  /La\.?\s*C\.?C\.?P\.?\s*(?:Art\.?|art\.?)\s*\d+/gi,
  /La\.?\s*R\.?S\.?\s*\d+:\d+/gi,
  /La\.?\s*Civ\.?\s*Code\s*(?:art\.?|Art\.?)\s*\d+/gi,
  /\d+\s*U\.S\.C\.?\s*§\s*\d+[a-z]?/gi,
  /Fed\.?\s*R\.?\s*(?:Civ|Crim|Evid|App)\.?\s*P\.?\s*\d+/gi,
  /Art\.?\s*\d+/gi,
  /§\s*\d+/gi,
];

/**
 * Extract all statutory references from a text.
 */
function extractStatutoryRefs(text: string): string[] {
  const refs: string[] = [];
  for (const pattern of STATUTORY_PATTERNS) {
    // Reset lastIndex since we reuse patterns with /g flag
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      refs.push(...matches);
    }
  }
  // Deduplicate
  return [...new Set(refs)];
}

// ============================================================================
// CORE LEGAL CONCEPT EXTRACTION
// ============================================================================

/**
 * Common legal phrases that should be preserved as units in queries.
 */
const LEGAL_PHRASE_UNITS = [
  'motion to compel',
  'motion to dismiss',
  'summary judgment',
  'good faith conference',
  'discovery sanctions',
  'failure to respond',
  'peremptory exception',
  'no cause of action',
  'genuine issue',
  'material fact',
  'burden of proof',
  'requests for production',
  'motion to strike',
  'pro hac vice',
  'preliminary injunction',
  'temporary restraining order',
  'protective order',
  'motion in limine',
  'discovery dispute',
  'attorney fees',
  'waiver of objections',
];

/**
 * Stop words to remove from queries when building focused searches.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'must', 'that', 'which',
  'who', 'whom', 'this', 'these', 'those', 'it', 'its', 'of', 'in',
  'for', 'on', 'at', 'to', 'from', 'by', 'with', 'as', 'or', 'and',
  'but', 'not', 'no', 'nor', 'if', 'then', 'than', 'so', 'very',
  'also', 'just', 'about', 'above', 'after', 'before', 'between',
  'under', 'over', 'through', 'during', 'each', 'every', 'all', 'both',
  'any', 'some', 'such', 'into', 'out', 'up', 'down',
]);

/**
 * Extract core legal concepts from a proposition text.
 * Returns meaningful legal terms, not stop words.
 */
function extractCoreConcepts(proposition: string): string[] {
  const lower = proposition.toLowerCase();

  // First, try to find multi-word legal phrase units
  const foundPhrases: string[] = [];
  for (const phrase of LEGAL_PHRASE_UNITS) {
    if (lower.includes(phrase)) {
      foundPhrases.push(phrase);
    }
  }

  // Extract individual meaningful words (not stop words, not in found phrases)
  const words = proposition
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  // Combine phrases + individual words, deduplicated
  const allConcepts = [...foundPhrases];
  for (const word of words) {
    // Don't add words that are already part of a found phrase
    const alreadyCovered = foundPhrases.some(p =>
      p.toLowerCase().includes(word.toLowerCase())
    );
    if (!alreadyCovered) {
      allConcepts.push(word);
    }
  }

  return allConcepts;
}

// ============================================================================
// QUERY BUILDING
// ============================================================================

/**
 * Build a proposition-aware CourtListener search query.
 *
 * Query construction priority:
 * 1. "[Statutory article] [core legal concept] [jurisdiction filter]"
 *    Example: "Art. 1469 motion compel discovery Louisiana"
 *
 * 2. "[Core legal concept] [specific issue]"
 *    Example: "motion compel discovery good faith conference"
 *
 * 3. "[Broader legal concept]"
 *    Example: "discovery sanctions failure respond interrogatories"
 *
 * CRITICAL: Preserves ALL of these patterns in queries:
 * - "Art." / "Article" + number
 * - "La. C.C.P." / "La. R.S." + article/section number
 * - "§" + number
 * - Court rule references
 *
 * @param proposition The legal proposition to build a query for
 * @returns A focused CourtListener search query (max 15 words)
 */
export function buildPropositionQuery(proposition: LegalProposition): string {
  const parts: string[] = [];

  // 1. Add statutory basis as primary anchor
  if (proposition.statutory_basis.length > 0) {
    // Use first statutory ref (most specific)
    const primaryRef = proposition.statutory_basis[0];
    // Shorten "La. C.C.P. Art. 1469" to "Art. 1469" for query efficiency
    const shortRef = shortenStatutoryRef(primaryRef);
    parts.push(shortRef);
  }

  // 2. Add core legal concepts from the proposition
  const concepts = extractCoreConcepts(proposition.proposition);
  // Take top concepts (prioritize multi-word phrases)
  const sortedConcepts = concepts.sort((a, b) => {
    // Multi-word phrases first
    const aWords = a.split(' ').length;
    const bWords = b.split(' ').length;
    return bWords - aWords;
  });

  for (const concept of sortedConcepts.slice(0, 3)) {
    parts.push(concept);
  }

  // 3. Add jurisdiction qualifier
  if (proposition.jurisdiction.toLowerCase().includes('louisiana') ||
      proposition.jurisdiction.toLowerCase() === 'la') {
    parts.push('Louisiana');
  } else if (proposition.jurisdiction) {
    // For non-Louisiana jurisdictions, add the state name
    parts.push(proposition.jurisdiction);
  }

  // Build query, enforce 15-word limit
  let query = parts.join(' ');
  const words = query.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 15) {
    query = words.slice(0, 15).join(' ');
  }

  console.log(`[QueryBuilder] Proposition: "${proposition.proposition.substring(0, 60)}..."`);
  console.log(`[QueryBuilder] Statutory basis: ${proposition.statutory_basis.join(', ') || 'none'}`);
  console.log(`[QueryBuilder] Built query: "${query}"`);

  return query;
}

/**
 * Shorten a statutory reference for query efficiency.
 * "La. C.C.P. Art. 1469" → "Art. 1469"
 * "La. R.S. 13:3201" → "La. R.S. 13:3201" (keep as-is, unique enough)
 */
function shortenStatutoryRef(ref: string): string {
  // La. C.C.P. Art. X → Art. X (the article number is the key anchor)
  const ccpMatch = ref.match(/(?:La\.?\s*C\.?C\.?P\.?\s*)?(Art\.?\s*\d+)/i);
  if (ccpMatch) {
    return ccpMatch[1];
  }

  // La. R.S. X:Y → keep full (unique identifier)
  const rsMatch = ref.match(/La\.?\s*R\.?S\.?\s*\d+:\d+/i);
  if (rsMatch) {
    return rsMatch[0];
  }

  return ref;
}

/**
 * Build fallback queries that are progressively broader.
 *
 * If the primary proposition query returns 0 results, these provide
 * increasingly broad alternatives while still maintaining topical relevance.
 *
 * @param proposition The legal proposition
 * @returns Array of 3 fallback queries, from specific to broad
 */
export function buildFallbackQueries(proposition: LegalProposition): string[] {
  const fallbacks: string[] = [];
  const concepts = extractCoreConcepts(proposition.proposition);
  const statutoryRefs = proposition.statutory_basis.map(shortenStatutoryRef);

  // Fallback 1: Core legal concept + jurisdiction (no statutory ref)
  const concept1 = concepts.slice(0, 3).join(' ');
  fallbacks.push(`${concept1} Louisiana appellate`.trim());

  // Fallback 2: Broader motion type + key concept
  const motionLabel = normalizeMotionType(proposition.motion_type);
  const keyConcept = concepts[0] || '';
  fallbacks.push(`${motionLabel} ${keyConcept} Louisiana`.trim());

  // Fallback 3: Just the statutory article + generic legal context
  if (statutoryRefs.length > 0) {
    fallbacks.push(`${statutoryRefs[0]} Louisiana court appeal`.trim());
  } else {
    // No statutory ref — use broad motion type search
    fallbacks.push(`${motionLabel} Louisiana civil procedure`.trim());
  }

  // Enforce 15-word limit on each
  return fallbacks.map(q => {
    const words = q.split(/\s+/).filter(w => w.length > 0);
    return words.length > 15 ? words.slice(0, 15).join(' ') : q;
  });
}

/**
 * Normalize motion type string to a human-readable label.
 */
function normalizeMotionType(motionType: string): string {
  const mapping: Record<string, string> = {
    'motion_to_compel_discovery': 'motion compel discovery',
    'motion_to_compel': 'motion compel discovery',
    'MCOMPEL': 'motion compel discovery',
    'motion_for_summary_judgment': 'summary judgment',
    'MSJ': 'summary judgment',
    'motion_to_dismiss': 'motion dismiss',
    'MTD_12B6': 'peremptory exception no cause action',
    'motion_to_strike': 'motion strike',
    'MSTRIKE': 'motion strike',
    'motion_to_continue': 'motion continuance',
    'MTC': 'motion continuance',
    'motion_for_extension': 'motion extension time',
    'MEXT': 'motion extension time',
    'motion_for_pro_hac_vice': 'pro hac vice admission',
    'MPRO_HAC': 'pro hac vice admission',
  };

  return mapping[motionType] || motionType.replace(/_/g, ' ');
}

/**
 * Build a proposition query from Phase III research query data.
 *
 * This accepts the structured research_queries output from Phase III
 * and converts it into a CourtListener-ready query.
 */
export function buildQueryFromResearchData(researchQuery: {
  proposition: string;
  primary_query?: string;
  statutory_basis: string[];
  required_topic?: string;
}): string {
  // If Phase III already generated a primary_query, use it (AI-generated tends to be good)
  if (researchQuery.primary_query && researchQuery.primary_query.length > 5) {
    // But still enforce limits
    const words = researchQuery.primary_query.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 15) {
      return researchQuery.primary_query;
    }
    return words.slice(0, 15).join(' ');
  }

  // Otherwise, build from proposition
  return buildPropositionQuery({
    proposition: researchQuery.proposition,
    statutory_basis: researchQuery.statutory_basis,
    jurisdiction: 'Louisiana',
    motion_type: researchQuery.required_topic || 'GENERIC',
  });
}

// ============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use buildPropositionQuery() instead.
 * This is a compatibility shim that wraps the new proposition-aware builder.
 */
export function simplifyQueryV2(query: string, statutoryBasis?: string[]): string {
  // Extract statutory refs from the query itself if none provided
  const refs = statutoryBasis || extractStatutoryRefs(query);

  return buildPropositionQuery({
    proposition: query,
    statutory_basis: refs,
    jurisdiction: 'Louisiana',
    motion_type: 'GENERIC',
  });
}
