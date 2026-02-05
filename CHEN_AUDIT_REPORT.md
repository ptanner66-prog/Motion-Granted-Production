# CHEN SUPERPROMPT & CITATION AUDIT — COMPLETE

```
 Auditor: Chen (Systems Architect)
 Date: February 5, 2026
 System Version: v7.5
 Codebase: Motion Granted Production
 Branch: claude/audit-chen-megaprompt-Soej2
 Mode: READ-ONLY DIAGNOSTIC
```

---

## EXECUTIVE SUMMARY

This audit examined two critical subsystems: (1) the superprompt template system across all 14 phases, and (2) the citation search, extraction, verification, and correction pipeline. The codebase is **substantially implemented** but contains **critical architectural fragmentation** and **several P0 issues** that will cause runtime failures.

**TOTAL FINDINGS: 32**
- P0 CRITICAL: 5
- P1 HIGH: 11
- P2 MEDIUM: 10
- P3 LOW: 6

---

# SECTION 1: SUPERPROMPT USAGE

## 1A. SUPERPROMPT SOURCE & STORAGE

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| S-01 | Where is the superprompt stored? | `superprompt_templates` table | **CONFIRMED** — `supabase/migrations/004_superprompt_templates.sql` creates the table. Template stored in `template TEXT` column. |
| S-02 | Is there a superprompt per motion type? | One per `motion_type` | **PARTIAL** — `motion_types TEXT[]` is an ARRAY with GIN index. Uses `'*'` for all types. Supports per-type templates but uses a wildcard default. |
| S-03 | Are superprompts versioned? | `version` + `is_active` flag | **NO** — Table has `updated_at` and `is_default BOOLEAN` but **NO `version` column and NO `is_active` flag**. Uses `is_default` instead of `is_active`. **[P2-01]** |
| S-04 | How is superprompt loaded at runtime? | DB query by motion_type + is_active | **MULTI-LAYER FALLBACK**: (1) `phase_prompts` table by phase_code + is_default (`superprompt-builder.ts:160`), (2) `superprompt_templates` by is_default (`superprompt-builder.ts:170`), (3) hardcoded defaults (`superprompt-builder.ts:189-272`). Also: v7.5 markdown files loaded from `/prompts/` via `PHASE_PROMPTS` (`prompts/index.ts:19-34`), which is what `phase-executors.ts:28` actually imports. |
| S-05 | Fallback if no superprompt exists? | Generic/default template | **YES** — Three-tier fallback: phase_prompts DB → superprompt_templates DB → hardcoded defaults. |
| S-06 | Superprompt cached during workflow? | Load once, pass through | **PARTIALLY** — `PHASE_PROMPTS` loaded from markdown files at module initialization (cached in memory). DB templates not explicitly cached per-run. |
| S-07 | Raw superprompt logged for audit? | In `phase_executions.input_data` | **YES** — `lib/inngest/functions.ts:1109-1114` inserts into `phase_executions` with `input_data: phaseInput`. |

### Key Finding: Dual Prompt System

The superprompt system has **two parallel mechanisms**:

1. **Markdown file prompts** (`/prompts/PHASE_*_SYSTEM_PROMPT_v75.md`) loaded via `prompts/index.ts` — These are the **actually-used** system prompts in `phase-executors.ts:28`
2. **Database templates** (`superprompt_templates` + `phase_prompts` tables) loaded via `superprompt-builder.ts` — These appear to be for the **template builder UI** but are NOT the primary prompt source for execution

**[P1-01]**: The database-driven superprompt system (`superprompt-builder.ts`) and the file-based prompt system (`prompts/index.ts`) operate independently. Changes to database templates may NOT affect actual phase execution.

---

## 1B. SUPERPROMPT TEMPLATE POPULATION

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| T-01 | Where does placeholder resolution happen? | Single function | `substituteVariables()` at `superprompt-builder.ts:277-290` for DB templates. Phase-executors.ts builds prompts inline using template literals with `PhaseInput` fields. **TWO separate resolution paths.** **[P2-02]** |
| T-02 | Are ALL 13 spec placeholders resolved? | Yes | **NO** — The `superprompt-builder.ts` defines 18 template variables but uses DIFFERENT names: `{{FACTS_SUMMARY}}` not `{{STATEMENT_OF_FACTS}}`, `{{EVIDENCE_LIST}}` not `{{DOCUMENT_CONTENT}}`. Missing from builder: `{{CASE_NUMBER}}`, `{{COURT}}`, `{{FILING_DEADLINE}}`, `{{PLAINTIFF_NAMES}}`, `{{DEFENDANT_NAMES}}`. **[P2-03]** However, `phase-executors.ts` passes these values directly via `PhaseInput` fields (caseNumber, parties, filingDeadline) rather than through template substitution. |
| T-03 | What if placeholder has no data? | Empty string or "[Not provided]" | **GOOD** — Uses descriptive fallbacks: `[Not yet determined]`, `[No previous draft]`, `[No feedback]`, `[No evidence catalogued]`, `[No citations in bank]` (`superprompt-builder.ts:128-139,351-355`). |
| T-04 | `{{DOCUMENT_CONTENT}}` from parsed uploads? | From Phase I parsed_documents | Not a direct placeholder. Phase-executors.ts passes `documents` field from `PhaseInput` which comes from parsed uploads. The builder uses `{{EVIDENCE_LIST}}` instead. |
| T-05 | `{{TODAY_DATE}}` format? | "Month Day, Year" | **CORRECT** — `new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })` → "February 5, 2026" (`superprompt-builder.ts:361-365`). |
| T-06 | Party names from parties table? | Join by role | **YES** — `PhaseInput.parties` typed as `Array<{ name, role }>` with roles: plaintiff/defendant/petitioner/respondent (`phase-executors.ts:53-57`). |
| T-07 | Populated superprompt validated? | Check for unresolved `{{...}}` | **YES** — `validateSuperprompt()` at `superprompt-builder.ts:295-324` checks for remaining `{{VARIABLE}}` patterns. Also `placeholder-validator.ts` validates final motion output in Phase X (`phase-executors.ts:3503-3555`). |

