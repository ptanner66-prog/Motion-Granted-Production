/**
 * Batched CourtListener Search
 *
 * Executes searches in controlled batches to prevent:
 * - Rate limit violations (60/min)
 * - Vercel function timeouts (5 min)
 * - CourtListener server overload
 *
 * @version 2026-01-30-CHEN-TIMEOUT-FIX
 */

import { logger } from '@/lib/logger';
import { withRateLimit, getStatus, recordFailure } from './rate-limiter';
import { searchOpinions } from './client';
import type { CourtTier, RawCandidate } from '@/types/citation-research';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('courtlistener-batched-search');
// Batch configuration
// CRITICAL FIX: CourtListener is SLOW - takes 60-97 seconds per request
// Multi-step architecture allows each batch to run as its own Inngest step
export const BATCH_SIZE = 1; // ONE search per step - CourtListener is too slow for batching
export const INTER_BATCH_DELAY_MS = 2000; // 2s between batches
export const PER_REQUEST_TIMEOUT_MS = 150000; // 150s per request - CL can take 60-97s!
export const MAX_BATCH_DURATION_MS = 240000; // 4 min max per batch (leave buffer for Vercel)
const MAX_TOTAL_DURATION_MS = 270000; // 4.5 min max (leave 30s buffer for Vercel's 5min limit)

export interface BatchSearchTask {
  id: string;
  query: string;
  jurisdiction: string;
  elementName: string;
  tier: CourtTier;
}

export interface BatchSearchResult {
  taskId: string;
  elementName: string;
  success: boolean;
  results: RawCandidate[];
  error?: string;
  durationMs: number;
}

export interface BatchSearchSummary {
  totalTasks: number;
  completed: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  results: BatchSearchResult[];
  durationMs: number;
  partialResults: boolean;
  abortReason?: string;
}

// Map tier to jurisdiction for searchOpinions
// CHEN JURISDICTION FIX (2026-02-03): ALL state tiers use STATE-ONLY courts
// For state court motions, we want ONLY So. 3d citations (state courts)
// NOT F.3d/F.4th citations (federal courts) which were drowning out state results
const TIER_JURISDICTION_MAP: Record<CourtTier, string> = {
  tier1: 'louisiana_state',    // la,lactapp ONLY - LA Supreme Court (So. 3d)
  tier2: 'louisiana_state',    // la,lactapp ONLY - LA Courts of Appeal (So. 3d)
  tier3: 'louisiana_federal',  // ca5,laed,lamd,lawd - Fifth Circuit + Districts (F.3d/F.4th)
};

/**
 * Execute a single search with timeout
 */
