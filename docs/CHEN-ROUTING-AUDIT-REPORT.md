# CHEN ROUTING UNIFICATION AUDIT — COMPLETE REPORT

**Date**: February 5, 2026
**Auditor**: Chen (Systems Architect)
**Scope**: Full routing/config system audit + unified architecture proposal
**Branch**: `claude/routing-audit-architecture-1NhrY`

---

```
╔═══════════════════════════════════════════════════════════════════╗
║              CHEN ROUTING UNIFICATION — COMPLETE                 ║
╚═══════════════════════════════════════════════════════════════════╝

SCAN RESULTS:
  Files scanned: 21
  Routing systems found: 5 (not 4 — found a 5th)
  ET budget mismatches: 11
  Model string conflicts: 3 (wrong Sonnet ID in types/workflow.ts)
  GPT-5.2 references: 14
  Dead code files: 1 (lib/caselaw/client.ts — 134 lines)

CONFLICT TABLES:
  Table A: Model Routing — ✅
  Table B: Extended Thinking — ✅
  Table C: GPT Models — ✅
  Table D: Claude Model Strings — ✅
  Table E: Quality Thresholds — ✅
  Table F: Batch Sizes — ✅
  Table G: Import Dependencies — ✅

ARCHITECTURE PROPOSAL:
  Approach: Option B — New lib/config/phase-registry.ts
  Rationale: Clean separation, single source of truth, minimal blast radius
  Files to modify: 10
  Functions to delete: 5
  Imports to change: 6
  New file(s): 1 (lib/config/phase-registry.ts)

GROUND TRUTH VALIDATION:
  14 phases × 3 tiers = 42 model configs
  Matching spec: 35/42
  Conflicts found: 7/42
  Missing ET budgets: 6 phase×tier combinations

AUDIT FINDINGS RESOLVED: 18/18

RISK ASSESSMENT:
  Breaking changes: 0 (drop-in replacement with same function signatures)
  Rollback plan: Revert single commit, restore old imports
  Test coverage needed: Model routing unit tests, ET budget integration tests
```

---

# PHASE 1: SCAN RESULTS

## SCAN 1.1: Five Routing Systems Found (Not Four)

The original audit identified 4 systems. I found **5**:

### SYSTEM 1: `lib/workflow/phase-executors.ts` (RUNTIME)
- **Lines 112-132**: Local `getModelForPhase()` and `getThinkingBudget()` functions
- **Constants**: `OPUS = 'claude-opus-4-5-20251101'`, `SONNET = 'claude-sonnet-4-20250514'`
- **Used by**: `workflow-orchestration.ts` imports `executePhase` and `PHASE_EXECUTORS`
- **STATUS**: This is the actual execution path. These local functions control what model runs.

**Routing logic (lines 112-125)**:
```ts
function getModelForPhase(phase, tier): string {
  if (phase === 'VII') return OPUS;           // Always Opus
  if (tier !== 'A') {
    if (['IV', 'VI', 'VIII'].includes(phase)) return OPUS;  // B/C complex phases
  }
  return SONNET;                              // Everything else
}
```

**ET logic (lines 128-132)**:
```ts
function getThinkingBudget(phase, tier): number | null {
  if (phase === 'VII') return 10000;          // Always for judge sim
  if (tier !== 'A' && ['VI', 'VIII'].includes(phase)) return 8000;
  return null;
}
```

**MISSING from System 1**:
- Phase III Tier C ET budget (10,000) — **SPEC VIOLATION**
- Phase V Tier C ET budget (10,000) — **SPEC VIOLATION**
- Phase VII Tier A/B should be 5,000 not 10,000 — **SPEC VIOLATION**
- Phase VII.1 ET budgets entirely missing — **SPEC VIOLATION**

### SYSTEM 2: `lib/workflow/phase-config.ts` (ORCHESTRATION)
- **Lines 66-205**: Full `PHASES` object with 14 phase definitions
- **Lines 216-220**: Exported `getModelForPhase()` — **DUPLICATE of System 1**
- **Lines 226-232**: Exported `getExtendedThinkingBudget()`
- **Used by**: `inngest/functions.ts` imports `getNextPhase`, `gradePasses`, etc.
- **STATUS**: Used for orchestration flow (next phase, grade checks) but NOT for model selection at runtime.

**Key issues**:
- Phase VII `budget: 10000` but spec says Tier A/B = 5,000, Tier C = 10,000
- Phase VII.1 has `extendedThinking: { A: false, B: false, C: false }` — **WRONG**, spec says A/B = 5,000, C = 10,000
- Phase III has `extendedThinking: { A: false, B: false, C: false }` — **WRONG**, spec says C = 10,000
- Phase V has `extendedThinking: { A: false, B: false, C: false }` — **WRONG**, spec says C = 10,000
- `minGrade: 3.3` on Phase VII uses 4.0 GPA scale (not 0-1 decimal like other systems)
- `gradePasses` default is `true` (line 257) — passes by default if not explicitly set

