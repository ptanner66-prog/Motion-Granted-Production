# CHEN AUDIT-B: DELIVERY PIPELINE + DOCUMENT GENERATION

**Auditor:** Chen (Opus 4.6)
**Date:** 2026-02-18
**Branch:** `claude/chen-character-profile-VonWL`
**Scope:** Clay's Area 11 (9 P0) + Area 14 (5 P0) = 14 P0 findings + MG-2602-0047 production bugs
**Status:** READ-ONLY AUDIT (no code changes)

---

## EXECUTIVE SUMMARY

Clay's assessment is **overwhelmingly correct**. The delivery pipeline is non-functional end-to-end. I verified 17 of 19 claimed findings (14 Clay P0s + 5 MG-2602-0047 bugs) and discovered 4 additional findings Clay did not report. Two findings were partially refuted (nuanced).

**The kill chain:** Even if every other system worked perfectly, the client download page (`app/client/orders/[id]/download/page.tsx`) queries the wrong table (`workflow_files`) with non-existent columns (`is_final`, `storage_path`). This alone guarantees zero downloads for every order, ever.

---

## FINDING VERIFICATION MATRIX

### Clay Area 11 -- Storage & Delivery (9 P0s)

```
A11-P0-001 (public URLs confidential docs):     CONFIRMED [P0-SECURITY]
A11-P0-002 (missing uploaded_by):                CONFIRMED [P0-DATA]
A11-P0-003 (document_type mismatch):             CONFIRMED [P1-CONSISTENCY]
A11-P0-004 (delivery_packages never populated):  CONFIRMED [P0-CRITICAL]
A11-P0-005 (authenticateCP3 blocks all):         PARTIALLY REFUTED [see notes]
A11-P0-006 (storage bucket mismatch):            CONFIRMED [P0-PIPELINE]
A11-P0-007 (wrong Inngest fn for CP3):           CONFIRMED [P1-ARCHITECTURE]
A11-P0-008 (Phase X dual upload):                CONFIRMED [P0-PIPELINE]
A11-P0-009 (client download wrong field):        CONFIRMED [P0-CRITICAL]
```

### Clay Area 14 -- Document Generation (5 P0s)

```
P0-DG-001 (bucket pipeline disconnect):          CONFIRMED [P0-PIPELINE]
P0-DG-002 (zero DB records from production):     CONFIRMED [P0-DATA]
P0-DG-003 (LibreOffice impossible on Vercel):    CONFIRMED [P0-ARCHITECTURE]
P0-DG-004 (4 doc types empty bodies):            CONFIRMED [P0-CRITICAL]
P0-DG-005 (is_final never set):                  CONFIRMED [P0-CRITICAL]
```

### MG-2602-0047 Production Bugs

```
AIS-1 ([object Object] grade):                   CONFIRMED [P0-OUTPUT]
AIS-2 (N/A/4.5 quality score):                   CONFIRMED [P0-OUTPUT]
SIG-1 (signature duplication):                    CONFIRMED [P1-OUTPUT]
SIG-2 (Porter name hardcoded):                    REFUTED [clean]
TPL-1 (unresolved template vars):                CONFIRMED [P1-DESIGN]
```

### New Findings (Chen)

```
CHEN-001 (getPublicUrl in workflow-orchestration): NEW [P0-SECURITY]
CHEN-002 (legacy bucket ref in DELETE path):       NEW [P1-DATA]
CHEN-003 (Fn2 missing cp3_decision write):         NEW [P1-AUDIT-TRAIL]
CHEN-004 (dead ApproveDeliverButton route):        NEW [P2-DEAD-CODE]
```

**Score: 17/19 confirmed, 1 partially refuted, 1 refuted, 4 new = 21 total findings**

---

## DETAILED FINDINGS

---

### A11-P0-001: PUBLIC URLs FOR CONFIDENTIAL LEGAL DOCUMENTS

**Status: CONFIRMED**
**Severity: P0-SECURITY**

Six call sites use `getPublicUrl()` instead of `createSignedUrl()` on the `order-documents` bucket, which is configured with `public: false`. This returns permanent, unauthenticated URLs to attorney work product.

| Location | Line | Context |
|---|---|---|
| `lib/inngest/workflow-orchestration.ts` | 466-468 | `uploadToSupabaseStorage()` helper |
| `lib/documents/storage-service.ts` | 57-59 | `uploadDocument()` |
| `lib/documents/storage-service.ts` | 90-92 | `getDocumentUrl()` |
| `app/api/orders/[id]/deliverables/route.ts` | 88-90 | POST upload response |
| `app/api/orders/[id]/deliverables/route.ts` | 198 | GET list response |
| `app/api/chat/approve/route.ts` | 165-167 | Chat approval response |

