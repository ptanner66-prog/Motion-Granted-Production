-- ==========================================================================
-- MIGRATION: Fix ST-002 -- Seed California in jurisdiction_toggles
-- AUDIT REF: ST-002 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

INSERT INTO jurisdiction_toggles (state_code, state_name, is_enabled, federal_circuits)
VALUES ('CA', 'California', true, '["9th"]'::jsonb)
ON CONFLICT (state_code) DO UPDATE SET is_enabled = true;

UPDATE jurisdiction_toggles SET is_enabled = true WHERE state_code = 'LA';
