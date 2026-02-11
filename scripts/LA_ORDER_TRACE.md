# Louisiana Motion Data Flow Trace

**SP10 Task 3 — End-to-End Jurisdiction Path**
**Date**: 2026-02-11

---

## Flow Summary

```
Client POST → orders table → Inngest event → gatherOrderContext() →
WorkflowState → buildPhaseInput() → Phase Executors (I–X) →
Phase X: DOCX + PDF generators → RuleLookupService → louisiana.json
```

---

## Step 1: Order Submission

**File**: `app/api/orders/route.ts`

- Client submits `{ jurisdiction: "LA State Court", ... }` via POST `/api/orders`
- Zod validates `jurisdiction: z.string().min(1)`
- Server extracts state code: `"LA"` via regex
- Checks `isStateAcceptingOrders(supabase, "LA", motionType)`
- Inserts into `orders` table with `jurisdiction: "LA State Court"` (original format preserved)

**DB Column**: `orders.jurisdiction` — `text NOT NULL`

---

## Step 2: Inngest Event Trigger

**File**: `lib/inngest/workflow-orchestration.ts` (Line ~904)

- Stripe webhook or manual trigger fires `order/submitted` event
- Inngest picks up with `generateOrderWorkflow` function
- Concurrency: 5 global, 1 per-order lock
- Timeout: 15 minutes

---

## Step 3: Order Context Gathering

**File**: `lib/workflow/orchestrator.ts` (Line ~162)

```typescript
gatherOrderContext(orderId) → OrderContext {
  jurisdiction: order.jurisdiction || 'Federal',  // Line 246
  courtDivision: order.court_division,
  // ... all order fields
}
```

- Fetches from `orders` table via Supabase
- Fallback: `'Federal'` if jurisdiction is null/empty
- For Louisiana: `jurisdiction = "LA State Court"` or `"la_state"`

---

## Step 4: Workflow State Initialization

**File**: `lib/inngest/workflow-orchestration.ts` (Lines ~958–1170)

```typescript
const state: WorkflowState = {
  orderId,
  workflowId,
  tier: orderContext.motionTier,
  orderContext: orderContext,  // jurisdiction lives here
  phaseOutputs: {},
  revisionLoopCount: 0,
  citationCount: 0,
};
```

---

## Step 5: Phase Input Construction

**File**: `lib/inngest/workflow-orchestration.ts` (Lines ~167–204)

```typescript
function buildPhaseInput(state: WorkflowState): PhaseInput {
  return {
    jurisdiction: state.orderContext.jurisdiction,  // Line 172
    // ... all other phase input fields
  };
}
```

Jurisdiction is **explicitly extracted** from OrderContext and passed to every phase.

---

## Step 6: Phase Execution (Phases I–X)

**File**: `lib/workflow/phase-executors.ts` (DO NOT TOUCH)

- All 14 phases receive `PhaseInput` with `jurisdiction` field
- Jurisdiction is embedded in Claude superprompt:
  - Case Information header: `Court/Jurisdiction: ${orderContext.jurisdiction}`
  - Drafting instruction: `Prioritize binding authority from ${orderContext.jurisdiction}`
- Louisiana: Claude AI knows to cite Louisiana Civil Code, La. C.C.P., La. R.S.

---

## Step 7: Phase X — DOCX Generation

**File**: `lib/documents/docx-generator.ts`

```
input.jurisdiction ("LA State Court" or "la_state")
  → normalizeJurisdiction() → "la_state"
  → getFormattingRules("la_state")
    → RuleLookupService.getFormattingRules({ stateCode: "la", isFederal: false })
    → loads data/formatting/configs/states/louisiana.json
    → convertToLegacyRules()
    → FormattingRules {
        paperSize: { widthDXA: 12240, heightDXA: 20160, name: "legal" },
        margins: { top: 2, bottom: 1, left: 1.5, right: 1 },
        font: { name: "Times New Roman", size: 12 },
        lineNumbers: false,
      }
```

