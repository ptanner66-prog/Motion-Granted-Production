# Motion Granted — Document Version Control

## Domain 1 Security Audit

| Document | Status | Notes |
|----------|--------|-------|
| MG_D1_SECURITY_AUDIT_FINAL_02152026.docx | RETIRED | Predates 7 CST corrections. Contains P0 user_id bug. |
| MG_DOMAIN_1_SECURITY_AUDIT_R4_FINAL_02152026.md | AUTHORITATIVE | Includes all CST corrections, client_id fix, hold-response route. |

## Critical Differences (Stale -> Correct)
- `orders.user_id` -> `orders.client_id` (P0: silent RLS failure)
- 5 CP3 routes -> 6 CP3 routes (adds hold-response)
- `IN_PROGRESS` -> `REVISION_REQ` (revision target status)
- Missing `order/revision-requested` event emission -> Added

## Rule
Porter works exclusively from R4 FINAL (.md). The stale .docx is formally retired and never referenced again.

## SP-1 Codebase Audit Results (2026-02-16)

| Check | Result | Action |
|-------|--------|--------|
| `orders.user_id` in SQL migrations | 0 hits | PASS |
| `orders.attorney_id` in SQL migrations | 1 hit (conflict_matches.sql:112) | Fixed via migration 20260216000001 |
| Hold-response route | EXISTS at app/api/workflow/hold-response/route.ts | VERIFIED |
| `REVISION_REQUESTED` in codebase | 1 hit (revision-handler.ts:402) | Fixed to REVISION_REQ |
