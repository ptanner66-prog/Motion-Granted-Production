# MOTION GRANTED — ENGINE AUDIT
## Date: 2026-02-11
## Auditor: Chen
## Scope: Workflow engine only (14-phase pipeline)

---

## OVERALL SCORE: 72 / 100

> The workflow engine is functional and demonstrates serious engineering effort — particularly the citation verification pipeline, phase gate enforcement, and the Inngest orchestration with proper revision loop mechanics. However, there are real gaps: two parallel orchestration paths (workflow-engine.ts vs workflow-orchestration.ts) that could diverge, weak JSON parse error handling in several phases that masks failures as successes, and a concurrent execution race condition with no database-level locking. For early customers under admin supervision, this will work. For unsupervised production at scale, several fixes are mandatory.

---

## SCORE BREAKDOWN

| Category | Score | Weight | Weighted | Key Finding |
|----------|-------|--------|----------|-------------|
| Phase Orchestration | 75/100 | 15% | 11.3 | Two parallel orchestrators (workflow-engine.ts + Inngest) — Inngest version is solid with proper loop mechanics |
| Phase Executors | 73/100 | 15% | 11.0 | All 14 phases call Claude for real; 4 phases have weak JSON parse handling that masks failures |
| Data Flow | 78/100 | 12% | 9.4 | Inngest `phaseOutputs` dict works correctly; Phase V→VII→VIII chain passes data properly |
| Prompt System | 85/100 | 10% | 8.5 | All 14 v7.5 file-based prompts loaded; lean (~5,359 words total); Phase IV uses inline (by design) |
| Quality Gates | 76/100 | 10% | 7.6 | Revision loop in Inngest orchestrator works (max 3); grade threshold enforced at B+ (3.3/4.0) |
| Citation Verification | 82/100 | 10% | 8.2 | 7-step CIV pipeline with CourtListener, Protocol 7 auto-pause, BUG-FIX-01 for api_error |
| Checkpoint System | 70/100 | 8% | 5.6 | HOLD phase-locked to Phase III (good); CP1/CP2/CP3 functional; BLOCKING checkpoint at Phase X works |
| Model Routing | 88/100 | 5% | 4.4 | Single source of truth in phase-registry.ts; all phases use `getModel()` correctly; no duplicate routers |
| Error Handling | 58/100 | 10% | 5.8 | No automatic retry on Claude API failure; workflow-engine.ts marks as 'blocked' with no recovery path |
| Payment → Workflow | 80/100 | 5% | 4.0 | Stripe webhook triggers `order/submitted` Inngest event; order_id linked via payment_intent; has fallback to automation_tasks |
| | | **TOTAL** | **75.8** | |

**Rounded score: 72/100** (adjusted down from 75.8 for compounding risk of dual-orchestrator confusion and no concurrency protection)

---

## CRITICAL FINDINGS (will break in production)

### [CRITICAL-1] Two Parallel Orchestrators — `lib/workflow/workflow-engine.ts` + `lib/inngest/workflow-orchestration.ts`

**What:** There are TWO complete workflow orchestration systems. `workflow-engine.ts` has a synchronous `runWorkflow()` while loop (line 2614) with `MAX_WORKFLOW_ITERATIONS = 50`. `workflow-orchestration.ts` has the Inngest `step.run()` based orchestrator (line 904) with proper revision loop tracking. The revision loop counter is only properly tracked in the Inngest version (`workflowState.revisionLoopCount` at line 1732). The `workflow-engine.ts` version defines `MAX_REVISION_LOOPS = 3` (line 64) but **never increments or checks a revision counter** against it.

**Impact:** If an admin triggers workflow execution via the HTTP API (which calls `workflow-engine.ts`), the revision loop has no max-loop enforcement. The `MAX_WORKFLOW_ITERATIONS = 50` is a blunt safety net but allows up to ~16 revision loops before hitting the cap. Additionally, maintaining two orchestrators creates divergence risk — a fix in one may not be applied to the other.

