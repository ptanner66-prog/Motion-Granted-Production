# Motion Granted — Full-Scale Production Audit

**Date:** February 5, 2026
**Auditor Perspective:** Senior Developer, Legal Tech
**Scope:** Security, Workflow Engine, Code Quality, Testing, Payments, Performance, DevOps, Compliance

---

## OVERALL GRADE: 52 / 100

> This application has strong architectural bones — well-chosen stack, thoughtful phase-based workflow design, proper RLS, solid compliance scaffolding. But it has **critical gaps in payment plumbing, test coverage, type safety, and CI/CD** that make it unfit for production in its current state. The issues are all fixable, and many are straightforward. Below is every finding and the roadmap to 100.

---

## GRADE BREAKDOWN BY CATEGORY

| Category | Score | Weight | Weighted |
|---|---|---|---|
| **Security** | 62/100 | 20% | 12.4 |
| **Workflow Engine Integrity** | 48/100 | 20% | 9.6 |
| **Payment System** | 35/100 | 15% | 5.25 |
| **Testing & QA** | 18/100 | 15% | 2.7 |
| **Code Quality & Type Safety** | 42/100 | 10% | 4.2 |
| **Performance & Scalability** | 68/100 | 8% | 5.44 |
| **DevOps & CI/CD** | 25/100 | 7% | 1.75 |
| **Compliance & Data Handling** | 78/100 | 5% | 3.9 |
| | | **TOTAL** | **~52** |

---

## 1. SECURITY AUDIT — 62/100

### What's Working
- Stripe webhook signature verification is properly implemented
- Admin routes enforce role checks consistently
- File upload has multi-layer validation (MIME, extension, double-extension)
- Payment amount verification protects against underpayment
- Webhook idempotency via database-level upsert
- CRON_SECRET uses constant-time comparison (timing-safe)
- Security headers are comprehensive (HSTS, CSP, Referrer-Policy, Permissions-Policy)

### Critical Findings

**[CRITICAL] Rate Limiting Bypass via IP Spoofing — `middleware.ts:103-105`**
The middleware extracts client IP from the `x-forwarded-for` header without validation and uses it as the sole identifier for rate limiting. An attacker can spoof this header to get unlimited requests, bypassing the 100 req/min API limit, 5 req/min generation limit, and 10 req/min auth limit.

```typescript
// Current — trivially spoofable
const clientId = request.headers.get('x-forwarded-for')?.split(',')[0] ||
  request.headers.get('x-real-ip') || 'unknown';
```

**Fix:** On Vercel, use the platform-injected `x-vercel-forwarded-for` or `request.ip` which cannot be spoofed by the client.

**[CRITICAL] Unauthenticated System Info Disclosure — `app/api/health/deep/route.ts`**
The `/api/health/deep` endpoint requires NO authentication and returns the status of every external integration (Supabase, Anthropic, OpenAI, CourtListener, Stripe, Resend, Storage, Queue). This is a reconnaissance goldmine.

**Fix:** Gate behind admin auth or require a secret header.

**[HIGH] Permissive CSP — `middleware.ts:198-199`**
CSP includes `'unsafe-inline'` AND `'unsafe-eval'` for scripts, which effectively neutralizes XSS protection.

**Fix:** Use nonce-based CSP. Next.js supports `nonce` in `<Script>` tags.

**[MEDIUM] Encryption Key Fallback — `lib/api-keys.ts:26`**
If `ENCRYPTION_SECRET` is unset, falls back to `SUPABASE_SERVICE_ROLE_KEY` for encrypting API keys at rest. This is key reuse across security domains.

**Fix:** Make `ENCRYPTION_SECRET` mandatory and fail startup without it.

**[MEDIUM] X-Frame-Options Conflict — `middleware.ts:213` vs `next.config.ts:31`**
middleware.ts sets `X-Frame-Options: DENY` while next.config.ts sets `SAMEORIGIN`. Middleware wins, but the inconsistency signals unclear security intent.

**Fix:** Pick one (DENY is correct for this app) and remove the other.

---

## 2. WORKFLOW ENGINE INTEGRITY — 48/100

### What's Working
- 14-phase architecture is well-designed with clear separation of concerns
- Checkpoint system (HOLD, NOTIFICATION, BLOCKING) is architecturally sound
- Model routing by tier (Sonnet for A, Opus for B/C) is correctly configured
- Extended thinking is targeted at the right phases (VI, VII, VIII, X)

### Critical Findings

