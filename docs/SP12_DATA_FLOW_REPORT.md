# SP12 DATA FLOW AUDIT REPORT

**Auditor:** Chen (SP12 Megaprompt)
**Date:** 2026-02-11
**Codebase:** Motion Granted Production
**Build Status:** ✅ CLEAN (0 TS errors, 0 build failures)

---

## EXECUTIVE SUMMARY

Traced 8 critical data paths through the system. Found **6 🔴 critical bugs** and **1 🟡 warning bug**. All fixed and verified compiling.

| ID | Severity | Description | File | Status |
|----|----------|-------------|------|--------|
| SP12-01 | 🔴 | buildPhaseInput() sends empty documents to all phases | workflow-orchestration.ts:185 | ✅ FIXED |
| SP12-02 | 🔴 | Order creation API inserts docs without is_deliverable=false | orders/route.ts:190 | ✅ FIXED |
| SP12-03 | 🔴 | Checkout session webhook missing filing_deadline in select | webhooks/stripe/route.ts:665 | ✅ FIXED |
| SP12-04 | 🔴 | Auto-generated deliverables not inserted into documents table | workflow-orchestration.ts:874 | ✅ FIXED |
| SP12-05 | 🔴 | Download route uses wrong column name (user_id vs client_id) | orders/[id]/download/route.ts:36 | ✅ FIXED |
| SP12-06 | 🔴 | Signed URL generator uses wrong column name (user_id vs client_id) | storage/signed-url.ts:64 | ✅ FIXED |
| SP12-07 | 🟡 | HOLD status mismatch between hold-service and orchestration | hold-service.ts:48 | ✅ FIXED |

### Additional Findings (Not Bugs — Design Notes)

| ID | Severity | Description |
|----|----------|-------------|
| SP12-DN-01 | 🟢 | HOLD resume restarts workflow from Phase I (full restart, not Phase IV resume) |
| SP12-DN-02 | 🟢 | Phase outputs stored correctly OUTSIDE step.run() for all 14 phases |
| SP12-DN-03 | 🟢 | gradePasses() properly accepts LetterGrade and does GRADE_VALUES lookup |
| SP12-DN-04 | 🟢 | Citation enforcement prompt properly injected in Phase V with verified bank |

---

## TRACE 1: Order Submission → Document Upload → Extraction → Phase Input

### Data Flow Diagram
```
Client Upload → POST /api/documents/upload → Supabase Storage + documents table
                                                       ↓
Inngest "order/submitted" → gatherOrderContext() → extractOrderDocuments()
                                                 → getOrderParsedDocuments()
                                                       ↓
                                              buildPhaseInput()
                                                       ↓
                                              Phase I Claude prompt
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Upload handler | documents table | is_deliverable | ✅ OK | Explicitly set to false (prior Bug 1 fix) |
| Upload handler | documents table | file_url | ✅ OK | Relative path stored correctly |
| gatherOrderContext | extractOrderDocuments | orderId | ✅ OK | Passed correctly |
| extractOrderDocuments | documents.raw | raw text | ✅ OK | Text extracted from .docx/.pdf |
| getOrderParsedDocuments | documents.parsed | summaries | ⚠️ EMPTY | parsed_documents table empty before Phase I |
| buildPhaseInput | PhaseInput.documents | parsed summaries | 🔴 BROKEN | Only sends parsed.map(d=>d.summary) — empty array |
| Phase I | Claude prompt | documents content | 🔴 BROKEN | Shows "UPLOADED DOCUMENTS: None provided" |

### Bugs Found & Fixed

**SP12-01 (🔴 CRITICAL):** `buildPhaseInput()` at `lib/inngest/workflow-orchestration.ts:185` only sends `documents.parsed.map(d => d.summary)`. Before Phase I runs, the `parsed_documents` table is empty (nothing has parsed documents yet). So every phase receives an empty documents array. The raw text IS available in `orderContext.documents.raw` but was never wired through.

**Fix:** Added fallback logic in `buildPhaseInput()`:
```typescript
documents: (() => {
  const parsedSummaries = state.orderContext.documents.parsed
    .map((d) => d.summary)
    .filter(Boolean);
  if (parsedSummaries.length > 0) {
    return parsedSummaries;
  }
  const raw = state.orderContext.documents.raw;
  if (raw && raw.trim().length > 0) {
    return [raw];
  }
  return [];
})(),
```

---

## TRACE 2: Order Fields → Workflow State → Phase Prompts → Motion Output

### Data Flow Diagram
```
Intake Form → POST /api/orders → orders table + parties table
                                        ↓
              gatherOrderContext() → OrderContext object
                                        ↓
              buildPhaseInput() → PhaseInput object
                                        ↓
              executePhaseI() → Claude prompt (user message)