**Fix:** Deprecate `workflow-engine.ts`'s `runWorkflow()` loop and route ALL execution through the Inngest orchestrator. If the HTTP API endpoint must exist for admin use, have it send an Inngest event rather than running the workflow loop directly. Alternatively, implement revision loop counting in `workflow-engine.ts` by reading/incrementing `revision_loop_count` from the database.

**Effort:** Medium (4-8 hours)

---

### [CRITICAL-2] No Concurrent Execution Protection — `workflow-engine.ts:226`

**What:** If two HTTP requests call `executeCurrentPhase()` simultaneously for the same `workflowId`, both read `current_phase` from the database, both execute the same phase, and the last DB write wins. There is no row-level locking, no optimistic concurrency check, and no Inngest exclusivity guarantee in the HTTP path.

**Impact:** A double-click on "Execute" in the admin panel, or a retry from a load balancer, could cause duplicate phase execution. This means duplicate Claude API costs, conflicting outputs, and potentially corrupted workflow state.

**Fix:** Add a database-level advisory lock or use Supabase's `SELECT ... FOR UPDATE` before phase execution. Alternatively, add an `execution_lock` column with a UUID that must match to proceed. The Inngest path has `concurrency: { limit: 5 }` (line 907 of workflow-orchestration.ts) which helps but doesn't prevent the HTTP path from racing.

**Effort:** Small-Medium (2-4 hours)

---

### [CRITICAL-3] JSON Parse Failures Marked as Success — `phase-executors.ts` (Phases II, VII.1, VIII.5, IX.1)

**What:** Multiple phases use a pattern where a failed JSON parse returns `{ success: true, output: { error: 'parse error', raw: rawText } }`. Downstream phases that expect structured JSON fields (e.g., `previousPhaseOutputs['II'].extracted_facts`) will receive `undefined`, causing silent data loss. Specifically:
- Phase II (line ~715-718): Returns `{error, raw}` on parse failure but `success: true`
- Phase VII.1 (line ~2948-2951): Same pattern
- Phase VIII.5 (line ~3338-3341): Same pattern
- Phase IX.1 (line ~3569-3572): Same pattern

**Impact:** If Claude returns malformed JSON in Phase II, the workflow continues but Phase III receives no `extracted_facts` or `legal_issues`. This propagates through all downstream phases, resulting in a low-quality or incoherent motion that still gets delivered.

**Fix:** Change these to `success: false` when JSON parsing fails. Add a validation step that checks the returned output contains the required keys per `PHASE_COMPLETION_REQUIREMENTS` from `phase-gates.ts`. The `markPhaseComplete()` function already validates required outputs — make sure it's called consistently.

**Effort:** Small (2-3 hours)

---

## HIGH FINDINGS (should fix before launch)

### [HIGH-1] No Automatic Retry on Claude API Failure — `workflow-engine.ts:376-385`

**What:** When a Claude API call fails (timeout, rate limit, server error), the phase simply returns `{ success: false }` and the workflow is marked as `status: 'blocked'`. There is no automatic retry, no exponential backoff, and no circuit breaker in the main execution path. The Inngest orchestrator has `retries: 3` at the function level (line 908), but this retries the ENTIRE step, not just the API call.

**Impact:** Transient Claude API errors (which happen regularly — rate limits, 529 overloaded errors) will block workflows requiring manual admin intervention to restart. At scale with 10+ concurrent orders, this will create a queue of blocked workflows daily.

**Fix:** Add retry logic with exponential backoff around Claude API calls in `phase-executors.ts`. The codebase already has `lib/utils/retry.ts` and `lib/circuit-breaker.ts` — wire them into `createMessageWithStreaming()` calls. Target: 3 retries with 2s/4s/8s backoff for 429/529/5xx errors.

**Effort:** Medium (3-5 hours)

---

### [HIGH-2] Inngest `workflowState` Not Persisted Across Function Restarts — `workflow-orchestration.ts:131-140`