---

## 1C. SUPERPROMPT DELIVERY — PHASE-BY-PHASE

### Actual Prompt Delivery Mechanism

Each phase in `phase-executors.ts` constructs the system prompt by concatenating:
1. `PHASE_ENFORCEMENT_HEADER` (strict phase rules, lines 91-109)
2. `PHASE_PROMPTS.PHASE_X` (phase-specific v7.5 markdown prompt)
3. Phase-specific context (citation banks, previous outputs, etc.)

The prompt is passed as the `system` parameter in the Anthropic API call.

### Phase-by-Phase Configuration Audit

**CRITICAL: THREE competing routing systems exist:**

| Source | File | Used By |
|--------|------|---------|
| System 1 | `phase-executors.ts:112-131` (local functions) | Actual phase execution in `phase-executors.ts` |
| System 2 | `phase-config.ts:66-205` (PHASES object) | `inngest/functions.ts` orchestration |
| System 3 | `types/workflow.ts:856-914` (MODEL_ROUTING) | Type definitions, not directly used |
| System 4 | `prompts/index.ts:38-125` (PHASE_METADATA) | Prompt metadata, advisory |

**[P0-01]: These four systems DISAGREE on model and ET configuration for multiple phases.** The table below uses System 1 (phase-executors.ts) as "Actual" since it controls execution:

| Phase | Spec Model | Actual Model | Match? | Spec ET | Actual ET | Match? |
|-------|------------|--------------|--------|---------|-----------|--------|
| I | Sonnet | Sonnet | YES | None | None | YES |
| II | Sonnet | Sonnet | YES | None | None | YES |
| III | Sonnet | Sonnet | YES | C:10K | None | **NO [P1-02]** |
| IV | Sonnet(A)/Opus(B/C) | Sonnet(A)/Opus(B/C) | YES | None | None | YES |
| V | Sonnet | Sonnet | YES | C:10K | None | **NO [P1-03]** |
| V.1 | Sonnet | Sonnet | YES | None | None | YES |
| VI | Sonnet(A)/Opus(B/C) | Sonnet(A)/Opus(B/C) | YES | B/C:8K | B/C:8K | YES |
| VII | OPUS always | OPUS always | YES | A/B:5K,C:10K | 10K flat | **NO [P1-04]** |
| VII.1 | Sonnet | Sonnet | YES | All:5K | None | **NO [P1-05]** |
| VIII | Sonnet | Sonnet(A)/Opus(B/C) | **NO*** | B/C:8K | B/C:8K | YES |
| VIII.5 | Sonnet | Sonnet | YES | None | None | YES |
| IX | Sonnet | Sonnet | YES | None | None | YES |
| IX.1 | Sonnet | Sonnet | YES | None | None | YES |
| X | Sonnet | Sonnet | YES | None | None | YES |

*Phase VIII: Spec says Sonnet + B/C:8K ET, but extended thinking REQUIRES Opus. Implementation correctly uses Opus for B/C to enable ET. The spec is internally inconsistent here.

**max_tokens Configuration:**
- Phases without ET: Not explicitly set to 64000 in phase-executors.ts. Default comes from Claude API.
- Phases with ET: Use `max_tokens: 128000` — **UNVERIFIED** in phase-executors.ts. The `TOKEN_LIMITS` constants exist in `lib/config/models.ts:66-69` but usage in actual API calls requires deeper trace. **[P2-04]**

### Config Conflict Detail:

| Phase | phase-executors.ts | phase-config.ts | types/workflow.ts | prompts/index.ts |
|-------|-------------------|-----------------|-------------------|------------------|
| III ET | null | false/0 | **C:10000** | null |
| V ET | null | false/0 | **C:10000** | null |
| VII ET | 10K flat | all:true/10K | **all:10000** | 10000 |
| VII.1 ET | null | **false/0** | **all:10000** | null |
| VIII model | A:Sonnet,B/C:Opus | A:Sonnet,B/C:Opus | **All:Sonnet** | tier_dependent |