```

### Handoff Verification

| Field | Form→API | DB Column | OrderContext | PhaseInput | Used in Prompt |
|-------|----------|-----------|-------------|------------|---------------|
| jurisdiction | ✅ | orders.jurisdiction | ✅ L246 | ✅ L176 | ✅ Phase I L526 |
| court_division | ✅ | orders.court_division | ✅ L247 | ✅ L180 | ✅ (via input) |
| case_number | ✅ | orders.case_number | ✅ L248 | ✅ L179 | ✅ Phase I L527 |
| case_caption | ✅ | orders.case_caption | ✅ L249 | ✅ L178 | ✅ Phase I L528 |
| statement_of_facts | ✅ | orders.statement_of_facts | ✅ L252 | ✅ L181 | ✅ Phase I L531 |
| procedural_history | ✅ | orders.procedural_history | ✅ L253 | ✅ L182 | ✅ Phase I L534 |
| instructions | ✅ | orders.instructions | ✅ L254 | ✅ L183 | ✅ Phase I L537 |
| motion_type | ✅ | orders.motion_type | ✅ L244 | ✅ L177 | ✅ Phase I L525 |
| motion_tier | ✅ | orders.motion_tier | ✅ L245 | ✅ L175 | ✅ (model routing) |
| filing_deadline | ✅ | orders.filing_deadline | ✅ L255 | ✅ L205 | ✅ Phase I preserves |
| parties | ✅ | parties table | ✅ L261 | ✅ L188 | ⚠️ Not in Phase I prompt |
| attorney info | ✅ | profiles table | ✅ L200-209 | ✅ L195-204 | ✅ (later phases) |

### Bugs Found
None in the field-to-field data flow. All fields correctly mapped at every hop.

Note: `parties` are not included in the Phase I prompt text, but Phase I extracts parties from the document content. This is by design — Phase I validates what the AI sees against the known party list.

---

## TRACE 3: Phase Output → Next Phase Input → Accumulation

### Data Flow Diagram
```
Phase N executor → PhaseOutput.output
         ↓
step.run("phase-n") returns result
         ↓
workflowState.phaseOutputs["N"] = result.output  ← OUTSIDE step.run()
         ↓
buildPhaseInput(workflowState) → PhaseInput.previousPhaseOutputs
         ↓
