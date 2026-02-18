# CHEN AUDIT-B: DELIVERY PIPELINE + DOCUMENT GENERATION

**Auditor:** Chen (Opus 4.6)
**Date:** 2026-02-18
**Scope:** Clay Area 11 (9 P0) + Area 14 (5 P0) + MG-2602-0047 (5 bugs)
**Status:** COMPLETE — 19 findings verified, 6 new findings discovered

---

## EXECUTIVE SUMMARY

Clay's assessment that the delivery pipeline is **non-functional end-to-end** is **CONFIRMED**. The pipeline has at minimum 6 independent fatal breakpoints between Phase V output and attorney download. Even if all other bugs were fixed, the client download page queries a table/column combination (`workflow_files.is_final`) where the column is never set by any code path, guaranteeing zero results.

Additionally, the Fn2 APPROVE handler (the final step before delivery) queries `order_deliverables.file_key` — but the table has `file_path` not `file_key`, and the table lacks an `order_id` column, making the query structurally impossible to succeed.

---

## CLAY FINDING VERIFICATION

### Area 11 — Document Delivery Pipeline (9 P0s)

#### A11-P0-001: Public URLs for Confidential Docs — CONFIRMED

**Evidence:**
- `lib/inngest/workflow-orchestration.ts:466-468` — `uploadToSupabaseStorage()` returns `getPublicUrl()` for all deliverables (motion.docx, instruction-sheet.txt, citation-report.txt, caption-qc-report.txt). These permanent public URLs are stored on the order record.
- `lib/documents/storage-service.ts:57-59` — `uploadDocument()` returns `getPublicUrl()` for all uploaded documents and writes it to `orders.document_url`.
- `app/api/orders/[id]/deliverables/route.ts:88-90` (POST) — Returns `getPublicUrl()` in response body.
- `app/api/orders/[id]/deliverables/route.ts:196-199` (GET) — Maps all deliverables through `getPublicUrl()` in API response.

**Impact:** Attorney-client privileged legal documents accessible indefinitely via guessable URLs. Anyone with the URL can access confidential motion content without authentication.

**Contrast:** The client download page (`app/client/orders/[id]/download/page.tsx:76-78`) and `lib/delivery/signed-urls.ts` correctly use `createSignedUrl()` with time-limited expiry. The inconsistency is between writer paths (public) and the canonical reader path (signed).

---

#### A11-P0-002: Missing uploaded_by — CONFIRMED

**Evidence:**
- `lib/inngest/workflow-orchestration.ts:1151-1158` — `persistDeliverableRecords()` inserts into `documents` table WITHOUT `uploaded_by` field.
- `supabase/migrations/20260216100002_d1_018_rls.sql:61` — `order_documents` table defines `uploaded_by UUID REFERENCES auth.users(id)`.
- `app/api/orders/[id]/deliverables/route.ts:102` — The manual upload path DOES include `uploaded_by: user.id`. Only the automated workflow path omits it.

**Impact:** Automated deliverables lack attribution. Audit trail incomplete for system-generated documents.

---

#### A11-P0-003: Document Type Mismatch — CONFIRMED

**Evidence:**

Workflow writes these `document_type` values (`lib/inngest/workflow-orchestration.ts:1142-1146`):
- `motion`, `instruction_sheet`, `citation_report`, `caption_qc_report`

Filing package assembler generates types (`lib/generators/filing-package-assembler.ts:36-44`):
- `notice_of_motion`, `memorandum`, `declaration`, `affidavit`, `separate_statement`, `proposed_order`, `proof_of_service`, `attorney_instructions`

Client download page expects (`app/client/orders/[id]/download/page.tsx:50`):
- `motion`, `exhibits`, `separate_statement`, `instructions`, `other`

Manual upload route hardcodes (`app/api/orders/[id]/deliverables/route.ts:101`):
- `deliverable`

**Mismatches:**
- Workflow writes `instruction_sheet` → Frontend expects `instructions`
- Workflow never writes `exhibits` or `separate_statement` → Frontend expects them
- Manual upload writes `deliverable` → Nothing expects this value
- Filing package types (`memorandum`, `notice_of_motion`, etc.) are never written to any database table

---

#### A11-P0-004: delivery_packages Never Populated — PARTIALLY REFUTED