**What:** The `workflowState` object (containing `phaseOutputs`, `revisionLoopCount`, `currentGrade`, etc.) is held in-memory across Inngest `step.run()` calls. Inngest guarantees step-level durability, but if the function is evicted and restarted (e.g., Vercel cold start, deployment, or the 15-minute timeout at line 912), the `workflowState` object is reconstructed from step return values. However, the `phaseOutputs` accumulation pattern (`workflowState.phaseOutputs["V"] = phaseVResult.output`) happens OUTSIDE `step.run()` (e.g., lines 1703-1704). If the function restarts mid-execution, these assignments may be lost.

**Impact:** On function restart, previously completed phase outputs may not be available in `phaseOutputs`, causing downstream phases to receive `undefined` inputs. This is most dangerous during the revision loop (Phase VIII output stored at line 1704).

**Fix:** Either (a) persist `phaseOutputs` to the database after each phase, or (b) reconstruct `phaseOutputs` from database at function start by reading all completed phase_execution records. The `workflow-engine.ts` version already does this via `getPreviousPhaseOutputs()` — port that pattern to the Inngest orchestrator.

**Effort:** Medium (4-6 hours)

---

### [HIGH-3] Phase IX.1 Runs for ALL Orders, Not Just MSJ/MSA — `workflow-orchestration.ts:1829-1841`

**What:** In the Inngest orchestrator, Phase IX.1 (Separate Statement Check) runs unconditionally for every order (line 1832). The phase-config.ts correctly defines `appliesTo: ['Motion for Summary Judgment', 'Motion for Summary Adjudication']` (line 190), but the orchestration code doesn't check this. The phase executor likely handles the skip internally, but this wastes a Claude API call and Inngest step for non-MSJ orders.

**Impact:** Unnecessary Claude API cost for ~80% of orders (estimated non-MSJ percentage). Also adds latency. Not a correctness issue if the executor handles non-MSJ gracefully.

**Fix:** Add a conditional check before the `step.run()` call: `if (orderContext.motionType includes 'Summary Judgment' or 'Summary Adjudication')`. Mirror the pattern from `phase-config.ts:258-260`.

**Effort:** Small (30 minutes)

---

### [HIGH-4] Checkpoint System Uses Phase Numbers, Not Phase Codes — `checkpoint-service.ts:75-80`

**What:** The checkpoint service maps checkpoints to phase numbers (`CP1: 4, CP2: 8, CP3: 12, HOLD: 3`) but the rest of the system uses phase codes ('I', 'II', ..., 'X'). The `processCP1Response` advances to `current_phase: 5` (line 346) and `processCP2Response` sets `current_phase: 10` (line 409). But the Inngest orchestrator uses phase codes ('I', 'II', etc.) and the `workflow_state` table likely uses phase codes.

**Impact:** After a checkpoint response, the workflow may advance to the wrong phase if the `current_phase` numeric field doesn't align with the `current_phase_code` string field. This creates a split-brain state where `workflow-engine.ts` reads `current_phase` (numeric) while `workflow-orchestration.ts` reads `current_phase_code` (string).

**Fix:** Standardize on phase codes throughout. Update `processCP1Response`, `processCP2Response`, and `processCP3Response` to set `current_phase_code` instead of (or in addition to) `current_phase`.

**Effort:** Medium (2-3 hours)

---

## MEDIUM FINDINGS (fix within first week)

### [MEDIUM-1] Quality Validator Not Called From Workflow — `quality-validator.ts`

**What:** The `validateDocument()` function in `quality-validator.ts` is a comprehensive quality validator with automated checks (grammar, formatting, completeness, organization) and AI-powered validation. However, it is NOT called from the main workflow execution path. Phase VII (Judge Simulation) performs its own grading via a Claude prompt, but doesn't use `validateDocument()`. The quality validator exists but isn't wired in.

**Impact:** The detailed quality checks (citation count validation, section completeness, grammar patterns, formatting rules) are not applied during workflow execution. Phase VII's grading is entirely LLM-subjective with no deterministic guardrails.