Phase N+1 reads previousPhaseOutputs["N"]
```

### Handoff Verification

| Phase | Output Stored Outside step.run() | Key Used | Next Phase Reads It |
|-------|--------------------------------|----------|-------------------|
| I | ✅ L1193 | "I" | ✅ Phase II reads previousPhaseOutputs['I'] |
| II | ✅ L1215 | "II" | ✅ Phase III |
| III | ✅ L1237 | "III" | ✅ Phase IV |
| IV | ✅ L1454 | "IV" | ✅ Phase V (citation bank) |
| V | ✅ L1536 | "V" | ✅ Phase V.1 + VII |
| V.1 | ✅ L1560 | "V.1" | ✅ Phase VI |
| VI | ✅ L1601 | "VI" | ✅ Phase VII |
| VII | ✅ L1624 | "VII" | ✅ Revision loop / Phase VIII |
| VIII | ✅ L1703 | "VIII" | ✅ Phase VII.1 / VIII.5 |
| VII.1 | ✅ L1727 | "VII.1" | ✅ |
| VIII.5 | ✅ L1799 | "VIII.5" | ✅ Phase IX |
| IX | ✅ L1821 | "IX" | ✅ Phase IX.1 |
| IX.1 | ✅ L1904 | "IX.1" | ✅ Phase X |
| X | ✅ L1926 | "X" | ✅ Finalization |

### Bugs Found
None. All phase outputs correctly stored outside `step.run()` boundaries, and correctly read by subsequent phases via `previousPhaseOutputs`.

**Notable safety mechanism:** If Phase VII passes on first try (no revision loop), Phase V output is carried forward into the "VIII" slot (L1776-1778). This ensures downstream phases (VIII.5, IX, etc.) that expect phaseOutputs["VIII"] always find content.

---

## TRACE 4: Phase III HOLD → Order Status → Resume → Continue Workflow

### Data Flow Diagram
```
Phase III AI output → phaseIIIOutput.holdRequired/holdRecommended/hold_recommended
         ↓ (if true)
Update orders.status = "on_hold"
Update workflow_state.phase_status = "HOLD"
Send HOLD email notification
         ↓
Inngest function RETURNS EARLY (L1346)
         ↓
Admin/client calls POST /api/workflow/hold-response
         ↓
processHoldResponse() resolves hold
         ↓
Admin calls POST /api/automation/resume
         ↓
resumeOrderAutomation() → inngest.send("order/submitted")
         ↓
Full workflow restart from Phase I (NOT Phase IV resume)
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Phase III AI output | HOLD detection | holdRequired/holdRecommended | ✅ OK | Checks camelCase + snake_case variants |
| HOLD trigger | orders table | status: "on_hold" | ✅ OK | L1273 |
| HOLD trigger | workflow_state | phase_status: "HOLD" | ✅ OK | L1283 |
| HOLD trigger | notification_queue | email data | ✅ OK | L1303 |
| HOLD trigger | email sender | HOLD notification | ✅ OK | L1323 |
| hold-service resumeFromHold | status check | 'hold_pending' vs 'on_hold' | 🟡 MISMATCH | L48 checks 'hold_pending' but orchestration sets 'on_hold' |
| resumeOrderAutomation | Inngest | "order/submitted" | ✅ OK | Full restart |

### Bugs Found & Fixed

**SP12-07 (🟡 WARNING):** `resumeFromHold()` in `hold-service.ts:48` checked only for `status === 'hold_pending'`, but the workflow orchestration sets `status = 'on_hold'` (L1273). Orders placed on hold by the workflow could never be resumed via this function.

**Fix:** Updated `resumeFromHold()` to accept both statuses:
```typescript
if (order.status !== 'hold_pending' && order.status !== 'on_hold')
  return { success: false, error: 'Order not on hold' };
```
Also updated `processHoldTimeouts()` to query both statuses:
```typescript
.in('status', ['hold_pending', 'on_hold'])
```

### Design Note (SP12-DN-01)
The resume mechanism fires a new `order/submitted` Inngest event, which restarts the entire workflow from Phase I. Previous phase work is re-executed (with Inngest step caching). This is by design but means HOLD resolution doesn't skip to Phase IV — it re-runs the full pipeline.

---

## TRACE 5: Phase Output → Document Generation → PDF → Storage → Client Download