**[CRITICAL] Quality Gate Bypass — `lib/workflow/phase-config.ts:257`**
The `getNextPhase()` function defaults `gradePasses` to `true` when undefined. If the calling code doesn't explicitly pass a grade result, Phase VII always proceeds to VIII.5 (success path), silently skipping the revision loop.

```typescript
const passes = options.gradePasses ?? true; // Undefined = passes!
```

**Fix:** Change default to `false` or make the parameter required.

**[CRITICAL] Race Condition in Checkpoint Responses — `lib/workflow/checkpoint-service.ts:404-410`**
Revision count and free-revision tracking are read and incremented without transactional safety. Two concurrent admin responses can both read count=0, both increment to 1, causing lost updates.

**Fix:** Use Supabase RPC with `UPDATE ... SET revision_count = revision_count + 1 RETURNING *` for atomic increment.

**[CRITICAL] HOLD Checkpoint Not Phase-Locked — `lib/workflow/checkpoint-service.ts:872`**
`processHoldResponse()` checks `checkpoint_pending === 'HOLD'` but never validates `current_phase === 'III'`. If the workflow somehow advanced past Phase III (e.g., via a bug or race condition), a stale HOLD response could still be processed.

**Fix:** Add `AND current_phase = 'III'` to the checkpoint validation.

**[HIGH] Duplicate Model Router — `lib/workflow/phase-executors.ts:112-124`**
A second hardcoded `getModelForPhase()` exists in phase-executors.ts that duplicates the logic in phase-config.ts. If one is updated and the other isn't, phases could use wrong models.

**Fix:** Delete the duplicate and import from the single source of truth.

**[HIGH] Citation Verifier Counts API Errors as Passes — `lib/workflow/citation-verifier.ts:514`**
Citations with verification status `api_error` are counted toward the minimum 4-citation requirement. A CourtListener outage could result in motions with zero actually-verified citations passing the gate.

**Fix:** Only count citations with status `verified` or `valid` toward minimums.

**[HIGH] Empty Phase Completion Requirements — `lib/workflow/phase-gates.ts:76-90`**
`PHASE_COMPLETION_REQUIREMENTS` is an empty array for ALL 14 phases. Any phase can be marked complete with zero outputs.

```typescript
export const PHASE_COMPLETION_REQUIREMENTS: Record<PhaseId, string[]> = {
  'I': [],   // No required output
  'II': [],  // No required output
  // ... every single phase is empty
};
```

**Fix:** Define minimum output requirements per phase (e.g., Phase V must produce `draft_text`, Phase IX must produce `supporting_documents`).

**[HIGH] Infinite Loop Risk — `lib/workflow/workflow-engine.ts:2610`**
The `executeWorkflowLoop()` while-loop increments `current_phase` by 1 as fallback if the phase executor doesn't set it. If a phase returns without updating state, the loop can get stuck or skip phases.

**Fix:** Add an iteration counter with a hard limit (e.g., 50), and fail the workflow if exceeded.

**[MEDIUM] Document Parsing Failure Silently Ignored — `lib/inngest/functions.ts:193-196`**
When document parsing fails, the workflow proceeds with "proceed without parsed content." A motion could be generated without any of the client's uploaded evidence.

**Fix:** Fail the workflow or trigger a HOLD checkpoint when document parsing fails.

---

## 3. PAYMENT SYSTEM — 35/100

### What's Working
- Stripe webhook signature verification is correct
- Payment amount validation exists (checks amount >= expected)
- Idempotency via database upsert
- Pricing tiers and rush multipliers are clearly defined

### Critical Findings

**[CRITICAL] Broken Payment-to-Order Linking — `app/api/orders/route.ts:98-107`**
PaymentIntent is created with only `motion_type` in metadata — `order_id` is never set because the order is created AFTER the PaymentIntent. The webhook handler at `app/api/webhooks/stripe/route.ts:250` expects `paymentIntent.metadata.order_id` but it's undefined. The webhook returns early silently, leaving orders stuck in `submitted` status forever after payment.

**This is the single most critical bug in the codebase. Paid orders will never trigger workflow generation.**

**Fix:** Either (a) create the order first, then create PaymentIntent with the order_id, or (b) look up the order by `stripe_payment_intent_id` in the webhook instead of relying on metadata.

**[HIGH] Refund Silent Failure — `lib/payments/refund-service.ts:171-191`**
When Stripe is not initialized, refunds are marked as `pending` but no queue or retry exists. The customer receives a refund confirmation email with the amount even though Stripe never processed it.

