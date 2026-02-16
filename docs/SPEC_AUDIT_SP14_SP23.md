# CHEN SPEC AUDIT — Sp 14-23 — COMPLETE

```
═══════════════════════════════════════════════════════════════════════════
CHEN SPEC AUDIT — Sp 14-23 — COMPLETE
═══════════════════════════════════════════════════════════════════════════

AUDIT DATE: 2026-02-16
SPECS AUDITED: 10 (Sp 14-23)
TOTAL FILES SCANNED: ~400+ TypeScript/TSX files
TYPESCRIPT ERRORS (pre-fix): 4 | (post-fix): 0 ✅

═══════════════════════════════════════════════════════════════════════════
```

## SPEC COMPLIANCE SUMMARY

| Spec | Name | Status | Features OK | Issues |
|------|------|--------|-------------|--------|
| Sp14 | Emergency Remediation Migrations | ⚠️ | 17/18 | 2 |
| Sp15 | Binding Decisions r2v2 | ⚠️ | 3/4 | 1 |
| Sp16 | D6 Directives Phases 0-2 | ⚠️ | 3/4 | 1 |
| Sp17 | D6 Phases 3-7 | ✅ | 6/6 | 0 |
| Sp18 | Citation Pipeline Wiring | ✅ | 4/4 | 0 |
| Sp19 | Citation Stress Test | ⚠️ | 5/5 created | 5 unwired |
| Sp20 | D5 Checkpoint Groups 1-3 | ✅ | 5/5 | 0 |
| Sp21 | D5 Checkpoint Groups 4-5 | ⚠️ | 13/14 | 1 |
| Sp22 | D5 Hold Stress Test | ⚠️ | 18/19 | 1 |
| Sp23 | D8 Delivery r6 | ❌ N/A | — | See note |

### Sp-23 Note
**SP-23 does not exist as a standalone spec.** The delivery functionality labeled
"D8 Delivery r6" was distributed across SP-16 (schema), SP-17 (download/upload/archive),
SP-18 (citation wiring into deliverables), and SP-20/22 (checkpoint integration). All
delivery code is present and functional. Commit `8d6a65a` is the SP-22 merge commit,
not a separate SP-23.

---

## SPEC-BY-SPEC DETAILED FINDINGS

### Sp 14: Emergency Remediation Migrations

**Commit:** `b53afef`
**Files created:** 18 SQL migrations + PREFLIGHT_DIAGNOSTIC.sql + POSTDEPLOY_VERIFICATION.sql + CODEBASE_CHANGES_CHECKLIST.md

**Features:**
- [✅] S-001: Privilege escalation RLS fix on profiles
- [✅] MW-002: Tier D enum addition
- [✅] MW-001/P10-001: motion_types tier corrections
- [⚠️] SPD-001: `amount_paid` → `amount_paid_cents` rename (DB done, **code not fully updated**)
- [✅] IX1-001/GAP-002: Phantom table reference removal
- [✅] CM-002: user_roles → profiles.role migration
- [✅] GAP-001: phase_prompts schema completion
- [✅] DUP-001: citation_banks schema fixes
- [✅] CC-001: conflict_checks rebuild
- [✅] PRE-001: ai_usage_logs FK fix
- [✅] ST-002: California jurisdiction seed
- [✅] DR-002: HOLD auto-refund 14-day trigger
- [✅] WCT-001: Retention period conflict fix
- [✅] V72-002: Dead service_role RLS removal
- [✅] GAP-003/ST-003: search_path fix on SECURITY DEFINER
- [✅] CM-003: orders.status constraint reconciliation
- [✅] DR-001: anonymized_analytics schema completion

**Issues:**
1. **P1 — Code not updated for `amount_paid_cents` column rename.** `lib/inngest/workflow-orchestration.ts` (~line 1625, 1631) and `lib/payments/tier-upgrade.ts` still reference `amount_paid` in some queries.
2. **P2 — Duplicate migration timestamps.** Multiple pairs share the same prefix (`20260216000001`, `20260216000002`, `20260216200001`, `20260216400001`). Supabase migration ordering depends on filename sort — collisions may cause non-deterministic execution order.

---

### Sp 15: Binding Decisions r2v2

**Commit:** `5462f5a`
**Files modified:** 3 (phase-registry.ts, phase-executors.ts, workflow-orchestration.ts)

**Features:**
- [✅] ING-015R: Phase VII threshold migrated from GPA (3.0/3.3) to percentage (83/87)
- [✅] ING-017: Model routing throws instead of silent Sonnet fallback
- [✅] ING-CP3T: Two-function split verified (Fn1 + Fn2)
- [⚠️] ING-011R: Citation pipeline wired, but **Phase IV still uses `passes_threshold` boolean**