### Data Flow Diagram
```
Phase X/VIII/V output → generateDeliverables()
         ↓
formatMotionObjectToText() → motionContent string
         ↓
createSimpleMotionPDF(motionContent) → PDF bytes
         ↓
uploadToSupabaseStorage() → Storage URL
         ↓
orders.deliverable_urls updated (JSONB)
         ↓ ← SP12-04 FIX: Now also inserts into documents table
Client GET /api/orders/[id]/deliverables → queries documents table
         ↓
getPublicUrl() → public URL returned to client
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Phase X finalPackage.motion | generateDeliverables | motionContent | ✅ OK | Priority chain: X → VIII → V |
| motionContent | createSimpleMotionPDF | content string | ✅ OK | L774 |
| PDF bytes | uploadToSupabaseStorage | file bytes | ✅ OK | L775-778 |
| Storage URL | orders.deliverable_urls | URL string | ✅ OK | L878 |
| Storage URL | documents table | is_deliverable: true | 🔴 MISSING | Not inserted before fix |
| GET /deliverables | documents table | .eq('is_deliverable', true) | 🔴 BROKEN | No matching rows before fix |
| Download route | orders table | user_id column | 🔴 WRONG | Column is client_id, not user_id |
| Signed URL gen | orders table | user_id column | 🔴 WRONG | Same column name bug |

### Bugs Found & Fixed

**SP12-04 (🔴 CRITICAL):** Auto-generated deliverables (motion PDF, instruction sheet, citation report, caption QC report) were uploaded to Supabase Storage and their URLs stored in `orders.deliverable_urls`, but they were never inserted into the `documents` table with `is_deliverable: true`. The client-facing GET `/api/orders/[id]/deliverables` queries `documents` table for `is_deliverable: true`, so it returned 0 deliverables.

**Fix:** After uploading each deliverable PDF, insert a record into the `documents` table:
```typescript
const deliverableEntries = [
  { name: 'motion.pdf', url: deliverableUrls.motionPdf, type: 'motion' },
  { name: 'instruction-sheet.pdf', url: ..., type: 'instruction_sheet' },
  { name: 'citation-report.pdf', url: ..., type: 'citation_report' },
  { name: 'caption-qc-report.pdf', url: ..., type: 'caption_qc_report' },
];
for (const entry of deliverableEntries) {
  if (entry.url) {
    await supabase.from('documents').insert({
      order_id: orderId,
      file_name: entry.name,
      file_url: `${storagePath}/${entry.name}`,
      is_deliverable: true,
      ...
    });
  }
}
```

**SP12-05 (🔴 CRITICAL):** Download route at `app/api/orders/[id]/download/route.ts:36` queried `select('user_id, status')` but the orders table uses `client_id`. The query returned `undefined` for `user_id`, making the ownership check `order.user_id !== user.id` always fail for non-admin users. Downloads were impossible for clients.

**Fix:** Changed all references from `user_id` to `client_id`.

**SP12-06 (🔴 CRITICAL):** Same `user_id` vs `client_id` bug in `lib/storage/signed-url.ts:64`. The `generateOrderDeliverableUrls()` function queried for `user_id` which doesn't exist, so the ownership check always failed.

**Fix:** Changed `user_id` to `client_id` in select and comparison.

---

## TRACE 6: Stripe Payment → Order Creation → Workflow Trigger

### Data Flow Diagram
```
Stripe payment_intent.succeeded → POST /api/webhooks/stripe
         ↓
Find order by stripe_payment_intent_id
         ↓
Update order status to "under_review"
         ↓
inngest.send("order/submitted", { orderId })
         ↓
Inngest function starts workflow

--- OR ---

Stripe checkout.session.completed → handleCheckoutSessionCompleted()
         ↓
Update order status to "under_review"
         ↓
Check order?.filing_deadline ← 🔴 Not selected! Always undefined!
         ↓
inngest.send() NEVER fires from this path
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Stripe webhook | orders query | stripe_payment_intent_id | ✅ OK | L273 |
| Order update | status | "under_review" | ✅ OK | L329 |
| payment_intent path | inngest.send | orderId + filing_deadline | ✅ OK | L411-414 (selects filing_deadline) |
| checkout session path | order select | filing_deadline | 🔴 MISSING | L665 selects only 'id, order_number' |
| checkout session path | inngest.send | condition check | 🔴 NEVER FIRES | L685 checks order?.filing_deadline → always undefined |
| Order creation API | documents | is_deliverable | 🔴 MISSING | L190-198 no is_deliverable set |
| Automation start API | inngest.send | orderId | ✅ OK | L94-101 |