**Fix:** Don't send confirmation email until Stripe confirms the refund. Add a retry queue for pending refunds.

**[HIGH] Auto-Generation Gated by Env Var — `app/api/webhooks/stripe/route.ts:345-355`**
Workflow generation after payment depends on `ENABLE_AUTO_GENERATION` env var. If unset (the default), orders sit idle after payment. There's a fallback to an `automation_tasks` table but no monitoring that it's being processed.

**Fix:** Ensure this is set in production. Add monitoring/alerting for orders stuck in `paid` status > 5 minutes.

**[MEDIUM] Rush Multiplier Not Validated Server-Side — `config/motion-types.ts:128-131`**
Price is calculated as `basePrice * rushMultiplier` but the multiplier comes from client state. The server only validates that the final amount paid is >= expected, but doesn't independently verify which rush tier was selected.

**Fix:** Validate rush tier selection against the config server-side during order creation.

---

## 4. TESTING & QA — 18/100

### What Exists
- 4 Playwright E2E spec files covering auth, admin dashboard, order creation (smoke only), API health
- 2 integration test files using Vitest (`__tests__/integration/`, `__tests__/citations/`)
- Playwright config is solid (multi-browser, mobile, parallel, CI retries)
- Auth setup in `global.setup.ts` is well-implemented

### Critical Findings

**[CRITICAL] Zero Unit Tests**
There is no unit test framework in `package.json`. The Vitest-based tests in `__tests__/` **cannot run** because Vitest is not a dependency. The core business logic — 14 workflow phases, citation verification, payment processing, PDF generation — has 0% test coverage.

**[CRITICAL] No CI/CD Pipeline**
No `.github/workflows/` directory. No automated testing on PRs. No linting gates. No build verification. Code can be merged to main without any automated checks.

**[CRITICAL] No Pre-Commit Hooks**
No husky, lint-staged, or any pre-commit configuration. Developers can commit and push code that doesn't compile.

**[HIGH] E2E Tests Don't Cover Core Business Logic**
The existing E2E tests verify pages load and basic navigation. They do NOT test:
- Stripe payment flow end-to-end
- Workflow phase execution
- Citation verification
- PDF generation
- Admin checkpoint approval/rejection
- Revision request flow
- Email notification delivery
- Rate limiting behavior
- File upload/download

**Top 15 Functions Needing Unit Tests (Priority Order):**

| # | File | Lines | Why |
|---|---|---|---|
| 1 | `lib/workflow/phase-executors.ts` | 3674 | Core phase execution — ALL motion generation |
| 2 | `lib/workflow/workflow-engine.ts` | 2650 | State machine orchestrator |
| 3 | `lib/workflow/checkpoint-service.ts` | 1033 | Admin approval — legal/financial compliance |
| 4 | `lib/workflow/citation-verifier.ts` | 789 | Citation accuracy — core differentiator |
| 5 | `app/api/webhooks/stripe/route.ts` | ~400 | Payment webhook — revenue flow |
| 6 | `lib/workflow/superprompt.ts` | 966 | AI prompt construction |
| 7 | `lib/workflow/pdf-generator.ts` | 1194 | Final deliverable — what clients receive |
| 8 | `lib/workflow/quality-validator.ts` | 619 | Quality gate before release |
| 9 | `lib/workflow/revision-handler.ts` | 411 | Revision credits & re-generation |
| 10 | `lib/workflow/phase-config.ts` | 346 | Phase transition logic (getNextPhase) |
| 11 | `config/motion-types.ts` | ~130 | Pricing calculations |
| 12 | `lib/services/conflict/conflict-check-service.ts` | ~200 | Conflict of interest detection |
| 13 | `lib/courtlistener/client.ts` | ~400 | External API integration |
| 14 | `lib/payments/refund-service.ts` | ~200 | Refund processing |
| 15 | `lib/workflow/phase-gates.ts` | ~320 | Phase entry validation |

---

## 5. CODE QUALITY & TYPE SAFETY — 42/100

### What's Working
- TypeScript strict mode enabled
- Path alias (`@/`) used consistently
- Zod v4 for API input validation
- Component organization is logical

### Critical Findings

**[CRITICAL] 823 `as any` Type Assertions Across 105 Files**
This is an extreme level of type safety circumvention. The worst offenders:
- `lib/workflow/phase-executors.ts` — 186 occurrences
- `lib/inngest/workflow-orchestration.ts` — 85 occurrences
- `lib/workflow/phase-iv/multi-step-executor.ts` — 57 occurrences
- `lib/workflow/phase-iv/parallel-search.ts` — 32 occurrences