**Issues:**
1. **P1 — Phase IV `passes_threshold` not migrated.** `lib/workflow/phase-iv/multi-step-executor.ts` and `parallel-search.ts` still use boolean `passes_threshold` for control flow instead of percentage-scale comparison per ING-015R binding decision.

**Dead Code:**
- `gpaToPercentage()` in phase-executors.ts and `gpaToPercentageScore()` in workflow-orchestration.ts — functionally overlapping but used in different contexts. Consolidation recommended.

---

### Sp 16: D6 Directives Phases 0-2

**Commit:** `aa82ad2`
**Files created:** 4 (jurisdiction/registry.ts, 3 migrations)
**Files modified:** 1 (doc-gen-bridge.ts)

**Features:**
- [✅] ST-038: Jurisdiction registry (5 jurisdictions, LA+CA enabled)
- [✅] ST-052/053/033: Missing columns migration (cancellation_reason, refund_amount_cents, resume_phase, delivery stage/status_version)
- [✅] ST-013/032: Definitive 14-status constraint with APPROVAL_TIMEOUT
- [⚠️] ST-049: order_deliverables table created, but **`validateAttorneyProfile()` not integrated**

**Issues:**
1. **P2 — `validateAttorneyProfile()` exported in `doc-gen-bridge.ts` but never called anywhere.** Intended for Phase IX/X jurisdiction validation but not wired into the generation pipeline.

---

### Sp 17: D6 Phases 3-7

**Commit:** `b237518`
**Files created:** 6 (uploads route, orphan-sweep, archive-service, scripts)
**Files modified:** 3 (download route, inngest route, supabase admin)

**Features:**
- [✅] Phase 3: Client upload endpoint with path traversal prevention
- [✅] Phase 4: Download proxy with signed URLs and status-dependent expiry
- [✅] Phase 5: Dead code cleanup script
- [✅] Phase 6: Archive service (copy-then-delete) + orphan sweep cron
- [✅] Phase 7: Storage migration script
- [✅] Inngest registration of orphanSweepCron

**Issues:** None.

---

### Sp 18: Citation Pipeline Wiring

**Commit:** `3cedf95`
**Files deleted:** 1 (lib/workflow/citation-verifier.ts re-export shim)
**Files modified:** 5

**Features:**
- [✅] Prefetch wiring: V.1 and VII.1 get pre-fetched CourtListener results (66% API reduction)
- [✅] Confidence bug fix: `confidence` → `confidenceScore` field name corrected
- [✅] Hardcoded VERIFIED eliminated: Protocol dispatcher now derives status from phase output
- [✅] Dead shim removed: citation-verifier.ts re-export deleted, 4 importers redirected

**Issues:** None.

---

### Sp 19: Citation Stress Test Hardening

**Commit:** `39c6ea4`
**Files created:** 5 TS modules + 1 SQL migration

**Features (all created but NOT WIRED):**
- [⚠️] `tenant-isolation.ts` — `validateCitationOwnership()` exported, **never imported**
- [⚠️] `protocol-orchestrator.ts` — `runProtocolChecks()` exported, **never imported**
- [⚠️] `flag-compiler.ts` — `compileFlags()` exported, **never imported**
- [⚠️] `circuit-breaker.ts` (citation-specific) — exported, **never imported**
- [⚠️] `retry-with-backoff.ts` — exported, **never imported** (overlaps `lib/utils/retry.ts`)
- [✅] citation_rls_hardening.sql — Admin policy added to citation_banks

**Issues:**
1. **P1 — All 5 SP-19 TypeScript modules are dead code.** Created as foundational code for future integration but no spec has wired them. The circuit-breaker and retry-with-backoff also duplicate existing modules (`lib/circuit-breaker.ts`, `lib/utils/retry.ts`).

---

### Sp 20: D5 Checkpoint Groups 1-3

**Commit:** `6d6c05d`
**Files created:** 2 (checkpoint-events.ts types, checkpoint_events migration)
**Files modified:** 3 (event-schemas.ts, client.ts, workflow-orchestration.ts)

**Features:**
- [✅] `checkpoint_events` table with RLS and 365-day retention
- [✅] `CP3ApprovalEvent` shared type with 6 fields
- [✅] CP1 emission after Phase I (non-blocking)
- [✅] CP2 emission after Phase V (non-blocking)
- [✅] `emitDurableEvent()` helper with retry + DB persistence

**Issues:** None.

---

### Sp 21: D5 Checkpoint Groups 4-5

