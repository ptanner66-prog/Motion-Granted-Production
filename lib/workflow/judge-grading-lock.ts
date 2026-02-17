/**
 * Judge Grading Lock — Anti-Inflation System
 *
 * PROBLEM (BUG 3): Phase VII Loop 2 graded the same deficiencies
 * 1.5 letter grades higher than Loop 1. Arguments III and IV went from
 * C+/C+ to B/B- with the IDENTICAL problem flagged ("complete absence
 * of case citations"). The judge simulation became lenient.
 *
 * FIX: This module provides:
 * 1. A grading preamble injected into the Phase VII prompt on loop 2+
 * 2. A diff-based consistency check that catches score drift
 * 3. Hard rules that override numeric scores for categorical failures
 *
 * USAGE: Call getGradingLockPreamble() and inject the returned string
 * into the Phase VII system prompt before the grading rubric section.
 * Call validateGradeConsistency() after Phase VII returns to check
 * for unexplained score increases.
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses BUG 3 (grade inflation across loops)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LoopGrade {
  loop: number;
  overallScore: number;
  sectionScores: Record<string, number>;
  deficiencies: string[];
  authorityFlags: Record<string, boolean>; // section -> authority_appropriate
}

export interface GradeConsistencyResult {
  valid: boolean;
  adjustedScore: number | null; // null if no adjustment needed
  warnings: string[];
  hardFails: string[];
}

// ============================================================================
// GRADING LOCK PREAMBLE
// ============================================================================

/**
 * Generate the anti-inflation preamble for Phase VII prompt.
 *
 * This preamble is ONLY injected on loop 2+. Loop 1 runs without it.
 * The preamble forces the judge simulation to:
 * - Apply identical grading standards regardless of loop number
 * - Explicitly compare revised draft against loop 1's deficiency list
 * - Justify any score increase with specific evidence of improvement
 * - Hard-fail any section that still has the same categorical issue
 */
export function getGradingLockPreamble(
  currentLoop: number,
  previousGrades: LoopGrade[]
): string {
  if (currentLoop <= 1 || previousGrades.length === 0) {
    return ''; // No preamble needed for first loop
  }

  const lastGrade = previousGrades[previousGrades.length - 1];

  const deficiencyList = lastGrade.deficiencies
    .map((d, i) => `  ${i + 1}. ${d}`)
    .join('\n');

  const authorityFails = Object.entries(lastGrade.authorityFlags)
    .filter(([, appropriate]) => !appropriate)
    .map(([section]) => section);

  const authorityWarning = authorityFails.length > 0
    ? `\n\nCRITICAL — SECTIONS WITH authority_appropriate=false IN LOOP ${lastGrade.loop}:\n` +
      `${authorityFails.map(s => `  - ${s}`).join('\n')}\n` +
      `If these sections STILL lack case citations in the current draft, they MUST receive ` +
      `the SAME or LOWER grade. You CANNOT increase the grade for a section that has the ` +
      `same categorical failure. A section with zero citations and authority_appropriate=false ` +
      `gets C+ or lower, PERIOD.`
    : '';

  return `
═══════════════════════════════════════════════════════════════
GRADING CONSISTENCY LOCK — LOOP ${currentLoop}
═══════════════════════════════════════════════════════════════

You are re-evaluating a revised draft. The previous loop (Loop ${lastGrade.loop})
graded this motion ${lastGrade.overallScore}/100 and identified these deficiencies:

${deficiencyList}
${authorityWarning}

MANDATORY GRADING RULES FOR THIS EVALUATION:

1. SAME STANDARDS: Apply the EXACT same grading rubric and weight as Loop ${lastGrade.loop}.
   Do NOT adjust for "good enough for this tier" or "good enough for a procedural motion."
   The standard is absolute, not relative to loop number.

2. JUSTIFY INCREASES: For EVERY section where you assign a HIGHER grade than Loop ${lastGrade.loop},
   you MUST cite the SPECIFIC text change that justifies the increase. If you cannot point to
   a concrete improvement, the grade for that section MUST remain the same or decrease.

3. UNFIXED = SAME GRADE: If a deficiency from Loop ${lastGrade.loop} is still present in the current
   draft, the grade for that section CANNOT increase. Rearranging words without fixing the
   underlying problem is not improvement.

4. NO AUTHORITY = HARD CEILING: Any argument section with zero case citations has a hard
   ceiling of C+ regardless of how well-written the prose is. Legal arguments require
   legal authority. Period.

5. OUTPUT REQUIREMENT: In your evaluation JSON, include a "loop_comparison" field:
   {
     "loop_comparison": {
       "previous_loop": ${lastGrade.loop},
       "previous_score": ${lastGrade.overallScore},
       "deficiencies_fixed": ["list of deficiencies that were actually addressed"],
       "deficiencies_remaining": ["list that still exist"],
       "score_changes_justified": true/false
     }
   }

═══════════════════════════════════════════════════════════════
`;
}

// ============================================================================
// GRADE CONSISTENCY VALIDATOR
// ============================================================================

/**
 * Validate that a grade increase between loops is justified.
 *
 * Returns warnings for any section where the score increased without
 * the corresponding deficiency being resolved, and hard fails for
 * authority_appropriate violations.
 */
export function validateGradeConsistency(
  previousGrade: LoopGrade,
  currentGrade: LoopGrade
): GradeConsistencyResult {
  const warnings: string[] = [];
  const hardFails: string[] = [];

  // Check for authority_appropriate violations that got better grades
  for (const [section, wasAppropriate] of Object.entries(previousGrade.authorityFlags)) {
    const isAppropriate = currentGrade.authorityFlags[section];

    // If it was false before AND is still false, the grade cannot increase
    if (!wasAppropriate && !isAppropriate) {
      const prevScore = previousGrade.sectionScores[section] ?? 0;
      const currScore = currentGrade.sectionScores[section] ?? 0;

      if (currScore > prevScore) {
        hardFails.push(
          `GRADE_INFLATION: "${section}" still has authority_appropriate=false but grade ` +
          `increased from ${prevScore} to ${currScore}. Reverting to ${prevScore}.`
        );
      }
    }
  }

  // Check overall score increase vs deficiencies resolved
  const deficienciesResolved = previousGrade.deficiencies.filter(
    d => !currentGrade.deficiencies.some(cd =>
      cd.toLowerCase().includes(d.toLowerCase().substring(0, 30))
    )
  );

  const scoreIncrease = currentGrade.overallScore - previousGrade.overallScore;

  if (scoreIncrease > 5 && deficienciesResolved.length === 0) {
    warnings.push(
      `SUSPICIOUS: Overall score increased by ${scoreIncrease} points but ` +
      `no deficiencies from Loop ${previousGrade.loop} appear to be resolved. ` +
      `Possible grade inflation.`
    );
  }

  // Calculate adjusted score if needed
  let adjustedScore: number | null = null;
  if (hardFails.length > 0) {
    // Revert inflated sections to previous scores
    adjustedScore = currentGrade.overallScore;
    for (const [section] of Object.entries(previousGrade.authorityFlags)) {
      if (!previousGrade.authorityFlags[section] && !currentGrade.authorityFlags[section]) {
        const prevScore = previousGrade.sectionScores[section] ?? 0;
        const currScore = currentGrade.sectionScores[section] ?? 0;
        if (currScore > prevScore) {
          adjustedScore -= (currScore - prevScore);
        }
      }
    }
  }

  return {
    valid: hardFails.length === 0,
    adjustedScore,
    warnings,
    hardFails,
  };
}