These are the core business logic files. TypeScript's type system is effectively disabled where it matters most.

**[HIGH] 150+ `console.log` Statements in Production Code**
Production code is littered with debug logging that should use the structured logger:
- `lib/workflow/phase-executors.ts` — 186 calls
- `lib/inngest/workflow-orchestration.ts` — 85 calls
- `lib/courtlistener/client.ts` — 73 calls

These leak to client-side console and clutter server logs with unstructured output.

**[HIGH] Minimal ESLint Configuration — `eslint.config.mjs`**
Only uses `next/core-web-vitals` and `next/typescript` defaults. Missing:
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-floating-promises`
- `no-console` (or a custom rule directing to the logger)
- Import ordering rules
- Complexity limits

**[MEDIUM] Duplicate Realtime Hooks**
`hooks/use-workflow-realtime.ts` (v6.3, subscription-based) and `hooks/useWorkflowRealtime.ts` (v7.2, phase-based) both exist. Both export as default. Import confusion is likely.

**[MEDIUM] `@ts-ignore` in Core Pipeline — `lib/workflow/phases/phase-ii.ts`**
Only 1 instance, but it's in the motion drafting pipeline.

---

## 6. PERFORMANCE & SCALABILITY — 68/100

### What's Working
- Redis caching is well-implemented (TTL, tag invalidation, pipeline ops, graceful fallback)
- Supabase queries use column projection (`.select('id, order_number')` not `*`)
- Vercel function timeouts properly configured (300s for workflow, 120s for documents)
- Real-time subscriptions via Supabase Realtime

### Findings

**[MEDIUM] In-Memory Rate Limiting on Serverless — `middleware.ts:14`**
Rate limit counters are stored in a per-instance `Map`. On Vercel, each serverless invocation may be a new instance with fresh counters. Distributed rate limiting via Redis exists in `lib/redis.ts` but isn't used in middleware.

**Fix:** Use Redis-backed rate limiting in middleware for production.

**[MEDIUM] No Pagination in Analytics — `app/api/admin/analytics/route.ts:207-232`**
Fetches ALL orders from the past 365 days and processes in memory. At scale (10K+ orders), this will OOM or timeout.

**Fix:** Use `GROUP BY` and date-range aggregation at the database level.

**[MEDIUM] N+1 Pattern in Conflict Check — `lib/services/conflict/conflict-check-service.ts:67-105`**
Party matching loops through all new parties × all existing parties for string comparison. Should batch or use database-level fuzzy matching.

**[LOW] Rate Limiting Fails Open — `lib/redis.ts:74-76`**
When Redis is unavailable, rate limiting returns `allowed: true`. This is a conscious availability-over-security tradeoff, acceptable for this use case.

---

## 7. DEVOPS & CI/CD — 25/100

### What's Working
- Vercel deployment configuration is correct
- Environment variable template (`.env.example`) is comprehensive
- Structured logging with request correlation exists
- Error logging with severity categories and email alerts for FATAL errors
- Health check endpoints exist

### Critical Findings

**[CRITICAL] No CI/CD Pipeline**
No GitHub Actions, no automated testing, no build gates. Any code can be merged to main and deployed.

**[HIGH] Env Validation is Superficial — `lib/utils/env-check.ts:30-55`**
Only checks if variables exist and don't contain placeholder text (`xxxxx`). Doesn't validate format, entropy, or completeness.

**[HIGH] Alert System Not Integrated — `lib/monitoring/alert-sender.ts`**
Alert sender code exists (6KB) but is not called from critical paths (payment errors, auth failures, workflow crashes). Stripe webhook security alerts have a `// TODO: Send alert notification` comment.

**[MEDIUM] Database Migrations Manual-Only**
Migrations applied manually via Supabase SQL editor. No migration runner, no version tracking, no rollback capability.

---

## 8. COMPLIANCE & DATA HANDLING — 78/100

### What's Working
- Data retention policy implemented (180-day default, 730-day hard cap)
- AI assistance disclosure properly written
- "Not legal advice" disclaimer is clear
- Mandatory attorney review requirement documented
- AES-256 encryption for sensitive data
- CCPA compliance considered
- Conflict-of-interest detection service exists
- Audit trail via `automation_logs` table

### Findings

**[MEDIUM] Conflict Check Not Mandatory**
The conflict check service exists but it's unclear if it's enforced before workflow generation starts. A motion could be generated for conflicting parties.