**Commit:** `1fa702e`
**Files created:** 6 (5 email templates + checkpoint-recovery.ts)
**Files modified:** 8

**Features:**
- [✅] CP3 rate limiting (`slidingWindow(5, '1 m')` on approve/cancel/request-changes)
- [✅] 5 email templates (attorney-package-ready, cancellation, cp3-reminder, timeout-escalation, delivery-complete)
- [✅] Protocol 10 guard in CP3Actions component
- [✅] Checkpoint recovery cron (every 6h, max 10 orders)
- [✅] 48h + 14d reminder functions
- [⚠️] `buildReminderHtml()` and `buildEscalationHtml()` in cp3-reminders.ts — **dead code, never called**

**Issues:**
1. **P3 — Dead helper functions** in `lib/email/cp3-reminders.ts`. `buildReminderHtml()` and `buildEscalationHtml()` defined but replaced with inline HTML strings. Should be removed.

---

### Sp 22: D5 Hold Stress Test

**Commit:** `ec99f83`
**Files created:** 8 (hold-event-schema, resume-handler, checkpoint-timeout, 4 Inngest functions, admin API)
**Files modified:** 10

**Features:**
- [✅] HoldReason discriminated union (4 canonical reasons)
- [✅] HOLD_RESUME_MAP → getResumePhase() for phase routing
- [✅] Idempotent handleHoldTimeout() with $0 guard
- [✅] 7-day terminal action with branching logic (evidence_gap auto-cancel, others escalate)
- [✅] Fn1 `checkAndWaitForHold()` at 4 sites (Phase III, V.1, revision loop, VII.1)
- [✅] 24h reminder + 72h escalation + 9d recovery cron
- [✅] Admin hold-resolve API (RESUME/CANCEL/ESCALATE)
- [✅] HoldResolutionPanel UI component
- [✅] Admin orders page HOLD tab
- [✅] Inngest event schemas + function registration
- [⚠️] `buildHoldEventPayload()` marked as "MUST use" but **not actually used by any emitter**

**Issues:**
1. **P2 — `buildHoldEventPayload()` bypass.** The function is documented as mandatory for canonical payload shape, but hold event emission in checkpoint-timeout.ts and hold-7d-terminal-action.ts constructs payloads directly, bypassing it. This creates risk of payload shape drift.

---

## DUPLICATE IMPLEMENTATIONS FOUND

### Functions (6 duplicated)

| Function | Count | Canonical Location | Dead Copies |
|----------|-------|--------------------|-------------|
| `normalizePartyName` | 4 | `lib/conflicts/normalize.ts` | `lib/utils.ts`, `lib/automation/claude.ts`, `lib/services/conflict/party-normalizer.ts` |
| `normalizeCitation` | 3 | `lib/workflow/citation-deduplicator.ts` | `lib/citation/civ/database.ts`, `lib/citation/steps/step-1-existence.ts` |
| `getRateLimitStatus` | 3 | N/A (3 distinct systems) | None — naming collision |
| `getCitationBatchSize` | 3 | `lib/config/workflow-config.ts` | `lib/services/citations/batch-processor.ts`, `lib/services/citations/eyecite-service.ts` |
| `deduplicateCitations` | 3 | `lib/civ/deduplication.ts` | `lib/citation/deduplication.ts` (deprecated), `lib/workflow/citation-deduplicator.ts` (complementary) |
| `calculateSimilarity` | 3 | `lib/citation/steps/step-4-quotes.ts` | `lib/automation/claude.ts`, `lib/services/conflict/party-normalizer.ts` |

### Types (3 critically duplicated)

| Type | Count | Canonical | Critical Issues |
|------|-------|-----------|-----------------|
| `MotionTier` | 8 | `types/workflow.ts` | `config/motion-types.ts` uses `'tierA'` keys instead of `'A'` — **type mismatch** |
| `OrderStatus` | 5 | `lib/config/status-transitions.ts` | Old models use snake_case (13 members) vs new SCREAMING_CASE (16 members). `lib/types/shared-interfaces.ts` uses `REVISION_REQUESTED` instead of canonical `REVISION_REQ` |
| `CheckpointType` | 4 | `types/workflow.ts` | `lib/realtime/workflow-subscription.ts` **missing HOLD** — only has CP1/CP2/CP3. `lib/workflow/checkpoint-types.ts` uses enum instead of type alias |

---

## CONFLICTS DETECTED

