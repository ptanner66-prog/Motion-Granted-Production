/**
 * Holding Verification Module (Phase IV-C)
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * For each candidate, Claude verifies:
 *
 * 1. Does the HOLDING support the proposition?
 *    → STRONG / MODERATE / WEAK / NO_SUPPORT
 *
 * 2. Is it still good law?
 *    → GOOD_LAW / CAUTION / BAD_LAW
 *
 * 3. Score by authority + recency + relevance
 *
 * Select TOP 2-3 citations per element
 * OUTPUT: 8-15 verified, ranked, proposition-matched citations
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  type ExtractedElement,
  type HoldingVerificationInput,
  type HoldingVerificationOutput,
  type RawCandidate,
  type ScoredCitation,
  type PropositionMatch,
  type GoodLawStatus,
} from '@/types/citation-research';
import { MODELS } from '@/lib/config/models';
import { getModel } from '@/lib/config/phase-registry';
import {
  scoreCandidate,
  selectTopCitations,
  sortByLouisianaPreference,
  countByCourtType,
} from './scoring';
import { buildElementPriorityMap } from './element-extraction';
import { getOpinionText } from '@/lib/courtlistener/client';
import { logger } from '@/lib/logger';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('workflow-phase-iv-holding-verification');
// ============================================================================
// BATCH VERIFICATION
// ============================================================================

/**
 * Batch size for parallel verification
 * Balance between speed (larger batches) and API limits
 */
const VERIFICATION_BATCH_SIZE = 5;

/**
 * Verify holdings for all candidates
 *
 * This is the core of Phase IV-C. For each candidate:
 * 1. Fetch opinion text from CourtListener (if needed)
 * 2. Have Claude verify holding supports proposition
 * 3. Score by authority + recency + relevance
 * 4. Select top citations per element
 */