async function executeSearchWithTimeout(task: BatchSearchTask): Promise<BatchSearchResult> {
  const startTime = Date.now();

  logger.info(`[executeSearchWithTimeout] Starting task ${task.id}: query="${task.query}", tier=${task.tier}`);

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);

    // Execute with rate limiting
    const searchResult = await withRateLimit(async () => {
      logger.info(`[executeSearchWithTimeout] Calling searchOpinions for task ${task.id}`);
      const result = await searchOpinions(
        task.query,
        TIER_JURISDICTION_MAP[task.tier],
        10, // Max results per search
        { signal: controller.signal }
      );
      logger.info(`[executeSearchWithTimeout] searchOpinions returned for task ${task.id}: success=${result.success}, opinions=${result.data?.opinions?.length || 0}`);
      return result;
    }, `search:${task.id}`);

    clearTimeout(timeoutId);

    if (!searchResult.success || !searchResult.data?.opinions) {
      logger.info(`[executeSearchWithTimeout] Task ${task.id} returned no results: success=${searchResult.success}, error=${searchResult.error}`);
      return {
        taskId: task.id,
        elementName: task.elementName,
        success: false,
        results: [],
        error: searchResult.error || 'No results',
        durationMs: Date.now() - startTime,
      };
    }

    // Transform to RawCandidate format
    // CHEN CIV FIX (2026-02-02): Validate citation strings to reject bare numbers (opinion IDs)
    const candidates: RawCandidate[] = searchResult.data.opinions.map((op) => {
      // Validate citation - reject if it's just a bare number (opinion ID)
      let citation = op.citation || '';
      if (citation && /^\d+$/.test(citation.trim())) {
        log.warn(`[executeSearchWithTimeout] ⚠️ INVALID CITATION: "${citation}" is a bare number (opinion ID), not a legal citation. Case: ${op.case_name}`);
        citation = ''; // Clear invalid citation
      }

      return {
        id: op.id,
        clusterId: op.cluster_id,
        caseName: op.case_name,
        citation,
        court: op.court,
        courtCode: extractCourtCode(op.court),
        dateFiled: op.date_filed,
        snippet: op.snippet,
        absoluteUrl: op.absolute_url,
        precedentialStatus: op.precedential_status,
        forElement: task.elementName,
        searchTier: task.tier,
      };
    });

    // DIAGNOSTIC: Check for candidates without IDs
    // FIX: Use proper null/undefined check, not falsy check (ID 0 is valid)
    const candidatesWithId = candidates.filter(c => c.id !== undefined && c.id !== null);
    const candidatesWithoutId = candidates.filter(c => c.id === undefined || c.id === null);
    logger.info(`[executeSearchWithTimeout] Task ${task.id} transformed ${candidates.length} candidates:`);
    logger.info(`  - With valid ID: ${candidatesWithId.length}`);
    logger.info(`  - WITHOUT ID (will be dropped): ${candidatesWithoutId.length}`);
    if (candidatesWithoutId.length > 0) {
      log.warn(`[executeSearchWithTimeout] ⚠️ DROPPING ${candidatesWithoutId.length} candidates without ID!`);
      candidatesWithoutId.slice(0, 3).forEach((c, i) => {
        log.warn(`  [${i}] caseName="${c.caseName}", clusterId=${c.clusterId}`);
      });
    }

    return {
      taskId: task.id,
      elementName: task.elementName,
      success: true,
      results: candidates,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout =
      errorMessage.includes('abort') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('Timeout');

    logger.warn(`[BatchedSearch] Task ${task.id} failed: ${errorMessage}`);

    return {
      taskId: task.id,
      elementName: task.elementName,
      success: false,
      results: [],
      error: isTimeout ? 'TIMEOUT' : errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract court code from court name
 */
function extractCourtCode(court: string): string {
  const normalizedCourt = court.toLowerCase();

  if (normalizedCourt.includes('supreme court of louisiana') || normalizedCourt === 'la') {
    return 'la';
  }
  if (normalizedCourt.includes('louisiana court of appeal') || normalizedCourt === 'lactapp') {
    return 'lactapp';
  }
  if (normalizedCourt.includes('fifth circuit') || normalizedCourt === 'ca5') {
    return 'ca5';
  }
  if (normalizedCourt.includes('eastern district') && normalizedCourt.includes('louisiana')) {
    return 'laed';
  }
  if (normalizedCourt.includes('middle district') && normalizedCourt.includes('louisiana')) {
    return 'lamd';
  }
  if (normalizedCourt.includes('western district') && normalizedCourt.includes('louisiana')) {
    return 'lawd';
  }
  if (normalizedCourt.includes('supreme court of the united states')) {
    return 'scotus';
  }

  return court; // Return as-is if not matched
}

/**
 * Execute a batch of searches concurrently
 */
async function executeBatch(tasks: BatchSearchTask[], batchNumber: number): Promise<BatchSearchResult[]> {
  logger.info(`[BatchedSearch] Executing batch ${batchNumber} with ${tasks.length} tasks`);

  const results = await Promise.all(tasks.map((task) => executeSearchWithTimeout(task)));

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info(`[BatchedSearch] Batch ${batchNumber} complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

/**
 * Execute all search tasks in controlled batches
 */
export async function executeBatchedSearches(tasks: BatchSearchTask[]): Promise<BatchSearchSummary> {
  const startTime = Date.now();
  const allResults: BatchSearchResult[] = [];
  let abortReason: string | undefined;

  logger.info(`\n${'='.repeat(66)}`);
  logger.info(`  BATCHED SEARCH EXECUTION`);
  logger.info(`${'='.repeat(66)}`);
  logger.info(`[BatchedSearch] Total tasks: ${tasks.length}`);
  logger.info(`[BatchedSearch] Batch size: ${BATCH_SIZE}`);
  logger.info(`[BatchedSearch] Estimated batches: ${Math.ceil(tasks.length / BATCH_SIZE)}`);

  // Sort tasks by tier priority (tier1 first, then tier2, then tier3)
  const sortedTasks = [...tasks].sort((a, b) => {
    const tierOrder: Record<CourtTier, number> = { tier1: 0, tier2: 1, tier3: 2 };
    return tierOrder[a.tier] - tierOrder[b.tier];
  });

  // Split into batches
  const batches: BatchSearchTask[][] = [];
  for (let i = 0; i < sortedTasks.length; i += BATCH_SIZE) {
    batches.push(sortedTasks.slice(i, i + BATCH_SIZE));
  }

  // Execute batches sequentially
  for (let i = 0; i < batches.length; i++) {
    // Check total duration
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_TOTAL_DURATION_MS) {
      abortReason = `Total duration exceeded ${MAX_TOTAL_DURATION_MS}ms`;
      logger.warn(`[BatchedSearch] ${abortReason}. Stopping with partial results.`);
      break;
    }

    // Check rate limiter status
    const status = getStatus();
    if (status.circuitOpen) {
      abortReason = 'Circuit breaker open due to consecutive failures';
      logger.warn(`[BatchedSearch] ${abortReason}. Stopping with partial results.`);
      break;
    }

    // Execute batch
    const batchResults = await executeBatch(batches[i], i + 1);
    allResults.push(...batchResults);

    // Check failure rate after each batch
    const totalFailed = allResults.filter((r) => !r.success).length;
    const failureRate = totalFailed / allResults.length;

    if (failureRate > 0.5 && allResults.length >= 10) {
      abortReason = `Failure rate too high (${Math.round(failureRate * 100)}%)`;
      logger.warn(`[BatchedSearch] ${abortReason}. Stopping with partial results.`);
      break;
    }

    // Delay before next batch (except for last batch)
    if (i < batches.length - 1) {
      logger.debug(`[BatchedSearch] Waiting ${INTER_BATCH_DELAY_MS}ms before next batch`);
      await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
    }
  }

  // Compile summary
  const summary: BatchSearchSummary = {
    totalTasks: tasks.length,
    completed: allResults.length,
    succeeded: allResults.filter((r) => r.success).length,
    failed: allResults.filter((r) => !r.success && r.error !== 'TIMEOUT').length,
    timedOut: allResults.filter((r) => r.error === 'TIMEOUT').length,
    results: allResults,
    durationMs: Date.now() - startTime,
    partialResults: allResults.length < tasks.length || !!abortReason,
    abortReason,
  };

  logger.info(`\n${'='.repeat(66)}`);
  logger.info(`  BATCHED SEARCH COMPLETE`);
  logger.info(`${'='.repeat(66)}`);
  logger.info(`[BatchedSearch] Completed: ${summary.completed}/${summary.totalTasks}`);
  logger.info(`[BatchedSearch] Succeeded: ${summary.succeeded}`);
  logger.info(`[BatchedSearch] Failed: ${summary.failed}`);
  logger.info(`[BatchedSearch] Timed out: ${summary.timedOut}`);
  logger.info(`[BatchedSearch] Duration: ${summary.durationMs}ms`);
  if (summary.partialResults) {
    logger.warn(`[BatchedSearch] PARTIAL RESULTS - Reason: ${summary.abortReason || 'Unknown'}`);
  }

  return summary;
}

/**
 * Convert Phase IV-B search tasks to batched format
 */
export function convertToBatchTasks(
  elements: Array<{
    name: string;
    id?: string;
    searchQueries: string[];
  }>,
  jurisdiction: string
): BatchSearchTask[] {
  const tasks: BatchSearchTask[] = [];
  let taskCounter = 0;

  // Tier distribution: first 3 queries per element = tier1, next 3 = tier2, rest = tier3
  for (const element of elements) {
    const queries = element.searchQueries.slice(0, 9); // Max 9 queries per element
    queries.forEach((query, idx) => {
      const tier: CourtTier = idx < 3 ? 'tier1' : idx < 6 ? 'tier2' : 'tier3';
      tasks.push({
        id: `task-${++taskCounter}`,
        query,
        jurisdiction,
        elementName: element.name,
        tier,
      });
    });
  }

  return tasks;
}

/**
 * Collect unique candidates from batch results
 */
export function collectUniqueCandidates(results: BatchSearchResult[]): RawCandidate[] {
  const seenIds = new Set<number>();
  const candidates: RawCandidate[] = [];

  // DIAGNOSTIC: Log input state
  logger.info(`[collectUniqueCandidates] Total batch results: ${results.length}`);
  const successfulResults = results.filter(r => r.success);
  logger.info(`[collectUniqueCandidates] Successful results: ${successfulResults.length}`);

  let totalCandidatesBeforeFilter = 0;
  let candidatesWithoutId = 0;
  let duplicateCandidates = 0;

  for (const result of results) {
    if (result.success) {
      logger.info(`[collectUniqueCandidates] Result ${result.taskId}: ${result.results.length} candidates`);
      for (const candidate of result.results) {
        totalCandidatesBeforeFilter++;
        // FIX: Use typeof check instead of falsy check - ID 0 is valid!
        if (candidate.id === undefined || candidate.id === null) {
          candidatesWithoutId++;
          log.warn(`[collectUniqueCandidates] ⚠️ Candidate without ID: ${candidate.caseName || 'unknown'}, clusterId=${candidate.clusterId}`);
        } else if (seenIds.has(candidate.id)) {
          duplicateCandidates++;
        } else {
          seenIds.add(candidate.id);
          candidates.push(candidate);
        }
      }
    } else {
      logger.info(`[collectUniqueCandidates] Result ${result.taskId} FAILED: ${result.error}`);
    }
  }

  logger.info(`[collectUniqueCandidates] SUMMARY:`);
  logger.info(`  - Total candidates before filter: ${totalCandidatesBeforeFilter}`);
  logger.info(`  - Candidates without ID (DROPPED): ${candidatesWithoutId}`);
  logger.info(`  - Duplicate candidates: ${duplicateCandidates}`);
  logger.info(`  - Final unique candidates: ${candidates.length}`);

  // Sort by authority: LA Supreme > LA App > 5th Cir > District > Other
  return candidates.sort((a, b) => {
    const getPriority = (c: RawCandidate): number => {
      const code = c.courtCode.toLowerCase();
      if (code === 'la' || code === 'lasc') return 1;
      if (code === 'lactapp') return 2;
      if (code === 'scotus') return 3;
      if (code === 'ca5') return 4;
      if (['laed', 'lamd', 'lawd'].includes(code)) return 5;
      return 6;
    };

    const priorityDiff = getPriority(a) - getPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    // Same priority - sort by date (recent first)
    const dateA = a.dateFiled ? new Date(a.dateFiled).getTime() : 0;
    const dateB = b.dateFiled ? new Date(b.dateFiled).getTime() : 0;
    return dateB - dateA;
  });
}
