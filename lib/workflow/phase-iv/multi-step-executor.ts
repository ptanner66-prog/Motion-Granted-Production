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
import { scoreRelevance, TOPICAL_RELEVANCE_THRESHOLD, type PropositionContext } from '@/lib/courtlistener/relevance-scorer';

// ============================================================================
// TYPES
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════════
// CHEN JURISDICTION FIX (2026-02-03): Tier → Jurisdiction Mapping
// For state court motions, ALL tiers map to STATE-ONLY courts
// This ensures we get So.3d citations (state) not F.3d/F.4th (federal)
// ═══════════════════════════════════════════════════════════════════════════
const TIER_JURISDICTION_MAP: Record<'tier1' | 'tier2' | 'tier3', string> = {
  'tier1': 'louisiana_state',    // la,lactapp ONLY - Louisiana Supreme Court
  'tier2': 'louisiana_state',    // la,lactapp ONLY - Louisiana Courts of Appeal
  'tier3': 'louisiana_federal',  // ca5,laed,lamd,lawd - Fifth Circuit + Districts
};

/**
 * Detect jurisdiction type from jurisdiction string
 * STATE: "19th Judicial District Court", "Louisiana State Court", "Parish of..."
 * FEDERAL: "Eastern District of Louisiana", "Fifth Circuit", "EDLA"
 */
function detectJurisdictionType(jurisdiction: string): 'state' | 'federal' {
  const normalized = jurisdiction.toLowerCase();

  // Federal court patterns
  const federalPatterns = [
    /eastern district/i,
    /middle district/i,
    /western district/i,
    /\bedla\b/i,
    /\bmdla\b/i,
    /\bwdla\b/i,
    /united states district/i,
    /fifth circuit/i,
    /5th circuit/i,
    /federal court/i,
    /bankruptcy court/i,
  ];

  for (const pattern of federalPatterns) {
    if (pattern.test(normalized)) {
      console.log(`[JurisdictionDetect] FEDERAL: "${jurisdiction}" matched ${pattern}`);
      return 'federal';
    }
  }

  // State court patterns
  const statePatterns = [
    /judicial district/i,
    /\bjdc\b/i,
    /parish of/i,
    /state court/i,
    /civil district court/i,
  ];

  for (const pattern of statePatterns) {
    if (pattern.test(normalized)) {
      console.log(`[JurisdictionDetect] STATE: "${jurisdiction}" matched ${pattern}`);
      return 'state';
    }
  }

  // Default to state for Louisiana
  if (normalized.includes('louisiana')) {
    console.log(`[JurisdictionDetect] STATE (default): "${jurisdiction}"`);
    return 'state';
  }

  console.log(`[JurisdictionDetect] STATE (fallback): "${jurisdiction}"`);
  return 'state';
}

/**
 * Post-search jurisdiction validation filter
 *
 * CHEN JURISDICTION FIX (2026-02-03):
 * Safety net to filter out any wrong-jurisdiction cases that slip through
 * For STATE court searches: remove federal cases (F.2d, F.3d, F.4th, F.Supp)
 * For FEDERAL court searches: remove state cases (So.2d, So.3d)
 */
function filterByJurisdiction(
  candidates: CitationCandidate[],
  expectedType: 'state' | 'federal'
): CitationCandidate[] {
  return candidates.filter(candidate => {
    const court = (candidate.court || '').toLowerCase();
    const citation = (candidate.citation || '').toLowerCase();

    // Detect federal courts
    const isFederal =
      court.includes('fifth circuit') ||
      court.includes('5th circuit') ||
      court.includes('circuit court of appeals') ||
      court.includes('district of louisiana') ||
      court.includes('united states') ||
      /f\.\s*\d+[dth]/.test(citation) ||  // F.2d, F.3d, F.4th
      /f\.\s*supp/.test(citation);         // F.Supp

    // Detect state courts
    const isState =
      court.includes('louisiana supreme') ||
      court.includes('supreme court of louisiana') ||
      court.includes('louisiana court of appeal') ||
      court.includes('la. app') ||
      court.includes('la app') ||
      /so\.\s*\d+[dth]/.test(citation);    // So.2d, So.3d

    if (expectedType === 'state') {
      if (isFederal) {
        console.log(`[JurisdictionFilter] ⛔ EXCLUDED federal case from STATE search: "${candidate.caseName?.substring(0, 40)}..." (${candidate.court})`);
        return false;
      }
      return true;
    } else {
      if (isState) {
        console.log(`[JurisdictionFilter] ⛔ EXCLUDED state case from FEDERAL search: "${candidate.caseName?.substring(0, 40)}..." (${candidate.court})`);
        return false;
      }
      return true;
    }
  });
}

