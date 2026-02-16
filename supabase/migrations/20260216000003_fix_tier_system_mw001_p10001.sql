-- ==========================================================================
-- MIGRATION: Fix MW-001 + P10-001 -- Tier System Repair
-- AUDIT REF: MW-001 (P0), P10-001 (P1) -- MG_COMPLETE_AUDIT_STATE
-- DATE: 2026-02-16 CST
--
-- WHAT THIS FIXES:
-- 1. MW-001: Tier assignments in motion_types are backwards/wrong
-- 2. P10-001: sync_order_tier() trigger compares enum to integers,
--    causing EVERY order to default to Tier B regardless of motion type
--
-- CORRECT TIER ASSIGNMENTS PER BINDING DECISIONS 02/15/2026:
--   Tier A ($150-400): Procedural -- Extensions, Substitution, Stipulations
--   Tier B ($500-1,400): Intermediate -- MTC, MTD, MIL, Demurrer, Compel
--   Tier C ($1,500-3,500): Complex -- Anti-SLAPP, TRO, Summary Adjudication
--   Tier D ($1,499+): Highly Complex -- MSJ, MSA, Class Cert, PI, Daubert...
--
-- BINDING: TRO = Tier C (NOT Tier D)
-- BINDING: Anti-SLAPP = single slug Tier C (no complex split)
-- ==========================================================================

-- ===== PART 1: Drop the broken sync_order_tier() trigger =====
DROP TRIGGER IF EXISTS trigger_sync_order_tier ON orders;
DROP FUNCTION IF EXISTS sync_order_tier();

-- ===== PART 2: Correct tier assignments in motion_types =====
-- NOTE: Run PREFLIGHT Query 3 first to verify actual code values.
-- Adjust WHERE clauses if production codes differ.

-- Tier D motions (most complex -- 10 total)
UPDATE motion_types SET tier = 'D' WHERE code IN (
  'MSJ',           -- Motion for Summary Judgment
  'MSA',           -- Motion for Summary Adjudication
  'PARTIAL_MSJ',   -- Partial Summary Judgment
  'CLASS_CERT',    -- Class Certification
  'DECERTIFY',     -- Decertification
  'PI',            -- Preliminary Injunction
  'DAUBERT',       -- Daubert Motion
  'RECEIVER',      -- Appoint Receiver
  'NEW_TRIAL',     -- Motion for New Trial
  'JNOV'           -- Judgment Notwithstanding the Verdict
);

-- Tier C motions (complex -- 9 total)
UPDATE motion_types SET tier = 'C' WHERE code IN (
  'ANTI_SLAPP',    -- Anti-SLAPP (single slug, Tier C per binding)
  'TRO',           -- Temporary Restraining Order (Tier C per binding, NOT D)
  'SUMMARY_ADJ'    -- Summary Adjudication (if separate from MSA)
);

-- Tier B motions (intermediate -- 49 total)
UPDATE motion_types SET tier = 'B' WHERE code IN (
  'MTC',           -- Motion to Compel
  'MTD',           -- Motion to Dismiss
  'MIL',           -- Motion in Limine
  'DEMURRER',      -- Demurrer
  'COMPEL',        -- Compel Discovery
  'PROTECTIVE'     -- Protective Order
);
-- NOTE: Only subset shown. Run Query 3 to see all codes and assign remaining.

-- Tier A motions (procedural/simple -- 20 total)
UPDATE motion_types SET tier = 'A' WHERE code IN (
  'EXTENSION',     -- Extension of Time
  'SOA',           -- Substitution of Attorney
  'STIPULATION',   -- Stipulation
  'CONTINUANCE'    -- Continuance
);
-- NOTE: Only subset shown. Run Query 3 to see all codes and assign remaining.

-- ===== PART 3: Fix existing orders with wrong tiers =====
UPDATE orders o
SET tier = mt.tier
FROM motion_types mt
WHERE o.motion_type_code = mt.code
  AND o.status NOT IN ('COMPLETED', 'completed', 'CANCELLED', 'cancelled')
  AND o.tier != mt.tier;

-- Verification:
-- SELECT code, name, tier, base_price_cents FROM motion_types
-- ORDER BY CASE tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 END, code;
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'orders' AND trigger_name LIKE '%tier%';
-- Expected: 0 rows (trigger deleted)
