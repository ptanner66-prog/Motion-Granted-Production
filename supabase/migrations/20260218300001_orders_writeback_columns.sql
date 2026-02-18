-- ============================================================================
-- Migration: Orders Write-Back Columns
-- Date: 2026-02-18
-- Purpose: Add missing columns to orders table for proper write-back from
--          workflow orchestration (Fn1/Fn2), conflict checks, and metadata.
--
-- Groups:
--   A: Workflow Tracking (overall_score, phase_course)
--   B: CP3 Checkpoint (cp3_status, cp3_approved_at, cp3_approved_by)
--   C: Deliverables (deliverable_ready_at, workflow_completed_at)
--   D: Conflict Check (conflict_checked, conflict_cleared, conflict_notes)
--   E: Filing Metadata (deadline_normal)
--   H: Miscellaneous (last_error)
--
-- Columns that ALREADY EXIST (not touched here):
--   workflow_id, generation_attempts, current_phase, judge_grade,
--   phase_outputs, deliverable_urls, deliverables_generated_at,
--   conflict_status, conflict_check_completed_at, opposing_party_name,
--   court_name, attorney_email, revision_count, revision_requested_at,
--   retention_expires_at, generation_started_at, generation_completed_at,
--   generation_error, cp3_entered_at, completed_at, metadata (order_workflows)
-- ============================================================================

BEGIN;

-- ── Group A: Workflow Tracking ──────────────────────────────────────────────

-- A-1: overall_score — Final quality percentage from Phase VII judge simulation
ALTER TABLE orders ADD COLUMN IF NOT EXISTS overall_score NUMERIC;

-- A-2: phase_course — Ordered array of phases that executed (for debugging/audit)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phase_course TEXT[] DEFAULT '{}';

-- ── Group B: CP3 Checkpoint ─────────────────────────────────────────────────

-- B-1: cp3_status — Current CP3 checkpoint status (PENDING, APPROVED, CHANGES_REQUESTED, CANCELLED)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_status TEXT;

-- B-2: cp3_approved_at — Timestamp when attorney approved the package
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_approved_at TIMESTAMPTZ;

-- B-3: cp3_approved_by — UUID of attorney who approved
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cp3_approved_by UUID;

-- ── Group C: Deliverables / Completion ──────────────────────────────────────

-- C-1: deliverable_ready_at — When deliverable package was ready for download
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliverable_ready_at TIMESTAMPTZ;

-- C-2: workflow_completed_at — When entire workflow pipeline completed (Fn2 APPROVE)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workflow_completed_at TIMESTAMPTZ;

-- ── Group D: Conflict Check ─────────────────────────────────────────────────

-- D-1: conflict_checked — Boolean flag: conflict check has been executed
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_checked BOOLEAN DEFAULT false;

-- D-2: conflict_cleared — Boolean flag: no blocking conflicts found
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_cleared BOOLEAN DEFAULT false;

-- D-3: conflict_notes — Free-text notes from conflict check process
ALTER TABLE orders ADD COLUMN IF NOT EXISTS conflict_notes TEXT;

-- ── Group E: Filing Metadata ────────────────────────────────────────────────

-- E-1: deadline_normal — Normalized internal deadline (business-day adjusted)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deadline_normal TIMESTAMPTZ;

-- ── Group H: Miscellaneous ──────────────────────────────────────────────────

-- H-1: last_error — Most recent workflow error message for quick dashboard display
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_error TEXT;

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_cp3_status ON orders(cp3_status) WHERE cp3_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_overall_score ON orders(overall_score) WHERE overall_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_conflict_checked ON orders(conflict_checked) WHERE conflict_checked = false;

COMMIT;

SELECT 'ORDERS WRITE-BACK COLUMNS MIGRATION COMPLETE' AS status;