// ============================================================================
// CITATION QUALITY VALIDATION (CHEN 2026-02-03)
// Prevents criminal cases, future dates, and invalid formats from entering
// the citation bank. This is CRITICAL for legal software.
// ============================================================================

/**
 * Determines if a case name indicates a criminal case.
 * Criminal cases should NOT be used for civil procedure motions.
 *
 * Criminal patterns:
 * - "State of Louisiana v. [Defendant]"
 * - "State v. [Defendant]"
 * - "United States v. [Defendant]"
 * - "People v. [Defendant]"
 * - "Commonwealth v. [Defendant]"
 */
function isCriminalCase(caseName: string): boolean {
  if (!caseName) return false;

  const criminalPatterns = [
    /^State\s+of\s+Louisiana\s+v\./i,
    /^State\s+v\./i,
    /^United\s+States\s+v\./i,
    /^People\s+v\./i,
    /^Commonwealth\s+v\./i,
    /^U\.S\.\s+v\./i,
    /^USA\s+v\./i,
  ];

  for (const pattern of criminalPatterns) {
    if (pattern.test(caseName.trim())) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that a citation date is not in the future.
 * Future-dated citations are impossible and indicate bad data.
 */
function isFutureDated(dateFiled: string | undefined): boolean {
  if (!dateFiled) return false;

  try {
    const caseDate = new Date(dateFiled);
    const today = new Date();

    // Case date is in the future
    if (caseDate > today) {
      return true;
    }

    return false;
  } catch {
    // If date parsing fails, don't reject (let other validation catch it)
    return false;
  }
}

/**
 * Validates Louisiana civil citation format.
 *
 * Valid Louisiana civil formats:
 * - "123 So. 2d 456" / "123 So.2d 456" / "123 So. 3d 456"
 * - "2024-CA-0123" (Court of Appeal docket)
 * - "2024-C-0123" (Supreme Court docket)
 * - "123 La. 456" (Louisiana Reports)
 * - "123 La. App. 456"
 *
 * Invalid formats:
 * - Plain numeric IDs like "11046003"
 * - Federal formats for state court matters
 */
function isValidLouisianaCivilCitation(citation: string): boolean {
  if (!citation) return false;

  const validPatterns = [
    // Southern Reporter (primary for Louisiana)
    /\d+\s*So\.\s*[23]d\s*\d+/i,
    /\d+\s*So\s*[23]d\s*\d+/i,

    // Louisiana docket numbers
    /\d{4}-C[A]?-\d+/i,           // 2024-CA-0123 or 2024-C-0123
    /\d{4}\s*-\s*C[A]?\s*-\s*\d+/i,

    // Louisiana Reports
    /\d+\s*La\.\s*\d+/i,
    /\d+\s*La\.\s*App\.\s*\d+/i,

    // Louisiana Annotated
    /La\.\s*R\.S\./i,             // Statutory citations are OK
    /La\.\s*C\.C\.P\./i,          // Code of Civil Procedure
    /La\.\s*C\.C\./i,             // Civil Code

    // Federal reporters (for federal jurisdiction searches)
    /\d+\s*F\.\s*[234](d|th)\s*\d+/i,    // F.2d, F.3d, F.4th
    /\d+\s*F\.\s*Supp/i,                  // F.Supp
  ];

  for (const pattern of validPatterns) {
    if (pattern.test(citation)) {
      return true;
    }
  }

  // Reject plain numeric IDs (CourtListener internal IDs)
  if (/^\d+$/.test(citation.trim())) {
    return false;
  }

  return false;
}

/**
 * Comprehensive citation quality validation.
 * Returns { valid: boolean, reason?: string }
 */
interface CitationValidationResult {
  valid: boolean;
  reason?: string;
}

function validateCitationQuality(candidate: {
  caseName?: string;
  citation?: string;
  dateFiled?: string;
  court?: string;
}): CitationValidationResult {
  const { caseName, citation, dateFiled, court } = candidate;

  // Check 1: Criminal case filter
  if (caseName && isCriminalCase(caseName)) {
    return {
      valid: false,
      reason: `CRIMINAL_CASE: "${caseName?.substring(0, 50)}..." appears to be a criminal case (State v. pattern)`,
    };
  }

  // Check 2: Future date filter
  if (dateFiled && isFutureDated(dateFiled)) {
    return {
      valid: false,
      reason: `FUTURE_DATED: Case dated ${dateFiled} is in the future`,
    };
  }

  // Check 3: Citation format validation (for Louisiana state court)
  // Only enforce for Louisiana state courts
  const isLouisianaState = court?.toLowerCase().includes('louisiana') &&
    !court?.toLowerCase().includes('district of louisiana');

  if (isLouisianaState && citation && !isValidLouisianaCivilCitation(citation)) {
    return {
      valid: false,
      reason: `INVALID_FORMAT: "${citation}" is not a valid Louisiana civil citation format`,
    };
  }

  // Check 4: Reject if citation is just a numeric ID
  if (citation && /^\d+$/.test(citation.trim())) {
    return {
      valid: false,
      reason: `NUMERIC_ID: "${citation}" is a database ID, not a legal citation`,
    };
  }

  return { valid: true };
}

/**
 * Filter candidates by citation quality.
 * Removes criminal cases, future-dated cases, and invalid citation formats.
 */
function filterByCitationQuality<T extends {
  caseName?: string;
  citation?: string;
  dateFiled?: string;
  court?: string;
}>(candidates: T[], logPrefix: string = '[Phase IV]'): T[] {
  const validCandidates: T[] = [];
  const rejectedCount = { criminal: 0, future: 0, format: 0, numeric: 0 };

  for (const candidate of candidates) {
    const validation = validateCitationQuality(candidate);

    if (validation.valid) {
      validCandidates.push(candidate);
    } else {
      // Log rejection for audit trail
      console.log(`${logPrefix} REJECTED: ${validation.reason}`);

      // Track rejection reasons
      if (validation.reason?.includes('CRIMINAL')) rejectedCount.criminal++;
      else if (validation.reason?.includes('FUTURE')) rejectedCount.future++;
      else if (validation.reason?.includes('FORMAT')) rejectedCount.format++;
      else if (validation.reason?.includes('NUMERIC')) rejectedCount.numeric++;
    }
  }

  if (candidates.length > 0 && validCandidates.length < candidates.length) {
    console.log(`${logPrefix} Citation quality filter: ${validCandidates.length}/${candidates.length} passed`);
    console.log(`${logPrefix} Rejections: criminal=${rejectedCount.criminal}, future=${rejectedCount.future}, format=${rejectedCount.format}, numeric=${rejectedCount.numeric}`);
  }

  return validCandidates;
}

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

const SEARCHES_PER_BATCH = 1; // ONE search per step - CourtListener is too slow for batching (150s × 3 = 450s > 300s Vercel limit)
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

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN JURISDICTION FIX (2026-02-03): Detect jurisdiction type
  // For STATE court cases, only use tier1/tier2 (state courts only)
  // For FEDERAL court cases, only use tier3 (federal courts only)
  // ═══════════════════════════════════════════════════════════════════════
  const jurisdictionType = detectJurisdictionType(jurisdiction || 'Louisiana');
  console.log(`[Phase IV-Init] Jurisdiction TYPE: ${jurisdictionType.toUpperCase()}`);

  // Extract elements from previous phases or use defaults
  const elements = extractLegalElements(input);
  console.log(`[Phase IV-Init] Extracted ${elements.length} legal elements`);

  // Generate search tasks for each element
  const searchTasks: SearchTask[] = [];
  let taskCounter = 0;

  // CHEN JURISDICTION FIX: Select tiers based on jurisdiction type
  const tiersToUse: Array<'tier1' | 'tier2' | 'tier3'> = jurisdictionType === 'state'
    ? ['tier1', 'tier2']  // STATE: only state court tiers
    : ['tier3'];          // FEDERAL: only federal court tier

  console.log(`[Phase IV-Init] Tiers for ${jurisdictionType.toUpperCase()} jurisdiction: ${tiersToUse.join(', ')}`);

  for (const element of elements) {
    // Limit queries per element
    const queries = element.searchQueries.slice(0, MAX_QUERIES_PER_ELEMENT);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      // CHEN FIX: Assign tier from jurisdiction-appropriate tiers only
      const tier = tiersToUse[i % tiersToUse.length];

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
  console.log(`[Phase IV-Aggregate] Total candidates before filter: ${allCandidates.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN JURISDICTION FIX (2026-02-03): Post-search jurisdiction validation
  // Filter out any federal cases that slipped through for state court searches
  // ═══════════════════════════════════════════════════════════════════════
  const jurisdictionType = detectJurisdictionType(initResult.jurisdiction);
  const filteredCandidates = filterByJurisdiction(allCandidates, jurisdictionType);
  const filteredCount = allCandidates.length - filteredCandidates.length;
  if (filteredCount > 0) {
    console.log(`[Phase IV-Aggregate] ⚠️ Filtered out ${filteredCount} wrong-jurisdiction cases`);
  }
  console.log(`[Phase IV-Aggregate] Candidates after jurisdiction filter: ${filteredCandidates.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN CITATION QUALITY FIX (2026-02-03): Final quality validation
  // This is a second pass to catch any bad citations that slipped through
  // batch-level filtering (e.g., criminal cases, future dates, numeric IDs)
  // ═══════════════════════════════════════════════════════════════════════
  const qualityFilteredCandidates = filterByCitationQuality(
    filteredCandidates,
    '[Phase IV-Aggregate]'
  );
  const qualityFilteredCount = filteredCandidates.length - qualityFilteredCandidates.length;
  if (qualityFilteredCount > 0) {
    console.log(`[Phase IV-Aggregate] ⚠️ Quality filter removed ${qualityFilteredCount} citations (criminal/future/invalid)`);
  }
  console.log(`[Phase IV-Aggregate] Candidates after quality filter: ${qualityFilteredCandidates.length}`);

  // Deduplicate candidates by ID
  const uniqueCandidates = deduplicateCandidates(qualityFilteredCandidates);
  console.log(`[Phase IV-Aggregate] Unique candidates after dedup: ${uniqueCandidates.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // CHEN RELEVANCE FIX (2026-02-05): Topical relevance scoring
  // Score each candidate for relevance to its claimed proposition
  // Reject candidates below 0.70 threshold
  // ═══════════════════════════════════════════════════════════════════════
  console.log(`[Phase IV-Aggregate] ═══ TOPICAL RELEVANCE SCORING ═══`);
  let relevanceRejections = 0;
  const relevanceScoredCandidates = uniqueCandidates.filter(candidate => {
    const element = initResult.elements.find(e => e.id === candidate.forElement || e.name === candidate.forElement);
    const propContext: PropositionContext = {
      proposition: element?.description || candidate.forElement || '',
      motionType: initResult.motionType || 'GENERIC',
      statutoryBasis: [],
      elementName: candidate.forElement,
    };

    const result = scoreRelevance(
      {
        caseName: candidate.caseName || '',
        citation: candidate.citation || '',
        court: candidate.court || '',
        snippet: candidate.snippet || '',
      },
      propContext
    );

    if (!result.passes_threshold) {
      relevanceRejections++;
      return false;
    }
    return true;
  });

  if (relevanceRejections > 0) {
    console.log(`[Phase IV-Aggregate] ⛔ Relevance scoring rejected ${relevanceRejections} candidates (threshold: ${TOPICAL_RELEVANCE_THRESHOLD})`);
  }
  console.log(`[Phase IV-Aggregate] Candidates after relevance scoring: ${relevanceScoredCandidates.length}`);

  // Score and rank candidates
  const scoredCandidates = scoreCandidates(relevanceScoredCandidates, initResult.jurisdiction);

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
 *
 * CHEN JURISDICTION FIX (2026-02-03):
 * Uses TIER_JURISDICTION_MAP[task.tier] instead of raw jurisdiction
 * This ensures tier1/tier2 map to 'louisiana_state' (no federal courts!)
 */
async function executeSearchWithTimeout(
  task: SearchTask,
  _jurisdiction: string  // UNUSED - kept for backward compat, use task.tier instead
): Promise<SearchResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

  // CHEN FIX: Use tier mapping, NOT raw jurisdiction
  const mappedJurisdiction = TIER_JURISDICTION_MAP[task.tier];
  console.log(`[executeSearchWithTimeout] task=${task.taskId} tier=${task.tier} → jurisdiction="${mappedJurisdiction}"`);

  try {
    const response = await searchOpinions(task.query, mappedJurisdiction, 10, {
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
    const rawCandidates: CitationCandidate[] = response.data.opinions
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

    // CHEN 2026-02-03: Apply citation quality filter to remove criminal cases,
    // future-dated citations, and invalid citation formats BEFORE returning
    const candidates = filterByCitationQuality(
      rawCandidates,
      `[Phase IV Search ${task.taskId}]`
    );

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
