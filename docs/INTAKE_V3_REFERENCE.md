# Intake Form V3 Reference — SP-D Implementation Guide

> **Owner:** SP-D (Dashboard/Portal)
> **Source:** `motion-granted-intake-v3.html` (59KB prototype by Clay)
> **Date:** 2026-02-15
> **Status:** Reference document — no code changes made to intake form

---

## Purpose

This document captures the delta between the current production intake form (`/submit`) and the v3 HTML prototype for SP-D to implement. The HTML prototype was not available in the repository at the time of this analysis, so this reference is based on the existing codebase structure and the SP-F megaprompt specification.

---

## Current Intake Form (Production)

**Route:** `/submit` (consolidated single-page form)
**File:** `app/(dashboard)/submit/page.tsx`
**State:** `hooks/use-order-form.ts` (Zustand + localStorage)
**Legacy:** `app/(dashboard)/orders/new/page.tsx` redirects to `/submit`

### Current Form Sections

#### Section 1: Motion & Case Details
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Filing Posture | Radio | Yes | "I am filing a motion" (PATH A) vs "I am opposing a motion" (PATH B) |
| Jurisdiction | Dropdown | Yes | Filtered from `JURISDICTIONS` config |
| Court | Dropdown | Yes | Filtered by jurisdiction |
| Motion Type | Grouped dropdown | Yes | Grouped by tier with pricing display |
| Turnaround Time | Radio | Yes | Standard / Rush 48h (+25%) / Rush 24h (+50%) |
| Case Number | Text | Conditional | Required unless "Case not yet filed" checkbox checked |
| Party Represented | Dropdown | Yes | From `PARTY_ROLES` config |
| Plaintiff Name(s) | Text | Yes | Min 1 character |
| Defendant Name(s) | Text | Yes | Min 1 character |
| Judge Name | Text | No | Optional |
| Opposing Counsel | Text | No | Optional |
| Opposing Firm | Text | No | Optional |

#### Section 2: Case Narrative
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Statement of Facts | Textarea | Yes | Min 200 characters |
| Drafting Instructions | Textarea | Yes | Min 50 characters |

#### Section 3: Document Upload
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Opponent Motion | File upload | PATH B only | Required if responding to a motion |
| Supporting Documents | Multi-file upload | No | PDF, DOCX, DOC, TXT, RTF; max 50MB/file |

---

## V3 Prototype Changes (To Be Confirmed)

> **NOTE:** The HTML prototype (`motion-granted-intake-v3.html`) was not available in the repository at analysis time. SP-D should obtain the prototype from Clay and verify these items.

### Expected Changes Based on Spec Context

1. **Visual/UX improvements** — The v3 prototype likely contains updated styling to match the new marketing design system (navy/gold color palette, Instrument Serif + DM Sans fonts).

2. **Stepper/progress indicator** — May include a visual stepper showing form completion progress, consistent with the multi-step intake experience.

3. **Pricing display** — Updated tier pricing to match the marketing pricing page:
   - Tier A: $299 (was varying $300-$400 per motion)
   - Tier B: $599 (was varying $700-$1000 per motion)
   - Tier C: $999
   - Tier D: $1,499
   - Louisiana discount: 15% off (automatic at checkout)

4. **Rush options** — May be updated to:
   - 48-Hour Rush: +25%
   - 24-Hour Rush: +50%
   - (Current form has Rush 48h and Rush 24h which aligns)

### Items for SP-D to Verify Against Prototype

- [ ] Any new form fields added in v3
- [ ] Any fields removed or reordered
- [ ] Changes to validation rules (character minimums, required fields)
- [ ] Updates to the filing posture (PATH A / PATH B) flow
- [ ] Changes to document upload UX (drag-drop, preview, progress)
- [ ] Any new conditional logic (fields that show/hide based on selections)
- [ ] Updated copy/microcopy on labels, placeholders, help text
- [ ] Changes to the order summary / review step before payment
- [ ] Mobile layout changes (the current form is a single-page scroll)
- [ ] Accessibility improvements (ARIA labels, focus management, error announcements)

---

## Legacy Components (Available for Reference)

The codebase maintains an older 8-step intake wizard in `components/orders/intake-form/`:

| Component | Purpose |
|-----------|---------|
| `motion-select.tsx` | Motion type dropdown with pricing |
| `turnaround-select.tsx` | Turnaround time selection |
| `case-info.tsx` | Jurisdiction, court, case number, caption |
| `parties-form.tsx` | Party list with role selection |
| `case-summary.tsx` | Statement of facts & procedural history |
| `instructions.tsx` | Drafting instructions textarea |
| `document-upload.tsx` | File upload with drag-drop support |
| `order-summary.tsx` | Review & summary before submission |
| `price-summary.tsx` | Price breakdown display |

These are not actively used by `/submit` but may contain patterns useful for the v3 implementation.

---

## Key Config Files

- **Motion types & pricing:** `config/motion-types.ts`
- **Jurisdictions:** `config/motion-types.ts` (`JURISDICTIONS` export)
- **Party roles:** `config/motion-types.ts` (`PARTY_ROLES` export)
- **Form state:** `hooks/use-order-form.ts`
- **Checkout flow:** `app/api/payments/checkout/route.ts` (DO NOT MODIFY — owned by SP-A)

---

## Action Items for SP-D

1. Obtain `motion-granted-intake-v3.html` from Clay
2. Diff against the current `/submit` page to identify exact changes
3. Update this document with the confirmed delta
4. Implement changes in the `/submit` route
5. Verify form state persistence (Zustand + localStorage) still works
6. Test the checkout flow end-to-end after changes