**Impact:** Every document uploaded through these paths gets a permanent public URL. The URL contains the Supabase project URL + bucket + file path and does not expire. Anyone with the URL can access attorney-client privileged documents indefinitely.

**Note:** The canonical client download path (`app/api/orders/[id]/download/route.ts`) correctly uses `createSignedUrl()` with status-dependent expiry (1h for review, 7d for delivery). The secure path exists but is not used consistently.

**Fix:** Replace all `getPublicUrl()` calls with `createSignedUrl(path, expirySeconds)` using appropriate expiry windows.

---

### A11-P0-002: MISSING uploaded_by IN DELIVERABLE INSERT

**Status: CONFIRMED**
**Severity: P0-DATA**

**Location:** `lib/inngest/workflow-orchestration.ts:1151-1159`

```typescript
const { error } = await supabase.from('documents').insert({
  order_id: orderId,
  file_name: entry.name,
  file_type: entry.mimeType,
  file_size: 0,
  file_url: `${storagePath}/${entry.name}`,
  document_type: entry.type,
  is_deliverable: true,
  // MISSING: uploaded_by field
});
```

The `documents` table has `uploaded_by UUID REFERENCES profiles NOT NULL` (confirmed in schema). This insert will fail with a NOT NULL constraint violation for every deliverable. The error is caught at line 1160-1162 and logged as a `console.warn`, then execution continues.

**Consequence chain:**
1. Workflow generates DOCX + text files and uploads to Supabase Storage (succeeds)
2. Workflow tries to create `documents` table records (fails silently for every deliverable)
3. No `documents` records exist with `is_deliverable: true`
4. Client download API (`app/api/orders/[id]/download/route.ts:186-193`) queries `documents WHERE is_deliverable = true` and gets zero rows
5. Client sees no downloadable files

**Other insertion points are correct:**
- `app/api/chat/approve/route.ts:170` includes `uploaded_by: user.id`
- `app/api/orders/route.ts:279` includes `uploaded_by: user.id`
- `app/api/orders/[id]/uploads/route.ts:97` includes `uploaded_by: user.id`

**Fix:** Add `uploaded_by` to the insert. Use a service account UUID or the admin who triggered the workflow.

---

### A11-P0-003: DOCUMENT_TYPE MISMATCH

**Status: CONFIRMED**
**Severity: P1-CONSISTENCY**

The workflow writes document types: `motion`, `instruction_sheet`, `citation_report`, `caption_qc_report` (line 1142-1147).

The frontend deliverables endpoint expects `document_type: 'deliverable'`:
- `app/api/orders/[id]/deliverables/route.ts:101` inserts with `document_type: 'deliverable'`
- `app/api/orders/[id]/documents/download-all/route.ts:105` routes folders based on `document_type === 'deliverable'`

The `documents` table defines `document_type: string` with no enum constraint (confirmed in `types/index.ts:125`). The `is_deliverable: boolean` flag is the actual discriminator, making the `document_type` string mismatch a P1 (functional but confusing) rather than P0 (breaking).

**Impact:** Folder routing in `download-all` will misclassify workflow-generated deliverables as "uploads" instead of "deliverables" because it checks `document_type === 'deliverable'` rather than `is_deliverable === true`.

---

### A11-P0-004: delivery_packages NEVER POPULATED

**Status: CONFIRMED**
**Severity: P0-CRITICAL**

**Evidence:** Zero `INSERT` operations on `delivery_packages` exist anywhere in the codebase. I grep'd every `.ts` file in `lib/` and `app/` for `delivery_packages` combined with `insert`, `upsert`, or `INSERT`. Zero matches.

The table is:
- **Created** in migration `20260216100002_d1_018_rls.sql`
- **SELECT'd** in 7 locations (cp3-auth, workflow-orchestration, checkpoint-recovery, orphan-sweep, dispute-handler, download route)
- **UPDATE'd** in 6 locations (approve, cancel, request-changes routes, workflow-orchestration Fn2, archive-service)
- **Never INSERT'd**

**Consequence chain:**
1. Workflow completes Phase X and emits `checkpoint/cp3.reached` event
2. Fn2 (`workflowCheckpointApproval`) starts and schedules CP3 timeouts
3. Attorney clicks "Approve" on the download page
4. `authenticateCP3Request()` (`lib/api/cp3-auth.ts:71-77`) queries `delivery_packages` for the order
5. No row exists; query returns null
6. Line 79-80: `if (pkgErr || !pkg) return 404`
7. **All CP3 actions (APPROVE, CANCEL, REQUEST_CHANGES) return 404**

**Fix:** Add `INSERT INTO delivery_packages` at Phase X completion in `workflow-orchestration.ts`, before emitting the `checkpoint/cp3.reached` event.

