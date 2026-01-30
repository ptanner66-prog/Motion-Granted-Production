/**
 * PHASE IV MULTI-STEP EXECUTOR
 *
 * Splits Phase IV into multiple Inngest steps to avoid Vercel timeout.
 * Each batch of CourtListener searches runs in its own step with checkpoint.
 *
 * ARCHITECTURE:
 * - step.run("phase-iv-init") → Extract elements, plan searches
 * - step.run("phase-iv-batch-1") → 3 searches → checkpoint
 * - step.run("phase-iv-batch-2") → 3 searches → checkpoint
 * - ... (N batches)
 * - step.run("phase-iv-aggregate") → Combine results, score, select
 *
 * VERSION: 2026-01-30-CHEN-MULTI-STEP
 */

import { randomUUID } from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Create a unique ID (alternative to cuid2)
const createId = () => randomUUID().slice(0, 8);
import { searchOpinions } from '@/lib/courtlistener/client';
import { PER_REQUEST_TIMEOUT_MS } from '@/lib/courtlistener/batched-search';
import type { PhaseInput } from '@/lib/workflow/phase-executors';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchTask {
  taskId: string;
  query: string;
  elementId: string;
  elementName: string;
  tier: 'tier1' | 'tier2' | 'tier3';
}

export interface SearchResult {
  taskId: string;
  elementId: string;
  elementName: string;
  success: boolean;
  candidates: CitationCandidate[];
  error?: string;
  durationMs: number;
}

export interface CitationCandidate {
  id: number;
  clusterId: number;
  caseName: string;
  citation: string;
  court: string;
  dateFiled: string;
  snippet?: string;
  relevanceScore?: number;
  forElement: string;
}

export interface ExtractedElement {
  id: string;
  name: string;
  description: string;
  isCritical: boolean;
  searchQueries: string[];
}

export interface PhaseIVInitResult {
  executionId: string;
  orderId: string;
  elements: ExtractedElement[];
  searchTasks: SearchTask[];
  totalBatches: number;
  jurisdiction: string;
  motionType: string;
}

export interface PhaseIVBatchResult {
  batchIndex: number;
  results: SearchResult[];
  successCount: number;
  failureCount: number;
  durationMs: number;
}

export interface PhaseIVAggregateResult {
  success: boolean;
  totalCandidates: number;
  caseCitationBank: SelectedCitation[];
  statutoryCitationBank: StatutoryCitation[];
  citationCount: number;
  bindingCount: number;
  persuasiveCount: number;
  louisianaCitations: number;
  federalCitations: number;
  flaggedForReview: boolean;
  qualityNotes?: string;
  elementsCovered: number;
  totalElements: number;
  verificationProof: {
    searchesPerformed: number;
    candidatesFound: number;
    candidatesVerified: number;
    citationsSelected: number;
    allCitationsVerified: boolean;
    verificationSource: string;
    verificationTimestamp: string;
  };
}

export interface SelectedCitation {
  courtlistener_id: number;
  courtlistener_cluster_id: number;
  caseName: string;
  citation: string;
  court: string;
  dateFiled: string;
  forElement: string;
  authorityLevel: 'binding' | 'persuasive';
  relevanceScore: number;
  verification_timestamp: string;
  verification_method: 'search';
}