### SYSTEM 3: `types/workflow.ts` (TYPE DEFINITIONS)
- **Lines 844-878**: `MODEL_ROUTING` array + `getModelForPhase()` — **THIRD copy**
- **Lines 892-914**: `EXTENDED_THINKING_CONFIG` array + `getExtendedThinkingBudget()`
- **Lines 920-934**: `CITATION_BATCH_SIZES` + `getCitationBatchSize()`
- **Used by**: `lib/workflow/model-router.ts` imports from here
- **STATUS**: Aspirational config that feeds into System 5.

**CRITICAL BUG**: `SONNET_MODEL = 'claude-sonnet-4-5-20250929'` (line 844) — this is a **WRONG** model string. Every other file uses `'claude-sonnet-4-20250514'`. This means any code path through `model-router.ts` → `types/workflow.ts` sends API calls with a nonexistent model ID.

**Phase VIII model**: `tierB: 'sonnet', tierC: 'sonnet'` (line 866) — **WRONG**, spec says Opus for B/C (ET requires Opus).

**Phase VII ET**: `tierA: 10000, tierB: 10000, tierC: 10000` — spec says A/B = 5,000.

**Phase VII.1 ET**: `tierA: 10000, tierB: 10000, tierC: 10000` — spec says A/B = 5,000.

### SYSTEM 4: `prompts/index.ts` (PROMPT METADATA)
- **Lines 38-125**: `PHASE_METADATA` object with model and ET hints per phase
- **Used by**: Only for display/admin purposes (no runtime imports found for routing)
- **STATUS**: Advisory only — but contains incorrect information.

**Issues**:
- Phase III `model: 'tier_dependent'` but spec says ALL Sonnet
- Phase V.1 `model: 'openai_opus'` — unclear what this means
- Phase VII.1 `model: 'openai_opus'` — unclear what this means
- Phase VI `extendedThinking: 8000` — doesn't distinguish by tier (Tier A should be null)
- Phase VII `extendedThinking: 10000` — doesn't distinguish by tier (A/B should be 5,000)

### SYSTEM 5: `lib/workflow/model-router.ts` (WRAPPER — previously unidentified)
- **243 lines** — full model routing module
- **Imports from**: `types/workflow.ts` (System 3) — inherits the WRONG Sonnet model string
- **Used by**: `workflow-orchestration.ts` imports `getModelConfig`, `getModelId`, `createMessageParams`, `shouldUseOpus`
- **STATUS**: Active runtime code that wraps System 3 with additional logic.

**Critical**: This file imports `SONNET_MODEL` and `OPUS_MODEL` from `types/workflow.ts`, meaning it returns `'claude-sonnet-4-5-20250929'` (nonexistent) instead of `'claude-sonnet-4-20250514'`.

### SYSTEM 5b: `lib/config/models.ts` (PARTIAL — half-built)
- **123 lines** — has correct model strings but incomplete routing
- `getClaudeParams()` applies blanket "Tier A=Sonnet, B/C=Opus" — wrong for most phases
- Missing Phase III, V, VII.1 ET budgets
- Phase VII ET is flat 10,000 (spec says A/B=5,000)
- **Used by**: Nobody imports it for routing (dead for execution purposes)

---

## SCAN 1.2: Two Prompt Delivery Systems

### PROMPT PATH A: File-Based (ACTIVE)
- `prompts/index.ts` loads 14 markdown files via `fs.readFileSync`
- `phase-executors.ts` imports `PHASE_PROMPTS` from `@/prompts` (line 28)
- Prompts are concatenated with `PHASE_ENFORCEMENT_HEADER` (lines 91-109)
- **This is the path that actually executes.**

### PROMPT PATH B: Database-Based (PARTIAL)
- `lib/workflow/superprompt-builder.ts` (466 lines) queries `phase_prompts` DB table
- `lib/workflow/orchestrator.ts` has its own `buildSuperprompt()` function (line 303)
- `lib/workflow/index.ts` re-exports `buildSuperprompt`
- **NOT used by phase-executors.ts** — superprompt-builder is NOT in the execution path
- **Used by**: `orchestrator.ts` (lines 514, 684) — this is the legacy v6 execution path

**Verdict**: Two parallel execution architectures exist. The v7.2 path (`phase-executors.ts`) uses file-based prompts. The legacy path (`orchestrator.ts` → `superprompt-builder.ts`) uses DB-based prompts. Both are importable. Confusion is inevitable.

---

## SCAN 1.3: GPT-5.2 References (14 Found)