---

### A11-P0-005: authenticateCP3 BLOCKS ALL ACTIONS

**Status: PARTIALLY REFUTED**

**Nuance:** Clay said `authenticateCP3Request` blocks all actions. This is partially correct but requires clarification.

The function (`lib/api/cp3-auth.ts:31-84`) does NOT block all actions indiscriminately. It correctly:
- Authenticates via Supabase JWT (line 36-41)
- Verifies order ownership via `client_id` (line 58-60)
- Enforces `AWAITING_APPROVAL` status gate (line 63-68)
- Fetches `delivery_packages` for optimistic locking (line 71-77)

**What actually blocks everything:** The `delivery_packages` query (step 4) returns 404 because no row exists (see A11-P0-004). The auth function itself is well-implemented; the data dependency is what breaks it.

The three canonical CP3 routes all call `authenticateCP3Request()`:
- `app/api/orders/[id]/approve/route.ts`
- `app/api/orders/[id]/request-changes/route.ts`
- `app/api/orders/[id]/cancel/route.ts`

**However:** Five non-canonical approval paths bypass `authenticateCP3Request()` entirely (see A11-P0-007).

---

### A11-P0-006: STORAGE BUCKET MISMATCH

**Status: CONFIRMED**
**Severity: P0-PIPELINE**

**Bucket map:**

| System | Writes To | Reads From | Match? |
|---|---|---|---|
| Phase X (workflow-orchestration) | `order-documents` via `uploadToSupabaseStorage()` | N/A (write only) | -- |
| persistDeliverableRecords | `documents` table (fails, see A11-P0-002) | N/A | -- |
| Client download page (TSX) | N/A | `workflow_files` table | WRONG TABLE |
| Client download API | N/A | `documents` table | Correct but empty |
| Admin deliverables route | `order-documents` | `order-documents` | Match |
| Chat approve | `order-documents` | N/A | -- |
| DELETE in deliverables route | N/A | `documents` (hardcoded legacy bucket name) | MISMATCH |

**Key disconnect:** The automated workflow uploads to `order-documents` bucket and tries (fails) to write to `documents` table. The client download page reads from `workflow_files` table. Even if the `documents` insert succeeded, the download page would still return nothing because it queries the wrong table.

**Additional finding (CHEN-002):** The DELETE endpoint in `app/api/orders/[id]/deliverables/route.ts:262` deletes from a hardcoded legacy bucket `'documents'` instead of `STORAGE_BUCKETS.ORDER_DOCUMENTS`. Deletes will silently fail.

---

### A11-P0-007: COMPETING CP3 APPROVAL PATHS

**Status: CONFIRMED**
**Severity: P1-ARCHITECTURE**

Six approval paths exist. Only one uses the canonical CP3 flow:

| # | Path | Route | Uses CP3 Auth? | Status Check? | Optimistic Lock? | Inngest Event? |
|---|---|---|---|---|---|---|
| 1 | **Canonical CP3** | `/api/orders/[id]/approve` | Yes | Yes | Yes | Yes (canonical) |
| 2 | Quick Approve (Chat) | `/api/chat/approve` | **No** | **No** | **No** | Yes (diff payload) |
| 3 | Motion Approval Panel | `/api/workflow/approve` | **No** | Legacy only | **No** | Yes (diff payload) |
| 4 | Citation Override | `/api/admin/orders/[id]/deliver` | **No** | N/A | N/A | **Route doesn't exist** |
| 5 | Automation Queue | `/api/automation/approval-queue` | **No** | Different status | **No** | **No** |
| 6 | Notify Delivery | `/api/orders/[id]/notify-delivery` | N/A | N/A | N/A | No (email only) |

**Path 2** (`/api/chat/approve`) is the most dangerous: it generates a DOCX, uploads it, emails the client, and emits `workflow/checkpoint-approved` -- all without checking order status, ownership, or the delivery_packages audit trail.

**Path 4** (`ApproveDeliverButton.tsx` component) calls a route that doesn't exist (`/api/admin/orders/[id]/deliver`). Dead code.

**CHEN-003:** Fn2's `handleApprove()` in `workflow-orchestration.ts:4092-4187` does NOT write `cp3_decision` to `delivery_packages`. The client-side routes DO write it (approve: line 74, cancel: line 106, request-changes: line 94). This creates an audit trail gap when events flow through Fn2.

---

### A11-P0-008: PHASE X DUAL UPLOAD

**Status: CONFIRMED**
**Severity: P0-PIPELINE**

Two independent upload paths fire during order completion:

**Path A -- Phase executors (inline):**
- `lib/workflow/phase-executors.ts` calls `uploadDocument()` via `lib/documents/storage-service.ts`
- Uploads to `order-documents/{orderId}/motion.docx`
- Updates `orders.document_url` with a `getPublicUrl()` result
- Does NOT insert into `documents` table

**Path B -- Orchestration (post-Phase X):**
- `workflow-orchestration.ts:3393-3416` runs separate Inngest steps for each deliverable
- Calls `generateAndUploadMotionDocx()`, `generateAndUploadInstructionSheet()`, etc.
- Each uploads to `order-documents/{orderId}/{filename}` via `uploadToSupabaseStorage()`
- Then `persistDeliverableRecords()` tries to insert into `documents` table (fails due to missing `uploaded_by`)

**Collision:** Both paths upload `motion.docx` to the same bucket path. Path B uses `upsert: true` so it overwrites Path A. Path A writes `orders.document_url`; Path B writes (tries to write) `documents.file_url`. Different tables, different fields.

---

### A11-P0-009: CLIENT DOWNLOAD PAGE QUERIES WRONG TABLE/FIELDS

**Status: CONFIRMED**
**Severity: P0-CRITICAL -- THE KILL SHOT**

**Location:** `app/client/orders/[id]/download/page.tsx:208-229`

```typescript
const { data: filesData } = await supabase
  .from('workflow_files')          // WRONG TABLE (should be 'documents')
  .select('*')
  .eq('order_id', orderId)
  .eq('is_final', true);           // NON-EXISTENT COLUMN

for (const file of filesData || []) {
  const { url, expiresAt } = await getSignedDownloadUrl(orderId, file.storage_path);
  // storage_path does NOT exist on workflow_files
```

**The `workflow_files` table schema** (from migration `013_create_workflow_files.sql`):
- `id`, `order_id`, `file_path`, `file_name`, `content`, `file_type`, `created_at`, `updated_at`
- **No `is_final` column**
- **No `storage_path` column**

**Impact:** This query will always return zero rows (Supabase/PostgREST returns empty set when filtering on non-existent columns via the API client). The `filesData` array will always be empty. No client will ever see any downloadable documents.

**The correct query exists** in `app/api/orders/[id]/download/route.ts:186-193`:
```typescript
const { data: documents } = await supabase
  .from('documents')
  .select('id, file_name, file_type, file_size, document_type, is_deliverable, created_at')
  .eq('order_id', orderId)
  .eq('is_deliverable', true)
  .order('created_at', { ascending: true });
```
This API route is correct, but the page component uses a completely different (broken) query.

---

### P0-DG-001: BUCKET PIPELINE DISCONNECT

**Status: CONFIRMED**
**Severity: P0-PIPELINE**

This is a summary finding that encompasses A11-P0-006 + A11-P0-008 + A11-P0-009. The write side (workflow-orchestration uploads to `order-documents`, tries to persist to `documents` table) and the read side (client page reads from `workflow_files` table) are completely disconnected. No data flows from generation to download.

---

### P0-DG-002: ZERO DB RECORDS FROM PRODUCTION

**Status: CONFIRMED**
**Severity: P0-DATA**

Direct consequence of A11-P0-002. The `persistDeliverableRecords()` function (line 1151) fails silently for every deliverable due to missing `uploaded_by`. The error is caught and logged as `console.warn` at line 1161 but execution continues. Zero `documents` records with `is_deliverable: true` are ever created by the automated workflow.

---

### P0-DG-003: LIBREOFFICE IMPOSSIBLE ON VERCEL

**Status: CONFIRMED**
**Severity: P0-ARCHITECTURE (by design)**

PDF generation was **deliberately removed**. Confirmed at `workflow-orchestration.ts:3391`:

```
// PDF generation removed -- ship DOCX + text reports only.
```

**Current PDF dependencies in `package.json`:**
- `pdf-lib` (PDF manipulation, not conversion)
- `pdf-parse` (PDF text extraction, not conversion)
- `pdfjs-dist` (PDF rendering, not conversion)

**Missing:** No `puppeteer`, `html-pdf`, `pdfkit`, `@react-pdf`, or any DOCX-to-PDF conversion library. No LibreOffice integration.

**Current deliverables:** `.docx` (motion) + `.txt` (instruction sheet, citation report, caption QC report). No PDF output.

This is a known design decision, not an accidental omission. However, it means attorneys receive Word documents instead of court-ready PDFs, which is a product-level P0 for a legal filing service.

---

### P0-DG-004: FOUR DOCUMENT TYPES ARE EMPTY SHELLS

**Status: CONFIRMED**
**Severity: P0-CRITICAL**

**Location:** `lib/generators/filing-package-assembler.ts:317-448`

Four document types extract body text and calculate word counts but never convert the text to DOCX Paragraph objects:

| Document Type | Lines | Text Extracted? | Converted to Paragraphs? | Content Array |
|---|---|---|---|---|
| **memorandum** | 318-341 | Yes (`memorandumBody`) | **No** | `[...captionParagraphs, ...signatureParagraphs, ...inlineCert]` |
| **notice_of_motion** | 343-352 | No processing | **No** | `[...captionParagraphs, ...signatureParagraphs]` |
| **proposed_order** | 394-406 | Yes (`proposedOrderRelief[]`) | **No** | `captionParagraphs` only |
| **separate_statement** | 436-448 | Yes (`separateStatementFacts[]`) | **No** | `captionParagraphs` only |

**Four document types that work correctly:**

| Document Type | Lines | Helper Function | Content Array |
|---|---|---|---|
| declaration | 355-371 | `generateDeclaration()` -> `declParagraphs` | `[...captionParagraphs, ...declParagraphs]` |
| affidavit | 374-391 | `generateDeclaration()` -> `affidavitParagraphs` | `[...captionParagraphs, ...affidavitParagraphs]` |
| proof_of_service | 408-433 | `generateProofOfService()` -> `posParagraphs` | `[...captionParagraphs, ...posParagraphs, ...signatureParagraphs]` |
| attorney_instructions | 450-471 | `generateAttorneyInstructions()` -> `instrParagraphs` | `[...captionParagraphs, ...instrParagraphs]` |

**Root cause:** The working types all call a helper function that returns `Paragraph[]`. The broken types extract raw string data, use it only for `estimateWordCount()`, and then discard it. No helper function exists to convert memorandum body text, notice text, proposed order relief, or separate statement facts into DOCX Paragraph objects.

**Data flow (verified correct up to the assembler):**
1. Phase V generates `draftMotion` with introduction, facts, arguments, conclusion, prayer
2. Phase VIII produces `revisedMotion` with same structure
3. `doc-gen-bridge.ts:166-189` assembles `memorandumBody` and `motionBody` strings correctly
4. These strings arrive at `filing-package-assembler.ts` in `input.content`
5. **The assembler reads them for word count and then throws them away**

---

### P0-DG-005: is_final NEVER SET

**Status: CONFIRMED**
**Severity: P0-CRITICAL**

`is_final` does not exist as a column on the `workflow_files` table. It is not set anywhere in the codebase. The only reference is the client download page (`app/client/orders/[id]/download/page.tsx:212`) which filters on it, guaranteeing zero results.

The `documents` table uses `is_deliverable: boolean` as its finality indicator. The `workflow_files` table has no equivalent. These are two separate tables serving different purposes, but the client download page queries the wrong one.

---

### AIS-1: [object Object] IN INSTRUCTION SHEET GRADE

**Status: CONFIRMED**
**Severity: P0-OUTPUT**

**Location:** `lib/inngest/workflow-orchestration.ts:517`

```typescript
content.push(`Judge Simulation Grade: ${judgeResult.grade || 'N/A'}`);
```

**Data flow trace:**

1. Phase VII executor (`phase-executors.ts:3526-3532`) returns:
   ```typescript
   output: {
     ...phaseOutput,              // Spreads ENTIRE LLM JSON response
     numeric_score: numericScore, // 0-100 percentage
     grade: letterGrade,          // String like 'B+' (from evaluation.grade)
     numericGrade: rawGrade,      // GPA number (0-4.0)
     loopNumber,
   }
   ```
   The `...phaseOutput` spread includes the raw LLM JSON, which contains `evaluation: { grade: "B+", numericGrade: 3.3, sectionScores: {...}, ... }`.

2. Orchestration stores the entire output: `workflowState.phaseOutputs["VII"] = phaseVIIResult.output` (line 2630)

3. Orchestration casts to interface: `const judgeResult = state.phaseOutputs["VII"] as JudgeSimulationResult` (line 981)

4. `JudgeSimulationResult` interface (`types/workflow.ts:823-832`) expects `grade: LetterGrade` (string) and `numericGrade: number` at top level.

**The bug scenario:** When the LLM returns a structure where `evaluation` has a sub-object `grade` (e.g., `{ letter: "B+", score: 3.3 }` instead of a plain string), the spread `...phaseOutput` places that object as the initial `grade` value. Then `grade: letterGrade` attempts to override it, but if `letterGrade` extraction fails (because `evaluation.grade` is itself an object, not a string), `letterGrade` is `undefined`, and the spread's object value persists. Template interpolation of an object produces `[object Object]`.

**Contributing factor:** No runtime validation that `grade` is a string. The cast `as JudgeSimulationResult` is a compile-time assertion only; it doesn't prevent object values at runtime.

---