**Fix:** Make conflict check a required pre-condition in Phase I or as a blocking gate before workflow starts.

**[LOW] PII Redaction Has Edge Cases — `lib/logger.ts:65-77`**
Email detection regex may over-redact legal citations containing `@` symbols. Field-name-based redaction is brittle.

---

## ROADMAP TO 100

### Phase 0: STOP-SHIP Fixes (Must Do Before Production) — Gets to ~65

| # | Issue | Category | Effort | Impact |
|---|---|---|---|---|
| 1 | **Fix payment-to-order linking** — order_id never set in PaymentIntent metadata; webhook can't find orders | Payment | 2 hrs | +8 |
| 2 | **Fix `gradePasses ?? true` default** — change to `false` or required param | Workflow | 30 min | +3 |
| 3 | **Add auth to `/api/health/deep`** | Security | 30 min | +2 |
| 4 | **Fix rate limiting IP source** — use Vercel's `x-vercel-forwarded-for` | Security | 1 hr | +2 |
| 5 | **Make `ENCRYPTION_SECRET` required** — remove fallback to service role key | Security | 30 min | +1 |
| 6 | **Add phase validation to HOLD checkpoint** — require `current_phase = 'III'` | Workflow | 30 min | +1 |
| 7 | **Fix auto-generation env var** — ensure `ENABLE_AUTO_GENERATION=true` in prod | Payment | 15 min | +2 |
| 8 | **Don't send refund email until Stripe confirms** | Payment | 1 hr | +1 |

**Subtotal after Phase 0: ~65/100** (from 52)

---

### Phase 1: Testing Foundation (Week 1-2) — Gets to ~76

| # | Issue | Effort | Impact |
|---|---|---|---|
| 9 | **Add Vitest to dependencies + configure** | 1 hr | +1 |
| 10 | **Write unit tests for `phase-config.ts` getNextPhase()** — all transition paths | 4 hrs | +2 |
| 11 | **Write unit tests for Stripe webhook handler** — all event types, edge cases | 6 hrs | +3 |
| 12 | **Write unit tests for `checkpoint-service.ts`** — all checkpoint types, race conditions | 6 hrs | +2 |
| 13 | **Write unit tests for `quality-validator.ts`** — grade calculations, thresholds | 4 hrs | +1 |
| 14 | **Write unit tests for pricing calculations** — all tiers, rush multipliers | 2 hrs | +1 |
| 15 | **Set up GitHub Actions CI** — lint, type-check, unit tests, build on every PR | 4 hrs | +3 |
| 16 | **Add husky + lint-staged pre-commit hooks** | 1 hr | +1 |

**Subtotal after Phase 1: ~76/100**

---

### Phase 2: Harden the Engine (Week 2-3) — Gets to ~86

| # | Issue | Effort | Impact |
|---|---|---|---|
| 17 | **Delete duplicate `getModelForPhase()`** in phase-executors.ts — use phase-config.ts | 1 hr | +1 |
| 18 | **Fix citation verifier** — don't count `api_error` as verified | 1 hr | +2 |
| 19 | **Populate `PHASE_COMPLETION_REQUIREMENTS`** — define min outputs per phase | 3 hrs | +2 |
| 20 | **Add loop termination safety** — hard limit on workflow iterations | 1 hr | +1 |
| 21 | **Atomic revision count increment** — use Supabase RPC for transactional update | 2 hrs | +1 |
| 22 | **Fail workflow on document parsing failure** — don't generate without evidence | 1 hr | +1 |
| 23 | **Remove `unsafe-eval` from CSP** — use nonce-based approach | 3 hrs | +1 |
| 24 | **Switch to Redis-backed rate limiting** in middleware for production | 2 hrs | +1 |
| 25 | **Integrate alert-sender** into payment errors, auth failures, workflow crashes | 3 hrs | +1 |
| 26 | **Make conflict check mandatory** before workflow start | 2 hrs | +1 |

**Subtotal after Phase 2: ~86/100**

---

### Phase 3: Code Quality & Type Safety (Week 3-5) — Gets to ~93