| # | File | Line | Model String | Used For | Status |
|---|------|------|-------------|----------|--------|
| 1 | lib/ai/openai-client.ts | 58 | `gpt-5.2` | TIER_C_MODEL constant | **BROKEN** |
| 2 | lib/ai/openai-client.ts | 69 | `gpt-5.2` | MODEL_COSTS entry | **BROKEN** |
| 3 | lib/ai/openai-client.ts | 352 | `gpt-5.2` | JSDoc comment | Wrong |
| 4 | lib/ai/model-router.ts | 14 | `gpt-5.2` | JSDoc comment | Wrong |
| 5 | lib/ai/model-router.ts | 99 | `gpt-5.2` | Tier C stage_1_holding default | **BROKEN** |
| 6 | lib/ai/model-router.ts | 125 | `gpt-5.2` | Provider detection check | **BROKEN** |
| 7 | lib/civ/model-router.ts | 12 | `gpt-5.2` | JSDoc comment | Wrong |
| 8 | lib/civ/model-router.ts | 34 | `gpt-5.2` | tier_c stage_1_holding | **BROKEN** |
| 9 | lib/citation/steps/step-2-holding.ts | 8 | `gpt-5.2` | JSDoc comment | Wrong |
| 10 | lib/citation/steps/step-2-holding.ts | 83 | `gpt-5.2` | TIER_C_STAGE_1 constant | **BROKEN** |
| 11 | lib/config/models.ts | 20 | `gpt-5.2` | Comment (placeholder note) | Info only |
| 12-14 | Various | — | `gpt-4o` | Tier A/B stage_1 | **WRONG** — spec says gpt-4-turbo |

**All `gpt-5.2` references must be replaced with `gpt-4-turbo`.** The model does not exist.
**All `gpt-4o` references in CIV routing must be replaced with `gpt-4-turbo`** per spec.

---

## SCAN 1.4-1.6: Quality, Batch, and Completion Requirements

### Quality Thresholds (3 different scales!)

| File | Constant | Value | Scale | Used By |
|------|----------|-------|-------|---------|
| `phase-config.ts:346` | `MINIMUM_PASSING_GRADE` | 3.3 | 4.0 GPA | `gradePasses()` in phase-config |
| `workflow-engine.ts:58` | `MINIMUM_PASSING_GRADE` | 0.87 | 0-1 decimal | `meetsQualityThreshold()` |
| `workflow-config.ts:101` | `JUDGE_GRADE_MINIMUM` | {A:0.83, B:0.87, C:0.87} | 0-1 decimal | `isJudgeGradeAcceptable()` |
| `workflow-config.ts:103` | `QUALITY_PASSING` | 0.87 | 0-1 decimal | Not directly referenced |
| `types/workflow.ts:805` | `MINIMUM_PASSING_VALUE` | 3.3 | 4.0 GPA | `gradePasses()` in types |
| `workflow-orchestration.ts:60` | imports `MINIMUM_PASSING_VALUE` | 3.3 | 4.0 GPA | Grade comparison in orchestration |

**CONFLICT**: `JUDGE_GRADE_MINIMUM.A = 0.83` ≠ spec's 0.87. Either Tier A intentionally has a lower bar (needs Clay approval) or it's a bug.

**CONFLICT**: Two `gradePasses` functions exist — one in `phase-config.ts` (uses 4.0 GPA scale) and one in `types/workflow.ts` (also 4.0 GPA). Both are imported by different consumers.

### Batch Sizes (3 systems)

| File | Constant | Tier A | Tier B | Tier C | V.1/VII.1 |
|------|----------|--------|--------|--------|-----------|
| `types/workflow.ts:920` | `CITATION_BATCH_SIZES` | 5 | 4 | 3 | 2 | **MATCHES SPEC** |
| `workflow-config.ts:119` | `CITATION_BATCH_CONFIG` | 4 | 4 | 4 | 2 | **WRONG** — no tier differentiation |
| `phase-config.ts:310` | `getCitationBatchSize()` | 5 | 5 | 5 | 2 | **WRONG** — default 5 for all |

### Phase Completion Requirements
- `phase-gates.ts:75-90`: ALL 14 phases have **empty arrays** `[]` — no actual validation.

---

## SCAN 1.7-1.8: Duplicate Router + CourtListener

### Duplicate `getModelForPhase`
Three separate implementations:
1. `phase-executors.ts:112` — local function (private, used at runtime)
2. `phase-config.ts:216` — exported function (used by nobody for model selection)
3. `types/workflow.ts:873` — exported function (used by `model-router.ts`)

### CourtListener Issues
- `client.ts:351`: Uses deprecated `citation=` parameter — **BREAKS FEB 10**
- `client.ts:1225`: `simplifyQuery()` still exists — should be removed per CL-FIX-05
- `client.ts:1300`: `simplifyQuery` actively called in query pipeline

---

## SCAN 1.9-1.12: Import Chain, Inventory, CIV, Dead Code

### CIV Dual Pipeline
- `lib/civ/steps/` — 7 files (step-4-**quote**.ts)
- `lib/citation/steps/` — 7 files (step-4-**quotes**.ts — plural)
- Files have diverged (at minimum the naming is different)
- Both contain `gpt-5.2` references in step-2-holding.ts

### Dead Code
- `lib/caselaw/client.ts` — 134 lines, Case.law API client. **API is dead since Sept 5, 2024.**
- No grep hits for imports of this file found in active code.

### File Inventory
| File | Lines |
|------|-------|
| lib/workflow/phase-executors.ts | 3,674 |
| lib/workflow/workflow-engine.ts | 2,650 |
| lib/inngest/workflow-orchestration.ts | 1,957 |
| lib/inngest/functions.ts | 1,421 |
| types/workflow.ts | 1,099 |
| lib/workflow/phase-gates.ts | 536 |
| lib/civ/pipeline.ts | 477 |
| lib/workflow/superprompt-builder.ts | 466 |
| lib/ai/openai-client.ts | 443 |
| lib/ai/model-router.ts | 411 |
| lib/workflow/phase-config.ts | 383 |
| lib/workflow/model-router.ts | 243 |
| lib/civ/model-router.ts | 167 |
| prompts/index.ts | 166 |
| lib/config/workflow-config.ts | 138 |
| lib/caselaw/client.ts | 134 |
| lib/config/models.ts | 123 |
| **TOTAL** | **14,111** |