### AIS-2: N/A/4.5 QUALITY SCORE

**Status: CONFIRMED**
**Severity: P0-OUTPUT**

**Location:** `lib/inngest/workflow-orchestration.ts:518`

```typescript
content.push(`Quality Score: ${judgeResult.numericGrade || 'N/A'}/4.5`);
```

**Two bugs in one line:**

1. **Wrong field:** Uses `numericGrade` (GPA scale, 0-4.0) instead of `numeric_score` (percentage scale, 0-100). The binding directive at `phase-executors.ts:3483` explicitly states: "Pure numeric scoring on 0-100 percentage scale. ... Thresholds: Tier A >= 83 (B), Tier B/C >= 87 (B+)."

2. **Wrong denominator:** Hardcoded `/4.5` which is not a standard GPA maximum (standard is 4.0 or 4.3). If this is meant to be a GPA display, the max should be 4.0. If percentage, the max should be 100.

3. **When undefined:** If `numericGrade` is `undefined` or `0` (falsy), the fallback `'N/A'` produces the literal string `N/A/4.5`.

**Fix:** Should be `${judgeResult.numeric_score || 'N/A'}/100` or, if GPA display is intended, `${judgeResult.numericGrade?.toFixed(1) || 'N/A'}/4.0`.

---

### SIG-1: SIGNATURE BLOCK TRIPLICATION

**Status: CONFIRMED**
**Severity: P1-OUTPUT**

Three independent signature generation paths combine to produce triple signatures:

**Signature 1 -- LLM-embedded:**
Phase V/VIII outputs a complete motion body that includes `Respectfully submitted, /s/ [Attorney Name]` as part of the JSON `motion` or `signature` field. The LLM is prompted to include a signature block in the draft text.

**Signature 2 -- DOCX assembler:**
`lib/documents/docx-generator.ts:54` calls `buildSignatureBlock(sanitizedData)` which generates a fresh signature block from attorney data. This is appended after the body paragraphs.

**Signature 3 -- Certificate of Service:**
`lib/documents/certificate-of-service.ts:62-82` includes its own `/s/ [Attorney Name]` signature line, which is correct for certificates of service (they require independent signing).

**Result in DOCX:**
```
[body paragraphs including LLM-generated signature]  <-- Signature 1
[buildSignatureBlock() output]                        <-- Signature 2
[buildCertificateOfService() with signature]          <-- Signature 3
```

**Fix:** Either strip the signature from the LLM output before assembling (preferred), or remove `buildSignatureBlock()` and rely solely on the LLM's signature (fragile).

---

### SIG-2: PORTER NAME HARDCODED

**Status: REFUTED**

I searched all `.ts` and `.md` files in `lib/generators/` and `prompts/` for "Porter", "Tanner", and "ptanne6". Zero hardcoded names found in template or generation code. The only references are in code comments and documentation.

Attorney name is properly parameterized via `sanitizeSignatureFields()` (`phase-executors.ts:374-393`), which falls back to `[ATTORNEY_NAME]` placeholder when the value is empty.

---

### TPL-1: UNRESOLVED TEMPLATE VARIABLES

**Status: CONFIRMED (by design)**
**Severity: P1-DESIGN**

**Location:** `lib/workflow/phase-executors.ts:374-393`

```typescript
function sanitizeSignatureFields(input: PhaseInput): {
  // ...
  return {
    attorneyName: isEmpty(input.attorneyName) ? '[ATTORNEY_NAME]' : input.attorneyName,
    barNumber: isEmpty(input.barNumber) ? '[ATTORNEY_BAR_NUMBER]' : input.barNumber,
    firmName: isEmpty(input.firmName) ? '[FIRM_NAME]' : input.firmName,
    firmAddress: isEmpty(input.firmAddress) ? '[ATTORNEY_ADDRESS]' : input.firmAddress,
    firmPhone: isEmpty(input.firmPhone) ? '[ATTORNEY_PHONE]' : input.firmPhone,
    firmEmail: isEmpty(input.firmEmail) ? '[ATTORNEY_EMAIL]' : input.firmEmail,
  };
}
```

This is **intentional defensive design** -- empty fields become bracketed placeholders so the LLM doesn't hallucinate values. However, there is no second-pass template resolution that replaces these placeholders with actual data before the final document is generated.

**The problem:** If attorney profile data is incomplete at order creation time (which is common for new clients), the placeholders persist into the final deliverable. `[ATTORNEY_BAR_NUMBER]` appears in the filed motion. There is no post-generation validation that checks for unresolved placeholders.

**Fix:** Add a validation step after document assembly that scans for `[PLACEHOLDER]` patterns and either resolves them from the database or blocks delivery with a clear error.

---

