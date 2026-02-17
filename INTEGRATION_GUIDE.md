# INTEGRATION GUIDE — CIV Emergency Fix
## Wiring Files 1-6 into the Motion Granted Codebase
## Date: February 17, 2026

---

## OVERVIEW

This guide provides the EXACT code changes needed in existing files
to wire the 6 new modules into the workflow. These are SURGICAL edits —
minimal changes to existing files that import and call the new modules.

**New files created (already done):**
1. `lib/citation/civ-pipeline-runner.ts` — Production CIV pipeline wrapper
2. `lib/workflow/phase-v1-executor.ts` — Replacement Phase V.1 executor
3. `lib/workflow/citation-hard-gates.ts` — Hard gate logic
4. `lib/workflow/judge-grading-lock.ts` — Anti-inflation for Phase VII
5. `lib/workflow/revision-diff-checker.ts` — Phase VIII diff verification
6. `lib/workflow/phase-vii-hardcoded-rules.ts` — Categorical hard-fail rules

**Files to modify:**
1. `lib/workflow/phase-executors.ts` — Phase V.1 section (lines ~2948-2969) and Phase VII section (line ~3405)
2. `lib/inngest/workflow-orchestration.ts` — Phase V.1 step + Phase VII loop

---

## STEP 1: Fix Phase V.1 Fallback in phase-executors.ts (BUG 1 + BUG 2)

### What's wrong

In `lib/workflow/phase-executors.ts`, the `executePhaseV1` function (line 2672) already
calls `verifyBatch()` from the canonical CIV pipeline at line 2862. However, lines 2948-2969
contain a `catch (civError)` block that silently falls back to shallow CourtListener
existence checks:

```typescript
// LINE 2948-2969 — THIS IS THE BUG
} catch (civError) {
  // CIV pipeline failure — fall back to simplified existence checks
  // DO NOT crash the workflow pipeline on CIV errors
  console.error(`[Phase V.1] CIV pipeline error — falling back to existence-only checks:`, civError);

  for (const citation of citationsInDraft) {
    // ... shallow existence check only ...
    const verifyResult = await verifyCitationExists(citation);
    // ... no holding verification, no proposition check ...
  }
}
```

This fallback is how BUG 1 occurred — the CIV pipeline errored, the fallback ran,
and shallow existence checks passed all 5 real-but-fabricated citations.

### The fix

**Option A (Recommended — minimal change):** Remove the fallback, propagate the error.

Replace lines 2948-2969 in `lib/workflow/phase-executors.ts`:

```typescript
// BEFORE (lines 2948-2969):
      } catch (civError) {
        console.error(`[Phase V.1] CIV pipeline error — falling back to existence-only checks:`, civError);
        // ... shallow fallback code ...
      }

// AFTER:
      } catch (civError) {
        // EMERGENCY FIX 2026-02-17: DO NOT fall back to shallow existence checks.
        // A silent fallback is how BUG 1 (HOLDING_MISMATCH bypass) occurred.
        // If the CIV pipeline fails, the motion MUST be blocked.
        console.error(`[Phase V.1] CIV pipeline FAILED — blocking motion (no shallow fallback):`, civError);

        return {
          success: false,
          phase: 'V.1',
          status: 'failed',
          output: {
            error: 'CIV_PIPELINE_FAILURE',
            message: `CIV pipeline failed: ${civError instanceof Error ? civError.message : 'Unknown error'}. ` +
              `Motion blocked. NO FALLBACK TO SHALLOW CHECKS.`,
            usedCIVPipeline: false,
            civPipelineResults: null,
            passesHardGate: false,
            verificationResults,
            unverifiedCitationsRemoved: unverifiedCitations,
          },
          error: civError instanceof Error ? civError.message : 'CIV pipeline failure',
          durationMs: Date.now() - start,
        };
      }
```

**Option B (Full replacement):** Replace the entire Phase V.1 executor with `executePhaseV1Full`.

Add this import at the top of `phase-executors.ts`:

```typescript
import { executePhaseV1 as executePhaseV1Full } from '@/lib/workflow/phase-v1-executor';
```

Then at line 2672, add a wrapper that calls the new executor:

```typescript
// At the start of executePhaseV1, before the existing try block:
// EMERGENCY FIX 2026-02-17: Use full CIV pipeline executor
if (process.env.USE_CIV_PIPELINE_V2 === 'true') {
  const extractedCitations = extractCitationsFromText(motionText);
  const fullResult = await executePhaseV1Full({
    orderId: input.orderId,
    tier: input.tier,
    draftText: motionText,
    rawCitations: extractedCitations,
  });
  // Map to PhaseOutput format
  return {
    success: fullResult.success,
    phase: 'V.1',
    status: fullResult.status,
    output: fullResult.output,
    durationMs: fullResult.durationMs,
  };
}
```

Option A is recommended because it's a smaller change with lower regression risk.

---

## STEP 2: Wire Citation Hard Gates (BUG 5)

Add this import to `phase-executors.ts`:

```typescript
import { evaluateCitationHardGates } from '@/lib/workflow/citation-hard-gates';
```

After the CIV pipeline results are processed (around line 2917), add:

```typescript
// EMERGENCY FIX 2026-02-17: Apply citation hard gates
if (civBatchResult) {
  const holdingMismatches = civBatchResult.results.filter(r =>
    r.compositeResult.flags.some(f => f.type === 'HOLDING_MISMATCH')
  ).length;

  const notFoundCount = civBatchResult.results.filter(r =>
    r.compositeResult.status === 'REJECTED' &&
    r.verificationResults.step1Existence.result === 'NOT_FOUND'
  ).length;

  const hardGateResult = evaluateCitationHardGates({
    tier: input.tier,
    holdingMismatches,
    notFoundCount,
    usedCIVPipeline: true,
    verifiedCount: civBatchResult.verified,
    totalCount: civBatchResult.totalCitations,
  });

  if (!hardGateResult.passes) {
    console.error(`[Phase V.1] HARD GATE FAILED:`, hardGateResult.failures);
    return {
      success: false,
      phase: 'V.1',
      status: 'failed',
      output: {
        error: 'CITATION_HARD_GATE_FAILED',
        hardGateFailures: hardGateResult.failures,
        hardGateWarnings: hardGateResult.warnings,
        civResults: civBatchResult,
        verificationResults,
        passesHardGate: false,
        usedCIVPipeline: true,
      },
      durationMs: Date.now() - start,
    };
  }
}
```

---

## STEP 3: Wire Phase VII Anti-Inflation (BUG 3 + BUG 5)

Add these imports to `phase-executors.ts`:

```typescript
import { getGradingLockPreamble, validateGradeConsistency, type LoopGrade } from '@/lib/workflow/judge-grading-lock';
import { applyPhaseVIIHardRules, type PhaseVIIOutput } from '@/lib/workflow/phase-vii-hardcoded-rules';
```

### 3a: Inject grading preamble

In the `executePhaseVII` function (line 3358), BEFORE the system prompt is assembled
(around line 3405), add:

```typescript
// EMERGENCY FIX 2026-02-17: Anti-inflation preamble for loop 2+
const previousGrades: LoopGrade[] = []; // Populate from previous loop data if available
if (loopNumber >= 2 && phaseVIIIOutput) {
  // Extract previous grade data from the last Phase VII evaluation
  const prevPhaseVII = (input.previousPhaseOutputs?.['VII'] ?? {}) as Record<string, unknown>;
  if (prevPhaseVII.overallScore) {
    previousGrades.push({
      loop: loopNumber - 1,
      overallScore: Number(prevPhaseVII.overallScore) || 0,
      sectionScores: (prevPhaseVII.sectionScores ?? {}) as Record<string, number>,
      deficiencies: (prevPhaseVII.deficiencies ?? []) as string[],
      authorityFlags: (prevPhaseVII.authorityFlags ?? {}) as Record<string, boolean>,
    });
  }
}

const gradingPreamble = getGradingLockPreamble(loopNumber, previousGrades);
```

Then inject into the system prompt assembly at line 3405:

```typescript
// BEFORE:
const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}\n\n${PHASE_PROMPTS.PHASE_VII}`;

// AFTER:
const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}\n\n${gradingPreamble}\n\n${PHASE_PROMPTS.PHASE_VII}`;
```

### 3b: Apply hard rules after Phase VII returns

After parsing the Phase VII response, add:

```typescript
// EMERGENCY FIX 2026-02-17: Apply categorical hard-fail rules
const phaseVIIStructured: PhaseVIIOutput = {
  overallGrade: parsedResult.overallGrade ?? '',
  overallScore: Number(parsedResult.overallScore) || 0,
  sections: (parsedResult.sections ?? []).map((s: Record<string, unknown>) => ({
    sectionName: String(s.sectionName ?? ''),
    grade: String(s.grade ?? ''),
    numericScore: Number(s.numericScore ?? s.score ?? 0),
    authorityAppropriate: Boolean(s.authorityAppropriate ?? s.authority_appropriate ?? true),
    citationCount: Number(s.citationCount ?? s.citation_count ?? 0),
    deficiencies: (s.deficiencies ?? []) as string[],
  })),
  deficiencies: (parsedResult.deficiencies ?? []) as string[],
  passesThreshold: Boolean(parsedResult.passesThreshold),
  loopComparison: parsedResult.loopComparison ?? parsedResult.loop_comparison,
};

const hardRuleResult = applyPhaseVIIHardRules(phaseVIIStructured, input.tier, loopNumber);

if (hardRuleResult.overriddenToFail) {
  console.warn(`[Phase VII] Hard rules overrode passing grade for order=${input.orderId}:`,
    hardRuleResult.ruleViolations);
  // Override the score and pass status
  parsedResult.overallScore = hardRuleResult.adjustedScore ?? parsedResult.overallScore;
  parsedResult.passesThreshold = false;
  parsedResult.hardRuleViolations = hardRuleResult.ruleViolations;
}

// Validate grade consistency on loop 2+
if (loopNumber >= 2 && previousGrades.length > 0) {
  const currentLoopGrade: LoopGrade = {
    loop: loopNumber,
    overallScore: Number(parsedResult.overallScore),
    sectionScores: Object.fromEntries(
      (phaseVIIStructured.sections).map(s => [s.sectionName, s.numericScore])
    ),
    deficiencies: phaseVIIStructured.deficiencies,
    authorityFlags: Object.fromEntries(
      (phaseVIIStructured.sections).map(s => [s.sectionName, s.authorityAppropriate])
    ),
  };

  const consistency = validateGradeConsistency(
    previousGrades[previousGrades.length - 1],
    currentLoopGrade
  );

  if (!consistency.valid) {
    console.warn(`[Phase VII] Grade inflation detected:`, consistency.hardFails);
    parsedResult.overallScore = consistency.adjustedScore ?? parsedResult.overallScore;
    const threshold = input.tier === 'A' ? 83 : 87;
    parsedResult.passesThreshold = parsedResult.overallScore >= threshold;
    parsedResult.gradeInflationDetected = consistency.hardFails;
  }
}
```

---

## STEP 4: Wire Revision Diff Checker (BUG 4)

Add this import to `phase-executors.ts` or `workflow-orchestration.ts` (wherever
Phase VIII completion flows back to Phase VII):

```typescript
import { checkRevisionExecution, parseRevisionInstructions } from '@/lib/workflow/revision-diff-checker';
```

Between Phase VIII completion and Phase VII re-entry, add:

```typescript
// EMERGENCY FIX 2026-02-17: Verify Phase VIII actually executed instructions
const phaseVIIPrevOutput = workflowState.phaseOutputs['VII'] as Record<string, unknown>;
const revisionInstructions = parseRevisionInstructions({
  deficiencies: (phaseVIIPrevOutput?.deficiencies ?? []) as Array<{ issue: string; priority?: number; section?: string }>,
  revisionInstructions: (phaseVIIPrevOutput?.revisionInstructions ?? []) as string[],
});

if (revisionInstructions.length > 0) {
  const originalDraft = String(phaseVOutput?.draftMotion ?? '');
  const revisedDraft = String(phaseVIIIOutput?.revisedMotion ?? '');

  const diffCheck = checkRevisionExecution(originalDraft, revisedDraft, revisionInstructions);

  console.log(`[Revision Check] ${diffCheck.summary.executed}/${diffCheck.summary.total} instructions executed, ` +
    `${diffCheck.summary.criticalNotExecuted} critical unexecuted`);

  if (!diffCheck.allCriticalExecuted) {
    console.warn(`[Revision Check] CRITICAL instructions not executed:`,
      diffCheck.results.filter(r => !r.executed && r.instruction.isCritical));

    // Proceed but add warning to Phase VII loop 2 preamble.
    // Phase VII's hard rules will catch zero-citation sections anyway.
    workflowState.revisionCheckWarnings = diffCheck.results
      .filter(r => !r.executed && r.instruction.isCritical)
      .map(r => `UNEXECUTED: ${r.instruction.instruction} (evidence: ${r.evidence})`);
  }
}
```