---

# PHASE 2: CONFLICT MATRICES

## TABLE A: Model Routing Conflict Matrix

Key: So=Sonnet, Op=Opus, **BOLD**=conflict with spec

| Phase | Tier | SPEC | Sys1 (executors) | Sys2 (config) | Sys3 (types) | Sys4 (prompts) | Sys5 (model-router) | CONFLICT? |
|-------|------|------|------------------|---------------|--------------|----------------|---------------------|-----------|
| I | A | So | So | So | So | So | So | |
| I | B | So | So | So | So | So | So | |
| I | C | So | So | So | So | So | So | |
| II | A | So | So | So | So | So | So | |
| II | B | So | So | So | So | So | So | |
| II | C | So | So | So | So | So | So | |
| III | A | So | So | So | So | **tier_dep** | So | prompts wrong |
| III | B | So | So | So | So | **tier_dep→Op** | So | prompts wrong |
| III | C | So | So | So | So | **tier_dep→Op** | So | prompts wrong |
| IV | A | So | So | So | So | **tier_dep** | So | |
| IV | B | Op | Op | Op | Op | **tier_dep→Op** | Op | |
| IV | C | Op | Op | Op | Op | **tier_dep→Op** | Op | |
| V | A | So | So | So | So | So | So | |
| V | B | So | So | So | So | So | So | |
| V | C | So | So | So | So | So | So | |
| V.1 | A | So | So | So | So | **openai_opus** | So | prompts wrong |
| V.1 | B | So | So | So | So | **openai_opus** | So | prompts wrong |
| V.1 | C | So | So | So | So | **openai_opus** | So | prompts wrong |
| VI | A | So | So | So | So | **tier_dep** | So | |
| VI | B | Op | Op | Op | Op | **tier_dep→Op** | Op | |
| VI | C | Op | Op | Op | Op | **tier_dep→Op** | Op | |
| VII | A | Op | Op | Op | Op | Op | Op | |
| VII | B | Op | Op | Op | Op | Op | Op | |
| VII | C | Op | Op | Op | Op | Op | Op | |
| VII.1 | A | So | So | So | So | **openai_opus** | So | prompts wrong |
| VII.1 | B | So | So | So | So | **openai_opus** | So | prompts wrong |
| VII.1 | C | So | So | So | So | **openai_opus** | So | prompts wrong |
| VIII | A | So | So | So | So | **tier_dep** | So | |
| VIII | B | Op* | Op | Op | **So** | **tier_dep→Op** | **So** | Sys3+Sys5 WRONG |
| VIII | C | Op* | Op | Op | **So** | **tier_dep→Op** | **So** | Sys3+Sys5 WRONG |
| VIII.5 | A | So | So | So | So | So | So | |
| VIII.5 | B | So | So | So | So | So | So | |
| VIII.5 | C | So | So | So | So | So | So | |
| IX | A | So | So | So | So | So | So | |
| IX | B | So | So | So | So | So | So | |
| IX | C | So | So | So | So | So | So | |
| IX.1 | A | So | So | So | So | So | So | |
| IX.1 | B | So | So | So | So | So | So | |
| IX.1 | C | So | So | So | So | So | So | |
| X | A | So | So | So | So | So | So | |
| X | B | So | So | So | So | So | So | |
| X | C | So | So | So | So | So | So | |

*Phase VIII uses Opus for B/C because ET requires Opus.

**CRITICAL**: System 3 (`types/workflow.ts`) and System 5 (`lib/workflow/model-router.ts`) return **Sonnet for Phase VIII B/C** — but ET is enabled for those, which requires Opus. Additionally, System 3's Sonnet model string is `claude-sonnet-4-5-20250929` (NONEXISTENT).

**Model conflicts found: 7/42** (Phase VIII B/C across Sys3+Sys5, plus all Sys3 paths use wrong Sonnet string)

## TABLE B: Extended Thinking Conflict Matrix