**Evidence:**
- `delivery_packages` IS written to by the CP3 approval routes:
  - `app/api/orders/[id]/approve/route.ts:74` — Writes `cp3_decision: 'APPROVED'`
  - `app/api/orders/[id]/request-changes/route.ts:94` — Writes `cp3_decision: 'REQUEST_CHANGES'`
  - `app/api/orders/[id]/cancel/route.ts:106` — Writes `cp3_decision: 'CANCELLED'`
- `lib/inngest/workflow-orchestration.ts:4139-4149` — Fn2 `handleApprove()` writes `delivered_at`, `completed_at`, `signed_urls`, expiry.

**However:** The initial delivery_packages row creation is NOT visible in the codebase. No code path does `INSERT INTO delivery_packages`. The CP3 routes and Fn2 all do `UPDATE` on existing rows. If the row doesn't exist, all updates silently fail (Supabase updates return 0 rows affected without error).

**Status:** PARTIALLY CONFIRMED — The table is updated but may never be initially populated.

---

#### A11-P0-005: authenticateCP3 Blocks All Actions — REFUTED

**Evidence:**
- `lib/api/cp3-auth.ts:31-84` — Authentication function is well-structured:
  1. JWT validation (line 37)
  2. Order ownership check via `client_id` (line 58)
  3. Status gate: only `AWAITING_APPROVAL` (line 63)
  4. Delivery package existence check (line 71-77)
  5. Returns typed `CP3AuthContext` with order, package, and user data

- All three CP3 routes use this shared auth: approve, request-changes, cancel.
- The cancel route has a DUAL path: CP3 path (AWAITING_APPROVAL) uses authenticateCP3, pre-CP3 path uses its own auth.

**Status:** The auth function does NOT "block all actions" — it correctly gates on status and ownership. Clay's finding is REFUTED.

---

#### A11-P0-006: Storage Bucket Mismatch — CONFIRMED

**Evidence:**

**Writer paths (5 distinct bucket targets):**
1. `lib/inngest/workflow-orchestration.ts:455` → `STORAGE_BUCKETS.ORDER_DOCUMENTS` (`order-documents`) ← canonical
2. `lib/integration/storage-manager.ts:20` → `'filing-packages'` (hardcoded) ← separate bucket
3. `lib/documents/storage-service.ts:17` → `'order-documents'` (hardcoded string, matches canonical)
4. `lib/documents/generators/instruction-sheet.ts:552` → `'documents'` (LEGACY bucket)
5. `app/api/orders/[id]/deliverables/route.ts:75` → `STORAGE_BUCKETS.ORDER_DOCUMENTS` ← canonical

**Reader paths:**
1. `app/client/orders/[id]/download/page.tsx:77` → `'order-documents'` (hardcoded) ← canonical
2. `lib/delivery/signed-urls.ts:27` → `'order-documents'` ← canonical
3. `app/api/orders/[id]/deliverables/route.ts:262` → `'documents'` (LEGACY — DELETE handler)

**Bucket Mismatch Map:**
- `filing-packages` bucket: storage-manager writes → nothing reads
- `documents` bucket: instruction-sheet.ts writes → deliverables DELETE reads (both legacy)
- `order-documents` bucket: workflow-orchestration writes → client download reads (correct path)

**Impact:** Documents uploaded to `filing-packages` by doc-gen-bridge are unreachable by the download page. Instruction sheets uploaded to `documents` bucket are unreachable by the download page.

---

#### A11-P0-007: Wrong Inngest Function for CP3 — REFUTED

**Evidence:**
- The primary CP3 handler is `workflowCheckpointApproval` (Fn2) in `lib/inngest/workflow-orchestration.ts:3941+`. It triggers on `'checkpoint/cp3.reached'` and waits for `'workflow/checkpoint-approved'` events.
- There IS a secondary `handleCheckpointApproval` in `lib/inngest/functions.ts:1040` that triggers on `'workflow/checkpoint-approved'`, but it's an **observability logger** — it logs the event but does NOT perform state transitions. This is by design, not a conflict.
- The CP3 routes emit `WORKFLOW_CHECKPOINT_APPROVED` events that correctly wake Fn2's `waitForEvent`.

**Status:** REFUTED — Fn2 is the correct handler. The secondary function is an observer, not a competitor.

---

#### A11-P0-008: Phase X Dual Upload — PARTIALLY CONFIRMED