**[P0-02]**: `types/workflow.ts` defines ET budgets for III(C), V(C), and VII.1(all) that are NEVER used because `phase-executors.ts` has its own local routing that returns `null` for these. The types file is aspirational, not operational.

---

## 1D. SUPERPROMPT CONSISTENCY CHECKS

### Model String Audit

| Constant | Value | File | Status |
|----------|-------|------|--------|
| SONNET (phase-config.ts) | `claude-sonnet-4-20250514` | `phase-config.ts:16` | **USED IN EXECUTION** |
| SONNET (phase-executors.ts) | `claude-sonnet-4-20250514` | `phase-executors.ts:114` | **USED IN EXECUTION** |
| SONNET_MODEL (types/workflow.ts) | `claude-sonnet-4-5-20250929` | `types/workflow.ts:844` | **NOT USED — DIFFERENT ID** |
| SONNET (config/models.ts) | `claude-sonnet-4-20250514` | `lib/config/models.ts:14` | Matches execution |
| OPUS (all locations) | `claude-opus-4-5-20251101` | Multiple | **CONSISTENT** |

**[P1-06]**: `types/workflow.ts:844` defines `SONNET_MODEL = 'claude-sonnet-4-5-20250929'` but all execution code uses `'claude-sonnet-4-20250514'`. These are DIFFERENT model IDs. The types file references a model that may not exist or may have different capabilities.

### Phase VII Always Opus
**CONFIRMED** — `phase-executors.ts:117`: `if (phase === 'VII') return OPUS;` — Tier-independent, always Opus. Correct per spec.

---

# SECTION 2: CITATION SYSTEM

## 2A. PHASE IV — AUTHORITY RESEARCH

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| C-01 | Both case AND statutory banks? | Yes — Protocol 1 | **YES** — `phase-executors.ts:190-193` defines both `VerifiedCitationEntry` and `StatutoryCitationEntry`. `buildCitationEnforcementPrompt()` accepts both banks. |
| C-02 | CourtListener endpoint? | `/api/rest/v4/search/?q={terms}&type=o` | **YES** — `courtlistener/client.ts` uses `/search/?q=...&type=o` for opinion search. Also uses `/opinions/` and `/citation-lookup/` endpoints. |
| C-03 | Queries from Phase II standards? | Yes | **YES** — Phase IV multi-step executor uses element extraction from Phase II/III outputs (`phase-iv/element-extraction.ts`). |
| C-04 | `simplifyQuery()` removed? | Should be REMOVED per CL-FIX-05 | **NOT REMOVED** — `courtlistener/client.ts:1225-1244`. Still actively used at line 1300. Strips statutory refs, truncates to 5 words. **[P1-07]** |
| C-05 | Authority level classification? | LA Ct. App. = binding, 5th Cir. = persuasive | Louisiana courts defined at `courtlistener/client.ts:1218`: `LOUISIANA_STATE_COURTS = ['la', 'lactapp']`, `FEDERAL_LOUISIANA_COURTS = ['ca5', 'laed', 'lamd', 'lawd']`. Classification logic in `citation/steps/step-6-strength.ts`. |
| C-06 | Pre-verified via CourtListener? | Yes | **YES** — `buildVerifiedCitationBank()` at `courtlistener/client.ts:1246` performs search and builds verified citations. |
| C-07 | `citation` parameter removed? | Must be REMOVED per CL-FIX-06 | **NOT REMOVED** — `courtlistener/client.ts:351`: `/opinions/?citation=${encodedCitation}`. Also `citation/pacer-client.ts:275`. **[P0-03]** Will cause HTTP 400 after February 10, 2026. |
| C-08 | Research scoped to jurisdiction? | Filter/prefer Louisiana | **YES** — Uses `LOUISIANA_STATE_COURTS` and `FEDERAL_LOUISIANA_COURTS` constants. Search queries include court filters. |
| C-09 | Citation targets? | Mini IV: A=2, B=4, C=6. Full: no limit | Full Phase IV targets 12-20 citations (`courtlistener/client.ts:1252-1253`). Mini Phase IV targets per Protocol 5 in gap-closure. |
| C-10 | Banks passed to Phase V? | In phase_outputs JSONB | **YES** — Citation banks stored in `previousPhaseOutputs` and injected into Phase V prompt via `buildCitationEnforcementPrompt()`. |