**Applied in DOCX**:
- `page.size.width: 12240` (8.5")
- `page.size.height: 20160` (14" — legal paper)
- `page.margin.top: convertInchesToTwip(2)` = 2880
- `page.margin.left: convertInchesToTwip(1.5)` = 2160

---

## Step 8: Phase X — PDF Generation

**File**: `lib/workflow/pdf-generator.ts`

```
generatePDFFromWorkflow(orderId, workflowId)
  → query orders table → order.jurisdiction = "LA State Court"
  → MotionDocument { jurisdiction: "la_state" }
  → generateDetailedMotionPDF(doc)
    → getPageDimensions("la_state")
      → parseJurisdictionForPDF("la_state") → { stateCode: "la", isFederal: false }
      → RuleLookupService.getFormattingRules({ stateCode: "la", isFederal: false })
      → dxaToPoints(12240) = 612pt width
      → dxaToPoints(20160) = 1008pt height (14" legal paper)
      → dxaToPoints(2880) = 144pt top margin (2")
      → dxaToPoints(2160) = 108pt left margin (1.5")
    → PageDimensions { pageWidth: 612, pageHeight: 1008, ... }
```

**Applied in PDF**:
- `pdfDoc.addPage([612, 1008])` — legal paper
- All drawing functions receive `dims` parameter
- Caption, title, sections, signature block all use legal-paper coordinates

---

## Louisiana-Specific Values (Source: louisiana.json)

| Property | DXA | Inches | Points |
|---|---|---|---|
| Paper Width | 12,240 | 8.5" | 612 |
| Paper Height | 20,160 | 14" | 1,008 |
| Top Margin | 2,880 | 2" | 144 |
| Bottom Margin | 1,440 | 1" | 72 |
| Left Margin | 2,160 | 1.5" | 108 |
| Right Margin | 1,440 | 1" | 72 |
| Font | Times New Roman 12pt | — | — |
| Line Spacing | 480 DXA (double) | — | 24pt |
| Line Numbers | disabled | — | — |
| Jurat | affidavit type | — | — |

---

## Normalization Functions (3 independent parsers)

| Function | File | Input Example | Output |
|---|---|---|---|
| `normalizeJurisdiction()` | docx-generator.ts:296 | `"LA State Court"` | `"la_state"` |
| `parseJurisdictionString()` | formatting-engine.ts:236 | `"la_state"` | `{ stateCode: "la", isFederal: false }` |
| `parseJurisdictionForPDF()` | pdf-generator.ts:87 | `"la_state"` | `{ stateCode: "la", isFederal: false }` |

---

## Fallback Chain

1. RuleLookupService loaded (51 states) → use JSON config (authoritative)
2. RuleLookupService empty → fall back to `JURISDICTION_RULES["la_state"]` hardcoded
3. Unknown jurisdiction → fall back to `JURISDICTION_RULES["la_state"]` (Louisiana is default)
4. Phase X missing jurisdiction → defaults to `"la_state"` (line 3827)

---

## Key Files

| File | Role |
|---|---|
| `app/api/orders/route.ts` | Order creation, jurisdiction validation |
| `lib/workflow/orchestrator.ts` | Context gathering, superprompt building |
| `lib/inngest/workflow-orchestration.ts` | Workflow state, phase input construction |
| `lib/workflow/phase-executors.ts` | Phase execution (DO NOT TOUCH) |
| `lib/documents/formatting-engine.ts` | Bridge: RuleLookupService → legacy FormattingRules |
| `lib/documents/docx-generator.ts` | DOCX generation with jurisdiction-aware paper |
| `lib/workflow/pdf-generator.ts` | PDF generation with jurisdiction-aware dimensions |
| `lib/services/formatting/rule-lookup.ts` | Singleton service loading 51 state JSON configs |
| `data/formatting/configs/states/louisiana.json` | Louisiana formatting rules (authoritative) |