**Evidence:**
- Phase X does NOT upload documents. It's a QC gate (placeholder validation, citation check).
- Document upload happens in Phase VIII via `generateAndStoreFilingPackage()` (doc-gen-bridge → storage-manager → `filing-packages` bucket).
- Deliverable upload happens in the workflow orchestrator step `generate-deliverables` → `uploadToSupabaseStorage()` → `order-documents` bucket.
- These are TWO SEPARATE uploads to TWO DIFFERENT buckets for potentially overlapping content.

**Impact:** The same motion content exists in both `filing-packages` (from doc-gen-bridge) and `order-documents` (from workflow orchestrator). Only `order-documents` is reachable by the download page.

---

#### A11-P0-009: Client Download Wrong Field — CONFIRMED

**Evidence:**
- `app/client/orders/[id]/download/page.tsx:208-212`:
  ```typescript
  const { data: filesData } = await supabase
    .from('workflow_files')
    .select('*')
    .eq('order_id', orderId)
    .eq('is_final', true);
  ```
- The `workflow_files` table exists (`lib/workflow/file-system.ts` manages it) but has NO `is_final` column — not in any migration, not set by any code path.
- No code anywhere in the codebase sets `is_final` on any record.
- The workflow orchestrator writes deliverables to the `documents` table (line 1151), NOT `workflow_files`.

**Impact:** The download page query ALWAYS returns zero results. No documents are ever displayed to the attorney. This is the terminal failure in the delivery pipeline.

---

### Area 14 — Document Generation Pipeline (5 P0s)

#### P0-DG-001: Bucket Pipeline Disconnect — CONFIRMED

See A11-P0-006 above. The filing package assembler writes to `filing-packages`, instruction sheet writes to `documents`, workflow orchestrator writes to `order-documents`, and the client download page reads from `order-documents` via `workflow_files`. None of these paths connect.

---

#### P0-DG-002: Zero DB Records from Production — CONFIRMED (by inference)

**Evidence:**
- The `persistDeliverableRecords()` function at line 1151 inserts into `documents` table with `is_deliverable: true`. However:
  1. `is_deliverable` does not appear in any migration schema
  2. The column names don't match (`file_type` vs schema's `mime_type`, `file_url` vs schema's `file_path`)
  3. The `documents` table referenced in code may not exist (migrations define `order_documents`)
- Without a matching table/column schema, these inserts will fail silently in production.

---

#### P0-DG-003: LibreOffice Impossible on Vercel — CONFIRMED (modified)

**Evidence:**
- No LibreOffice binary, no puppeteer, no html-pdf in `package.json`.
- `package.json` has `pdf-lib` (1.17.1) for utility, `pdf-parse` (2.4.5) for parsing, `pdfjs-dist` for viewing — none for PDF generation.
- All document generation outputs DOCX via the `docx` npm package (9.5.1).
- The client download page checks for `application/pdf` type to show iframe preview (line 517) but all generated files are DOCX — preview never works.
- No DOCX-to-PDF conversion exists anywhere.

**Clay's finding is CONFIRMED with correction:** The issue isn't that LibreOffice is required but unavailable — it's that NO PDF conversion path exists at all. Attorneys receive DOCX files only.

---

#### P0-DG-004: 4 Doc Types Empty Bodies — CONFIRMED

**Evidence in `lib/generators/filing-package-assembler.ts`:**

1. **Memorandum** (line 330-339): `content: [...captionParagraphs, ...signatureParagraphs, ...inlineCert]` — the `bodyText` from `memorandumBody` is computed at line 319 but NEVER converted to Paragraph objects. Zero legal arguments in the DOCX.

2. **Notice of Motion** (line 345-351): `content: [...captionParagraphs, ...signatureParagraphs]` — zero hearing date, zero notice text.

3. **Proposed Order** (line 397-405): `content: captionParagraphs` — the `relief` array is extracted at line 395 but NEVER converted to ordering paragraphs. No signature line for the judge.

4. **Separate Statement** (line 440-447): `content: captionParagraphs` — the `separateStatementFacts` data is referenced but NEVER rendered into a facts table.

**Root cause:** The doc-gen-bridge correctly extracts legal text from Phase V/VIII output and passes it as strings (`motionBody`, `memorandumBody`) in the `AssemblerInput.content` object. But the assembler's `generateSingleDocument()` function never converts these strings to `Paragraph[]` objects. It generates the DOCX with caption + signature only.

---

#### P0-DG-005: is_final Never Set — CONFIRMED