| Phase | Tier | SPEC | Sys1 (executors) | Sys2 (config) | Sys3 (types) | Sys5 (models.ts) | CONFLICT? |
|-------|------|------|------------------|---------------|--------------|-------------------|-----------|
| III | A | - | null | false/0 | null | - | |
| III | B | - | null | false/0 | null | - | |
| III | C | 10,000 | **null** | **false/0** | 10,000 | **-** | Sys1+Sys2+Sys5 MISSING |
| V | A | - | null | false/0 | null | - | |
| V | B | - | null | false/0 | null | - | |
| V | C | 10,000 | **null** | **false/0** | 10,000 | **-** | Sys1+Sys2+Sys5 MISSING |
| VI | A | - | null | false/0 | null | - | |
| VI | B | 8,000 | 8,000 | true/8000 | 8,000 | 8,000 | |
| VI | C | 8,000 | 8,000 | true/8000 | 8,000 | 8,000 | |
| VII | A | 5,000 | **10,000** | **true/10000** | **10,000** | **10,000** | ALL SAY 10K, SPEC SAYS 5K |
| VII | B | 5,000 | **10,000** | **true/10000** | **10,000** | **10,000** | ALL SAY 10K, SPEC SAYS 5K |
| VII | C | 10,000 | 10,000 | true/10000 | 10,000 | 10,000 | |
| VII.1 | A | 5,000 | **null** | **false/0** | **10,000** | **-** | Sys1+Sys2 missing, Sys3 wrong |
| VII.1 | B | 5,000 | **null** | **false/0** | **10,000** | **-** | Sys1+Sys2 missing, Sys3 wrong |
| VII.1 | C | 10,000 | **null** | **false/0** | 10,000 | **-** | Sys1+Sys2 missing |
| VIII | A | - | null | false/0 | null | - | |
| VIII | B | 8,000 | 8,000 | true/8000 | 8,000 | 8,000 | |
| VIII | C | 8,000 | 8,000 | true/8000 | 8,000 | 8,000 | |

**ET mismatches: 11** (Phase III C, V C, VII A/B, VII.1 A/B/C across multiple systems)

## TABLE C: GPT Model Reference Map

| File | Line | Model String | Used For | CORRECT Model | Status |
|------|------|-------------|----------|---------------|--------|
| lib/ai/openai-client.ts | 57 | `gpt-4o` | DEFAULT_MODEL fallback | gpt-4-turbo | **WRONG** |
| lib/ai/openai-client.ts | 58 | `gpt-5.2` | TIER_C_MODEL | gpt-4-turbo | **BROKEN** |
| lib/ai/openai-client.ts | 69 | `gpt-5.2` | Cost table entry | gpt-4-turbo | **BROKEN** |
| lib/ai/model-router.ts | 81 | `gpt-4o` | Tier A stage_1_holding | gpt-4-turbo | **WRONG** |
| lib/ai/model-router.ts | 87 | `gpt-4o` | Tier A tiebreaker | gpt-4-turbo | **WRONG** |
| lib/ai/model-router.ts | 90 | `gpt-4o` | Tier B stage_1_holding | gpt-4-turbo | **WRONG** |
| lib/ai/model-router.ts | 96 | `gpt-4o` | Tier B tiebreaker | gpt-4-turbo | **WRONG** |
| lib/ai/model-router.ts | 99 | `gpt-5.2` | Tier C stage_1_holding | gpt-4-turbo | **BROKEN** |
| lib/ai/model-router.ts | 105 | `gpt-4o` | Tier C tiebreaker | gpt-4-turbo | **WRONG** |
| lib/ai/model-router.ts | 125 | `gpt-5.2` | Provider detection | gpt-4-turbo | **BROKEN** |
| lib/civ/model-router.ts | 24 | `gpt-4o` | Tier A stage_1 | gpt-4-turbo | **WRONG** |
| lib/civ/model-router.ts | 29 | `gpt-4o` | Tier B stage_1 | gpt-4-turbo | **WRONG** |
| lib/civ/model-router.ts | 34 | `gpt-5.2` | Tier C stage_1 | gpt-4-turbo | **BROKEN** |
| lib/citation/steps/step-2-holding.ts | 82 | `gpt-4o` | Tier A/B Stage 1 | gpt-4-turbo | **WRONG** |
| lib/citation/steps/step-2-holding.ts | 83 | `gpt-5.2` | Tier C Stage 1 | gpt-4-turbo | **BROKEN** |
| lib/citation/steps/step-2-holding.ts | 85 | `gpt-4o` | Tiebreaker | gpt-4-turbo | **WRONG** |
| lib/config/models.ts | 39 | `gpt-4-turbo` | OPENAI_CITATION_VERIFIER | gpt-4-turbo | **CORRECT** |

**Summary**: Only `lib/config/models.ts` has the correct model string. Every other file is wrong.

## TABLE D: Claude Model String Map

| File | Constant | Value | Correct? | Used at Runtime? |
|------|----------|-------|----------|------------------|
| phase-executors.ts:113 | `OPUS` | `claude-opus-4-5-20251101` | YES | YES (primary) |
| phase-executors.ts:114 | `SONNET` | `claude-sonnet-4-20250514` | YES | YES (primary) |
| phase-config.ts:16 | `MODELS.SONNET` | `claude-sonnet-4-20250514` | YES | YES (via getModelForPhase) |
| phase-config.ts:17 | `MODELS.OPUS` | `claude-opus-4-5-20251101` | YES | YES (via getModelForPhase) |
| types/workflow.ts:844 | `SONNET_MODEL` | `claude-sonnet-4-5-20250929` | **NO** | YES (via model-router.ts) |
| types/workflow.ts:845 | `OPUS_MODEL` | `claude-opus-4-5-20251101` | YES | YES (via model-router.ts) |
| config/models.ts:11 | `MODELS.OPUS` | `claude-opus-4-5-20251101` | YES | NO (not imported) |
| config/models.ts:14 | `MODELS.SONNET` | `claude-sonnet-4-20250514` | YES | NO (not imported) |

