BEGIN;

-- ============================================================
-- STEP 1: STOP-CHECK — Verify motion_types codes exist
-- ============================================================
-- Run this SELECT first. If code values differ from the WHERE clauses
-- below (e.g., 'MOTION_SUMMARY_JUDGMENT' instead of 'MSJ'), STOP.
-- DO $$
-- BEGIN
--   RAISE NOTICE 'Current motion_types: %', (SELECT json_agg(json_build_object('code', code, 'tier', tier)) FROM motion_types);
-- END $$;

-- ============================================================
-- STEP 2: Replace sync_order_tier() trigger function
-- The old trigger hardcodes Tier B for everything. The new trigger
-- looks up the tier from the motion_types table via motion_type_code.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_order_tier()
RETURNS TRIGGER AS $$
DECLARE
  resolved_tier motion_tier;
BEGIN
  -- Look up tier from motion_types table
  SELECT tier INTO resolved_tier
  FROM motion_types
  WHERE code = NEW.motion_type_code;

  -- If found, set it. If not found, keep whatever was provided (or default).
  IF resolved_tier IS NOT NULL THEN
    NEW.motion_tier := resolved_tier;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 3: Ensure trigger exists on orders table (idempotent)
-- ============================================================

DROP TRIGGER IF EXISTS trg_sync_order_tier ON orders;

CREATE TRIGGER trg_sync_order_tier
  BEFORE INSERT OR UPDATE OF motion_type_code ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_tier();

-- ============================================================
-- STEP 4: Fix seed data — correct tier assignments
-- These UPDATEs are idempotent. They fix any motion_types rows
-- that have wrong tier values.
-- ============================================================

-- Tier D motions (these are the most critical — were incorrectly Tier A/B/C)
UPDATE motion_types SET tier = 'D' WHERE code = 'MSJ' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'MSA' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'PARTIAL_MSJ' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'PI' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'CLASS_CERT' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'DECERTIFY' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'DAUBERT' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'RECEIVER' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'NEW_TRIAL' AND tier != 'D';
UPDATE motion_types SET tier = 'D' WHERE code = 'JNOV' AND tier != 'D';

-- Tier C corrections (Anti-SLAPP was incorrectly Tier B)
UPDATE motion_types SET tier = 'C' WHERE code = 'ANTI_SLAPP' AND tier != 'C';
UPDATE motion_types SET tier = 'C' WHERE code = 'TRO' AND tier != 'C';

-- ============================================================
-- STEP 5: Insert any missing Tier D motion types
-- Uses ON CONFLICT DO NOTHING to be idempotent.
-- base_price_cents for Tier D = 149900 ($1,499)
-- ============================================================

INSERT INTO motion_types (code, name, tier, base_price_cents) VALUES
  ('MSJ', 'Motion for Summary Judgment', 'D', 149900),
  ('MSA', 'Motion for Summary Adjudication', 'D', 149900),
  ('PARTIAL_MSJ', 'Partial Summary Judgment', 'D', 149900),
  ('PI', 'Preliminary Injunction', 'D', 149900),
  ('CLASS_CERT', 'Class Certification', 'D', 149900),
  ('DECERTIFY', 'Decertify Class', 'D', 149900),
  ('DAUBERT', 'Daubert Motion', 'D', 149900),
  ('RECEIVER', 'Appoint Receiver', 'D', 149900),
  ('NEW_TRIAL', 'New Trial', 'D', 149900),
  ('JNOV', 'Judgment Notwithstanding the Verdict', 'D', 149900)
ON CONFLICT (code) DO UPDATE SET
  tier = EXCLUDED.tier,
  name = EXCLUDED.name,
  base_price_cents = EXCLUDED.base_price_cents;

COMMIT;