### Bugs Found & Fixed

**SP12-03 (🔴 CRITICAL):** In `handleCheckoutSessionCompleted()` at `app/api/webhooks/stripe/route.ts:658-666`, the order update selects only `id, order_number` but NOT `filing_deadline`. The Inngest trigger on L685 checks `order?.filing_deadline` which is always `undefined`. The workflow **never fires** from the checkout session path.

**Fix:** Added `filing_deadline` to the select:
```typescript
.select('id, order_number, filing_deadline')
```

**SP12-02 (🔴 CRITICAL):** The order creation API at `app/api/orders/route.ts:190-198` inserts documents without `is_deliverable: false`. Postgres defaults the column to NULL. The document extractor query `.neq('is_deliverable', true)` cannot match NULL rows (NULL ≠ true evaluates to NULL in Postgres, not TRUE).

**Fix:** Added `is_deliverable: false` to document insert:
```typescript
const documentsData = body.documents.map((doc) => ({
  ...existingFields,
  is_deliverable: false, // SP12-02 FIX
}))
```

### Race Condition Analysis
The order creation API (L239-242) explicitly does NOT start automation. Instead:
1. Client uploads documents first
2. Client calls `/api/automation/start` after uploads complete
3. This prevents the documents-before-workflow race condition

The Stripe webhook path (payment_intent.succeeded) can also trigger the workflow (L411), but this is a secondary path. The primary path through `/api/automation/start` is race-condition-safe.

---

## TRACE 7: Citation Verification Pipeline

### Data Flow Diagram
```
Phase III output → Phase IV Init (extract legal elements)
         ↓
Phase IV Batches (CourtListener searches, parallelized)
         ↓
Phase IV Aggregate (score + select citations)
         ↓
workflowState.phaseOutputs["IV"] = { caseCitationBank, statutoryCitationBank }
         ↓
Phase V reads phaseOutputs["IV"] → buildCitationEnforcementPrompt()
         ↓
Phase V prompt includes VERIFIED CITATION BANK
         ↓
Phase V.1 validates citations in draft against bank
         ↓
Phase VII.1 re-validates after revision
         ↓
Final deliverables extract citations from Phase IV output
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Phase III | Phase IV Init | legal elements | ✅ OK | Via previousPhaseOutputs["III"] |
| Phase IV Init | Phase IV Batches | searchTasks | ✅ OK | L1401-1415 |
| Phase IV Batches | Phase IV Aggregate | batchResults | ✅ OK | L1418-1420 |
| Phase IV Aggregate | phaseOutputs["IV"] | caseCitationBank | ✅ OK | L1454 |
| Phase IV Aggregate | phaseOutputs["IV"] | statutoryCitationBank | ✅ OK | L1454 |
| phaseOutputs["IV"] | Phase V | citation enforcement prompt | ✅ OK | buildCitationEnforcementPrompt() |
| Phase V draft | Phase V.1 | draft + bank → validation | ✅ OK | |
| Phase V draft | Phase VII | judge simulation input | ✅ OK | |
| Phase IV output | generateDeliverables | citation count | ✅ OK | L736-740 |

### Bugs Found
None. The citation pipeline is properly wired. Key safety mechanisms in place:
- Citation enforcement prompt is injected at the TOP of Phase V/VIII prompts
- Post-generation validation via `validateDraftCitations()`
- [CITATION NEEDED] fallback when no citation fits
- Circuit breaker for CourtListener API failures

---

## TRACE 8: Quality Gate → Revision Loop

### Data Flow Diagram
```
Phase VII (Judge Simulation) → { evaluation: { grade, numericGrade } }
         ↓
