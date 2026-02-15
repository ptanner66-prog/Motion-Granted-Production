/**
 * TIER-BASED REVISION CONTROLLER
 *
 * TASK-18: Implement tier-based revision loop caps with early exit.
 *
 * Current State:
 * - Flat 3-loop cap for all tiers
 * - No early exit when motion already passes
 *
 * Problem (Pelican order - Tier C):
 * - Loop 1 = 84 (denied)
 * - Loop 2 = 82 (regression, wasted cycle)
 * - Loop 3 = 88 (granted with known deficiencies)
 *
 * With 4th loop available, could have addressed SWAT 24 and Vartech.
 *
 * Solution:
 * - Revision caps: A=2, B=3, C=4, D=5
 * - Early exit: score >=87 AND zero placeholders AND opposition addressed
 * - Cost caps: A=$4, B=$8, C=$12, D=$18
 *
 * Dependency: TASK-10 (score-regression-detector) must be complete.
 *
 * @module tier-based-revision-controller
 */

import { checkForRegression, type RegressionCheck } from './score-regression-detector';
import { checkAuthoritiesAddressed, type OppositionAuthority } from './opposition-integrator';
import { logger } from '@/lib/logger';

// =======================================================================
// TYPES
// =======================================================================

export interface RevisionConfig {
  tier: 'A' | 'B' | 'C' | 'D';
  maxLoops: number;
  costCap: number;
  qualityThreshold: number;
}

export interface LoopState {
  orderId: string;
  tier: 'A' | 'B' | 'C' | 'D';
  currentLoop: number;
  maxLoops: number;
  totalApiCost: number;
  costCap: number;
  scores: number[];
  earlyExitTriggered: boolean;
  earlyExitReason?: string;
}

export interface LoopDecision {
  continueLoop: boolean;
  reason: string;
  loopsUsed: number;
  loopsRemaining: number;
  earlyExit: boolean;
  costRemaining: number;
}

export interface EarlyExitCheck {
  canExit: boolean;
  criteria: {
    scoreAboveThreshold: boolean;
    zeroPlaceholders: boolean;
    oppositionAddressed: boolean;
  };
  reason: string;
}

// =======================================================================
// CONSTANTS
// =======================================================================

const REVISION_CAPS: Record<string, number> = {
  A: 2,
  B: 3,
  C: 4,
  D: 5,
};

const COST_CAPS: Record<string, number> = {
  A: 4,
  B: 8,
  C: 12,
  D: 18,
};

const QUALITY_THRESHOLD = 0.87; // B+ (87%)

// =======================================================================
// STATE MANAGEMENT
// =======================================================================

const loopStates = new Map<string, LoopState>();

/**
 * Initialize revision loop state for an order.
 */
export function initLoopState(orderId: string, tier: 'A' | 'B' | 'C' | 'D'): LoopState {
  const state: LoopState = {
    orderId,
    tier,
    currentLoop: 0,
    maxLoops: REVISION_CAPS[tier],
    totalApiCost: 0,
    costCap: COST_CAPS[tier],
    scores: [],
    earlyExitTriggered: false,
  };
  loopStates.set(orderId, state);
  return state;
}

/**
 * Get loop state for an order.
 */
export function getLoopState(orderId: string): LoopState | undefined {
  return loopStates.get(orderId);
}

// =======================================================================
// EARLY EXIT CHECK
// =======================================================================

/**
 * Check if early exit conditions are met.
 *
 * Conditions:
 * 1. Score >= 87% (B+ threshold)
 * 2. Zero [CITATION NEEDED] placeholders
 * 3. All HIGH-likelihood Phase VI opposition authorities addressed
 */
export function checkEarlyExit(
  score: number,
  motionText: string,
  oppositionAuthorities: OppositionAuthority[]
): EarlyExitCheck {
  // Check score
  const scoreAboveThreshold = score >= QUALITY_THRESHOLD * 100;

  // Check placeholders
  const placeholderPattern = /\[CITATION\s+NEEDED\]|\[CITE\]|\[AUTHORITY\s+NEEDED\]/gi;
  const zeroPlaceholders = !placeholderPattern.test(motionText);

  // Check opposition authorities
  const authorityResults = checkAuthoritiesAddressed(motionText, oppositionAuthorities);
  const oppositionAddressed = authorityResults.every(r => r.citedByName);

  const canExit = scoreAboveThreshold && zeroPlaceholders && oppositionAddressed;

  let reason: string;
  if (canExit) {
    reason = 'All early exit criteria met: score >=87%, zero placeholders, opposition addressed';
  } else {
    const missing: string[] = [];
    if (!scoreAboveThreshold) missing.push(`score ${score}% < 87%`);
    if (!zeroPlaceholders) missing.push('placeholders remain');
    if (!oppositionAddressed) missing.push('opposition not fully addressed');
    reason = `Cannot exit early: ${missing.join(', ')}`;
  }

  return {
    canExit,
    criteria: {
      scoreAboveThreshold,
      zeroPlaceholders,
      oppositionAddressed,
    },
    reason,
  };
}