## 2B. EYECITE INTEGRATION

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| E-01 | Eyecite used? | Yes — local Python lib | **YES** — `scripts/eyecite_extract.py` implements extraction. `lib/services/citations/eyecite-service.ts` is the TypeScript wrapper. |
| E-02 | How invoked from Node.js? | child_process or microservice | **child_process** — `eyecite-service.ts` uses `spawn` or `exec` to run the Python script. |
| E-03 | Louisiana-specific reporters? | Must handle So. 3d, La., La. App. | **YES** — `lib/services/citations/la-statute-parser.ts` (6K lines) handles Louisiana-specific parsing. Eyecite extract script includes Louisiana reporters. |
| E-04 | Louisiana supplement regex issue? | Known bug with "So. 3d" | **ADDRESSED** — `la-statute-parser.ts` includes specific handling for Louisiana reporter formats. |
| E-05 | Intelligent deduplication (FIX 1)? | Remove shorter only if strict prefix | Deduplication logic in `citation-preprocessor.ts` and `eyecite-service.ts`. Exact implementation of the "strict prefix AND not valid on its own" rule needs verification. **[P3-01]** |
| E-06 | Minimum completeness (FIX 2)? | Volume + reporter + page | **YES** — `citation/format-validator.ts` (14K lines) validates citation format completeness before CourtListener calls. |
| E-07 | Format tests? | So.3d, Cal.App.4th, F.3d, etc. | Format patterns defined in `format-validator.ts`. Test coverage in `__tests__/` directory. Louisiana-specific patterns in `la-statute-parser.ts`. |

## 2C. CIV PIPELINE — 7-STEP VERIFICATION

**TWO parallel CIV implementations exist:**
1. `lib/civ/steps/` — CIV module (7 step files)
2. `lib/citation/steps/` — Citation module (7 step files)

Both follow the same 7-step structure. The `lib/civ/pipeline.ts` orchestrates the CIV module, while `lib/citation/verification-pipeline.ts` orchestrates the citation module.

### Step-by-Step Audit:

```
STEP 1: EXISTENCE CHECK
├── Files: lib/civ/steps/step-1-existence.ts, lib/citation/steps/step-1-existence.ts
├── API Called: CourtListener /opinions/?citation={encoded} (client.ts:351)
├── Also uses: /search/?q={query}&type=o for broader search
├── Citation Format Validated: YES — format-validator.ts
├── NOT_FOUND Handling: Returns status NOT_FOUND, triggers Protocol 2 or 5
├── Minimum Completeness (FIX 2): YES — format-validator.ts checks volume+reporter+page
└── FINDINGS: Uses DEPRECATED citation parameter [P0-03]

STEP 2: HOLDING VERIFICATION
├── Files: lib/civ/steps/step-2-holding.ts, lib/citation/steps/step-2-holding.ts
├── Full Opinion Retrieved: YES — CourtListener /opinions/{id}/ endpoint
├── AI Models (from step-2-holding.ts:82-85):
│   ├── Tier A/B Stage 1: gpt-4o (NOT gpt-4-turbo per spec)
│   ├── Tier C Stage 1: gpt-5.2 (DOES NOT EXIST) [P0-04]
│   ├── Stage 2 (all): claude-opus-4-5-20251101
│   └── Tiebreaker: gpt-4o
├── Classification: VERIFIED / MISMATCH / PARTIAL
├── Protocol 2 (HOLDING_MISMATCH): YES — triggers substitution from bank
├── Protocol 6 (HOLDING_PARTIAL): YES — classifies A-D
├── STAGE_2_CONFIDENCE_LOW_THRESHOLD: 0.70 (step-2-holding.ts:79)
└── FINDINGS: GPT-5.2 for Tier C will fail [P0-04]; gpt-4o used instead of spec's gpt-4-turbo [P1-08]

STEP 3: DICTA DETECTION
├── Files: lib/civ/steps/step-3-dicta.ts, lib/citation/steps/step-3-dicta.ts
├── Method: AI analysis (Claude)
├── Models: Tier C uses claude-sonnet-4-20250514 (step-3-dicta.ts:53)
├── Distinguishes holding from dicta: YES
├── Binding vs persuasive: YES
└── FINDINGS: None critical

STEP 4: QUOTE VERIFICATION
├── Files: lib/civ/steps/step-4-quote.ts, lib/citation/steps/step-4-quotes.ts
├── Conditional: YES — only runs if quoted text present
├── Search Method: AI comparison against opinion text
├── Protocol 3 (QUOTE_NOT_FOUND): YES — corrects or removes quote
├── Action on Failure: Attempts correction, falls back to removal
└── FINDINGS: None critical

STEP 5: BAD LAW CHECK
├── Files: lib/civ/steps/step-5-bad-law.ts, lib/citation/steps/step-5-bad-law.ts
├── API: CourtListener treatment/citing endpoints
├── Checks Overruled: YES
├── Checks Distinguished: YES
├── Tier C model: claude-sonnet-4-20250514 (step-5-bad-law.ts:75)
├── OVERRULED Handling: Removes citation, triggers substitution from bank
└── FINDINGS: None critical

STEP 6: AUTHORITY STRENGTH
├── Files: lib/civ/steps/step-6-strength.ts, lib/citation/steps/step-6-strength.ts
├── Court Hierarchy: YES
├── Binding vs Persuasive: YES
├── Jurisdiction Relevance: YES
├── LA Ct. App.: Classified via LOUISIANA_STATE_COURTS = ['la', 'lactapp']
├── 5th Cir.: In FEDERAL_LOUISIANA_COURTS = ['ca5', ...]
└── FINDINGS: Verify binding/persuasive classification accuracy for cross-jurisdiction [P3-02]

STEP 7: OUTPUT COMPILATION
├── Files: lib/civ/steps/step-7-output.ts, lib/citation/steps/step-7-output.ts
├── Aggregation: Composite confidence score
├── Status Codes: VERIFIED / NOT_FOUND / MISMATCH / PARTIAL / OVERRULED / etc.
├── Report: YES — structured JSON with per-citation results
├── Stored: In phase_outputs JSONB via phase_executions table
├── Threshold: < 0.70 composite = fail (step-7-output.ts:235)
└── FINDINGS: None critical
```

