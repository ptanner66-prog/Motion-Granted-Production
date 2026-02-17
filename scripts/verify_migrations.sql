-- ============================================================
-- MOTION GRANTED: POST-MIGRATION VERIFICATION
-- Run in Supabase SQL Editor after applying all migrations.
-- ============================================================

-- 1. TABLE INVENTORY: All critical tables must exist
SELECT
  t.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM (
  VALUES
    ('orders'), ('profiles'), ('order_workflows'), ('documents'),
    ('parties'), ('conversations'), ('superprompt_templates'),
    ('automation_logs'), ('verified_citations'), ('clerks'),
    ('protocol_results'), ('citation_verifications'),
    ('workflow_audit_log'), ('workflow_violations'),
    ('checkpoint_events'), ('hold_escalations'),
    ('delivery_packages'), ('payment_events'),
    ('citation_banks'), ('rate_limits'),
    ('promo_redemptions'), ('admin_activity_log'),
    ('data_retention_log'), ('ai_usage_logs'),
    ('conflict_checks'), ('conflict_matches'),
    ('judge_profiles_cache'), ('federal_circuits'),
    ('states'), ('state_motion_availability'),
    ('order_deliverables'), ('phase_prompts')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_name = expected.table_name
  AND t.table_schema = 'public'
ORDER BY expected.table_name;

-- 2. RLS ENABLED: Verify Row Level Security on critical tables
SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'orders', 'profiles', 'order_workflows', 'documents',
    'protocol_results', 'citation_verifications', 'delivery_packages',
    'checkpoint_events', 'conversations', 'conflict_matches'
  )
ORDER BY tablename;

-- 3. PROTOCOL_RESULTS: Verify the table that caused the original error
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'protocol_results'
ORDER BY ordinal_position;

-- 4. PROTOCOL_RESULTS UNIQUE CONSTRAINT: Verify upsert support
SELECT
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'protocol_results'
  AND tc.constraint_type = 'UNIQUE'
GROUP BY tc.constraint_name;

-- 5. PROTOCOL_RESULTS RLS POLICIES
SELECT
  policyname,
  cmd,
  qual::text AS using_expr,
  with_check::text AS check_expr
FROM pg_policies
WHERE tablename = 'protocol_results';
