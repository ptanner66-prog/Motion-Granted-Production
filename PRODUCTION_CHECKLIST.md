# MOTION GRANTED — PRODUCTION READINESS CHECKLIST

**Last updated:** 2026-02-11

---

## INFRASTRUCTURE

- [ ] All env vars set (`npx tsx scripts/check-env.ts`)
- [ ] Supabase Storage bucket created (`npx tsx scripts/setup-storage.ts`)
- [ ] Resend domain verified (SPF + DKIM records)
- [ ] Stripe webhook endpoint configured and tested (`/api/webhooks/stripe`)
- [ ] Inngest connected to production
- [ ] Custom domain configured (optional for launch)
- [ ] CRON jobs visible in Vercel dashboard (hold-enforcer hourly, daily-cleanup at 6 UTC)
- [ ] CRON_SECRET environment variable set in Vercel

## TESTING

- [ ] E2E smoke test passes (`pnpm test:e2e`)
- [ ] Test filing package generated and reviewed by Clay
- [ ] Real order submitted and processed through all 14 phases
- [ ] Payment flow tested (use Stripe test mode)
- [ ] Email delivery confirmed (order confirm, documents ready)
- [ ] CP3 review page tested (approve + download)
- [ ] Revision request tested (request changes + re-delivery)
- [ ] HOLD timeout sequence tested (24h reminder, 72h escalation)

## LEGAL REVIEW (Clay)

- [ ] Generated motion content meets professional standards
- [ ] Caption block matches Louisiana practice
- [ ] Affidavit jurat language correct (notarized, not perjury declaration)
- [ ] Citation formatting matches Bluebook / Louisiana style
- [ ] Proof of service language appropriate
- [ ] Attorney instructions clear and complete
- [ ] Disclaimer language on all customer-facing pages reviewed
- [ ] Terms of service reviewed
- [ ] Privacy policy reviewed

## SECURITY

- [ ] RLS policies on all tables with customer data
- [ ] Rate limiting active on all API routes
- [ ] CRON endpoints require CRON_SECRET (timing-safe comparison)
- [ ] Health endpoint gated behind admin auth
- [ ] No API keys exposed in client-side code (`NEXT_PUBLIC_` prefix only)
- [ ] File uploads restricted to allowed MIME types
- [ ] Stripe webhook signature verification active
- [ ] ENCRYPTION_SECRET set for API key encryption at rest

## LAUNCH

- [ ] First 3 waitlist customers contacted
- [ ] Payment amounts set correctly in Stripe (Tier A: $300-400, B: $700-1000, C: $1500-3200)
- [ ] Rush multipliers configured (72hr +25%, 48hr +50%)
- [ ] Customer support email configured
- [ ] Error monitoring in place (even if just email alerts)
- [ ] Clay available for same-day review of first orders
- [ ] Only Louisiana enabled in jurisdiction toggles

## POST-LAUNCH (First Week)

- [ ] Monitor CRON execution logs for hold-enforcer and daily-cleanup
- [ ] Verify first paid order flows through full workflow
- [ ] Confirm email delivery for all templates
- [ ] Check stale workflow alerts are working
- [ ] Review automation_logs for any errors
