/**
 * SCORE REGRESSION DETECTOR
 *
 * TASK-10: Prevent score regression between revision loops.
 *
 * Audit Evidence (Pelican order):
 * Loop 1: 84% (denied) -> Loop 2: 82% (regression!) -> Loop 3: 88% (granted)
 * Loop 2 made the motion 2 points worse. This wasted one of three allowed
 * revision cycles.
 *
 * Solution:
 * - Compare each loop's score to previous
 * - On regression, revert to prior version
 * - Generate more targeted revision instructions
 * - Maximum 1 regression-revert per order to prevent oscillation
 *
 * @module score-regression-detector
 */

import { logger } from '@/lib/logger';

// =======================================================================
// TYPES
// =======================================================================

export interface LoopScore {
  loopNumber: number;
  numericScore: number;
  categoryScores: Record<string, number>;
  motionText: string;
  timestamp: string;
}

export interface RegressionCheck {
  hasRegression: boolean;
  previousScore: number;
  currentScore: number;
  delta: number;
  droppedCategories: string[];
  action: 'continue' | 'revert' | 'blocked';
  reason: string;
}

export interface RegressionState {
  orderId: string;
  scores: LoopScore[];
  revertsUsed: number;
  maxReverts: number;
}

// =======================================================================
// CONSTANTS
// =======================================================================

const MAX_REVERTS_PER_ORDER = 1;

// =======================================================================
// STATE MANAGEMENT
// =======================================================================

const regressionStates = new Map<string, RegressionState>();

/**
 * Initialize regression tracking for an order.
 */
export function initRegressionTracking(orderId: string): RegressionState {
  const state: RegressionState = {
    orderId,
    scores: [],
    revertsUsed: 0,
    maxReverts: MAX_REVERTS_PER_ORDER,
  };
  regressionStates.set(orderId, state);
  return state;
}

/**
 * Get regression state for an order.
 */
export function getRegressionState(orderId: string): RegressionState | undefined {
  return regressionStates.get(orderId);
}

// =======================================================================
// MAIN FUNCTIONS
// =======================================================================

/**
 * Record a loop score and check for regression.
 *
 * @param orderId - The order ID
 * @param loopNumber - Current revision loop number
 * @param numericScore - Overall score from Phase VII (0-100)
 * @param categoryScores - Individual category scores
 * @param motionText - Current motion text (for potential revert)
 * @returns Regression check result with recommended action
 */
export function checkForRegression(
  orderId: string,
  loopNumber: number,
  numericScore: number,
  categoryScores: Record<string, number>,
  motionText: string
): RegressionCheck {
  let state = getRegressionState(orderId);
  if (!state) {
    state = initRegressionTracking(orderId);
  }

  // Record current score
  const currentLoop: LoopScore = {
    loopNumber,
    numericScore,
    categoryScores,
    motionText,
    timestamp: new Date().toISOString(),
  };

  // If this is the first loop, no regression possible
  if (state.scores.length === 0) {
    state.scores.push(currentLoop);
    regressionStates.set(orderId, state);

    return {
      hasRegression: false,
      previousScore: 0,
      currentScore: numericScore,
      delta: 0,
      droppedCategories: [],
      action: 'continue',
      reason: 'First loop — no previous score to compare',
    };
  }

  const previousLoop = state.scores[state.scores.length - 1];
  const delta = numericScore - previousLoop.numericScore;

  // -------------------------------------------------------------------
  // REGRESSION DETECTED
  // -------------------------------------------------------------------

  if (delta < 0) {
    // Find which categories dropped
    const droppedCategories: string[] = [];
    for (const [category, score] of Object.entries(categoryScores)) {
      const prevScore = previousLoop.categoryScores[category] ?? score;
      if (score < prevScore) {
        droppedCategories.push(category);
      }
    }

    logger.warn('[REGRESSION] Score regression detected', {
      orderId,
      loopNumber,
      previousScore: previousLoop.numericScore,
      currentScore: numericScore,
      delta,
      droppedCategories,
      revertsRemaining: state.maxReverts - state.revertsUsed,
    });

    // Can we revert?
    if (state.revertsUsed < state.maxReverts) {
      state.revertsUsed++;
      // Don't add current score to history (we're reverting)
      regressionStates.set(orderId, state);

      return {
        hasRegression: true,
        previousScore: previousLoop.numericScore,
        currentScore: numericScore,
        delta,
        droppedCategories,
        action: 'revert',
        reason: `Regression of ${Math.abs(delta)} points. Reverting to previous version and generating targeted instructions.`,
      };
    } else {
      // Can't revert — we've used our quota
      state.scores.push(currentLoop);
      regressionStates.set(orderId, state);

      return {
        hasRegression: true,
        previousScore: previousLoop.numericScore,
        currentScore: numericScore,
        delta,
        droppedCategories,
        action: 'blocked',
        reason: `Regression detected but max reverts (${MAX_REVERTS_PER_ORDER}) already used. Continuing with lower score.`,
      };
    }
  }

  // -------------------------------------------------------------------
  // NO REGRESSION — Score improved or stayed same
  // -------------------------------------------------------------------

  state.scores.push(currentLoop);
  regressionStates.set(orderId, state);

  return {
    hasRegression: false,
    previousScore: previousLoop.numericScore,
    currentScore: numericScore,
    delta,
    droppedCategories: [],
    action: 'continue',
    reason: delta > 0
      ? `Score improved by ${delta} points`
      : 'Score unchanged',
  };
}

/**
 * Get the best motion text (highest score) for an order.
 */
export function getBestMotionText(orderId: string): string | null {
  const state = getRegressionState(orderId);
  if (!state || state.scores.length === 0) {
    return null;
  }

  const best = state.scores.reduce((prev, curr) =>
    curr.numericScore > prev.numericScore ? curr : prev
  );

  return best.motionText;
}

/**
 * Get previous loop's motion text for revert.
 */
export function getPreviousMotionText(orderId: string): string | null {
  const state = getRegressionState(orderId);
  if (!state || state.scores.length === 0) {
    return null;
  }

  return state.scores[state.scores.length - 1].motionText;
}

/**
 * Generate targeted revision instructions after regression.
 *
 * These instructions focus on the categories that improved in the
 * prior version, avoiding changes that caused the regression.
 */
export function generateTargetedInstructions(
  droppedCategories: string[],
  originalInstructions: string
): string {
  const categoryFixes: Record<string, string> = {
    'legal_reasoning': 'Focus on strengthening legal analysis without restructuring existing arguments.',
    'citation_quality': 'Add citations only where gaps exist. Do not remove or replace existing citations.',
    'structure': 'Maintain current document structure. Do not reorganize sections.',
    'persuasiveness': 'Enhance persuasive language in conclusion only. Do not modify argument structure.',
    'completeness': 'Address any missing elements without altering sections that scored well.',
    'clarity': 'Improve sentence clarity in flagged sections only.',
  };

  let targeted = originalInstructions + '\n\n';
  targeted += 'REGRESSION PREVENTION INSTRUCTIONS:\n';
  targeted += 'The previous revision caused a score regression. Focus ONLY on deficiencies listed in the grading feedback. ';
  targeted += 'DO NOT modify sections that are not specifically flagged for improvement.\n\n';

  if (droppedCategories.length > 0) {
    targeted += 'Categories that regressed and need careful handling:\n';
    for (const category of droppedCategories) {
      const fix = categoryFixes[category] || `Be cautious when modifying ${category}.`;
      targeted += `- ${category}: ${fix}\n`;
    }
  }

  return targeted;
}