| Conflict | Files | Severity | Description |
|----------|-------|----------|-------------|
| MotionTier key mismatch | `config/motion-types.ts` vs `types/workflow.ts` | P1 | `'tierA'` vs `'A'` — incompatible union members |
| OrderStatus member mismatch | `lib/types/shared-interfaces.ts` vs `lib/config/status-transitions.ts` | P1 | `REVISION_REQUESTED` vs `REVISION_REQ` |
| CheckpointType missing HOLD | `lib/realtime/workflow-subscription.ts` | P1 | Missing `'HOLD'` member — will fail to handle HOLD checkpoint subscriptions |
| normalizePartyName signature | `lib/conflicts/normalize.ts` vs 3 others | P2 | Returns `NormalizedParty` object vs `string` |
| normalizeCitation signature | `lib/workflow/citation-deduplicator.ts` vs 2 others | P2 | Returns `{ normalized, hasFormatWarning }` object vs `string` |

---

## DEAD CODE INTRODUCED

| File | Export | Spec | Status |
|------|--------|------|--------|
| `lib/citation/security/tenant-isolation.ts` | `validateCitationOwnership()`, `scopeCitationQuery()` | SP-19 | Never imported |
| `lib/citation/protocols/protocol-orchestrator.ts` | `runProtocolChecks()` | SP-19 | Never imported |
| `lib/citation/flag-compiler.ts` | `compileFlags()` | SP-19 | Never imported |
| `lib/citation/resilience/circuit-breaker.ts` | `getCircuitState()`, etc. | SP-19 | Never imported (duplicates `lib/circuit-breaker.ts`) |
| `lib/citation/resilience/retry-with-backoff.ts` | `retryWithBackoff()` | SP-19 | Never imported (duplicates `lib/utils/retry.ts`) |
| `lib/email/cp3-reminders.ts` | `buildReminderHtml()`, `buildEscalationHtml()` | SP-21 | Defined but never called |
| `lib/workflow/hold-event-schema.ts` | `buildHoldEventPayload()` | SP-22 | Documented as mandatory but bypassed by all emitters |
| `lib/integration/doc-gen-bridge.ts` | `validateAttorneyProfile()` | SP-16 | Exported but never called |
| `lib/citation/deduplication.ts` | All exports | Pre-SP-19 | Marked deprecated, `lib/civ/deduplication.ts` is canonical |

---

## REGRESSIONS FOUND

| Issue | Spec | File | Description |
|-------|------|------|-------------|
| **FIXED** | SP-20 | `workflow-orchestration.ts:278` | `.catch()` on PostgrestFilterBuilder — replaced with `{ error }` destructuring |
| **FIXED** | SP-22 | `checkpoint-timeout.ts:120` | Missing `Stripe` namespace — added type import |
| **FIXED** | SP-22 | `hold-7d-terminal-action.ts:133` | `undefined` not in type union — added `undefined` |
| **FIXED** | SP-22 | `event-schemas.ts:79` | `z.record()` Zod v4 requires 2 args — added `z.string()` key schema |

---

## AGENT VERIFICATION RESULTS

### Agent 1 (Spec Compliance): 74/79 features verified
- SP-14: 17/18 (amount_paid code migration incomplete)
- SP-15: 3/4 (Phase IV passes_threshold not migrated)
- SP-16: 3/4 (validateAttorneyProfile unwired)
- SP-17: 6/6
- SP-18: 4/4
- SP-19: 5/5 created, 0/5 wired
- SP-20: 5/5
- SP-21: 13/14 (dead HTML builders)
- SP-22: 18/19 (buildHoldEventPayload bypassed)
- SP-23: N/A (not a standalone spec)

### Agent 2 (Red Team): 7 findings
- **P1**: Phase IV `passes_threshold` boolean can be spoofed by LLM
- **P1**: CheckpointType missing HOLD → realtime subscription won't show HOLD events
- **P2**: 361 `console.log` statements in production (85 in workflow-orchestration.ts alone)
- **P2**: 4 `as any` type assertions in production code
- **P2**: `buildHoldEventPayload()` bypass → payload shape could drift
- **P3**: Recovery crons (SP-21 + SP-22) both fire at `*/6h` — thundering herd risk
- **P3**: 20 empty/silent catch blocks (mostly intentional JSON parse fallbacks)

### Agent 3 (Consistency): 8 cross-reference issues
- MotionTier: 8 definitions, 1 incompatible (`'tierA'` vs `'A'`)
- OrderStatus: 5 definitions, 2 incompatible (snake_case vs SCREAMING_CASE, REVISION_REQUESTED vs REVISION_REQ)
- CheckpointType: 4 definitions, 1 missing HOLD, 1 enum vs type
- normalizePartyName: 4 definitions, incompatible return types
- normalizeCitation: 3 definitions, incompatible return types
- getCitationBatchSize: 3 identical copies (consolidation needed)
- getRateLimitStatus: 3 different systems with same name (naming collision)
- calculateSimilarity: 3 copies across different domains