**Evidence:**
- `app/client/orders/[id]/download/page.tsx:212` queries `workflow_files` WHERE `is_final = true`.
- Zero code paths in the entire codebase set `is_final` on any `workflow_files` record.
- The `workflow_files` table (managed by `lib/workflow/file-system.ts`) has columns: `id`, `order_id`, `file_path`, `file_name`, `content`, `file_type`, `created_at`, `updated_at`. No `is_final` column in the schema.
- The `writeFile()` function at line 119 inserts: `order_id`, `file_path`, `file_name`, `content`, `file_type`. No `is_final`.

**Impact:** Terminal failure. Even if every other bug were fixed, the download page would still return zero documents.

---

### MG-2602-0047 Bugs

#### AIS-1: [object Object] Grade — CONFIRMED (root cause identified)

**Evidence:**
- `lib/inngest/workflow-orchestration.ts:516-518`:
  ```typescript
  content.push(`Judge Simulation Grade: ${judgeResult.grade || 'N/A'}`);
  content.push(`Quality Score: ${judgeResult.numericGrade || 'N/A'}/4.5`);
  ```
- Line 981: `const judgeResult = state.phaseOutputs["VII"] as JudgeSimulationResult | undefined;`
- Phase VII executor (`lib/workflow/phase-executors.ts:3466`): `const phaseOutput = { ...parsed.data, phaseComplete: 'VII' }` — the raw LLM JSON is spread into the phase output.
- Line 3481: `const evaluation = (phaseOutput.evaluation as Record<string, unknown>) || phaseOutput;` — if `evaluation` is undefined, falls back to the entire phaseOutput.
- Line 3487: `const letterGrade = evaluation.grade as string | undefined;` — if the LLM returns `grade` as an object (e.g., `{ grade: { letter: "A", numeric: 3.85 } }`), `letterGrade` becomes an object.
- Line 3529: `grade: letterGrade` stores the object in the output.
- Instruction sheet renders: `Judge Simulation Grade: [object Object]`.

**Root cause:** The `as string` type assertion at line 3487 does NOT perform runtime conversion. If the LLM returns `grade` as a nested object, it passes through as-is. The instruction sheet template interpolation then calls `.toString()` on the object, producing `[object Object]`.

---

#### AIS-2: N/A/4.5 Quality Score — CONFIRMED (root cause identified)

**Evidence:**
- `lib/inngest/workflow-orchestration.ts:518`: `Quality Score: ${judgeResult.numericGrade || 'N/A'}/4.5`
- If `judgeResult.numericGrade` is `0` (a valid numeric score), `0 || 'N/A'` evaluates to `'N/A'` because `0` is falsy in JavaScript.
- Result: `Quality Score: N/A/4.5`

**Root cause:** Falsy value conflation. Should use `judgeResult.numericGrade ?? 'N/A'` (nullish coalescing) instead of `||` (logical OR).

---

#### SIG-1: Signature Block Duplication — PARTIALLY CONFIRMED

**Evidence:**
- The filing package assembler generates `signatureParagraphs` once at line 251-253 and includes them in every document type that uses signature blocks.
- Phase V prompt instructs the LLM to include a signature block in the draft.
- The assembler then adds a SECOND signature block from `generateSignatureBlock()`.
- If doc-gen-bridge passes the Phase V text with its own signature, the memorandum would have: (1) signature from the LLM text body, (2) signature from the assembler.

**However:** Currently the memorandum body text is never converted to paragraphs (P0-DG-004), so only the assembler's signature appears. The duplication would manifest IF P0-DG-004 were fixed without stripping the LLM's embedded signature.

---

#### SIG-2: Porter Name Hardcoded — REFUTED

**Evidence:**
- Searched all files in `lib/generators/`, `prompts/`, `lib/workflow/` for "Porter", "ptanne", "Tanner" — zero matches.
- Attorney info is data-driven from the `profiles` table: `lib/integration/doc-gen-bridge.ts:296-307` reads `profile.full_name`, `profile.bar_number`, etc.
- Phase V executor uses `input.attorneyName` from the workflow state, which comes from the order/profile data.

**Possible explanation:** Porter's name appeared in MG-2602-0047 because that order's profile data contained Porter's information. It's not hardcoded — it's the attorney who placed the order.

---

#### TPL-1: Unresolved [ATTORNEY_BAR_NUMBER] — CONFIRMED (conditional)