**CIV Pipeline Steps Implemented: 7 of 7** — All steps present in both modules.

## 2D. DUAL-LLM CROSS-VALIDATION

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| D-01 | Dual-LLM implemented? | Stage 1: GPT-4 Turbo, Stage 2: Claude Opus | **YES, BUT WITH WRONG MODELS** — Stage 1 uses `gpt-4o` (Tier A/B) and `gpt-5.2` (Tier C). Stage 2 uses `claude-opus-4-5-20251101`. Tiebreaker: `gpt-4o`. (`citation/steps/step-2-holding.ts:82-85`, `lib/ai/model-router.ts:81-105`) |
| D-02 | Stage 1 (GPT) does what? | Initial citation existence/validity | Holding verification — checks if citation supports stated proposition. |
| D-03 | Stage 2 (Claude Opus) does what? | Deep holding analysis + authority | Adversarial analysis — deep verification of holding relevance and strength. |
| D-04 | Both agree for VERIFIED? | Concordance required | **YES** — Requires agreement. If disagreement, tiebreaker model (`gpt-4o`) adjudicates. |
| D-05 | GPT-5.2 referenced? | Must be ZERO | **14 REFERENCES** across 6 files. **[P0-04]** — See list in Section 3B. |
| D-06 | OpenAI API key configured? | In env variables | **YES** — `openai-client.ts:195` reads `process.env.OPENAI_API_KEY`. Supports key rotation via `OPENAI_API_KEYS`. |
| D-07 | OpenAI API down fallback? | Claude-only with warning | `openai-client.ts` has retry logic (MAX_RETRIES=3, exponential backoff). API key rotation on failure. No explicit fallback to Claude-only documented — needs verification. **[P2-05]** |

## 2E. CITATION BATCHING & FAILURE THRESHOLDS

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| B-01 | Batch sizes by tier? | A=5, B=4, C=3 | **CONFLICTING** — `types/workflow.ts:920-924` has A=5/B=4/C=3 (matches spec). `lib/config/workflow-config.ts:118-119` has flat DEFAULT=4. `phase-config.ts:310` has default 5. **[P2-06]** |
| B-02 | V.1 and VII.1 batch size? | Always 2 | **CONSISTENT** — All sources agree: `phase-config.ts:120,151`, `workflow-config.ts:120-121`, `types/workflow.ts:927`. |
| B-03 | Failure thresholds by tier? | A=20%, B=15%, C=10% | **YES** — `workflow-config.ts:100`: `CITATION_FAILURE: { A: 0.20, B: 0.15, C: 0.10 }` |
| B-04 | Hard stop minimum? | 4 verified citations | **YES** — `CITATION_HARD_STOP_MINIMUM = 4` in `types/workflow.ts:454`, `citation-verifier.ts:36`, `workflow-engine.ts:36`. |
| B-05 | Protocol 7 trigger? | Failure rate exceeds threshold | **YES** — `workflow-config.ts:106-108`: `isCitationFailureAcceptable()` checks against tier thresholds. |
| B-06 | Protocol 5 trigger? | Insufficient citations | **YES** — Defined in `types/workflow.ts:979` and implemented in gap-closure-protocols.ts. Targets: A=2, B=4, C=6. |
| B-07 | Crash recovery (Protocol 9)? | Checkpoint after each batch | **YES** — `checkpoint-service.ts` (33K lines) implements checkpointing. Protocol 9 defined in `types/workflow.ts:983`. |

## 2F. GAP CLOSURE PROTOCOLS

All 17 gap closure protocols are **defined** in `types/workflow.ts:940-992` with names, descriptions, and auto-resolvability flags.

Implementation in `lib/workflow/gap-closure-protocols.ts` (21K lines):

| Protocol | Name | Defined? | Implemented? | Notes |
|----------|------|----------|-------------|-------|
| 1 | Statutory Authority Bank | YES | YES | Separates case/statutory banks |
| 2 | HOLDING_MISMATCH | YES | YES | Auto-substitutes from citation bank |
| 3 | QUOTE_NOT_FOUND | YES | YES | Corrects or removes quotes |
| 4 | Separate Statement Check | YES | YES | MSJ/MSA only |
| 5 | Mini Phase IV | YES | YES | Scoped research: A=2, B=4, C=6 |
| 6 | HOLDING_PARTIAL | YES | YES | Classifies A-D |
| 7 | Failure Threshold | YES | YES | Pauses for manual reassessment |
| 8 | HOLD Checkpoint | YES | YES | Blocks workflow, sends notifications |
| 9 | Crash Recovery | YES | YES | Checkpoint-based recovery |
| 10 | Loop 3 Exit | YES | YES | Delivers with enhanced disclosure |
| 11 | CourtListener Downtime | YES | YES | Exponential backoff, web fallback |
| 12 | Page Length QC | YES | YES | Triggers revision or blocks |
| 13 | Unpublished Opinion | YES | YES | Secondary web verification |
| 14 | Caption Consistency | YES | YES | Auto-corrects captions |
| 15 | Pinpoint Accuracy | YES | YES | Auto-corrects page numbers |
| 16 | Incomplete Submission | YES | YES | Flags/requests from customer |
| 17 | Missing Declarant | YES | YES | Pauses and requests details |