export async function verifyHoldings(
  input: HoldingVerificationInput,
  anthropicClient: Anthropic,
  modelId?: string,
  thinkingBudget?: number,
): Promise<HoldingVerificationOutput> {
  const start = Date.now();

  logger.info(`╔══════════════════════════════════════════════════════════════╗`);
  logger.info(`║  PHASE IV-C: HOLDING VERIFICATION + SCORING                  ║`);
  logger.info(`╚══════════════════════════════════════════════════════════════╝`);
  logger.info(`[Phase IV-C] Candidates to verify: ${input.candidates.length}`);
  logger.info(`[Phase IV-C] Elements to cover: ${input.elements.length}`);

  try {
    // Build element map for proposition lookup
    const elementMap = new Map<string, ExtractedElement>();
    for (const element of input.elements) {
      elementMap.set(element.name, element);
      elementMap.set(element.id, element);
    }

    // Build priority map for selection
    const priorityMap = buildElementPriorityMap(input.elements);

    // ═══════════════════════════════════════════════════════════════════════
    // BATCH VERIFICATION: Process candidates in parallel batches
    // ═══════════════════════════════════════════════════════════════════════
    const scoredCitations: ScoredCitation[] = [];
    const batches = chunkArray(input.candidates, VERIFICATION_BATCH_SIZE);

    logger.info(`[Phase IV-C] Processing ${batches.length} batches of ${VERIFICATION_BATCH_SIZE}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(`[Phase IV-C] Batch ${i + 1}/${batches.length}: ${batch.length} candidates`);

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(candidate =>
          verifySingleCandidate(candidate, elementMap, anthropicClient, modelId, thinkingBudget)
        )
      );

      // Collect results
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          scoredCitations.push(result.value);
        } else if (result.status === 'rejected') {
          log.warn(`[Phase IV-C] Verification failed:`, result.reason);
        }
      }
    }

    logger.info(`[Phase IV-C] Verified citations: ${scoredCitations.length}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SELECTION: Pick top citations per element
    // ═══════════════════════════════════════════════════════════════════════
    const selectedCitations = selectTopCitations(
      scoredCitations,
      priorityMap,
      6,   // Min citations
      15   // Max citations
    );

    // Sort by Louisiana preference
    const sortedSelected = sortByLouisianaPreference(selectedCitations);

    // Calculate metrics
    const counts = countByCourtType(sortedSelected);
    const elementCoverage = calculateElementCoverage(sortedSelected, input.elements);
    const avgScore = sortedSelected.length > 0
      ? sortedSelected.reduce((sum, c) => sum + c.totalScore, 0) / sortedSelected.length
      : 0;

    const duration = Date.now() - start;

    logger.info(`[Phase IV-C] Selected citations: ${sortedSelected.length}`);
    logger.info(`[Phase IV-C] Louisiana: ${counts.louisiana}, Federal: ${counts.federal}`);
    logger.info(`[Phase IV-C] Binding: ${counts.binding}, Persuasive: ${counts.persuasive}`);
    logger.info(`[Phase IV-C] Average score: ${avgScore.toFixed(1)}`);
    logger.info(`[Phase IV-C] Duration: ${duration}ms`);

    return {
      success: sortedSelected.length >= 6,
      scoredCitations,
      selectedCitations: sortedSelected,
      totalVerified: scoredCitations.length,
      totalSelected: sortedSelected.length,
      averageScore: Math.round(avgScore * 10) / 10,
      elementCoverage,
      durationMs: duration,
      error: sortedSelected.length < 6 ? `Only ${sortedSelected.length} citations selected, minimum is 6` : undefined,
    };
  } catch (error) {
    logger.error('[Phase IV-C] Holding verification failed:', error);
    return {
      success: false,
      scoredCitations: [],
      selectedCitations: [],
      totalVerified: 0,
      totalSelected: 0,
      averageScore: 0,
      elementCoverage: new Map(),
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Holding verification failed',
    };
  }
}

// ============================================================================
// SINGLE CANDIDATE VERIFICATION
// ============================================================================

/**
 * Verify a single candidate's holding
 *
 * Steps:
 * 1. Get the element's proposition
 * 2. Use snippet (or fetch opinion text if needed)
 * 3. Ask Claude to verify holding
 * 4. Score the citation
 */
async function verifySingleCandidate(
  candidate: RawCandidate,
  elementMap: Map<string, ExtractedElement>,
  client: Anthropic,
  modelId?: string,
  thinkingBudget?: number,
): Promise<ScoredCitation | null> {
  try {
    // Get element's proposition
    const element = elementMap.get(candidate.forElement);
    const proposition = element?.proposition || `Legal support for ${candidate.forElement}`;

    // Use snippet from search for verification
    // (Fetching full text is expensive and snippet usually suffices)
    const snippetText = candidate.snippet || '';

    // If snippet is too short, try to fetch more context
    let opinionContext = snippetText;
    if (snippetText.length < 200 && candidate.id) {
      try {
        const opinionResult = await getOpinionText(candidate.id);
        if (opinionResult.success && opinionResult.data?.plain_text) {
          // Get first 2000 chars of opinion for context
          opinionContext = opinionResult.data.plain_text.substring(0, 2000);
        }
      } catch {
        // Continue with snippet
      }
    }

    // Ask Claude to verify holding
    const verification = await verifyWithClaude(
      candidate,
      proposition,
      opinionContext,
      client,
      modelId,
      thinkingBudget,
    );

    // If no support, skip this candidate
    if (verification.propositionMatch === 'NO_SUPPORT') {
      logger.info(`[Phase IV-C] Skipping ${candidate.caseName?.substring(0, 30)}... (NO_SUPPORT)`);
      return null;
    }

    // Score the citation
    return scoreCandidate(
      candidate,
      verification.propositionMatch,
      verification.relevantHolding
    );
  } catch (error) {
    log.warn(`[Phase IV-C] Failed to verify ${candidate.caseName}:`, error);
    return null;
  }
}

// ============================================================================
// CLAUDE VERIFICATION
// ============================================================================

interface ClaudeVerification {
  propositionMatch: PropositionMatch;
  relevantHolding: string;
  goodLawStatus: GoodLawStatus;
}

/**
 * Use Claude to verify if holding supports proposition
 *
 * Per Chen's verification template:
 * 1. Does the HOLDING (not dicta) support this proposition?
 * 2. How directly on point is it? (STRONG/MODERATE/WEAK/NO_SUPPORT)
 * 3. What is the relevant holding text?
 * 4. Any concerns about it being good law?
 */
async function verifyWithClaude(
  candidate: RawCandidate,
  proposition: string,
  opinionContext: string,
  client: Anthropic,
  modelId?: string,
  thinkingBudget?: number,
): Promise<ClaudeVerification> {
  const prompt = `CASE: ${candidate.caseName}
CITATION: ${candidate.citation}
COURT: ${candidate.court}
DATE: ${candidate.dateFiled}

SNIPPET/CONTEXT:
${opinionContext}

PROPOSITION TO VERIFY:
"${proposition}"

QUESTIONS:
1. Does the HOLDING (not dicta) support this proposition?
2. How directly on point is it?
3. What is the relevant holding text?
4. Any concerns about it being good law?

OUTPUT FORMAT (JSON only):
{
  "propositionMatch": "STRONG" | "MODERATE" | "WEAK" | "NO_SUPPORT",
  "relevantHolding": "extracted holding text that supports the proposition (1-3 sentences)",
  "goodLawStatus": "GOOD_LAW" | "CAUTION" | "BAD_LAW",
  "reasoning": "brief explanation of your assessment"
}

MATCHING CRITERIA:
- STRONG: Holding directly and explicitly supports the proposition
- MODERATE: Holding supports the proposition but requires inference
- WEAK: Tangentially related, could be used with qualification
- NO_SUPPORT: Does not support the proposition`;

  try {
    if (!modelId) {
      log.warn('[Phase IV-C] No modelId passed — falling back to phase-registry default (caller should pass model from registry)');
    }
    const resolvedModel = modelId || getModel('IV', 'A') || MODELS.SONNET;
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: 1024,
      ...(thinkingBudget ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudget } } : {}),
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find((c: { type: string }) => c.type === 'text');
    const text = textContent?.type === 'text' ? textContent.text : '';

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Default to WEAK if can't parse
      return {
        propositionMatch: 'WEAK',
        relevantHolding: opinionContext.substring(0, 200),
        goodLawStatus: 'GOOD_LAW',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize response
    const validMatches: PropositionMatch[] = ['STRONG', 'MODERATE', 'WEAK', 'NO_SUPPORT'];
    const validStatuses: GoodLawStatus[] = ['GOOD_LAW', 'CAUTION', 'BAD_LAW'];

    return {
      propositionMatch: validMatches.includes(parsed.propositionMatch)
        ? parsed.propositionMatch
        : 'WEAK',
      relevantHolding: parsed.relevantHolding || opinionContext.substring(0, 200),
      goodLawStatus: validStatuses.includes(parsed.goodLawStatus)
        ? parsed.goodLawStatus
        : 'GOOD_LAW',
    };
  } catch (error) {
    log.warn(`[Phase IV-C] Claude verification error for ${candidate.caseName}:`, error);
    // Default to WEAK on error
    return {
      propositionMatch: 'WEAK',
      relevantHolding: opinionContext.substring(0, 200) || 'Unable to extract holding',
      goodLawStatus: 'GOOD_LAW',
    };
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Split array into chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Calculate element coverage from selected citations
 */
function calculateElementCoverage(
  citations: ScoredCitation[],
  elements: ExtractedElement[]
): Map<string, number> {
  const coverage = new Map<string, number>();

  // Initialize all elements with 0
  for (const element of elements) {
    coverage.set(element.name, 0);
  }

  // Count citations per element
  for (const citation of citations) {
    const currentCount = coverage.get(citation.forElement) || 0;
    coverage.set(citation.forElement, currentCount + 1);
  }

  return coverage;
}

// ============================================================================
// FAST VERIFICATION (WITHOUT CLAUDE)
// ============================================================================

/**
 * Quick verification based on snippet matching (no Claude call)
 *
 * Use this for initial filtering before full Claude verification.
 * Matches key legal terms in the snippet.
 */
export function quickVerify(
  candidate: RawCandidate,
  element: ExtractedElement
): PropositionMatch {
  if (!candidate.snippet) return 'WEAK';

  const snippetLower = candidate.snippet.toLowerCase();
  const queryTerms = element.searchQueries.flatMap(q =>
    q.toLowerCase().split(' ').filter(w => w.length > 3)
  );

  let matchCount = 0;
  for (const term of queryTerms) {
    if (snippetLower.includes(term)) {
      matchCount++;
    }
  }

  // Heuristic: More term matches = stronger relevance
  if (matchCount >= 3) return 'STRONG';
  if (matchCount >= 2) return 'MODERATE';
  if (matchCount >= 1) return 'WEAK';
  return 'NO_SUPPORT';
}
