-- T-85: Standardize conflict_matches schema across 3 competing writers
--
-- Problem: conflict_matches was created by migration 001 with columns:
--   order_id, matched_order_id, party_name, matched_party_name, match_type,
--   similarity_score, risk_level, ai_analysis, is_cleared, etc.
--
-- Migration 20260128200000 tried CREATE TABLE IF NOT EXISTS with a different
-- schema (current_order_id, conflicting_order_id, etc.) but was silently
-- skipped because the table already existed.
--
-- Migration 20260216000008 added some columns (type, severity, match_field,
-- match_confidence, resolution_note, resolved_at, resolved_by) via ALTER TABLE.
--
-- Result: System A (lib/conflicts/check.ts) writes columns that don't exist.
-- This migration adds ALL missing columns so both writers can coexist.

-- Add columns expected by System A (lib/conflicts/check.ts)
ALTER TABLE public.conflict_matches
  ADD COLUMN IF NOT EXISTS current_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS current_case_number TEXT,
  ADD COLUMN IF NOT EXISTS current_party_name TEXT,
  ADD COLUMN IF NOT EXISTS current_opposing_party TEXT,
  ADD COLUMN IF NOT EXISTS current_attorney_id UUID,
  ADD COLUMN IF NOT EXISTS conflicting_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conflicting_case_number TEXT,
  ADD COLUMN IF NOT EXISTS conflicting_party_name TEXT,
  ADD COLUMN IF NOT EXISTS conflicting_opposing_party TEXT,
  ADD COLUMN IF NOT EXISTS conflicting_attorney_id UUID,
  ADD COLUMN IF NOT EXISTS match_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure columns from 20260216000008 also exist (idempotent)
ALTER TABLE public.conflict_matches
  ADD COLUMN IF NOT EXISTS type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS match_field VARCHAR(100),
  ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID;

-- Add unique constraint for System A writes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_conflict_pair'
  ) THEN
    -- Only add if all required columns exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'conflict_matches' AND column_name = 'current_order_id'
    ) THEN
      ALTER TABLE public.conflict_matches
        ADD CONSTRAINT unique_conflict_pair
        UNIQUE (current_order_id, conflicting_order_id, type);
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Summary:
-- After this migration, conflict_matches has columns for BOTH System A and System B:
-- System A columns: current_order_id, current_case_number, current_party_name,
--   current_opposing_party, current_attorney_id, conflicting_order_id, etc.
-- System B columns: order_id, matched_order_id, party_name, matched_party_name,
--   match_type, similarity_score, risk_level, ai_analysis, is_cleared
-- Shared columns: type, severity, match_field, match_confidence, match_reason,
--   resolved, resolved_at, resolved_by, resolution_note, detected_at, created_at