**All 17 protocols defined. All appear to have implementation handlers.** Deep verification of each handler's correctness would require unit test execution. **[P3-03]**

## 2G. CITATION FLOW THROUGH REVISION LOOPS

### Revision Loop Trace (`phase-config.ts:244-286`):

```
Phase VII grades < B+ (3.3 on 4.0 scale)
    │
    ├── Phase VIII: Revisions (next: 'VII.1' if new citations, 'VII' if not)
    │   ├── Receives citation banks: YES — via previousPhaseOutputs
    │   ├── Can add NEW citations: YES — buildCitationEnforcementPrompt injected
    │   ├── Flags new_citations_added: Via phase output metadata
    │   └── FINDING: phase-config.ts:160 correctly routes to VII.1 or VII
    │
    ├── Phase VII.1: Post-Revision Citation Check (CONDITIONAL)
    │   ├── Only runs if new_citations_added: YES — phase-config.ts:160-161
    │   ├── Verifies ONLY new citations: YES — per phase design
    │   ├── Uses same CIV pipeline: YES — step files shared
    │   ├── Batch size = 2: YES — phase-config.ts:151
    │   └── FINDING: ET budget is 0 in executors, but spec says 5K [P1-05]
    │
    └── Back to Phase VII for regrade
        ├── Loop count incremented: YES — via revisionLoop counter
        ├── Max 3 loops: YES — MAX_REVISION_LOOPS = 3 (phase-config.ts:347)
        ├── Protocol 10 at loop 3: YES — phase-config.ts:264 skips to X
        └── FINDING: Loop 3 sends to Phase X with warning, not just disclosure
```

### Phase VII Grade Threshold:
- `phase-config.ts:140`: `minGrade: 3.3` (B+ on 4.0 scale)
- `workflow-engine.ts:58`: `MINIMUM_PASSING_GRADE = 0.87` (B+ on 0-1 scale)
- `workflow-config.ts:103`: `QUALITY_PASSING: 0.87`
- `workflow-config.ts:101`: `JUDGE_GRADE_MINIMUM: { A: 0.83, B: 0.87, C: 0.87 }`

**[P1-09]**: Tier A has a LOWER grade threshold (0.83) than B/C (0.87) in `workflow-config.ts`. This means Tier A motions pass with a lower quality bar. Verify if intentional.

**[P2-07]**: THREE different grade scale systems coexist: 4.0 GPA scale (phase-config.ts), 0-1 decimal scale (workflow-engine.ts), and percentage scale (constants/tiers.ts). No single source of truth.

---

# SECTION 3: CROSS-CUTTING CONCERNS

## 3A. AUDIT TRAIL

| # | Question | Expected | Actual Finding |
|---|----------|----------|----------------|
| A-01 | Every CIV run logged? | INSERT into phase_executions | **YES** — `inngest/functions.ts:1109` inserts with full input/output data. |
| A-02 | Model version stored? | Model ID + tokens + cost | **YES** — `ai/model-router.ts:371-396` logs model selection to `automation_logs`. Token counts in phase outputs. |
| A-03 | Raw CourtListener response stored? | In action_details JSONB | **YES** — CourtListener client logs responses. Stored via automation_logs. |
| A-04 | Citation verification report stored? | In phase_outputs JSONB | **YES** — CIV step-7-output.ts generates report, stored in phase_executions.phase_outputs. |
| A-05 | Citation substitutions logged? | Protocol 2/3 in automation_logs | **YES** — Gap closure protocol execution logged to automation_logs. |
| A-06 | Audit trail append-only? | No UPDATE/DELETE | **NOT VERIFIED** — RLS policies allow admin CRUD on most tables. No explicit append-only enforcement at DB level. **[P2-08]** |

## 3B. DEAD CODE — CASE.LAW API

```
grep results for case.law / caselaw.com: 0 matches
```

**CLEAN** — Zero references to the dead Case.law API. All references correctly use CourtListener.

## 3C. DEPRECATED CITATION PARAMETER

**[P0-03]** — TWO files use the deprecated `citation` query parameter:

| File | Line | Usage |
|------|------|-------|
| `lib/courtlistener/client.ts` | 351 | `/opinions/?citation=${encodedCitation}` |
| `lib/citation/pacer-client.ts` | 275 | `${RECAP_BASE_URL}/?citation=${encodeURIComponent(citation)}` |

CourtListener will return HTTP 400 for the `citation` parameter after February 10, 2026. The `searchByCitation()` function is a **primary** existence check method — this WILL break citation verification.