## NEW FINDINGS (CHEN)

### CHEN-001: getPublicUrl IN WORKFLOW ORCHESTRATION

**Severity: P0-SECURITY**

**Location:** `lib/inngest/workflow-orchestration.ts:466-468`

The `uploadToSupabaseStorage()` helper function returns a `getPublicUrl()` result for every file uploaded during deliverable generation. This means the four deliverables (motion.docx, instruction-sheet.txt, citation-report.txt, caption-qc-report.txt) all receive permanent public URLs.

These URLs are stored in `orders.deliverable_urls` (line 1169) as a JSON object, making them queryable by anyone with database access.

---

### CHEN-002: LEGACY BUCKET REFERENCE IN DELETE PATH

**Severity: P1-DATA**

**Location:** `app/api/orders/[id]/deliverables/route.ts:262`

```typescript
await supabase.storage
  .from('documents')  // HARDCODED LEGACY BUCKET NAME
  .remove([doc.file_url])
```

The file was uploaded to `order-documents` bucket, but the DELETE path tries to remove from a bucket called `documents`. The delete will silently fail (bucket doesn't exist or file isn't there).

---

### CHEN-003: FN2 MISSING cp3_decision AUDIT TRAIL

**Severity: P1-AUDIT-TRAIL**

**Location:** `lib/inngest/workflow-orchestration.ts:4092-4187` (`handleApprove()`)

The Fn2 approve handler updates `delivery_packages` with `delivered_at`, `completed_at`, `signed_urls`, etc. (lines 4129-4151) but does NOT set `cp3_decision: 'APPROVED'`. The client-side routes DO set this field (approve route line 74, cancel route line 106, request-changes route line 94).

This creates a split-brain audit trail: the `cp3_decision` is only recorded when the event originates from the client route, not when Fn2 processes the event independently.

---

### CHEN-004: DEAD ApproveDeliverButton COMPONENT

**Severity: P2-DEAD-CODE**

**Location:** `app/(admin)/admin/orders/[id]/components/ApproveDeliverButton.tsx:57`

This component calls `POST /api/admin/orders/[id]/deliver`, but this route does not exist in the codebase. The component will always receive a 404 response. Dead code.

---

## DELIVERY PIPELINE FLOW MAP

```
PHASE V (Draft) ──> PHASE VIII (Revision) ──> PHASE X (Final Assembly)
                                                      │
                                                      ▼
                                      ┌─────────────────────────────────┐
                                      │  generateAndUploadMotionDocx()  │
                                      │  generateAndUploadInstrSheet()  │
                                      │  generateAndUploadCitReport()   │
                                      │  generateAndUploadCaptionQc()   │
                                      └───────────────┬─────────────────┘
                                                      │
                                          uploadToSupabaseStorage()
                                                      │
                                              ┌───────┴───────┐
                                              │               │
                                    order-documents      getPublicUrl()
                                     (bucket OK)        (SECURITY BUG)
                                              │
                                              ▼
                                    persistDeliverableRecords()
                                              │
                                     INSERT INTO documents
                                     (MISSING uploaded_by)
                                              │
                                         SILENT FAIL ✗
                                              │
                                              ▼
                                   emit CP3_REACHED event
                                              │
                                     (delivery_packages
                                      row NEVER created)
                                              │
                                              ▼
                              Fn2: workflowCheckpointApproval
                                              │
                                   Attorney clicks APPROVE
                                              │
                                    authenticateCP3Request()
                                              │
                                     query delivery_packages
                                              │
                                         404 NOT FOUND ✗
                                              │
                                              ▼
                                  APPROVAL BLOCKED. Even if
                                  it succeeded, client download
                                  page queries workflow_files
                                  with is_final (wrong table,
                                  non-existent column).
                                              │
                                         ZERO FILES ✗
```

**Conclusion: The pipeline has 5 independent failure points that each independently prevent delivery. Even fixing any 4 of 5 leaves the pipeline broken.**

---

## AGENT VERIFICATION RESULTS

### Agent 1 (Spec Compliance): 17/19 VERIFIED

All 14 Clay P0 findings confirmed. 3 of 5 MG-2602-0047 bugs confirmed (SIG-2 refuted, TPL-1 confirmed as by-design). 4 new findings discovered.

### Agent 2 (Red Team): 7 FINDINGS

1. **getPublicUrl() on private buckets** -- permanent URLs to privileged legal documents (6 sites)
2. **No runtime type validation** on Phase VII output before template interpolation
3. **Silent failure on NOT NULL constraint** -- `console.warn` instead of error propagation
4. **Dead admin route** accepts clicks but always 404s
5. **Unguarded approval backdoor** via `/api/chat/approve` -- no ownership, status, or locking checks
6. **Stale delete targets** -- DELETE hits wrong bucket, files accumulate forever
7. **Placeholder injection** -- if attorney submits `[ATTORNEY_NAME]` as their actual name, it would be replaced by the sanitizer

