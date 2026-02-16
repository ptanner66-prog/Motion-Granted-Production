-- ==========================================================================
-- MIGRATION: Fix MW-002 -- Add Tier D to motion_tier enum
-- AUDIT REF: MW-002 (P1), V72-001 (P1) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WHAT THIS FIXES:
-- Architecture defines 4 tiers (A/B/C/D). Enum only has 3 (A/B/C).
-- Tier D motions (MSJ, MSA, Class Cert, etc.) cannot be created.
--
-- NOTE: ALTER TYPE ... ADD VALUE with IF NOT EXISTS requires PG 12+.
-- Supabase uses PG 15, so this is safe.
-- ==========================================================================

ALTER TYPE motion_tier ADD VALUE IF NOT EXISTS 'D';

-- Verification:
-- SELECT enumlabel FROM pg_enum
-- JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
-- WHERE typname = 'motion_tier' ORDER BY enumsortorder;
-- Expected: A, B, C, D