// =======================================================================
// LOOP DECISION
// =======================================================================

/**
 * Decide whether to continue revision loop.
 */
export function shouldContinueLoop(
  orderId: string,
  currentScore: number,
  motionText: string,
  oppositionAuthorities: OppositionAuthority[],
  loopApiCost: number
): LoopDecision {
  const state = getLoopState(orderId);
  if (!state) {
    logger.error('[REVISION-CONTROLLER] No loop state found', { orderId });
    return {
      continueLoop: false,
      reason: 'No loop state found',
      loopsUsed: 0,
      loopsRemaining: 0,
      earlyExit: false,
      costRemaining: 0,
    };
  }

  // Update state
  state.currentLoop++;
  state.totalApiCost += loopApiCost;
  state.scores.push(currentScore);

  // -------------------------------------------------------------------
  // CHECK EARLY EXIT
  // -------------------------------------------------------------------

  const earlyExitCheck = checkEarlyExit(currentScore, motionText, oppositionAuthorities);

  if (earlyExitCheck.canExit) {
    state.earlyExitTriggered = true;
    state.earlyExitReason = earlyExitCheck.reason;
    loopStates.set(orderId, state);

    logger.info('[REVISION-CONTROLLER] Early exit triggered', {
      orderId,
      loopsUsed: state.currentLoop,
      loopsRemaining: state.maxLoops - state.currentLoop,
      score: currentScore,
    });

    return {
      continueLoop: false,
      reason: `Early exit: ${earlyExitCheck.reason}`,
      loopsUsed: state.currentLoop,
      loopsRemaining: state.maxLoops - state.currentLoop,
      earlyExit: true,
      costRemaining: state.costCap - state.totalApiCost,
    };
  }

  // -------------------------------------------------------------------
  // CHECK LOOP CAP
  // -------------------------------------------------------------------

  if (state.currentLoop >= state.maxLoops) {
    loopStates.set(orderId, state);

    logger.info('[REVISION-CONTROLLER] Max loops reached', {
      orderId,
      tier: state.tier,
      maxLoops: state.maxLoops,
      finalScore: currentScore,
    });

    return {
      continueLoop: false,
      reason: `Max loops (${state.maxLoops}) reached for Tier ${state.tier}`,
      loopsUsed: state.currentLoop,
      loopsRemaining: 0,
      earlyExit: false,
      costRemaining: state.costCap - state.totalApiCost,
    };
  }

  // -------------------------------------------------------------------
  // CHECK COST CAP
  // -------------------------------------------------------------------

  if (state.totalApiCost >= state.costCap) {
    loopStates.set(orderId, state);

    logger.warn('[REVISION-CONTROLLER] Cost cap reached', {
      orderId,
      tier: state.tier,
      costCap: state.costCap,
      totalCost: state.totalApiCost,
    });

    return {
      continueLoop: false,
      reason: `Cost cap ($${state.costCap}) reached for Tier ${state.tier}`,
      loopsUsed: state.currentLoop,
      loopsRemaining: state.maxLoops - state.currentLoop,
      earlyExit: false,
      costRemaining: 0,
    };
  }

  // -------------------------------------------------------------------
  // CONTINUE LOOP
  // -------------------------------------------------------------------

  loopStates.set(orderId, state);

  return {
    continueLoop: true,
    reason: `Loop ${state.currentLoop}/${state.maxLoops}: score ${currentScore}%, continuing`,
    loopsUsed: state.currentLoop,
    loopsRemaining: state.maxLoops - state.currentLoop,
    earlyExit: false,
    costRemaining: state.costCap - state.totalApiCost,
  };
}

/**
 * Get final loop statistics for audit.
 */
export function getFinalLoopStats(orderId: string): {
  loopsUsed: number;
  loopsRemaining: number;
  earlyExit: boolean;
  totalCost: number;
  scores: number[];
} | null {
  const state = getLoopState(orderId);
  if (!state) return null;

  return {
    loopsUsed: state.currentLoop,
    loopsRemaining: state.maxLoops - state.currentLoop,
    earlyExit: state.earlyExitTriggered,
    totalCost: state.totalApiCost,
    scores: state.scores,
  };
}
