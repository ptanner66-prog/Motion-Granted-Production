-- ============================================================
-- COMPREHENSIVE POST-FIX VERIFICATION
-- Run after all Tier 1 + Tier 2 + Tier 3 migrations applied
-- ============================================================

-- 1. S-001: Privilege escalation fixed?
SELECT policyname, with_check::text LIKE '%role%' AS role_protected
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'UPDATE';
-- Expected: role_protected = true

-- 2. MW-001: Tier assignments correct?
SELECT tier, count(*), array_agg(code ORDER BY code)
FROM motion_types
GROUP BY tier ORDER BY tier;
-- Expected: A=procedural, B=intermediate, C=complex, D=highly complex

-- 3. P10-001: sync_order_tier trigger gone?
SELECT count(*) AS broken_trigger_count
FROM information_schema.triggers
WHERE trigger_name LIKE '%sync_order_tier%';
-- Expected: 0

-- 4. SPD-001: Column renamed?
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN ('amount_paid', 'amount_paid_cents');
-- Expected: amount_paid_cents only

-- 5. MW-002: Tier D in enum?
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'motion_tier';
-- Expected: includes 'D'

-- 6. GAP-001: phase_prompts complete?
SELECT count(*) AS model_routing_columns
FROM information_schema.columns
WHERE table_name = 'phase_prompts' AND column_name LIKE 'model_tier_%';
-- Expected: 4

-- 7. CC-001: conflict_checks exists?
SELECT count(*) FROM information_schema.tables WHERE table_name = 'conflict_checks';
-- Expected: 1

-- 8. CM-002: No user_roles references in RLS?
SELECT count(*) FROM pg_policies WHERE qual::text LIKE '%user_roles%';
-- Expected: 0

-- 9. ST-002: California seeded?
SELECT state_code, is_enabled FROM jurisdiction_toggles WHERE state_code = 'CA';
-- Expected: CA, true

-- 10. DR-002: Only one retention trigger?
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'orders' AND trigger_name LIKE '%retention%';
-- Expected: exactly 1

-- 11. Phantom tables resolved?
SELECT count(*) FROM information_schema.tables
WHERE table_name IN ('clients', 'user_roles', 'order_workflow_state', 'workflows');
-- Expected: 0

-- 12. workflow_state has new columns?
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workflow_state' AND column_name IN (
  'citations_verified_count', 'phase_started_at', 'phase_history', 'assigned_to'
);
-- Expected: all 4 present