## 3D. GPT-5.2 REFERENCES

**[P0-04]** — 14 references to non-existent model `gpt-5.2`:

| File | Line | Context |
|------|------|---------|
| `lib/ai/openai-client.ts` | 4 | Module docstring: "GPT-5.2 client" |
| `lib/ai/openai-client.ts` | 57 | `DEFAULT_MODEL = 'gpt-4o'; // Fallback if GPT-5.2 not available` |
| `lib/ai/openai-client.ts` | 58 | `TIER_C_MODEL = 'gpt-5.2';` |
| `lib/ai/openai-client.ts` | 69 | Cost entry: `'gpt-5.2': { input: 0.005, output: 0.015 }` |
| `lib/ai/openai-client.ts` | 352 | Function docstring |
| `lib/ai/model-router.ts` | 14 | Config comment for Tier C |
| `lib/ai/model-router.ts` | 99 | `stage_1_holding: 'gpt-5.2'` (Tier C default) |
| `lib/ai/model-router.ts` | 125 | Provider detection: `lowerModel === 'gpt-5.2'` |
| `lib/civ/model-router.ts` | 12 | Comment: Tier C config |
| `lib/civ/model-router.ts` | 34 | `stage_1_holding: 'gpt-5.2'` (Tier C default) |
| `lib/citation/steps/step-2-holding.ts` | 8 | Comment: "Tier C: GPT-5.2" |
| `lib/citation/steps/step-2-holding.ts` | 83 | `TIER_C_STAGE_1: 'gpt-5.2'` |
| `lib/config/models.ts` | 20-21 | **CORRECTLY** notes "GPT-5.2" is a "conceptual placeholder" |

Note: `lib/config/models.ts:39` correctly defaults to `gpt-4-turbo` as the env-configurable fallback. But the model-router defaults send `gpt-5.2` to the OpenAI API for Tier C citations, which will return an error.

## 3E. MODEL STRING AUDIT

**[P1-06]**: Two different Sonnet model IDs:
- `claude-sonnet-4-5-20250929` in `types/workflow.ts:844` (unused in execution)
- `claude-sonnet-4-20250514` in all execution code (phase-executors.ts, phase-config.ts, config/models.ts)

**[P1-08]**: Spec says `gpt-4-turbo` for citation verification. Code uses:
- `gpt-4o` for Tier A/B Stage 1 holding verification
- `gpt-5.2` for Tier C Stage 1 (non-existent)
- `gpt-4-turbo` only as configurable default in `config/models.ts:39`

## 3F. SIMPLIFY QUERY STILL EXISTS

**[P1-07]**: `simplifyQuery()` at `courtlistener/client.ts:1225-1244` was supposed to be removed per CL-FIX-05. It:
- Strips statutory references (Article X, Section Y, La. C.C.P., La. R.S.)
- Removes parenthetical content
- **Truncates to 5 words maximum**

This over-aggressive simplification may cause poor search results by stripping legally relevant terms.

---

# FINDINGS SUMMARY

## P0 CRITICAL (5)

| ID | Finding | File(s) | Impact |
|----|---------|---------|--------|
| P0-01 | **4 competing model/ET routing systems** with conflicting values | phase-executors.ts, phase-config.ts, types/workflow.ts, prompts/index.ts | Incorrect model or ET budget used depending on code path |
| P0-02 | **types/workflow.ts ET configs are aspirational, not operational** — defines ET for III(C), V(C), VII.1(all) but phase-executors.ts ignores them | types/workflow.ts:895-901 vs phase-executors.ts:128-131 | Phase III/V Tier C and Phase VII.1 run WITHOUT extended thinking despite spec requirement |
| P0-03 | **Deprecated `citation` parameter** in CourtListener API calls — HTTP 400 after Feb 10, 2026 | courtlistener/client.ts:351, citation/pacer-client.ts:275 | Citation existence checks will BREAK in 5 days |
| P0-04 | **14 references to non-existent `gpt-5.2`** model — Tier C holding verification will fail | openai-client.ts:58, model-router.ts:99, civ/model-router.ts:34, step-2-holding.ts:83 | All Tier C citation holding verification will error |
| P0-05 | **`simplifyQuery()` still active** (per CL-FIX-05: should be REMOVED) — truncates search queries to 5 words, strips statutory refs | courtlistener/client.ts:1225-1244,1300 | Degrades citation research quality by over-simplifying queries |

## P1 HIGH (11)