**Evidence:**
- Phase V executor uses placeholder fallbacks when profile data is empty:
  ```
  attorneyName: isEmpty(input.attorneyName) ? '[ATTORNEY_NAME]' : input.attorneyName
  barNumber: isEmpty(input.barNumber) ? '[ATTORNEY_BAR_NUMBER]' : input.barNumber
  ```
- Phase X validates for placeholders and BLOCKS delivery if detected (`lib/workflow/phase-executors.ts:5038-5048`).
- However, Phase X's blocking only prevents the workflow from completing — it does NOT prevent documents already uploaded in Phase VIII from being accessible.

**Root cause:** Incomplete profile data triggers placeholder injection. Phase X catches it but documents may already exist in storage from the Phase VIII upload step.

---

## NEW FINDINGS

### NEW-001: Fn2 APPROVE Queries Non-Existent Column/Table Structure (P0)

**Location:** `lib/inngest/workflow-orchestration.ts:4115-4123`
```typescript
const { data: deliverables } = await supabase
  .from('order_deliverables')
  .select('file_key')
  .eq('order_id', orderId);
```

**Issues:**
1. `order_deliverables` table has `file_path`, NOT `file_key` (migration: `20260216700003`)
2. `order_deliverables` has NO `order_id` column — it links through `package_id` to `delivery_packages`
3. No code populates `order_deliverables` with file records

**Impact:** Fn2 handleApprove ALWAYS throws `No deliverable files found` at line 4122. Even if CP3 approval succeeds, signed URL generation fails, delivery records are never written, and the order is never marked COMPLETED.

---

### NEW-002: Two Parallel Document Systems Write to Different Tables (P0)

**System 1 (Workflow Orchestrator):**
- Generates .docx and .txt files
- Uploads to `order-documents` bucket
- Inserts records into `documents` table
- Fields: `file_url`, `document_type`, `is_deliverable`

**System 2 (Filing Package Assembler via doc-gen-bridge):**
- Generates .docx files (empty body shells)
- Uploads to `filing-packages` bucket
- Does NOT insert database records
- Updates `orders.document_generated_at` only

**System 3 (Instruction Sheet Generator):**
- Generates .docx instruction sheet
- Uploads to `documents` bucket (LEGACY)
- Does NOT insert database records