workflowState.currentGrade = grade (LetterGrade)
         ↓
while (!gradePasses(currentGrade) && revisionLoopCount < MAX_REVISION_LOOPS)
  ↓
  Phase VIII (Revisions) → revisedMotion
  Phase VII.1 (Citation re-check)
  Phase VII (Re-grade) → new grade
  revisionLoopCount++
         ↓
If no revision needed: phaseOutputs["VIII"] = phaseOutputs["V"]
Continue to Phase VIII.5 → IX → IX.1 → X
```

### Handoff Verification

| From | To | Field/Data | Status | Issue |
|------|----|-----------|--------|-------|
| Phase VII output | workflowState.currentGrade | grade string | ✅ OK | L1627 with camelCase fallback |
| currentGrade | gradePasses() | LetterGrade → GRADE_VALUES lookup | ✅ OK | types/workflow.ts:836 |
| Revision loop | Phase VIII input | revisionLoop counter | ✅ OK | L1690 |
| Phase VIII output | phaseOutputs["VIII"] | revised motion | ✅ OK | L1703-1704 |
| Phase VII.1 | citation re-check | reads phaseOutputs["VIII"] | ✅ OK | L1713 |
| Loop counter | DB | workflow_state.revision_loop_count | ✅ OK | L1735-1740 |
| No revision | VIII slot | Phase V carried forward | ✅ OK | L1776-1778 |

### Bugs Found
None. The revision loop is correctly implemented:
- `gradePasses()` from `types/workflow.ts` accepts `LetterGrade` and does `GRADE_VALUES[grade] >= MINIMUM_PASSING_VALUE`
- Loop counter is at workflow level (not step-level), preventing reset on retry (BUG-11 fix)
- Maximum 3 revision loops enforced
- Phase VIII → VII.1 → VII ordering is correct (was BUG-03 fix)

---

## ADDITIONAL PATTERN CHECKS

### Pattern 1: NULL column filters
Verified all `.eq()` and `.neq()` queries against columns that could be NULL:
- `document-extractor.ts:303` `.neq('is_deliverable', true)` — ⚠️ Would miss NULL rows, but new docs now explicitly set `false` (SP12-02 fix ensures order API also sets it)
- `deliverables/route.ts:181` `.eq('is_deliverable', true)` — ✅ Now has matching rows (SP12-04 fix)

### Pattern 2: Empty array/string passed as "documents"
- `buildPhaseInput()` — 🔴 Was broken, now ✅ FIXED (SP12-01)
- Phase I prompt fallback: `input.documents?.join('\n') || 'None provided'` — ✅ Works correctly with empty array (joins to '' which is falsy)

### Pattern 3: Inngest step.run() data persistence
All 14 phases store outputs OUTSIDE step.run() via assignment to `workflowState.phaseOutputs["X"]` between step calls. ✅ Correct pattern.

### Pattern 4: Supabase storage download paths
- Upload uses relative paths (e.g., `orders/{uuid}/deliverables/motion.pdf`) ✅
- Download uses `.from('documents').getPublicUrl(file_url)` which expects relative path ✅

### Pattern 5: JSON.stringify in prompts
Phase outputs passed to next phases via `previousPhaseOutputs` as raw objects. Individual phase executors access specific keys (e.g., `previousPhaseOutputs['I'].classification`). No JSON.stringify round-trip issues found.

---

## FILES MODIFIED

1. `lib/inngest/workflow-orchestration.ts` — SP12-01 (documents fallback), SP12-04 (deliverable records)
2. `app/api/orders/route.ts` — SP12-02 (is_deliverable: false)
3. `app/api/webhooks/stripe/route.ts` — SP12-03 (filing_deadline in select)
4. `app/api/orders/[id]/download/route.ts` — SP12-05 (client_id fix)
5. `lib/storage/signed-url.ts` — SP12-06 (client_id fix)
6. `lib/workflow/hold-service.ts` — SP12-07 (on_hold status)