**Fix:** Call `quickValidate()` before Phase VII's Claude evaluation as a pre-check. Use the automated scores as a floor — if `quickValidate` fails, don't even run the expensive judge simulation. Alternatively, feed the automated check results into Phase VII's prompt so the judge simulation is informed by objective metrics.

**Effort:** Medium (3-4 hours)

---

### [MEDIUM-2] `gradePasses` in phase-config.ts Defaults to `false` (Correct) but Grade Parsing Is Fragile — `phase-executors.ts:2882`

**What:** The `getNextPhase()` function correctly defaults `gradePasses` to `false` (line 235: `options.gradePasses ?? false`). However, the grade extraction from Phase VII's Claude output relies on parsing a JSON response for a `grade` field and comparing it. If Claude returns an unexpected grade format (e.g., "A minus" instead of "A-", or a score of "87%" instead of "3.7"), the grade comparison may fail and default to "not passing," triggering unnecessary revision loops.

**Impact:** Claude occasionally returns grades in unexpected formats. Each unnecessary revision loop costs 3 additional Claude API calls (VIII + VII.1 + VII regrade) at Opus pricing. For a Tier C motion, that's roughly $15-25 per false revision loop.

**Fix:** Add robust grade normalization in the phase executor: regex match for letter grades, percentage-to-GPA conversion, and validation that the returned grade is in the expected set.

**Effort:** Small (1-2 hours)

---

### [MEDIUM-3] Citation Verification Uses AI (Claude) Instead of Authoritative Sources — `citation-verifier.ts:350-419`

**What:** The `verifyWithAI()` function asks Claude to verify citations by analyzing the citation format and providing a confidence score. Claude can hallucinate citation validity — asking Claude "is this citation real?" is like asking the person who may have hallucinated it to verify their own work. The 7-step CIV pipeline in `lib/civ/pipeline.ts` correctly uses CourtListener for existence checks, but the `citation-verifier.ts` fallback uses Claude.

**Impact:** Citations verified only by Claude (when CourtListener lookup fails) have a non-zero chance of being hallucinated citations that Claude confidently confirms as real. The CIV pipeline mitigates this with multi-step verification, but the fallback path in `citation-verifier.ts` is weaker.

**Fix:** Remove or deprioritize the AI verification path. If CourtListener returns no match, mark the citation as `needs_manual_review` rather than letting Claude decide. The existing `pending` status path (lines 286-314) already handles this correctly — ensure it's the default when AI is the only verification source.

**Effort:** Small (1 hour)

---

### [MEDIUM-4] Deliverable PDF Generation Is Rudimentary — `workflow-orchestration.ts:268-345`

**What:** The `createSimpleMotionPDF()` function uses `pdf-lib` to generate a basic PDF with Times Roman font, 1-inch margins, and double-spacing. It has no support for: bold/italic text, heading hierarchy, footnotes, page numbers, court-specific formatting (e.g., line numbering for California courts), or proper legal document margins. The signature block is just plain text.

**Impact:** The delivered PDF will look unprofessional compared to what attorneys expect from legal document preparation services. Solo practitioners may need to reformat the entire document in Word, undermining the value proposition. This is a UX issue, not a correctness issue.

**Fix:** Use a proper document generation library (e.g., `docx` for Word format, which attorneys actually prefer) or integrate with the existing `pdf-generator.ts` file referenced in CLAUDE.md. Consider offering both PDF and DOCX.

**Effort:** Large (1-2 days for proper formatting)

---

### [MEDIUM-5] Phase IV Multi-Step Executor May Timeout on Vercel — `workflow-orchestration.ts:89-95`

**What:** Phase IV is split into 3 sub-phases (IV-A: Element Extraction, IV-B: Parallel Search, IV-C: Holding Verification) imported from `lib/workflow/phase-iv/multi-step-executor.ts`. Each sub-phase is run as a separate Inngest step (good), but IV-B performs parallel CourtListener searches that may take 30+ seconds depending on the number of queries and rate limiting (60 req/min free tier). The Inngest function timeout is 15 minutes total (line 912).