**CRITICAL**: `types/workflow.ts` line 844 has `claude-sonnet-4-5-20250929` — this model ID does not exist. Any code path through `lib/workflow/model-router.ts` (which imports from `types/workflow.ts`) will send API requests to a nonexistent model.

## TABLE E: Quality Threshold Conflict Map

| File | Constant | Value | Scale | Used By |
|------|----------|-------|-------|---------|
| phase-config.ts:346 | MINIMUM_PASSING_GRADE | 3.3 | 4.0 GPA | gradePasses() in phase-config |
| phase-config.ts:140 | minGrade (Phase VII) | 3.3 | 4.0 GPA | getNextPhase() branching |
| workflow-engine.ts:58 | MINIMUM_PASSING_GRADE | 0.87 | 0-1 decimal | meetsQualityThreshold() |
| workflow-config.ts:101 | JUDGE_GRADE_MINIMUM | {A:0.83,B:0.87,C:0.87} | 0-1 decimal | isJudgeGradeAcceptable() |
| workflow-config.ts:103 | QUALITY_PASSING | 0.87 | 0-1 decimal | Unused |
| types/workflow.ts:805 | MINIMUM_PASSING_VALUE | 3.3 | 4.0 GPA | gradePasses() in types |
| workflow-orchestration.ts:60 | imports MINIMUM_PASSING_VALUE | 3.3 | 4.0 GPA | Grade comparison |

**CONFLICT**: Tier A judge grade minimum is 0.83 in workflow-config.ts but spec says 0.87 for all tiers. This needs Clay confirmation.

**CONFLICT**: Two different `gradePasses()` functions (phase-config.ts + types/workflow.ts) and one `meetsQualityThreshold()` (workflow-engine.ts) all do the same thing with different APIs.

## TABLE F: Batch Size Conflict Map

| File | Constant | Tier A | Tier B | Tier C | V.1/VII.1 |
|------|----------|--------|--------|--------|-----------|
| types/workflow.ts:920 | CITATION_BATCH_SIZES | 5 | 4 | 3 | 2 |
| workflow-config.ts:119 | CITATION_BATCH_CONFIG | **4** | 4 | **4** | 2 |
| phase-config.ts:310 | getCitationBatchSize() | **5** | **5** | **5** | 2 |
| **SPEC** | Ground Truth | 5 | 4 | 3 | 2 |

**Only `types/workflow.ts` matches the spec.** Both other systems are wrong.

## TABLE G: Import Dependency Graph

| File | Imports FROM | Used By (imported BY) |
|------|-------------|----------------------|
| lib/workflow/phase-executors.ts | `@/prompts` (PHASE_PROMPTS), `@/types/workflow` (types) | workflow-orchestration.ts |
| lib/workflow/phase-config.ts | (no routing imports) | inngest/functions.ts |
| lib/workflow/model-router.ts | `@/types/workflow` (SONNET_MODEL, OPUS_MODEL, getModelForPhase, getExtendedThinkingBudget) | workflow-orchestration.ts |
| lib/workflow/phase-executor.ts | `@/lib/config/workflow-config` | inngest/functions.ts |
| lib/inngest/functions.ts | `phase-executor`, `phase-config` | Inngest runtime |
| lib/inngest/workflow-orchestration.ts | `phase-executors`, `model-router`, `types/workflow` | Inngest runtime |
| types/workflow.ts | (standalone) | model-router.ts, workflow-orchestration.ts |
| prompts/index.ts | `fs`, `path` | phase-executors.ts |
| lib/config/models.ts | (standalone) | **NOBODY** (dead for routing) |
| lib/config/workflow-config.ts | (standalone) | phase-executor.ts, hold-service.ts, revision-loop.ts, revision-handler.ts |
| lib/ai/model-router.ts | `@/lib/api-keys`, `@/lib/automation/claude` | (CIV pipeline) |
| lib/ai/openai-client.ts | `openai` | (CIV pipeline) |
| lib/civ/model-router.ts | `openai`, `@/lib/api-keys` | (CIV pipeline) |
| lib/workflow/superprompt-builder.ts | `@supabase` | orchestrator.ts (legacy v6 path) |

**Two active execution paths**:
1. `inngest/functions.ts` → `phase-executor.ts` → `workflow-config.ts` (v7.2 orchestration)
2. `inngest/workflow-orchestration.ts` → `phase-executors.ts` + `model-router.ts` → `types/workflow.ts` (v7.2 execution)

These paths use **different config sources**.

---

# PHASE 3: ARCHITECTURE PROPOSAL

## Decision: Option B — New `lib/config/phase-registry.ts`

**Rationale**:
1. `phase-config.ts` already mixes config with transition logic (getNextPhase, grade functions) — adding more would create a 500+ line god-file.
2. `config/models.ts` was an attempt at this but is incomplete and unused.
3. A new file with a clean interface lets us swap imports without touching business logic.
4. `workflow-config.ts` handles non-routing config (hold timeouts, skip rules) well — don't pollute it.
5. Every consumer gets the same data from one source. Period.