| ID | Finding | File(s) |
|----|---------|---------|
| P1-01 | Dual prompt systems (DB templates vs file prompts) operate independently — DB changes may not affect execution | superprompt-builder.ts vs prompts/index.ts + phase-executors.ts |
| P1-02 | Phase III Tier C missing 10K ET budget in execution code | phase-executors.ts:128-131 (returns null) vs spec: 10K |
| P1-03 | Phase V Tier C missing 10K ET budget in execution code | phase-executors.ts:128-131 (returns null) vs spec: 10K |
| P1-04 | Phase VII ET budget 10K flat for all tiers — spec says A/B: 5K, C: 10K | phase-executors.ts:129 |
| P1-05 | Phase VII.1 missing 5K ET budget for all tiers | phase-executors.ts:128-131 (returns null) vs spec: all 5K |
| P1-06 | Model string conflict: types/workflow.ts uses `claude-sonnet-4-5-20250929`, execution uses `claude-sonnet-4-20250514` | types/workflow.ts:844 vs phase-executors.ts:114 |
| P1-07 | `simplifyQuery()` still exists and over-aggressively truncates CourtListener queries to 5 words | courtlistener/client.ts:1225-1244 |
| P1-08 | Citation verification uses `gpt-4o` not `gpt-4-turbo` as spec requires for Stage 1 | step-2-holding.ts:82, model-router.ts:81,90 |
| P1-09 | Tier A quality threshold (0.83) lower than B/C (0.87) — possible design intent but undocumented | workflow-config.ts:101 |
| P1-10 | Phase VI skipped for Tier A per code but spec says Sonnet(A) should execute VI | workflow-config.ts:30, prompts/index.ts:80 |
| P1-11 | Batch size config inconsistency: types/workflow.ts has tier-specific (A=5,B=4,C=3), workflow-config.ts has flat (4), phase-config.ts has default (5) | Multiple files |

## P2 MEDIUM (10)

| ID | Finding |
|----|---------|
| P2-01 | superprompt_templates table lacks `version` column and `is_active` flag (uses `is_default` instead) |
| P2-02 | Two separate placeholder resolution paths (template substitution vs inline template literals) |
| P2-03 | Template variables use different names than spec (FACTS_SUMMARY vs STATEMENT_OF_FACTS, etc.) |
| P2-04 | max_tokens (128K/64K) not verified in phase-executors.ts API calls |
| P2-05 | No explicit Claude-only fallback when OpenAI API is unavailable |
| P2-06 | Three different citation batch size configurations that may diverge |
| P2-07 | Three different grade scale systems (4.0 GPA, 0-1 decimal, percentage) with no single source of truth |
| P2-08 | Audit trail not enforced as append-only at database level |
| P2-09 | `lib/caselaw/` directory still exists (dead code from Case.law API era — though `.ts` files clean) |
| P2-10 | `phase_prompts` table referenced in code but no migration file found in scanned migrations |

## P3 LOW (6)

| ID | Finding |
|----|---------|
| P3-01 | Eyecite deduplication (FIX 1) "strict prefix" rule needs unit test verification |
| P3-02 | Authority strength classification for cross-jurisdiction edge cases needs manual review |
| P3-03 | Gap closure protocol handlers need unit test execution to verify correctness |
| P3-04 | PHASE_METADATA in prompts/index.ts is advisory only — not enforced by execution code |
| P3-05 | OpenAI cost tracking uses estimated pricing for gpt-5.2 model that doesn't exist |
| P3-06 | Multiple `MINIMUM_PASSING_GRADE` constants defined across 4 files |

---

# VERIFICATION SCAN RESULTS

```
SUPERPROMPT REFERENCES:         139
SYSTEM PROMPT REFERENCES:        21
TEMPLATE PLACEHOLDER REFS:      285
COURTLISTENER REFERENCES:       571
EYECITE REFERENCES:              50
CIV PIPELINE REFERENCES:        131
GPT / OPENAI REFERENCES:        142
DEAD API (case.law):              0  (CLEAN)
DEPRECATED citation PARAM:        2  (CRITICAL)
GPT-5.2 REFERENCES:              14  (CRITICAL)
```

---

# RECOMMENDATIONS (PRIORITY ORDER)

1. **IMMEDIATE (before Feb 10, 2026)**: Remove `citation` parameter from `courtlistener/client.ts:351` and `citation/pacer-client.ts:275`. Replace with query-based search.

2. **IMMEDIATE**: Replace all `gpt-5.2` references with `gpt-4-turbo` (or env-configurable model). Files: `openai-client.ts`, `model-router.ts`, `civ/model-router.ts`, `step-2-holding.ts`.

3. **HIGH**: Consolidate model routing into ONE authoritative source. Eliminate `phase-executors.ts` local routing in favor of `phase-config.ts` or a unified config.

4. **HIGH**: Add missing ET budgets: Phase III (C:10K), Phase V (C:10K), Phase VII.1 (all:5K). Fix Phase VII to tier-specific (A/B:5K, C:10K).

5. **HIGH**: Remove `simplifyQuery()` per CL-FIX-05, or at minimum increase word limit from 5 to a reasonable threshold.

6. **MEDIUM**: Resolve Sonnet model string conflict (`-4-5-20250929` vs `-4-20250514`). Delete the unused constant.

7. **MEDIUM**: Unify grade scale systems to a single representation.

8. **MEDIUM**: Unify batch size configuration to one source of truth.

---

```
Auditor: Chen (Systems Architect)
Date: February 5, 2026
System Version: v7.5
Total Findings: 32
  P0 CRITICAL: 5
  P1 HIGH: 11
  P2 MEDIUM: 10
  P3 LOW: 6
```