| # | Issue | Effort | Impact |
|---|---|---|---|
| 27 | **Eliminate top 100 `as any` assertions** — focus on workflow engine and inngest files | 16 hrs | +3 |
| 28 | **Replace `console.log` with structured logger** — all 150+ instances in production code | 6 hrs | +2 |
| 29 | **Enhance ESLint config** — add `no-explicit-any`, `no-floating-promises`, `no-console` | 2 hrs | +1 |
| 30 | **Remove duplicate realtime hook** — deprecate v6.3, keep v7.2 | 1 hr | +0.5 |
| 31 | **Write unit tests for phase-executors.ts** — at least key phases (I, V, VII, X) | 16 hrs | +2 |
| 32 | **Write unit tests for PDF generator** | 8 hrs | +1 |
| 33 | **Add E2E test for full payment flow** (with Stripe test mode) | 8 hrs | +1 |
| 34 | **Add E2E test for admin checkpoint approval** | 4 hrs | +0.5 |

**Subtotal after Phase 3: ~93/100**

---

### Phase 4: Production Polish (Week 5-6) — Gets to 100

| # | Issue | Effort | Impact |
|---|---|---|---|
| 35 | **Add database-level GROUP BY** for analytics queries | 3 hrs | +1 |
| 36 | **Fix N+1 in conflict check** — batch party matching | 2 hrs | +0.5 |
| 37 | **Env validation improvements** — format checking, entropy, completeness | 3 hrs | +1 |
| 38 | **Database migration runner** — version tracking and rollback support | 6 hrs | +1 |
| 39 | **Write remaining unit tests** — citation-verifier, courtlistener client, refund service | 12 hrs | +2 |
| 40 | **Add Sentry or equivalent** error tracking for production monitoring | 4 hrs | +1 |
| 41 | **Rush multiplier server-side validation** during order creation | 1 hr | +0.5 |
| 42 | **Resolve X-Frame-Options conflict** between middleware and next.config | 15 min | +0.5 |
| 43 | **Fix PII redaction edge cases** in logger | 2 hrs | +0.5 |

**Subtotal after Phase 4: 100/100**

---

## FULL FINDINGS INDEX

### By Severity

| Severity | Count | Categories |
|---|---|---|
| CRITICAL | 9 | Payment linking (1), Workflow bypasses (3), Testing gaps (3), Security (2) |
| HIGH | 11 | Workflow integrity (4), Payments (2), Code quality (3), DevOps (2) |
| MEDIUM | 14 | Security (3), Performance (3), Workflow (3), Code quality (2), Compliance (1), DevOps (2) |
| LOW | 2 | Rate limit fail-open, PII redaction |

### By Category

| Category | CRIT | HIGH | MED | LOW |
|---|---|---|---|---|
| Security | 2 | 1 | 3 | 0 |
| Workflow Engine | 3 | 4 | 2 | 0 |
| Payments | 1 | 2 | 2 | 0 |
| Testing | 3 | 1 | 0 | 0 |
| Code Quality | 1 | 3 | 2 | 0 |
| Performance | 0 | 0 | 3 | 1 |
| DevOps | 0 | 2 | 1 | 0 |
| Compliance | 0 | 0 | 1 | 1 |

---

## ESTIMATED TIMELINE TO 100

| Phase | Timeline | Score After |
|---|---|---|
| Phase 0: Stop-Ship Fixes | 1-2 days | 65 |
| Phase 1: Testing Foundation | Week 1-2 | 76 |
| Phase 2: Harden the Engine | Week 2-3 | 86 |
| Phase 3: Code Quality | Week 3-5 | 93 |
| Phase 4: Production Polish | Week 5-6 | 100 |

**Total estimated effort: ~6 weeks of focused development.**

Phase 0 is the absolute minimum before accepting any paid orders. Phases 1-2 should be complete before public launch. Phases 3-4 can be done in the first month post-launch if needed, but ideally before.

---

## WHAT'S GENUINELY GOOD

This isn't all doom and gloom. The application has significant strengths that many legal tech startups never achieve:

1. **Architecture** — The 14-phase workflow with tiered model routing is sophisticated and well-thought-out
2. **Checkpoint System** — HOLD/NOTIFICATION/BLOCKING pattern is exactly right for legal document generation
3. **Supabase RLS** — Row-level security is properly used for data isolation
4. **Compliance Framework** — AI disclosure, attorney review requirements, data retention policies are all present
5. **Redis Caching** — Well-implemented with TTL, tags, pipeline operations, and graceful fallback
6. **Security Headers** — HSTS, Referrer-Policy, Permissions-Policy are all correct
7. **Pricing Model** — Tier/rush multiplier system is clean and well-organized
8. **Email Templates** — React Email templates cover the full order lifecycle
9. **Error Infrastructure** — Circuit breaker, retry logic, and structured logger all exist (just need wider adoption)
10. **Real-time Updates** — Supabase Realtime for live order status is a great UX choice