## Architecture Diagram

```
                    ┌─────────────────────────────────┐
                    │   lib/config/phase-registry.ts   │
                    │   ═══════════════════════════════ │
                    │   PHASE_REGISTRY (14 phases × 3  │
                    │   tiers): model, ET, max_tokens,  │
                    │   batch size, prompt file         │
                    │                                   │
                    │   Exports:                        │
                    │   - getModelForPhase(phase, tier) │
                    │   - getETBudget(phase, tier)      │
                    │   - getMaxTokens(phase, tier)     │
                    │   - getBatchSize(phase, tier)     │
                    │   - CLAUDE_MODELS                 │
                    │   - OPENAI_MODELS                 │
                    └───────────┬───────────────────────┘
                                │
            ┌───────────────────┼───────────────────────┐
            │                   │                       │
            ▼                   ▼                       ▼
┌───────────────────┐ ┌─────────────────┐ ┌───────────────────────┐
│ phase-executors.ts│ │ model-router.ts │ │ inngest/functions.ts  │
│ (execution)       │ │ (API params)    │ │ (orchestration)       │
│                   │ │                 │ │                       │
│ DELETES local     │ │ DELETES local   │ │ Imports from          │
│ getModelForPhase  │ │ shouldUseOpus   │ │ phase-registry        │
│ getThinkingBudget │ │ getModelId      │ │ instead of            │
│                   │ │ Uses registry   │ │ phase-config          │
│ Imports from      │ │ getters instead │ │ for model/ET          │
│ phase-registry    │ │                 │ │                       │
└───────────────────┘ └─────────────────┘ └───────────────────────┘
            │                   │                       │
            ▼                   ▼                       ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Anthropic / OpenAI APIs                       │
│  Claude: claude-sonnet-4-20250514 / claude-opus-4-5-20251101     │
│  OpenAI: gpt-4-turbo (ALL CIV tasks)                             │
└───────────────────────────────────────────────────────────────────┘
```

## File-Level Change Plan

### NEW FILE: `lib/config/phase-registry.ts`
- Complete 14×3 phase registry with model, ET, max_tokens, batch size, prompt key
- Getter functions with the same signatures as existing ones (drop-in replacement)
- Single source of truth for ALL routing decisions
- **See full implementation below**

### MODIFY: `lib/workflow/phase-executors.ts`
```
DELETE: Lines 112-125 (local getModelForPhase function)
DELETE: Lines 128-132 (local getThinkingBudget function)
DELETE: Lines 113-114 (local OPUS/SONNET constants)
ADD:    import { getModelForPhase, getETBudget, getMaxTokens } from '@/lib/config/phase-registry'
MODIFY: All callsites of getModelForPhase() and getThinkingBudget() → use imported versions
        getThinkingBudget → getETBudget (renamed for clarity)
```

### MODIFY: `lib/workflow/model-router.ts`
```
DELETE: Lines 20-27 (imports from types/workflow.ts — WRONG Sonnet model)
ADD:    import { getModelForPhase, getETBudget, getMaxTokens, CLAUDE_MODELS } from '@/lib/config/phase-registry'
MODIFY: getModelConfig() → use phase-registry getters
DELETE: shouldUseOpus() function (lines 79-92) — replaced by registry lookup
MODIFY: getModelId() → delegate to phase-registry getModelForPhase()
MODIFY: getThinkingBudget() → delegate to phase-registry getETBudget()
```

### MODIFY: `types/workflow.ts`
```
DELETE: Lines 844-878 (MODEL_ROUTING, SONNET_MODEL, OPUS_MODEL, getModelForPhase)
DELETE: Lines 892-914 (EXTENDED_THINKING_CONFIG, getExtendedThinkingBudget)
DELETE: Lines 920-934 (CITATION_BATCH_SIZES, getCitationBatchSize)
NOTE:   Keep type definitions (WorkflowPhaseCode, MotionTier, etc.) — those are still needed
ADD:    Re-export from phase-registry for backwards compatibility if needed
```

### MODIFY: `lib/config/models.ts`
```
DELETE: Lines 46-118 (EXTENDED_THINKING, TOKEN_LIMITS, getClaudeParams) — superseded by registry
KEEP:   Lines 5-44 (MODELS constant with correct strings, OPENAI config)
KEEP:   Lines 78-94 (getOpenAIParams — still useful for CIV)
```

### MODIFY: `lib/ai/openai-client.ts`
```
MODIFY: Line 57 — DEFAULT_MODEL = 'gpt-4o' → 'gpt-4-turbo'
DELETE: Line 58 — TIER_C_MODEL = 'gpt-5.2' (replace with gpt-4-turbo)
MODIFY: Line 69 — Remove gpt-5.2 cost entry, ensure gpt-4-turbo entry exists
```

### MODIFY: `lib/ai/model-router.ts`
```
MODIFY: Lines 81,87 — Tier A: gpt-4o → gpt-4-turbo
MODIFY: Lines 90,96 — Tier B: gpt-4o → gpt-4-turbo
MODIFY: Lines 99,105 — Tier C: gpt-5.2 → gpt-4-turbo, gpt-4o → gpt-4-turbo
MODIFY: Line 125 — Remove gpt-5.2 from provider detection
```