---

## STEP 5: Verify Deduplication is Wired

Deduplication is called in TWO places now:

1. **Inside `civ-pipeline-runner.ts`** (File 1) — calls `deduplicateCitations()`
   from `@/lib/civ/deduplication` before building `CitationToVerify[]`

2. **Inside `verifyBatch()`** (canonical pipeline at `lib/citation/civ/pipeline.ts`
   line 367-382) — already calls `deduplicateCitations()` internally

This double-dedup is safe (idempotent) and provides defense in depth.
The first dedup catches fragments before they even reach the pipeline.

Verify with:
```bash
grep -n "deduplicateCitations" lib/citation/civ-pipeline-runner.ts lib/citation/civ/pipeline.ts
```

---

## TESTING CHECKLIST

After wiring, test with these scenarios:

1. **Real case, fabricated holding** (BUG 1 scenario)
   - Submit a motion citing a real Louisiana case for a fabricated proposition
   - Expected: CIV pipeline catches the holding mismatch, hard gate blocks

2. **Truncated citation fragments** (BUG 2 scenario)
   - Submit a motion where Eyecite produces both "194 So. 3d 626" and "194 So. 3"
   - Expected: Dedup removes the fragment, only 1 citation verified, no phantom 100%

3. **Grade inflation** (BUG 3 scenario)
   - Submit a motion that fails Phase VII loop 1 with zero-citation sections
   - Expected: If loop 2 increases grade without fixing citations, hard rules block

4. **Revision non-execution** (BUG 4 scenario)
   - Submit a motion where Phase VIII ignores "add citations" instruction
   - Expected: Diff checker flags non-execution, Phase VII hard rules catch it

5. **usedCIVPipeline flag**
   - Verify every Phase V.1 output now shows `usedCIVPipeline: true`
   - Verify `civPipelineResults` is never null on successful execution

---

## ROLLBACK PLAN

If any regression occurs:

1. **Option A fix:** Revert the `catch` block in `phase-executors.ts` to restore
   the shallow fallback. The 6 new files are all additive and have no effect
   if not imported.

2. **Option B fix (env flag):** Set `USE_CIV_PIPELINE_V2=false` to bypass the
   new executor. The existing code path runs as before.

3. Phase VII grading lock preamble is injected via string concatenation —
   removing the concatenation restores original prompt behavior.

4. Hard rules module is called after Phase VII returns — removing the call
   site restores pure numeric grading.

---

## DEPLOYMENT ORDER

1. Deploy Files 1-6 (new modules) — zero risk, not imported yet
2. Wire Phase V.1 fallback removal (Step 1 above) — fixes BUG 1 + BUG 2
3. Wire citation hard gates (Step 2) — fixes BUG 5 for Phase V.1
4. Wire Phase VII anti-inflation (Step 3) — fixes BUG 3 + BUG 5
5. Wire revision diff checker (Step 4) — fixes BUG 4
6. Test with real order through full pipeline
7. Verify Inngest output shows `usedCIVPipeline: true` and `civPipelineResults` populated

---

## KEY IMPORT PATHS

Use canonical Path A imports in all new code:

| Module | Import Path |
|--------|-------------|
| CIV Pipeline | `@/lib/civ` |
| CIV Types | `@/lib/citation/civ/types` |
| Deduplication | `@/lib/civ/deduplication` |
| CIV Pipeline Runner | `@/lib/citation/civ-pipeline-runner` |
| Phase V.1 Executor | `@/lib/workflow/phase-v1-executor` |
| Citation Hard Gates | `@/lib/workflow/citation-hard-gates` |
| Judge Grading Lock | `@/lib/workflow/judge-grading-lock` |
| Revision Diff Checker | `@/lib/workflow/revision-diff-checker` |
| Phase VII Hard Rules | `@/lib/workflow/phase-vii-hardcoded-rules` |
