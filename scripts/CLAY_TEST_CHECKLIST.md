# Clay's Attorney Test Checklist

**SP10 — Test Prep Package for Clay's First Live Workflow Test**
**Date**: 2026-02-11

---

## Pre-Flight

- [ ] Verify `pnpm build` passes with 0 errors
- [ ] Verify `npx tsc --noEmit` shows 0 TypeScript errors
- [ ] Verify `npx tsx scripts/test-formatting-integration.ts` passes all 7 jurisdictions
- [ ] Confirm RuleLookupService loads 51 state configs (check console output)
- [ ] Confirm Supabase is reachable (`/api/health` returns 200)
- [ ] Confirm Stripe webhook is configured for `/api/webhooks/stripe`
- [ ] Confirm Inngest dev server is running (`pnpm dev:inngest`)
- [ ] Confirm `ANTHROPIC_API_KEY` is set in environment

---

## Test Order: Louisiana Motion to Compel

**Payload**: `scripts/clay-test-order.json`

| Field | Expected Value |
|---|---|
| Motion Type | `compel_discovery` (Tier B) |
| Jurisdiction | `LA State Court` |
| Court | 19th JDC, East Baton Rouge Parish |
| Case Number | C-724391 |
| Case Caption | Thibodaux Properties, LLC v. Boudreaux Construction, Inc. |
| Turnaround | Standard (3-4 days) |
| Price | $700 |

---

## Workflow Execution Checks

### Phase I — Intake & Document Processing
- [ ] Phase I starts automatically after order submission
- [ ] Order context gathered with `jurisdiction: "LA State Court"`
- [ ] Phase I completes without error

### Phase II — Legal Standards
- [ ] Motion deconstruction identifies La. C.C.P. art. 1461-1474 as primary authority
- [ ] Louisiana-specific discovery rules recognized

### Phase III — Evidence Strategy (HOLD Checkpoint)
- [ ] **HOLD checkpoint triggers** — workflow pauses
- [ ] Admin receives notification
- [ ] Admin can APPROVE to continue
- [ ] After approval, Phase IV begins

### Phases IV–V — Authority Research & Drafting
- [ ] Phase IV researches Louisiana case law
- [ ] Phase V produces initial draft
- [ ] Draft cites Louisiana authorities (not federal rules)

### Phase V.1 — Citation Accuracy Check
- [ ] Citation verification runs on Phase V output
- [ ] All citations checked against available databases

### Phases VI–VIII — Opposition, Judge Sim, Revisions
- [ ] Extended thinking active on Phases VI, VII, VIII
- [ ] Revision loop count does not exceed 3

### Phase VII.1 — Post-Revision Citation Check
- [ ] Second citation pass runs after revisions

### Phase VIII.5 — Caption Validation
- [ ] Caption matches "Thibodaux Properties, LLC v. Boudreaux Construction, Inc."
- [ ] Court and case number correctly formatted

### Phase IX — Supporting Documents
- [ ] Proposed order generated
- [ ] Certificate of service included

### Phase X — Final Assembly (BLOCKING Checkpoint)
- [ ] **CP3 BLOCKING checkpoint triggers** — requires admin approval
- [ ] Admin reviews final package
- [ ] Admin can APPROVE, REQUEST_CHANGES, or CANCEL

---

## Document Output Checks

### DOCX Output
- [ ] **Paper size is LEGAL** (8.5" x 14") — NOT letter
- [ ] **Top margin is 2 inches** (per La. Dist. Ct. R. 9.9)
- [ ] **Left margin is 1.5 inches**
- [ ] Bottom margin is 1 inch
- [ ] Right margin is 1 inch
- [ ] Font is Times New Roman 12pt
- [ ] **No line numbers** (Louisiana does not require them)
- [ ] Double line spacing

### PDF Output
- [ ] **Page height is 1008 points** (14" legal paper)
- [ ] **Page width is 612 points** (8.5")
- [ ] Margins match DOCX dimensions
- [ ] All sections render within margins
- [ ] Page numbers present
- [ ] Signature block renders correctly
- [ ] Certificate of service renders correctly

### Content Quality
- [ ] Motion title: "Motion to Compel Discovery Responses"
- [ ] Cites La. C.C.P. art. 1461 (scope of discovery)
- [ ] Cites La. C.C.P. art. 1462 (time for response)
- [ ] Cites La. C.C.P. art. 1469 (sanctions/attorney's fees)
- [ ] References meet-and-confer efforts (two letters)
- [ ] Requests responses within 15 days
- [ ] Requests attorney's fees as sanction
- [ ] Case caption is correct throughout
- [ ] No federal rule citations (FRCP should not appear)
- [ ] Proposed order attached

---

## Safety Verification

- [ ] Order is visible only to owner + admin (RLS enforced)
- [ ] No PII leaked in Sentry events (check Sentry dashboard)
- [ ] Stripe payment amount matches order total ($700)
- [ ] MFA required for admin to approve checkpoints
- [ ] Rate limiting active on `/api/workflow/*` endpoints

---

## Post-Test

- [ ] Download DOCX — open in Word, verify legal paper formatting
- [ ] Download PDF — verify page dimensions in Acrobat (File > Properties)
- [ ] Measure top margin in Word ruler — confirm 2 inches
- [ ] Measure left margin in Word ruler — confirm 1.5 inches
- [ ] Verify document prints correctly on legal paper
- [ ] Check all citations are valid (spot-check 3-5 in Westlaw/LexisNexis)
- [ ] Review quality grade — should be A- or above
- [ ] Confirm order status transitions: submitted → paid → in_progress → on_hold → in_progress → completed

---

## Quick Reference: Louisiana Formatting Rules

| Property | Value | Source |
|---|---|---|
| Paper | Legal (8.5" x 14") | louisiana.json |
| Top Margin | 2" (2880 DXA) | La. Dist. Ct. R. 9.9 |
| Left Margin | 1.5" (2160 DXA) | La. Dist. Ct. R. 9.9 |
| Bottom Margin | 1" (1440 DXA) | louisiana.json |
| Right Margin | 1" (1440 DXA) | louisiana.json |
| Font | Times New Roman 12pt | louisiana.json |
| Line Spacing | Double (480 DXA) | louisiana.json |
| Line Numbers | No | louisiana.json |
| Jurat | Affidavit | louisiana.json |