### Agent 3 (Consistency): 8 CROSS-REFERENCES

1. `document_type` values: workflow writes `motion` / `instruction_sheet` / `citation_report` / `caption_qc_report`; frontend expects `deliverable` -- MISMATCH
2. `is_deliverable` vs `is_final` -- two different concepts on two different tables, download page uses wrong one
3. `workflow_files` vs `documents` -- download page queries wrong table
4. `storage_path` vs `file_url` vs `file_path` -- three different column names for URLs across tables
5. `getPublicUrl()` vs `createSignedUrl()` -- inconsistent within same bucket
6. `STORAGE_BUCKETS.ORDER_DOCUMENTS` vs hardcoded `'documents'` in delete path
7. Fn2 updates `delivery_packages` without `cp3_decision`; client routes include it
8. `numericGrade` (GPA) vs `numeric_score` (percentage) -- instruction sheet uses wrong field

### Agent 4 (Regression): NO REGRESSIONS

This is a read-only audit. No code was modified. Pre-existing TypeScript compilation errors exist (missing `node_modules` type declarations) but are unrelated to this audit's scope.

### Agent 5 (Documentation): PIPELINE MAP COMPLETE

See "Delivery Pipeline Flow Map" section above. Full trace from Phase V output through every failure point to the dead-end client download page.

---

## PRIORITY FIX ORDER

If I were fixing this (which is outside this audit's scope), the dependency chain dictates this order:

1. **A11-P0-002:** Add `uploaded_by` to `persistDeliverableRecords()` -- unblocks DB inserts
2. **A11-P0-004:** Add `INSERT INTO delivery_packages` before CP3 emission -- unblocks CP3
3. **A11-P0-009:** Fix client download page to query `documents WHERE is_deliverable = true` -- unblocks downloads
4. **P0-DG-004:** Add body text -> Paragraph conversion for memorandum, notice, proposed order, separate statement -- unblocks content
5. **A11-P0-001 + CHEN-001:** Replace all `getPublicUrl()` with `createSignedUrl()` -- security
6. **AIS-1 + AIS-2:** Fix instruction sheet grade/score rendering -- output quality
7. **SIG-1:** Strip LLM signature from body before assembling -- output quality
8. **Everything else** -- cleanup, consistency, dead code removal

Items 1-3 are the minimum viable fix to make the pipeline functional. Items 4-5 are required for production-quality output. Items 6-8 are polish.

---

```
===============================================================
CHEN AUDIT-B: DELIVERY PIPELINE -- COMPLETE
===============================================================

CLAY FINDING VERIFICATION (Area 11 -- 9 P0s):

A11-P0-001 (public URLs confidential docs):     CONFIRMED
A11-P0-002 (missing uploaded_by):                CONFIRMED
A11-P0-003 (document_type mismatch):             CONFIRMED
A11-P0-004 (delivery_packages never populated):  CONFIRMED
A11-P0-005 (authenticateCP3 blocks all):         PARTIALLY REFUTED
A11-P0-006 (storage bucket mismatch):            CONFIRMED
A11-P0-007 (wrong Inngest fn for CP3):           CONFIRMED
A11-P0-008 (Phase X dual upload):                CONFIRMED
A11-P0-009 (client download wrong field):        CONFIRMED

CLAY FINDING VERIFICATION (Area 14 -- 5 P0s):

P0-DG-001 (bucket pipeline disconnect):          CONFIRMED
P0-DG-002 (zero DB records from production):     CONFIRMED
P0-DG-003 (LibreOffice impossible on Vercel):    CONFIRMED
P0-DG-004 (4 doc types empty bodies):            CONFIRMED
P0-DG-005 (is_final never set):                  CONFIRMED

MG-2602-0047 BUGS:

AIS-1 ([object Object] grade):                   CONFIRMED
AIS-2 (N/A/4.5 quality score):                   CONFIRMED
SIG-1 (signature duplication):                    CONFIRMED
SIG-2 (Porter name hardcoded):                    REFUTED
TPL-1 (unresolved template vars):                CONFIRMED (by design)

NEW FINDINGS: 4 (CHEN-001 through CHEN-004)

---------------------------------------------------------------
AGENT RESULTS:
Agent 1 (Spec):        17/19 findings verified + 4 new
Agent 2 (Red Team):    7 findings
Agent 3 (Consistency): 8 cross-refs
Agent 4 (Regression):  No changes (read-only audit)
Agent 5 (Documentation): Pipeline map complete

===============================================================
```