**System 4 (Client Download Page):**
- Reads from `workflow_files` table (DIFFERENT table from above)
- Filters on `is_final = true` (column doesn't exist)
- Downloads from `order-documents` bucket

**No pathway connects any writer to the reader.**

---

### NEW-003: contentType Mismatch for Text Files (P1)

**Location:** `lib/inngest/workflow-orchestration.ts:457`
```typescript
contentType: 'application/pdf',  // Hardcoded for ALL uploads
```

The `uploadToSupabaseStorage()` function hardcodes `contentType: 'application/pdf'` but is used for `.txt` files (instruction-sheet.txt, citation-report.txt, caption-qc-report.txt) and `.docx` files. This means:
- Text files are stored with PDF content type
- DOCX files are stored with PDF content type
- Download clients may mishandle the files

---

### NEW-004: Instruction Sheet Has No Phase VII Integration (P1)

**Location:** `lib/documents/generators/instruction-sheet.ts:45-65`

The `InstructionSheetData` interface has no fields for judge grade, evaluation, or quality metrics. The DOCX instruction sheet generator (Task 57/65) is completely separate from the TXT instruction sheet in the workflow orchestrator. Two different instruction sheets exist:
1. `.docx` version in `lib/documents/generators/instruction-sheet.ts` — rich formatting, no grade data
2. `.txt` version in `lib/inngest/workflow-orchestration.ts:485-556` — plain text, HAS grade data (but with [object Object] bug)

---

### NEW-005: deliverables DELETE Uses Legacy Bucket (P2)

**Location:** `app/api/orders/[id]/deliverables/route.ts:261-263`
```typescript
const { error: storageError } = await supabase.storage
  .from('documents')  // WRONG — should be STORAGE_BUCKETS.ORDER_DOCUMENTS
  .remove([doc.file_url])
```

Deletes target the legacy `documents` bucket but files exist in `order-documents`. Storage deletions silently fail, leaving orphaned files.

---

### NEW-006: getPublicUrl in Workflow Orchestrator (P1)

**Location:** `lib/inngest/workflow-orchestration.ts:466-468`

The `uploadToSupabaseStorage()` function returns `getPublicUrl()` which generates permanent, unauthenticated URLs. These URLs are stored on the order record (`deliverable_urls`). This is separate from (but compounds) A11-P0-001.

---

## VERIFICATION AGENTS

### Agent 1: SPEC COMPLIANCE

```
SPEC COMPLIANCE:
[CONFIRMED] A11-P0-001 (public URLs)          → workflow-orchestration.ts:466, storage-service.ts:57, deliverables/route.ts:88
[CONFIRMED] A11-P0-002 (missing uploaded_by)   → workflow-orchestration.ts:1151 (no uploaded_by field)
[CONFIRMED] A11-P0-003 (document_type mismatch)→ orchestration:1142 vs download/page.tsx:50
[PARTIAL]   A11-P0-004 (delivery_packages)     → CP3 routes UPDATE but no INSERT found
[REFUTED]   A11-P0-005 (authenticateCP3)       → cp3-auth.ts:31-84 is correct
[CONFIRMED] A11-P0-006 (bucket mismatch)       → 3 different buckets across writers
[REFUTED]   A11-P0-007 (wrong Inngest fn)      → Fn2 is correct; secondary is observer
[PARTIAL]   A11-P0-008 (Phase X dual upload)   → Two uploads to two buckets, not Phase X
[CONFIRMED] A11-P0-009 (wrong download field)  → queries workflow_files.is_final (nonexistent)
[CONFIRMED] P0-DG-001 (bucket disconnect)      → See A11-P0-006
[CONFIRMED] P0-DG-002 (zero DB records)        → Schema/column mismatches prevent inserts
[CONFIRMED] P0-DG-003 (no PDF generation)      → No conversion path exists
[CONFIRMED] P0-DG-004 (empty doc bodies)       → assembler:335 — body text never included
[CONFIRMED] P0-DG-005 (is_final never set)     → Zero code paths set it
[CONFIRMED] AIS-1 ([object Object])            → phase-executors.ts:3487 type assertion
[CONFIRMED] AIS-2 (N/A/4.5)                    → orchestration.ts:518 falsy conflation
[PARTIAL]   SIG-1 (signature duplication)       → Would manifest if P0-DG-004 fixed
[REFUTED]   SIG-2 (Porter hardcoded)           → Data-driven from profile
[CONFIRMED] TPL-1 (unresolved placeholders)    → Phase X blocks but docs already uploaded
```

**Score: 14 CONFIRMED, 3 PARTIAL, 2 REFUTED out of 19 findings**

### Agent 2: RED TEAM

1. **Public URL exposure (CRITICAL):** `getPublicUrl()` in 4 locations returns permanent URLs for privileged legal documents. Any URL guessing or leakage exposes attorney-client content.
2. **Empty body documents (HIGH):** If an attorney files the generated DOCX, they file a document with only a caption and signature — no legal arguments. Professional malpractice risk.
3. **is_final never set (HIGH):** Download page shows zero documents to paying customers. Total service failure.
4. **file_key column doesn't exist (HIGH):** Fn2 approve path crashes, order never completes.
5. **Console.log in production (MEDIUM):** `lib/generators/filing-package-assembler.ts:241` uses `console.log` instead of structured logger.

### Agent 3: CONSISTENCY

1. **Table name drift:** Code references `documents`, `order_documents`, and `order_deliverables` — three different tables for similar data.
2. **Column name drift:** `file_url` (code) vs `file_path` (migration), `file_type` (code) vs `mime_type` (migration), `file_key` (code) vs `file_path` (migration).
3. **Bucket constant drift:** `STORAGE_BUCKETS.ORDER_DOCUMENTS` used in some files, hardcoded `'order-documents'` in others, legacy `'documents'` and `'filing-packages'` in others.
4. **Two instruction sheet generators:** `lib/documents/generators/instruction-sheet.ts` (DOCX) and `lib/inngest/workflow-orchestration.ts:485` (TXT) generate overlapping content with different formats and different data sources.

### Agent 4: REGRESSION

- TypeScript compilation: Pre-existing errors in non-core files (playwright.config, sentry configs). Core app/lib compiles cleanly.
- No code modifications made in this audit — read-only assessment.
- Build baseline preserved.

### Agent 5: DOCUMENTATION — DELIVERY PIPELINE MAP

```
PHASE V (Draft) → state.phaseOutputs["V"]
    ↓
PHASE VII (Judge Sim) → state.phaseOutputs["VII"]
    ↓
PHASE VIII (Revisions) → state.phaseOutputs["VIII"]
    ↓ (also triggers doc-gen-bridge)
    ├→ doc-gen-bridge → filing-package-assembler → "filing-packages" bucket ❌ DEAD END
    │   (empty body shells — caption + signature only)
    ↓
PHASE X (QC Gate) → validates but doesn't upload
    ↓
DELIVERABLE GENERATION (workflow-orchestration.ts)
    ├→ motion.docx → "order-documents" bucket ✓
    ├→ instruction-sheet.txt → "order-documents" bucket ✓
    ├→ citation-report.txt → "order-documents" bucket ✓
    └→ caption-qc-report.txt → "order-documents" bucket ✓
    ↓
persistDeliverableRecords() → INSERT into "documents" table
    (with is_deliverable=true, but schema mismatch likely causes failure)
    ↓
CP3 CHECKPOINT REACHED → Fn2 waitForEvent
    ↓
ATTORNEY APPROVES → /api/orders/[id]/approve
    ↓
Fn2 handleApprove()
    ├→ Query "order_deliverables"."file_key" ❌ COLUMN DOESN'T EXIST
    └→ CRASH: "No deliverable files found" ❌ TERMINAL FAILURE
    ↓ (NEVER REACHED)
generateSignedUrls() → signed download URLs
    ↓ (NEVER REACHED)
delivery_packages UPDATE → signed_urls, delivered_at
    ↓ (NEVER REACHED)
ORDER → COMPLETED status
    ↓ (NEVER REACHED)
CLIENT DOWNLOAD PAGE
    ├→ Query "workflow_files" WHERE is_final=true ❌ COLUMN DOESN'T EXIST
    └→ ZERO RESULTS ❌ TERMINAL FAILURE
```

**There are TWO independent terminal failures preventing any delivery:**
1. Fn2 crashes on `order_deliverables.file_key` (column doesn't exist)
2. Download page queries `workflow_files.is_final` (column doesn't exist)

---

## PRIORITY RANKING FOR FIXES

### Tier 1 — Terminal Failures (fix these first)

1. **A11-P0-009 + P0-DG-005:** Client download page queries wrong table/column. Must query `documents` WHERE `is_deliverable = true` AND `order_id = orderId` instead of `workflow_files` WHERE `is_final = true`.

2. **NEW-001:** Fn2 handleApprove queries `order_deliverables.file_key` which doesn't exist. Must query `documents` WHERE `is_deliverable = true` to get `file_url` paths.

3. **P0-DG-004:** Empty document bodies. The assembler must convert `motionBody`/`memorandumBody` strings to DOCX Paragraph objects.

### Tier 2 — Security + Data Integrity

4. **A11-P0-001 + NEW-006:** Replace all `getPublicUrl()` calls with `createSignedUrl()`.

5. **A11-P0-006:** Consolidate all bucket references to use `STORAGE_BUCKETS.ORDER_DOCUMENTS` constant.

6. **A11-P0-002:** Add `uploaded_by` (system user or null) to automated document inserts.

### Tier 3 — Correctness

7. **AIS-1:** Fix `[object Object]` by ensuring grade is a string: `String(judgeResult?.grade ?? 'N/A')`.

8. **AIS-2:** Fix `N/A/4.5` by using nullish coalescing: `judgeResult.numericGrade ?? 'N/A'`.

9. **A11-P0-003:** Standardize document_type values across workflow, database, and frontend.

10. **NEW-003:** Fix contentType for non-PDF uploads.

11. **NEW-005:** Fix DELETE handler to use `STORAGE_BUCKETS.ORDER_DOCUMENTS`.

---

## CONCLUSION

Clay was correct: the delivery pipeline is non-functional end-to-end. The failure is not a single bug but a **cascade of 6+ independent breakpoints** across storage buckets, database tables, column names, and query targets. No order has ever successfully delivered a downloadable document through the automated workflow because multiple layers independently prevent it.

The most surgical fix path requires:
1. Fix the download page to query the correct table (`documents` not `workflow_files`)
2. Fix Fn2 to query the correct table/column (`documents.file_url` not `order_deliverables.file_key`)
3. Convert body text to DOCX paragraphs in the assembler
4. Replace getPublicUrl with createSignedUrl

These 4 changes would establish a minimal viable delivery path, though the full 11-item fix list is required for production quality.