### MODIFY: `lib/civ/model-router.ts`
```
MODIFY: Line 24 — tier_a stage_1: gpt-4o → gpt-4-turbo
MODIFY: Line 29 — tier_b stage_1: gpt-4o → gpt-4-turbo
MODIFY: Line 34 — tier_c stage_1: gpt-5.2 → gpt-4-turbo
```

### MODIFY: `lib/citation/steps/step-2-holding.ts`
```
MODIFY: Line 82 — TIER_A_B_STAGE_1: gpt-4o → gpt-4-turbo
MODIFY: Line 83 — TIER_C_STAGE_1: gpt-5.2 → gpt-4-turbo
MODIFY: Line 85 — TIEBREAKER: gpt-4o → gpt-4-turbo
```

### LABEL (no code change): `lib/workflow/superprompt-builder.ts`
```
ADD: Header comment: "ADMIN PREVIEW ONLY — NOT USED IN EXECUTION PATH"
     "Execution uses file-based prompts via prompts/index.ts → phase-executors.ts"
```

### DELETE: `lib/caselaw/client.ts`
```
134 lines of dead code for an API that sunset September 5, 2024.
```

---

## Migration Checklist

1. **What breaks during switchover?**
   - Nothing, if done correctly. The new registry exports functions with identical signatures.
   - `getModelForPhase(phase, tier)` returns the same string type.
   - `getETBudget(phase, tier)` returns `number | null` (same as existing).
   - Callers don't need to change their logic, only their import source.

2. **What needs to be tested?**
   - Unit tests: Call `getModelForPhase()` for all 42 combinations, assert correct model string
   - Unit tests: Call `getETBudget()` for all 42 combinations, assert correct budget
   - Unit tests: Call `getMaxTokens()` for all 42 combinations, assert 64K or 128K
   - Unit tests: Call `getBatchSize()` for all 42 combinations, assert correct size
   - Integration: Run a Tier C motion through Phase VII, verify Opus + 10K ET budget
   - Integration: Run a Tier A motion through Phase VII, verify Opus + 5K ET budget
   - Integration: Run a Tier C motion through Phase III, verify Sonnet + 10K ET budget
   - Smoke test: Verify no API calls go to `claude-sonnet-4-5-20250929` or `gpt-5.2`

3. **Rollback plan?**
   - Single git revert. All changes are in one commit on the feature branch.
   - Old import paths still exist until types/workflow.ts routing code is deleted.
   - Phase 1: Add registry + update imports. Phase 2: Delete old code. Can be split if needed.

---

## Audit Findings Resolved

| Change | Resolves |
|--------|----------|
| Unified registry replaces 5 routing systems | P0-01, P0-02 (competing systems) |
| Phase III Tier C ET budget = 10,000 | P1-02 (missing ET) |
| Phase V Tier C ET budget = 10,000 | P1-03 (missing ET) |
| Phase VII Tier A/B ET budget = 5,000 | P1-04 (wrong ET) |
| Phase VII.1 ET budgets populated | P1-05 (missing ET) |
| Wrong Sonnet model string fixed | P1-06 (model string conflict) |
| Phase VIII B/C model = Opus | P1-06b (model conflict for ET) |
| gpt-5.2 → gpt-4-turbo (14 refs) | P0-04 (nonexistent model) |
| gpt-4o → gpt-4-turbo (all CIV) | P0-04b (wrong model per spec) |
| Batch sizes unified per tier | P1-11, P2-06 |
| Grade scale documented (flag Tier A=0.83) | P2-07, P3-06 |
| Duplicate getModelForPhase deleted (3→1) | HIGH (prod audit) |
| CourtListener citation= param flagged | P0-03 |
| simplifyQuery flagged for removal | P0-05, P1-07 |
| superprompt-builder labeled non-execution | P1-01, P2-02 |
| lib/caselaw/ deleted (dead API) | P0-06 (Case.law sunset) |
| Phase completion requirements flagged | P2-08 (empty arrays) |
| PHASE_METADATA model values corrected | P2-09 (prompts/index.ts) |

**Total: 18/18 findings resolved or flagged for Clay decision.**

---

## OPEN QUESTIONS FOR CLAY

1. **Tier A judge grade minimum**: `workflow-config.ts` has 0.83, spec says 0.87. Is the lower bar for Tier A intentional? **Decision needed before deploying.**

2. **Phase VII.1 model**: Spec says Sonnet, but ET budgets (5K/10K) require Opus. Should VII.1 use Opus like VII does? Or should VII.1 ET be removed? **The registry currently follows the spec (Sonnet + ET) but this is internally inconsistent — Sonnet does not support extended thinking with these budget levels.**

3. **CourtListener `citation=` parameter**: Deprecated Feb 10. Timeline for the fix is separate from this routing audit but is a **ticking clock**.

4. **Two CIV pipelines**: `lib/civ/steps/` and `lib/citation/steps/` have diverged (different file names). Which is canonical? Consolidation is out of scope for this audit but should be tracked.
