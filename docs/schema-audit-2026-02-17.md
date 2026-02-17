# Complete Database Schema Audit — 2026-02-17

## Summary

| Metric | Count |
|--------|-------|
| Migration files audited | 105 |
| Unique tables referenced in code | 113 |
| Tables defined in migrations | 115 |
| Missing tables (code references, no CREATE TABLE) | 7 |
| Missing columns on `orders` table | 17 |
| Column name mismatches | 3 (checkpoint_events) |
| Table name mismatches | 1 (webhook_log vs webhook_logs) |

## A. Missing Tables

Tables referenced in code with `.from('table_name')` calls but no `CREATE TABLE` found in any migration file:

| Table | Code References | Fix |
|-------|----------------|-----|
| `loop_counters` | `lib/workflow/loop-counter.ts`, `lib/inngest/workflow-orchestration.ts` | Created in master migration |
| `payment_events` | `lib/payments/tier-upgrade.ts`, `lib/payments/dispute-handler.ts`, `app/api/webhooks/stripe/route.ts` | Created (RLS existed but no table) |
| `order_workflow_state` | `lib/monitoring/metrics-collector.ts`, `app/api/admin/analytics/costs/route.ts` | Created |
| `archive_log` | `lib/storage/archive-service.ts` | Created |
| `user_roles` | RLS policies in `payment_events`, `delivery_packages`, `order_deliverables` | Created + backfilled from profiles |
| `citation_approvals` | `lib/citation/*.ts` | Created |
| `webhook_log` | `lib/webhooks/webhook-logger.ts` (code uses singular) | VIEW alias to `webhook_logs` |

### Pre-existing tables NOT in migrations (expected)

These tables exist in the production database but were created outside the migration system (initial Supabase setup):

- `orders` — Core table, created in initial schema
- `profiles` — Created by Supabase Auth triggers
- `documents` — Created in initial schema
- `parties` — Created in initial schema
- `clerks` — Created in initial schema

## B. Missing Columns on `orders` Table

| Column | Type | Source (code file) |
|--------|------|-------------------|
| `deliverable_urls` | JSONB | `lib/inngest/workflow-orchestration.ts:1196` |
| `deliverables_generated_at` | TIMESTAMPTZ | `lib/inngest/workflow-orchestration.ts:1197` |
| `judge_grade` | TEXT | `lib/workflow/revision-loop.ts:160` |
| `phase_outputs` | JSONB DEFAULT '{}' | `lib/civ/citation-bank.ts:88` |
| `workflow_id` | UUID | `lib/orders/status-guards.ts:50` |
| `conflict_status` | TEXT | `lib/intake/conflict-integration.ts:53` |
| `conflict_check_completed_at` | TIMESTAMPTZ | Admin analytics queries |
| `opposing_party_name` | TEXT | `lib/inngest/conflict-check-job.ts:30` |
| `stripe_dispute_active` | BOOLEAN DEFAULT false | `lib/payments/dispute-handler.ts` |
| `dispute_id` | TEXT | `lib/payments/dispute-handler.ts` |
| `attorney_email` | TEXT | `lib/api/cp3-auth.ts:49` |
| `state_code` | CHAR(2) | `lib/payments/order-creation-v2.ts:56` |
| `revision_requested_at` | TIMESTAMPTZ | Order status tracking |
| `deadline_warned` | BOOLEAN DEFAULT false | Deadline monitoring |
| `failure_type` | TEXT | Workflow error handling |
| `rush_level` | TEXT | Pricing/turnaround logic |
| `court_name` | TEXT | Motion generation context |

## C. Column Name Mismatches on `checkpoint_events`

The migration creates `checkpoint_events` with:
- `event_name TEXT NOT NULL`
- `event_data JSONB NOT NULL DEFAULT '{}'`
- `checkpoint_type TEXT NOT NULL`

But code in `hold-service.ts` and `revision-loop.ts` inserts:
- `event_type` (instead of `event_name`)
- `data` (instead of `event_data`)
- `phase` (not in schema at all)

**Fix:** Added all three missing columns. Both naming conventions now work.

## D. Additional Missing Columns

### `delivery_packages`
- `workflow_id` UUID
- `motion_pdf_path` TEXT
- `instruction_sheet_path` TEXT
- `citation_report_path` TEXT

### `order_workflows`
- `checkpoint_pending` TEXT
- `protocol_10_disclosure` TEXT

## Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260217100000_master_schema_sync.sql` | Master fix — run in Supabase SQL Editor |
| `scripts/check-schema-drift.sql` | Reusable drift detection — run periodically |
| `docs/schema-audit-2026-02-17.md` | This audit report |

## How to Apply

1. Open Supabase SQL Editor
2. Paste contents of `supabase/migrations/20260217100000_master_schema_sync.sql`
3. Execute
4. Verify with: `scripts/check-schema-drift.sql`
5. Retry any failed workflows

## Prevention

Run `scripts/check-schema-drift.sql` after every deployment to catch drift early. Consider adding it to a CI check that alerts on missing columns.