### Agent 4 (Regression):
- TypeScript: ✅ 0 errors (4 fixed in this audit)
- Build: ❌ Cannot verify (Vercel build requires full env vars)
- Tests: N/A (E2E only, requires running server)

### Agent 5 (Documentation):
- 22 TODO/FIXME/HACK comments remaining
- 5 in production code (2 blocking: unpublished-handler searchCitations, cp3-timeout stub)
- SP-14 has PREFLIGHT/POSTDEPLOY verification SQL ✅
- SP-22 has comprehensive JSDoc on all exported functions ✅
- Commit messages are clear and reference spec numbers ✅

---

## PRIORITY REMEDIATION LIST

### P0 (BLOCKER — fixed in this audit):
1. ~~`checkpoint-timeout.ts:120` — `Stripe` namespace missing~~ → Added `import type Stripe from 'stripe'` ✅
2. ~~`hold-7d-terminal-action.ts:133` — `undefined` not in cast union~~ → Added `| undefined` ✅
3. ~~`event-schemas.ts:79` — `z.record()` Zod v4 arity~~ → Changed to `z.record(z.string(), z.unknown())` ✅
4. ~~`workflow-orchestration.ts:278` — `.catch()` on PostgREST builder~~ → Replaced with `{ error }` pattern ✅

### P1 (HIGH — fix within 24 hours):
1. **CheckpointType missing HOLD** → `lib/realtime/workflow-subscription.ts:19` — Add `'HOLD'` to union
2. **OrderStatus `REVISION_REQUESTED` vs `REVISION_REQ`** → `lib/types/shared-interfaces.ts:138` — Change to `REVISION_REQ`
3. **Phase IV `passes_threshold` boolean** → `lib/workflow/phase-iv/multi-step-executor.ts`, `parallel-search.ts` — Migrate to percentage comparison
4. **MotionTier `'tierA'` mismatch** → `config/motion-types.ts:119` — Fix key derivation or add mapping
5. **SP-19 dead code** → Wire `tenant-isolation.ts`, `protocol-orchestrator.ts`, `flag-compiler.ts` into citation pipeline, or remove

### P2 (MEDIUM — fix within 72 hours):
1. **`amount_paid_cents` code migration** → Update workflow-orchestration.ts and tier-upgrade.ts queries
2. **Consolidate `normalizePartyName`** → Keep `lib/conflicts/normalize.ts`, remove 3 duplicates
3. **Consolidate `normalizeCitation`** → Merge step-1-existence patterns into citation-deduplicator
4. **Consolidate `getCitationBatchSize`** → Remove from batch-processor.ts and eyecite-service.ts
5. **`buildHoldEventPayload()` bypass** → Wire into hold event emitters or remove
6. **`validateAttorneyProfile()` unwired** → Integrate into Phase IX/X or remove
7. **Migrate `console.log` to structured logger** → Priority: workflow-orchestration.ts (85 instances)
8. **Delete deprecated `lib/citation/deduplication.ts`** → lib/civ/ is canonical

### P3 (LOW — fix when convenient):
1. **Rename `getRateLimitStatus`** to disambiguate (3 different systems)
2. **Delete dead HTML builders** in cp3-reminders.ts
3. **Convert CheckpointType enum** in checkpoint-types.ts to type alias for consistency
4. **Stagger recovery crons** (SP-21 vs SP-22 both `*/6h`) to avoid thundering herd
5. **Standardize MotionTier imports** → All should import from `types/workflow.ts`
6. **Remove duplicate migration timestamp prefixes** in SP-14 migrations
7. **Address remaining 22 TODO/FIXME comments**
8. **Review 4 production `as any` casts** for proper typing

---

## FINAL SCORES

```
TypeScript: ✅ 0 errors (4 fixed)
Build: ⚠️ (env-dependent, cannot verify in audit environment)
Tests: ⚠️ (E2E only, requires running server)

OVERALL AUDIT SCORE: 72/100

Breakdown:
  Spec compliance:    15/20 (74/79 features, 5 unwired SP-19 modules)
  Type safety:        14/20 (4 TS errors fixed, 8 duplicate type defs remain)
  Code quality:       12/20 (361 console.log, 22 TODOs, 4 as any)
  Integration:        16/20 (cross-spec wiring solid except CheckpointType/OrderStatus)
  Dead code:          15/20 (9 dead exports, 1 deprecated file, 2 dead helpers)
```

```
═══════════════════════════════════════════════════════════════════════════
```
