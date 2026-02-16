-- ============================================================
-- MOTION GRANTED: PRE-FLIGHT DIAGNOSTIC QUERIES
-- Run in Supabase SQL Editor BEFORE applying any fix migration
-- Save output to compare before/after state
-- Date: 2026-02-16 CST
-- ============================================================

-- QUERY 1: Full table inventory
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- QUERY 2: Phantom table check
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'user_roles', 'order_workflow_state', 'workflows');

-- QUERY 3: Tier assignments
SELECT code, name, tier, base_price_cents
FROM motion_types
ORDER BY tier, code;

-- QUERY 4: phase_prompts schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'phase_prompts'
ORDER BY ordinal_position;

-- QUERY 5: citation_banks schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'citation_banks'
ORDER BY ordinal_position;

-- QUERY 6: anonymized_analytics schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'anonymized_analytics'
ORDER BY ordinal_position;

-- QUERY 7: conflict_checks existence
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'conflict_checks';

-- QUERY 8: ai_usage_logs existence
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ai_usage_logs';

-- QUERY 9: Jurisdiction toggles
SELECT * FROM jurisdiction_toggles;

-- QUERY 10: Retention triggers on orders
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'orders'
ORDER BY trigger_name;

-- QUERY 11: Privilege escalation check
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'UPDATE';

-- QUERY 12: Status constraint + tier enum
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%status%' OR constraint_name LIKE '%tier%';

SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'motion_tier'
ORDER BY enumsortorder;