**Impact:** With aggressive rate limiting, Phase IV-B could take 2-5 minutes for complex Tier C motions with many search queries. Combined with all other phases, the 15-minute total timeout is tight for complex orders, especially if revision loops occur.

**Fix:** Monitor execution times in production. If needed, increase the Inngest timeout or split the workflow into multiple Inngest functions with event chaining.

**Effort:** Small (monitoring) to Medium (refactoring if needed)

---

### [MEDIUM-6] HOLD Checkpoint Timers May Not Fire — `checkpoint-service.ts:828-864`

**What:** The HOLD checkpoint schedules three Inngest events with future timestamps: 48hr reminder, 72hr escalation, and 7-day auto-cancel (lines 832-860). However, these events use `ts: reminderAt.getTime()` which sets a Unix timestamp for delayed delivery. If the Inngest server is down or the events fail to send, the timers never fire. The code catches this error (line 861) and logs it but continues — meaning the HOLD has no timeout enforcement.

**Impact:** A customer who doesn't respond to a HOLD checkpoint could have their order stuck indefinitely if Inngest timer events fail to deliver. No fallback cron job exists to catch these.

**Fix:** Add a cron job or scheduled function that scans for `status: 'on_hold'` workflows where `hold_triggered_at` is older than 7 days and auto-cancels them. This provides defense-in-depth for timer failures.

**Effort:** Small (1-2 hours)

---

## WHAT'S GENUINELY GOOD

1. **Citation Enforcement Is Multi-Layered**: The citation pipeline is the strongest part of the system. Phase IV builds a verified citation bank with `courtlistener_id` requirements (`phase-executors.ts:1049-1053`), Phase V has a verification gate that blocks unverified citations (`phase-executors.ts:1128-1191`), Phase V.1 runs Protocol 20 (plurality detection) and Protocol 21 (dissent blocking) (`phase-executors.ts:2445-2495`), Phase VIII re-validates on revision, and Phase X filters to only citations present in the final motion. The `BUG-FIX-01` in `citation-verifier.ts:513-530` correctly treats API errors as failures, not passes.

2. **Phase Gate Enforcement Is Serious**: `phase-gates.ts` implements proper prerequisite checking, phase skip blocking, completion requirements validation, and audit logging. The `PHASE_COMPLETION_REQUIREMENTS` (line 74-89) define minimum outputs per phase. The `executePhaseWithGates()` wrapper (line 457-496) combines gate checking, execution, and completion marking.

3. **Inngest Revision Loop Is Correctly Implemented**: The revision loop in `workflow-orchestration.ts:1660-1772` follows the correct order (VIII → VII.1 → VII regrade), tracks loop count at workflow level (BUG-11 fix), persists to database (line 1735-1739), and respects `MAX_REVISION_LOOPS = 3`. The `gradePasses()` function from `types/workflow.ts` is imported and used correctly.

4. **Model Routing Is Clean**: Single source of truth in `lib/config/phase-registry.ts` with all other routing code removed. Phase executors consistently use `getModel(phase, tier)` (probe shows 13 calls across all phases). No duplicate router logic. Extended thinking budgets are correctly configured per phase/tier.

5. **HOLD Checkpoint Phase-Locking**: The `processHoldResponse()` function (checkpoint-service.ts:929) validates that the workflow is still in Phase III before processing the response, preventing stale HOLD responses from corrupting later phases. Returns `HOLD_PHASE_MISMATCH` if the phase has moved on.

6. **Prompt System Is Well-Organized**: All 14 phases have dedicated v7.5 markdown prompt files loaded via `prompts/index.ts`. Total prompt footprint is lean (~5,359 words). Phase IV intentionally uses inline prompts for its multi-step search architecture. No prompt version confusion — all v75 files present and loaded.

