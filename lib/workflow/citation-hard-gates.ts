/**
 * Citation Hard Gates
 *
 * Categorical rules that block a motion from proceeding regardless of
 * numeric quality scores. These exist because BUG 5 showed that a
 * purely numeric grading system (Phase VII) can compensate for
 * categorical failures — a motion with zero citations in 2 of 4
 * argument sections passed at 88/100.
 *
 * RULES:
 * 1. Any HOLDING_MISMATCH -> BLOCK (case exists but doesn't support proposition)
 * 2. Any NOT_FOUND citation -> BLOCK (case doesn't exist at all)
 * 3. CIV pipeline did not run -> BLOCK (usedCIVPipeline must be true)
 * 4. Zero citations in an argument section -> BLOCK (Phase VII categorical fail)
 * 5. Verification rate below tier threshold -> BLOCK
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses BUG 5 (no hard-fail rules)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HardGateInput {
  tier: 'A' | 'B' | 'C' | 'D';
  holdingMismatches: number;
  notFoundCount: number;
  usedCIVPipeline: boolean;
  verifiedCount: number;
  totalCount: number;
  argumentSections?: Array<{
    sectionName: string;
    citationCount: number;
    authorityAppropriate: boolean;
  }>;
}

export interface HardGateResult {
  passes: boolean;
  failures: string[];
  warnings: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimum verification rates by tier.
 * These are the floor — below this, the motion cannot proceed.
 */
const MIN_VERIFICATION_RATE: Record<string, number> = {
  A: 0.80, // 80% of citations must pass
  B: 0.85,
  C: 0.90,
  D: 0.90,
};

// ============================================================================
// HARD GATE EVALUATOR
// ============================================================================

/**
 * Evaluate citation hard gates.
 *
 * Returns { passes: false } if ANY gate fails. The motion cannot
 * proceed regardless of numeric quality scores.
 *
 * Called from:
 * - Phase V.1 executor (after CIV pipeline)
 * - Phase VII grading (before numeric evaluation)
 * - Workflow orchestration (as safety net)
 */
export function evaluateCitationHardGates(input: HardGateInput): HardGateResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // GATE 1: No holding mismatches allowed
  if (input.holdingMismatches > 0) {
    failures.push(
      `HARD_FAIL: ${input.holdingMismatches} citation(s) have HOLDING_MISMATCH — ` +
      `case exists but does NOT support the proposition it's cited for. ` +
      `This is the most dangerous hallucination type and cannot be overridden by numeric scores.`
    );
  }

  // GATE 2: No NOT_FOUND citations allowed
  if (input.notFoundCount > 0) {
    failures.push(
      `HARD_FAIL: ${input.notFoundCount} citation(s) not found in any legal database. ` +
      `Citing a non-existent case is sanctionable under La. R. Prof. Conduct 3.3.`
    );
  }

  // GATE 3: CIV pipeline must have run
  if (!input.usedCIVPipeline) {
    failures.push(
      `HARD_FAIL: CIV pipeline did not execute (usedCIVPipeline=false). ` +
      `Motion cannot be delivered without full citation verification. ` +
      `This is a system error — escalate to engineering.`
    );
  }

  // GATE 4: No argument sections with zero citations (for non-procedural sections)
  if (input.argumentSections) {
    for (const section of input.argumentSections) {
      if (!section.authorityAppropriate && section.citationCount === 0) {
        failures.push(
          `HARD_FAIL: "${section.sectionName}" has zero case citations and authority_appropriate=false. ` +
          `An argument section without legal authority cannot pass regardless of numeric score.`
        );
      }
    }
  }

  // GATE 5: Verification rate minimum
  if (input.totalCount > 0) {
    const rate = input.verifiedCount / input.totalCount;
    const minRate = MIN_VERIFICATION_RATE[input.tier] ?? 0.85;
    if (rate < minRate) {
      failures.push(
        `HARD_FAIL: Verification rate ${Math.round(rate * 100)}% is below ` +
        `minimum ${Math.round(minRate * 100)}% for Tier ${input.tier}.`
      );
    }
  }

  return {
    passes: failures.length === 0,
    failures,
    warnings,
  };
}