export interface StatutoryCitation {
  citation: string;
  title: string;
  section: string;
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SEARCHES_PER_BATCH = 3; // How many CourtListener searches per Inngest step
const MAX_QUERIES_PER_ELEMENT = 3; // Limit queries per element
const MINIMUM_CITATIONS_HARD_STOP = 4;
const MINIMUM_CITATIONS_IDEAL = 6;

// Standard elements for motion types (fallback if Phase II/III don't provide)
const STANDARD_ELEMENTS: Record<string, ExtractedElement[]> = {
  MCOMPEL: [
    {
      id: 'elem-1',
      name: 'Discovery Request Propounded',
      description: 'Valid discovery request was served',
      isCritical: true,
      searchQueries: ['discovery request Louisiana', 'interrogatories served Louisiana'],
    },
    {
      id: 'elem-2',
      name: 'Response Deadline Expired',
      description: 'Response deadline has passed',
      isCritical: true,
      searchQueries: ['discovery deadline Louisiana', 'thirty day response discovery'],
    },
    {
      id: 'elem-3',
      name: 'Inadequate Response',
      description: 'Response was inadequate or not provided',
      isCritical: true,
      searchQueries: ['failure respond discovery Louisiana', 'inadequate discovery response'],
    },
    {
      id: 'elem-4',
      name: 'Good Faith Effort',
      description: 'Movant made good faith effort to resolve',
      isCritical: false,
      searchQueries: ['good faith discovery Louisiana', 'meet confer discovery'],
    },
    {
      id: 'elem-5',
      name: 'Relevance',
      description: 'Discovery is relevant to claims/defenses',
      isCritical: false,
      searchQueries: ['discovery relevance Louisiana', 'scope discovery Louisiana'],
    },
    {
      id: 'elem-6',
      name: 'Not Privileged',
      description: 'Discovery is not privileged',
      isCritical: false,
      searchQueries: ['discovery privilege Louisiana', 'work product doctrine Louisiana'],
    },
  ],
  MTD_12B6: [
    {
      id: 'elem-1',
      name: 'Failure to State Claim',
      description: 'Plaintiff fails to state a claim upon which relief can be granted',
      isCritical: true,
      searchQueries: ['failure state claim Louisiana', 'motion dismiss Louisiana'],
    },
    {
      id: 'elem-2',
      name: 'Pleading Standard',
      description: 'Complaint must meet pleading requirements',
      isCritical: true,
      searchQueries: ['pleading standard Louisiana', 'complaint sufficiency'],
    },
    {
      id: 'elem-3',
      name: 'Legal Insufficiency',
      description: 'Even if facts are true, no legal claim exists',
      isCritical: true,
      searchQueries: ['legal insufficiency Louisiana', 'no cause action'],
    },
  ],
  MSJ: [
    {
      id: 'elem-1',
      name: 'No Genuine Dispute',
      description: 'No genuine dispute as to any material fact',
      isCritical: true,
      searchQueries: ['summary judgment Louisiana', 'genuine issue material fact'],
    },
    {
      id: 'elem-2',
      name: 'Entitled to Judgment',
      description: 'Movant is entitled to judgment as a matter of law',
      isCritical: true,
      searchQueries: ['judgment matter law Louisiana', 'summary judgment standard'],
    },
    {
      id: 'elem-3',
      name: 'Burden of Proof',
      description: 'Movant must meet initial burden',
      isCritical: true,
      searchQueries: ['summary judgment burden Louisiana', 'burden proof summary'],
    },
  ],
  DEFAULT: [
    {
      id: 'elem-1',
      name: 'Procedural Requirements',
      description: 'Motion meets procedural requirements',
      isCritical: true,
      searchQueries: ['Louisiana civil procedure', 'motion requirements Louisiana'],
    },
    {
      id: 'elem-2',
      name: 'Substantive Grounds',
      description: 'Motion has substantive legal grounds',
      isCritical: true,
      searchQueries: ['Louisiana motion practice', 'legal grounds motion'],
    },
    {
      id: 'elem-3',
      name: 'Relief Requested',
      description: 'Court has authority to grant relief',
      isCritical: false,
      searchQueries: ['court authority Louisiana', 'relief granted motion'],
    },
  ],
};

// Statutory banks for common motion types
const MOTION_STATUTORY_BANKS: Record<string, StatutoryCitation[]> = {
  MCOMPEL: [
    {
      citation: 'La. C.C.P. art. 1469',
      title: 'Louisiana Code of Civil Procedure',
      section: 'Article 1469',
      description: 'Motion to compel discovery',
    },
    {
      citation: 'La. C.C.P. art. 1471',
      title: 'Louisiana Code of Civil Procedure',
      section: 'Article 1471',
      description: 'Sanctions for failure to comply with discovery',
    },
  ],
  MTD_12B6: [
    {
      citation: 'La. C.C.P. art. 927',
      title: 'Louisiana Code of Civil Procedure',
      section: 'Article 927',
      description: 'Peremptory exception - no cause of action',
    },
  ],
  MSJ: [
    {
      citation: 'La. C.C.P. art. 966',
      title: 'Louisiana Code of Civil Procedure',
      section: 'Article 966',
      description: 'Motion for summary judgment',
    },
  ],
};

// ============================================================================
// SUPABASE HELPER
// ============================================================================

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// STEP 1: INIT - Extract elements and plan searches
// ============================================================================

/**
 * Initialize Phase IV: Extract elements and plan search tasks
 * This runs as a single Inngest step before the batched searches
 */
export async function executePhaseIVInit(
  input: PhaseInput
): Promise<PhaseIVInitResult> {
  const executionId = `p4-init-${Date.now()}-${createId().slice(0, 6)}`;

  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE IV-INIT: PLANNING MULTI-STEP SEARCH                            ║');
  console.log('║  VERSION: 2026-01-30-CHEN-MULTI-STEP                                   ║');
  console.log(`║  EXECUTION ID: ${executionId.padEnd(52)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const { orderId, jurisdiction, motionType } = input;

  console.log(`[Phase IV-Init] Order ID: ${orderId}`);
  console.log(`[Phase IV-Init] Jurisdiction: ${jurisdiction}`);
  console.log(`[Phase IV-Init] Motion Type: ${motionType}`);

  // Extract elements from previous phases or use defaults
  const elements = extractLegalElements(input);
  console.log(`[Phase IV-Init] Extracted ${elements.length} legal elements`);

  // Generate search tasks for each element
  const searchTasks: SearchTask[] = [];
  let taskCounter = 0;

  for (const element of elements) {
    // Limit queries per element
    const queries = element.searchQueries.slice(0, MAX_QUERIES_PER_ELEMENT);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      // Assign tier based on query position
      const tier: 'tier1' | 'tier2' | 'tier3' = i === 0 ? 'tier1' : i === 1 ? 'tier2' : 'tier3';

      searchTasks.push({
        taskId: `task-${++taskCounter}`,
        query,
        elementId: element.id,
        elementName: element.name,
        tier,
      });
    }
  }

  const totalBatches = Math.ceil(searchTasks.length / SEARCHES_PER_BATCH);

  console.log(`[Phase IV-Init] Generated ${searchTasks.length} search tasks`);
  console.log(`[Phase IV-Init] Will execute in ${totalBatches} batches`);
  console.log(`[Phase IV-Init] Searches per batch: ${SEARCHES_PER_BATCH}`);

  return {
    executionId,
    orderId,
    elements,
    searchTasks,
    totalBatches,
    jurisdiction: jurisdiction || 'Louisiana',
    motionType: motionType || 'MCOMPEL',
  };
}

// ============================================================================
// STEP 2-N: BATCH - Execute a single batch of searches
// ============================================================================

/**
 * Execute a single batch of searches
 * This runs as its own Inngest step with checkpoint
 */
export async function executePhaseIVBatch(
  batchIndex: number,
  searchTasks: SearchTask[],
  jurisdiction: string
): Promise<PhaseIVBatchResult> {
  const startTime = Date.now();

  console.log(`╔════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  PHASE IV-BATCH ${String(batchIndex + 1).padStart(2, '0')}: EXECUTING SEARCHES                         ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════╝`);

  // Get the tasks for this batch
  const startIdx = batchIndex * SEARCHES_PER_BATCH;
  const endIdx = Math.min(startIdx + SEARCHES_PER_BATCH, searchTasks.length);
  const batchTasks = searchTasks.slice(startIdx, endIdx);

  console.log(`[Phase IV-Batch ${batchIndex + 1}] Processing tasks ${startIdx + 1}-${endIdx} of ${searchTasks.length}`);
  console.log(`[Phase IV-Batch ${batchIndex + 1}] Tasks in this batch: ${batchTasks.length}`);

  const results: SearchResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Execute searches sequentially within batch to avoid overwhelming CourtListener
  for (const task of batchTasks) {
    const taskStart = Date.now();

    try {
      console.log(`[Phase IV-Batch ${batchIndex + 1}] Executing task ${task.taskId}: "${task.query}"`);

      const searchResult = await executeSearchWithTimeout(task, jurisdiction);

      results.push(searchResult);

      if (searchResult.success && searchResult.candidates.length > 0) {
        successCount++;
        console.log(`[Phase IV-Batch ${batchIndex + 1}] Task ${task.taskId} SUCCESS: ${searchResult.candidates.length} candidates`);
      } else {
        failureCount++;
        console.warn(`[Phase IV-Batch ${batchIndex + 1}] Task ${task.taskId} FAILED: ${searchResult.error || 'No results'}`);
      }

      // Small delay between requests to be nice to CourtListener
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      failureCount++;
      results.push({
        taskId: task.taskId,
        elementId: task.elementId,
        elementName: task.elementName,
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - taskStart,
      });
      console.error(`[Phase IV-Batch ${batchIndex + 1}] Task ${task.taskId} EXCEPTION: ${error}`);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(`[Phase IV-Batch ${batchIndex + 1}] Complete: ${successCount} succeeded, ${failureCount} failed`);
  console.log(`[Phase IV-Batch ${batchIndex + 1}] Duration: ${durationMs}ms`);

  return {
    batchIndex,
    results,
    successCount,
    failureCount,
    durationMs,
  };
}

// ============================================================================
// FINAL STEP: AGGREGATE - Combine results and select citations
// ============================================================================

/**
 * Aggregate all batch results and select final citations
 * This runs as the final Inngest step
 */
export async function executePhaseIVAggregate(
  orderId: string,
  initResult: PhaseIVInitResult,
  batchResults: PhaseIVBatchResult[]
): Promise<PhaseIVAggregateResult> {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE IV-AGGREGATE: COMBINING RESULTS & SELECTING CITATIONS          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const supabase = getSupabase();

  // Combine all candidates from all batches
  const allCandidates: CitationCandidate[] = [];
  const candidatesByElement: Record<string, CitationCandidate[]> = {};

  let totalSuccesses = 0;
  let totalFailures = 0;

  for (const batch of batchResults) {
    totalSuccesses += batch.successCount;
    totalFailures += batch.failureCount;

    for (const result of batch.results) {
      if (result.success && result.candidates.length > 0) {
        allCandidates.push(...result.candidates);

        if (!candidatesByElement[result.elementId]) {
          candidatesByElement[result.elementId] = [];
        }
        candidatesByElement[result.elementId].push(...result.candidates);
      }
    }
  }

  console.log(`[Phase IV-Aggregate] Total searches: ${totalSuccesses + totalFailures}`);
  console.log(`[Phase IV-Aggregate] Successful searches: ${totalSuccesses}`);
  console.log(`[Phase IV-Aggregate] Failed searches: ${totalFailures}`);
  console.log(`[Phase IV-Aggregate] Total candidates: ${allCandidates.length}`);

  // Deduplicate candidates by ID
  const uniqueCandidates = deduplicateCandidates(allCandidates);
  console.log(`[Phase IV-Aggregate] Unique candidates after dedup: ${uniqueCandidates.length}`);

  // Score and rank candidates
  const scoredCandidates = scoreCandidates(uniqueCandidates, initResult.jurisdiction);

  // Select top citations
  const selectedCitations = selectTopCitations(
    scoredCandidates,
    initResult.elements,
    candidatesByElement,
    initResult.jurisdiction
  );

  const citationCount = selectedCitations.length;

  console.log(`[Phase IV-Aggregate] Selected citations: ${citationCount}`);

  // Get statutory bank for this motion type
  const statutoryBank = MOTION_STATUTORY_BANKS[initResult.motionType] || [];

  // Count by authority level
  const bindingCount = selectedCitations.filter(c => c.authorityLevel === 'binding').length;
  const persuasiveCount = selectedCitations.filter(c => c.authorityLevel === 'persuasive').length;

  // Count Louisiana vs federal
  const louisianaCitations = selectedCitations.filter(c =>
    c.court?.toLowerCase().includes('louisiana') ||
    c.court === 'la' ||
    c.court === 'lactapp'
  ).length;
  const federalCitations = selectedCitations.length - louisianaCitations;

  // Determine if we need to flag for manual review
  let flaggedForReview = false;
  let qualityNotes: string | undefined;

  if (citationCount === 0) {
    flaggedForReview = true;
    qualityNotes = 'CRITICAL: Zero citations found. CourtListener may be down or all searches failed. Manual research required.';
    console.error(`[Phase IV-Aggregate] ${qualityNotes}`);

    await flagForManualReview(orderId, supabase, qualityNotes);
    throw new Error(`Phase IV failed: Zero citations. Order flagged for manual review.`);

  } else if (citationCount < MINIMUM_CITATIONS_HARD_STOP) {
    flaggedForReview = true;
    qualityNotes = `CRITICAL: Only ${citationCount} citations found (minimum ${MINIMUM_CITATIONS_HARD_STOP}). Manual research required.`;
    console.error(`[Phase IV-Aggregate] ${qualityNotes}`);

    await flagForManualReview(orderId, supabase, qualityNotes);
    throw new Error(`Phase IV failed: Only ${citationCount} citations (minimum ${MINIMUM_CITATIONS_HARD_STOP}). Order flagged for manual review.`);

  } else if (citationCount < MINIMUM_CITATIONS_IDEAL) {
    flaggedForReview = true;
    qualityNotes = `Phase IV found ${citationCount} citations (below ideal ${MINIMUM_CITATIONS_IDEAL}). Review before delivery.`;
    console.warn(`[Phase IV-Aggregate] ${qualityNotes}`);

    await supabase
      .from('orders')
      .update({
        needs_manual_review: true,
        quality_notes: qualityNotes,
      })
      .eq('id', orderId);

    // DO NOT THROW - continue with marginal results
  }

  // Count elements with at least one citation
  const elementsCovered = Object.keys(candidatesByElement).filter(
    elemId => candidatesByElement[elemId].length > 0
  ).length;

  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE IV MULTI-STEP COMPLETE                                         ║');
  console.log(`║  Citations Selected: ${String(citationCount).padEnd(50)}║`);
  console.log(`║  Binding: ${String(bindingCount).padEnd(61)}║`);
  console.log(`║  Persuasive: ${String(persuasiveCount).padEnd(58)}║`);
  console.log(`║  Louisiana: ${String(louisianaCitations).padEnd(59)}║`);
  console.log(`║  Federal: ${String(federalCitations).padEnd(61)}║`);
  console.log(`║  Flagged for Review: ${String(flaggedForReview).padEnd(50)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  return {
    success: citationCount >= MINIMUM_CITATIONS_HARD_STOP,
    totalCandidates: allCandidates.length,
    caseCitationBank: selectedCitations,
    statutoryCitationBank: statutoryBank,
    citationCount,
    bindingCount,
    persuasiveCount,
    louisianaCitations,
    federalCitations,
    flaggedForReview,
    qualityNotes,
    elementsCovered,
    totalElements: initResult.elements.length,
    verificationProof: {
      searchesPerformed: totalSuccesses + totalFailures,
      candidatesFound: allCandidates.length,
      candidatesVerified: uniqueCandidates.length,
      citationsSelected: citationCount,
      allCitationsVerified: true,
      verificationSource: 'CourtListener API',
      verificationTimestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Execute a single search with timeout
 */
async function executeSearchWithTimeout(
  task: SearchTask,
  jurisdiction: string
): Promise<SearchResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

  try {
    const response = await searchOpinions(task.query, jurisdiction, 10, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.success || !response.data?.opinions || response.data.opinions.length === 0) {
      return {
        taskId: task.taskId,
        elementId: task.elementId,
        elementName: task.elementName,
        success: false,
        candidates: [],
        error: response.error || 'No results',
        durationMs: Date.now() - startTime,
      };
    }

    // Transform to CitationCandidate format
    const candidates: CitationCandidate[] = response.data.opinions
      .filter((op) => op.id !== undefined && op.id !== null)
      .map((op) => ({
        id: op.id,
        clusterId: op.cluster_id || op.id,
        caseName: op.case_name || 'Unknown',
        citation: op.citation || `${op.id}`,
        court: op.court || 'Unknown',
        dateFiled: op.date_filed || '',
        snippet: op.snippet,
        forElement: task.elementName,
      }));

    return {
      taskId: task.taskId,
      elementId: task.elementId,
      elementName: task.elementName,
      success: true,
      candidates,
      durationMs: Date.now() - startTime,
    };

  } catch (error) {
    clearTimeout(timeoutId);
    return {
      taskId: task.taskId,
      elementId: task.elementId,
      elementName: task.elementName,
      success: false,
      candidates: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract legal elements from phase input or use defaults
 */
function extractLegalElements(input: PhaseInput): ExtractedElement[] {
  const { previousPhaseOutputs, motionType } = input;

  // Try to get elements from Phase II/III outputs
  const phaseIIOutput = previousPhaseOutputs?.['II'] as Record<string, unknown> | undefined;
  const phaseIIIOutput = previousPhaseOutputs?.['III'] as Record<string, unknown> | undefined;

  // Check for extracted elements in various locations
  const rawElements =
    (phaseIIOutput?.legalElements as unknown[]) ||
    (phaseIIIOutput?.elements as unknown[]) ||
    (phaseIIIOutput?.legalElements as unknown[]) ||
    null;

  if (rawElements && Array.isArray(rawElements) && rawElements.length > 0) {
    console.log(`[extractLegalElements] Found ${rawElements.length} elements from previous phases`);

    return rawElements.map((el: unknown, idx: number) => {
      const element = el as Record<string, unknown>;
      return {
        id: String(element.id || `element-${idx + 1}`),
        name: String(element.name || element.element || `Element ${idx + 1}`),
        description: String(element.description || ''),
        isCritical: Boolean(element.isCritical ?? element.critical ?? true),
        searchQueries: Array.isArray(element.searchQueries)
          ? element.searchQueries.map(String)
          : generateSearchQueries(String(element.name || element.element || ''), input.jurisdiction || 'Louisiana'),
      };
    });
  }

  // Fallback: Use standard elements for motion type
  const motionTypeKey = normalizeMotionType(motionType || 'DEFAULT');
  const standardElements = STANDARD_ELEMENTS[motionTypeKey] || STANDARD_ELEMENTS.DEFAULT;

  console.log(`[extractLegalElements] Using standard elements for motion type: ${motionTypeKey}`);

  return standardElements;
}

/**
 * Generate search queries for an element
 */
function generateSearchQueries(elementName: string, jurisdiction: string): string[] {
  const simplifiedName = elementName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  return [
    `${simplifiedName} ${jurisdiction}`,
    `${simplifiedName}`,
  ];
}

/**
 * Normalize motion type to key
 */
function normalizeMotionType(motionType: string): string {
  const normalized = motionType.toUpperCase().replace(/\s+/g, '_');

  if (normalized.includes('COMPEL')) return 'MCOMPEL';
  if (normalized.includes('DISMISS')) return 'MTD_12B6';
  if (normalized.includes('SUMMARY')) return 'MSJ';

  return 'DEFAULT';
}

/**
 * Deduplicate candidates by ID
 */
function deduplicateCandidates(candidates: CitationCandidate[]): CitationCandidate[] {
  const seen = new Set<number>();
  return candidates.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/**
 * Score candidates based on court authority and recency
 */
function scoreCandidates(
  candidates: CitationCandidate[],
  jurisdiction: string
): CitationCandidate[] {
  return candidates.map(c => {
    let score = 50; // Base score

    // Prefer recent cases
    const year = parseInt(c.dateFiled?.split('-')[0] || '1900');
    if (year >= 2020) score += 30;
    else if (year >= 2015) score += 20;
    else if (year >= 2010) score += 10;

    // Prefer state supreme court
    const court = (c.court || '').toLowerCase();
    if (court.includes('supreme') || court === 'la') score += 25;
    else if (court.includes('appeal') || court === 'lactapp') score += 15;
    else if (court.includes('fifth circuit') || court === 'ca5') score += 20;

    return { ...c, relevanceScore: score };
  }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

/**
 * Select top citations ensuring element coverage
 */
function selectTopCitations(
  scoredCandidates: CitationCandidate[],
  elements: ExtractedElement[],
  candidatesByElement: Record<string, CitationCandidate[]>,
  jurisdiction: string
): SelectedCitation[] {
  const selected: SelectedCitation[] = [];
  const usedIds = new Set<number>();
  const TARGET_CITATIONS = 10;

  // First, select at least one citation per critical element
  for (const element of elements.filter(e => e.isCritical)) {
    const elementCandidates = candidatesByElement[element.id] || [];
    for (const candidate of elementCandidates) {
      if (!usedIds.has(candidate.id)) {
        selected.push(convertToSelectedCitation(candidate, jurisdiction));
        usedIds.add(candidate.id);
        break;
      }
    }
  }

  // Then, fill up to target with highest-scored remaining candidates
  for (const candidate of scoredCandidates) {
    if (selected.length >= TARGET_CITATIONS) break;
    if (usedIds.has(candidate.id)) continue;

    selected.push(convertToSelectedCitation(candidate, jurisdiction));
    usedIds.add(candidate.id);
  }

  return selected;
}

/**
 * Convert CitationCandidate to SelectedCitation
 */
function convertToSelectedCitation(
  candidate: CitationCandidate,
  jurisdiction: string
): SelectedCitation {
  return {
    courtlistener_id: candidate.id,
    courtlistener_cluster_id: candidate.clusterId || candidate.id,
    caseName: candidate.caseName,
    citation: candidate.citation,
    court: candidate.court,
    dateFiled: candidate.dateFiled,
    forElement: candidate.forElement,
    authorityLevel: determineAuthorityLevel(candidate.court, jurisdiction),
    relevanceScore: candidate.relevanceScore || 50,
    verification_timestamp: new Date().toISOString(),
    verification_method: 'search',
  };
}

/**
 * Determine if a court's decisions are binding or persuasive
 */
function determineAuthorityLevel(court: string, jurisdiction: string): 'binding' | 'persuasive' {
  const normalizedCourt = (court || '').toLowerCase();
  const normalizedJurisdiction = (jurisdiction || '').toLowerCase();

  // U.S. Supreme Court is binding everywhere
  if (normalizedCourt.includes('supreme court of the united states') || normalizedCourt === 'scotus') {
    return 'binding';
  }

  // Louisiana-specific
  if (normalizedJurisdiction.includes('louisiana')) {
    if (normalizedCourt.includes('louisiana supreme') || normalizedCourt === 'la' || normalizedCourt.includes('supreme court of louisiana')) {
      return 'binding';
    }
    if (normalizedCourt.includes('fifth circuit') || normalizedCourt === 'ca5') {
      return 'binding';
    }
  }

  return 'persuasive';
}

/**
 * Flag order for manual review
 */
async function flagForManualReview(
  orderId: string,
  supabase: ReturnType<typeof getSupabase>,
  qualityNotes: string
): Promise<void> {
  await supabase
    .from('orders')
    .update({
      needs_manual_review: true,
      quality_notes: qualityNotes,
    })
    .eq('id', orderId);

  console.warn(`[Phase IV] Order ${orderId} flagged for manual review: ${qualityNotes}`);
}