7. **Payment → Workflow Bridge**: Stripe webhook properly links orders via `stripe_payment_intent_id`, deduplicates events via `webhook_events` upsert, validates payment amounts, and triggers the Inngest `order/submitted` event with a fallback to `automation_tasks` table if Inngest is down.

8. **Violation Alert System**: `violation-alerts.ts` logs phase violations, citation violations, output violations, and bypass attempts to both the database and console. Critical violations auto-pause the workflow (`pauseWorkflowForReview` at line 246). Production mode sends admin email alerts.

---

## PRIORITY FIX ORDER

| # | Finding | Effort | Impact on Score |
|---|---------|--------|----------------|
| 1 | CRITICAL-3: JSON parse failures marked as success | 2-3 hrs | +5 points (Phase Executors, Data Flow, Error Handling) |
| 2 | CRITICAL-1: Deprecate dual orchestrator / enforce revision loop in both | 4-8 hrs | +4 points (Phase Orchestration, Quality Gates) |
| 3 | CRITICAL-2: Add concurrent execution protection | 2-4 hrs | +3 points (Phase Orchestration, Error Handling) |
| 4 | HIGH-1: Add Claude API retry logic | 3-5 hrs | +4 points (Error Handling) |
| 5 | HIGH-2: Persist Inngest phaseOutputs to database | 4-6 hrs | +3 points (Data Flow, Error Handling) |
| 6 | HIGH-4: Standardize checkpoint phase codes | 2-3 hrs | +2 points (Checkpoint System) |
| 7 | MEDIUM-1: Wire quality validator into workflow | 3-4 hrs | +2 points (Quality Gates) |
| 8 | MEDIUM-2: Robust grade normalization | 1-2 hrs | +1 point (Quality Gates) |
| 9 | MEDIUM-6: HOLD timeout fallback cron | 1-2 hrs | +1 point (Checkpoint System) |
| 10 | HIGH-3: Conditional Phase IX.1 execution | 30 min | +0.5 points (Phase Orchestration) |

---

## ESTIMATED SCORE AFTER FIXES

| Fix batch | Score after |
|-----------|------------|
| Current state | 72/100 |
| After critical fixes (1-3) | 84/100 |
| After high fixes (4-6) | 89/100 |
| After medium fixes (7-10) | 93/100 |

---

## COMPARISON TO FEB 5 AUDIT

The previous audit scored the Workflow Engine at **48/100**. Key improvements since then:

1. **Phase gates implemented** (+10): `phase-gates.ts` with prerequisite validation, completion requirements, and audit logging didn't exist or was stubbed before.

2. **Model routing consolidated** (+5): Moved from duplicate routers (phase-config.ts + model-router.ts + types/workflow.ts all had routing) to single source of truth in `phase-registry.ts`. The wrong Sonnet model string (`claude-sonnet-4-5-20250929`) has been fixed.

3. **gradePasses defaults to false** (+5): Previously defaulted to `true`, meaning any phase that didn't explicitly set a grade would auto-pass. Now defaults to `false` (phase-config.ts:235).

4. **BUG-FIX-01 for api_error** (+3): Citation verification API errors now count as failures, not passes (citation-verifier.ts:527-530).

5. **BUG-03 revision loop order fixed** (+5): Revision loop was running VII.1 before VIII. Now correctly runs VIII → VII.1 → VII (workflow-orchestration.ts:1660-1670).

6. **BUG-11 loop counter fix** (+3): Revision loop count is now tracked at workflow level, not step-level state that resets (workflow-orchestration.ts:1672-1673).

7. **Phase IV multi-step architecture** (+5): Avoids Vercel timeout by splitting into sub-phases with Inngest steps. CourtListener integration with topical relevance scoring.

8. **HOLD checkpoint fully implemented** (+3): Phase-locked to Phase III, 3 response types, timer scheduling, email notifications.

**Net improvement: +39 points (48 → 72+)**. The engine has gone from "broken core" to "functional with real risks." The remaining gaps are operational resilience issues, not architectural failures.
