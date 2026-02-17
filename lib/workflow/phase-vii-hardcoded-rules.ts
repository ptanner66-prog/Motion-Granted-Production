/**
 * Phase VII Hard-Coded Rules
 *
 * PROBLEM (BUG 5): A motion with zero citations in 2 of 4 argument
 * sections passed Phase VII at 88/100. Numeric scoring compensated
 * for categorical failures.
 *
 * FIX: These rules are checked AFTER Phase VII returns its numeric
 * grade. If any rule triggers, the motion FAILS regardless of score.
 *
 * These rules are NOT injected into the LLM prompt (that's what the
 * grading lock preamble does). These are CODE-LEVEL gates that run
 * on the structured JSON output from Phase VII.
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses BUG 5 (no hard-fail rules in Phase VII)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PhaseVIISectionGrade {
  sectionName: string;
  grade: string;                // e.g., "B+", "C+", "A-"
  numericScore: number;         // 0-100
  authorityAppropriate: boolean;
  citationCount: number;
  deficiencies: string[];
}

export interface PhaseVIIOutput {
  overallGrade: string;
  overallScore: number;
  sections: PhaseVIISectionGrade[];
  deficiencies: string[];
  passesThreshold: boolean;
  loopComparison?: {
    previousLoop: number;
    previousScore: number;
    deficienciesFixed: string[];
    deficienciesRemaining: string[];
    scoreChangesJustified: boolean;
  };
}

export interface HardRuleResult {
  overriddenToFail: boolean;
  originalScore: number;
  adjustedScore: number | null; // null if no adjustment
  originalPasses: boolean;
  adjustedPasses: boolean;
  ruleViolations: string[];
  warnings: string[];
}

// ============================================================================
// HARD RULE ENGINE
// ============================================================================

/**
 * Apply hard-coded rules to Phase VII output.
 *
 * Rules are applied in order. Any single rule violation forces failure.
 *
 * Thresholds: Tier A = 83, Tier B/C/D = 87
 */
export function applyPhaseVIIHardRules(
  output: PhaseVIIOutput,
  tier: 'A' | 'B' | 'C' | 'D',
  loopNumber: number
): HardRuleResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  const threshold = tier === 'A' ? 83 : 87;

  // ── RULE 1: Zero citations in argument section = automatic fail ──────
  for (const section of output.sections) {
    if (!section.authorityAppropriate && section.citationCount === 0) {
      // Only apply to argument-type sections, not procedural sections
      // (certificate of service, signature block, etc.)
      const isArgumentSection =
        section.sectionName.toLowerCase().includes('argument') ||
        section.sectionName.toLowerCase().includes('legal') ||
        section.sectionName.toLowerCase().includes('analysis') ||
        section.sectionName.toLowerCase().includes('discussion');

      if (isArgumentSection) {
        violations.push(
          `RULE_1_VIOLATION: "${section.sectionName}" has 0 case citations and ` +
          `authority_appropriate=false. Argument sections MUST cite legal authority. ` +
          `Automatic fail regardless of overall score (${output.overallScore}/100).`
        );
      }
    }
  }

  // ── RULE 2: No section can score below C (70) in a passing motion ────
  for (const section of output.sections) {
    if (section.numericScore < 70 && output.passesThreshold) {
      violations.push(
        `RULE_2_VIOLATION: "${section.sectionName}" scored ${section.numericScore}/100 ` +
        `(below C/70 minimum). No section can score below C in a motion that passes overall.`
      );
    }
  }

  // ── RULE 3: Grade inflation detection on loop 2+ ─────────────────────
  if (loopNumber >= 2 && output.loopComparison) {
    const { previousScore, deficienciesRemaining, scoreChangesJustified } =
      output.loopComparison;
    const scoreIncrease = output.overallScore - previousScore;

    // Flag if score increased significantly without fixing deficiencies
    if (scoreIncrease > 5 && deficienciesRemaining.length > 0 && !scoreChangesJustified) {
      warnings.push(
        `GRADE_INFLATION_WARNING: Score increased ${previousScore}->${output.overallScore} ` +
        `(+${scoreIncrease}) but ${deficienciesRemaining.length} deficiencies remain unfixed. ` +
        `Review manually.`
      );
    }

    // Hard fail if score increased but NO deficiencies were fixed
    if (
      scoreIncrease > 3 &&
      output.loopComparison.deficienciesFixed.length === 0
    ) {
      violations.push(
        `RULE_3_VIOLATION: Score increased from ${previousScore} to ${output.overallScore} ` +
        `but ZERO deficiencies from Loop ${output.loopComparison.previousLoop} were fixed. ` +
        `This indicates grade inflation, not improvement.`
      );
    }
  }

  // ── RULE 4: CIV pipeline enforcement (defense in depth) ─────────────
  // This is enforced at the workflow level. If Phase V.1 output shows
  // usedCIVPipeline=false, Phase VII should never have been reached.
  // But defense in depth means we check here too. This rule is
  // evaluated by the caller via evaluateCitationHardGates().

  // ── RULE 5: Tier A verbosity check ──────────────────────────────────
  if (tier === 'A') {
    const repetitiveDeficiencies = output.deficiencies.filter(d =>
      d.toLowerCase().includes('repetit') ||
      d.toLowerCase().includes('verbose') ||
      d.toLowerCase().includes('redundant')
    );
    if (repetitiveDeficiencies.length >= 2) {
      warnings.push(
        `TIER_A_VERBOSITY: Multiple deficiencies flag repetitiveness in a Tier A motion. ` +
        `Tier A procedural motions should be 1-2 pages. Consider enforcing brevity in Phase VIII.`
      );
    }
  }

  const overriddenToFail = violations.length > 0;

  return {
    overriddenToFail,
    originalScore: output.overallScore,
    adjustedScore: overriddenToFail ? Math.min(output.overallScore, threshold - 1) : null,
    originalPasses: output.passesThreshold,
    adjustedPasses: overriddenToFail ? false : output.passesThreshold,
    ruleViolations: violations,
    warnings,
  };
}
