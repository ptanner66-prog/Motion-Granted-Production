# Production Readiness Checklist — Motion Granted

## Pre-Launch (Complete ALL before first customer order)

### Infrastructure
- [ ] All env vars set in Vercel Production (not placeholders) — validate with `pnpm validate-env`
- [ ] Supabase: all 25+ migrations applied
- [ ] Supabase: RLS enabled on all tables (verify via `scripts/supabase_audit.sql`)
- [ ] Vercel: domain configured (motiongranted.com or production URL)
- [ ] Vercel: function timeouts set in `vercel.json` (300s for workflow/chat/inngest)
- [ ] Resend: sender domain verified (`motiongranted.com`)
- [ ] Stripe: production webhook endpoint configured → `/api/webhooks/stripe`
- [ ] Stripe: webhook events include `checkout.session.completed`, `payment_intent.succeeded`
- [ ] Inngest: production keys set (not development) — `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY`
- [ ] Sentry: production DSN configured (if applicable)
- [ ] Upstash Redis: production URL + token set for rate limiting and citation cache

### Pipeline
- [ ] Intake form routes to `/api/automation/start` (NOT `/api/chat/start`)
- [ ] Inngest `generateOrderWorkflow` timeout set to `30m` (in `lib/inngest/workflow-orchestration.ts`)
- [ ] Phase prompts loaded from `/prompts/PHASE_*_v75.md` files (14 files present)
- [ ] Phase prompt index (`prompts/index.ts`) DB fallback functional
- [ ] Model router returns correct models for all tier x phase combos:
  - Tier A drafting: Sonnet
  - Tier B/C complex reasoning: Opus
  - CIV Stage 1: GPT-4 Turbo
  - CIV Stage 2: Opus
  - CIV Steps 3-5 Tier A/B: Haiku, Tier C: Sonnet
- [ ] CIV pipeline active (Phases V.1, VII.1, IX.1 call `verifyBatch()`)
- [ ] Quality threshold set to 0.87 for ALL tiers (`lib/config/phase-registry.ts`)
- [ ] Revision loop max: 3 iterations (`MAX_REVISION_LOOPS`)
- [ ] Protocol 7 triggers on citation verification failures
- [ ] Protocol 10 stall detection after 3 same-grade loops

### Security
- [ ] Middleware enforces auth on `/dashboard/*` and `/admin/*` routes
- [ ] Admin routes verify `profiles.role === 'admin'`
- [ ] `service_role` key not used in client-facing API routes (only admin/webhook/inngest)
- [ ] Security headers present in middleware.ts:
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Strict-Transport-Security (HSTS)
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: camera=(), microphone=(), geolocation=()
- [ ] CSP headers configured in `next.config.ts`
- [ ] Encryption module functional — AES-256-GCM (`lib/security/encryption.ts`)
- [ ] PII sanitizer active (`lib/security/sanitizer.ts`) — blocks SSN, DOB, financial data
- [ ] Sanitized logger in use (`lib/security/logger.ts`)
- [ ] Rate limiting active: API 100 req/min, Generation 5 req/min, Auth 10 req/min
- [ ] CORS headers appropriate for production domain
- [ ] No unsanitized `console.log` in API routes

### Quality Gates
- [ ] `pnpm tsc --noEmit` passes (excluding `tests/e2e/`)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` runs (advisory, not blocking)
- [ ] Production smoke test passes: `npx tsx scripts/production-smoke-test.ts`
- [ ] Pre-launch audit passes: `npx tsx scripts/pre-launch-audit.ts`
- [ ] Clay's validation checklist reviewed: `npx tsx scripts/clay-validation-checklist.ts`

### Email Lifecycle
- [ ] Order confirmation email sends on order creation (`sendOrderConfirmation`)
- [ ] Payment confirmation email sends after Stripe webhook (`sendPaymentConfirmation`)
- [ ] HOLD notification email sends with missing items list (`sendHoldNotification`)
- [ ] CP3 review notification email sends on checkpoint (`sendCP3ReviewNotification`)
- [ ] Revision notification email sends on revision loop trigger (`sendRevisionNotification`)
- [ ] Delivery notification email sends on completion (`sendDeliveryNotification`)
- [ ] Admin alert emails functional (`sendAdminAlert`)

### Documents
- [ ] Louisiana Tier A generates motion + proposed order + AIS
- [ ] Certificate of service inline in LA motions
- [ ] Proposed order uses judge-fillable date blanks
- [ ] Citation verification report references CourtListener (not Westlaw)
- [ ] PDF generator functional (`lib/workflow/pdf-generator.ts`)

### Compliance
- [ ] CCPA data export endpoint functional: `GET /api/account/export`
- [ ] Account deletion flow functional
- [ ] Terms of Service page live (`/terms`)
- [ ] Privacy Policy page live (`/privacy`)
- [ ] Disclaimer page live (`/disclaimer`)
- [ ] DPA page live (`/dpa`)
- [ ] Security page live (`/security`)
- [ ] "Motion Granted is NOT a law firm" disclaimer visible on site

---

## Post-Launch Monitoring (First 48 hours)

- [ ] Monitor Sentry for runtime errors
- [ ] Monitor Inngest dashboard for failed/cancelled workflows
- [ ] Monitor Vercel function logs for crashes and cold start timeouts
- [ ] Confirm first customer order completes all 14 phases
- [ ] Verify email delivery via Resend dashboard (check bounce rate)
- [ ] Check Stripe for successful payment processing
- [ ] Respond to any HOLD notifications within 24 hours
- [ ] Verify Phase X BLOCKING checkpoint requires admin approval
- [ ] Check CIV verification results for accurate composite scores
- [ ] Monitor Redis/Upstash for rate limiting correctness

---

## Controlled Launch Strategy

1. **Alpha (Week 1):** 2-3 trusted attorneys from waitlist, Tier A orders only
   - Monitor every workflow phase in Inngest dashboard
   - Manually review every generated motion before delivery
   - Collect feedback on quality, formatting, citations

2. **Beta (Week 2-3):** 5-10 attorneys, Tier A + B orders
   - Enable Tier B model routing (Opus for complex phases)
   - Monitor Tier B completion times (target: under 20 minutes)
   - Verify CIV composite scores for Tier B citations

3. **General (Week 4+):** Open to full waitlist, all tiers
   - Enable Tier C orders
   - Monitor scaling and cold start behavior
   - Review Stripe revenue vs. cost metrics

---

## Scripts Available

| Script | Purpose | Command |
|---|---|---|
| Environment validation | Check all env vars | `pnpm validate-env` |
| Production smoke test | Full E2E smoke test | `npx tsx scripts/production-smoke-test.ts` |
| Pre-launch audit | Static code audit | `npx tsx scripts/pre-launch-audit.ts` |
| Clay's checklist | 32-point validation | `npx tsx scripts/clay-validation-checklist.ts` |
| E2E smoke test | Existing E2E runner | `npx tsx scripts/e2e-smoke-test.ts` |
| Supabase audit | Database audit SQL | `scripts/supabase_audit.sql` |
