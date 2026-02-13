-- ============================================================================
-- Migration: 20260213000006_consolidate_timestamp_triggers.sql
-- SP19 CGA6-009: Consolidate timestamp trigger functions
--
-- BEFORE: 8 separate functions that all do the same thing (NEW.updated_at = NOW())
--   1. update_updated_at_column()              (migration 006)
--   2. update_generic_timestamp()              (migration 006)
--   3. update_superprompt_templates_updated_at()(migration 006)
--   4. update_verified_citation_timestamp()     (migration 022)
--   5. update_order_citations_timestamp()       (migration 20260130)
--   6. update_conversation_timestamp()          (migration 006)
--   7. update_workflow_files_updated_at()       (migration 013)
--   8. update_citation_cache_timestamp()        (migration 20260130)
--
-- AFTER: 1 unified function: set_updated_at()
--
-- PRESERVED: update_workflow_timestamp() — sets BOTH updated_at AND last_activity_at
--            (used by order_workflows table). This is NOT consolidated.
--
-- NOTE: NOW() returns UTC in Supabase. Application layer converts to CST/CDT.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create unified timestamp function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Unified timestamp trigger function. Replaces 8 duplicate functions.
   NOW() returns UTC; application layer converts to CST/CDT.';

-- ============================================================================
-- STEP 2: Re-wire all triggers to use set_updated_at()
--
-- For each table:
--   1. DROP old trigger(s) — some tables have duplicate triggers
--   2. CREATE new trigger using set_updated_at()
--
-- Tables are listed alphabetically for auditability.
-- ============================================================================

-- --- automation_settings (from 001_automation_tables.sql) ---
DROP TRIGGER IF EXISTS update_automation_settings_updated_at ON automation_settings;
CREATE TRIGGER set_updated_at_automation_settings
  BEFORE UPDATE ON automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_banks (from 018 + 023 — has DUPLICATE triggers) ---
DROP TRIGGER IF EXISTS update_citation_banks_timestamp ON citation_banks;
DROP TRIGGER IF EXISTS update_citation_banks_updated_at ON citation_banks;
CREATE TRIGGER set_updated_at_citation_banks
  BEFORE UPDATE ON citation_banks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_cache (from 20260130_create_citation_cache.sql) ---
DROP TRIGGER IF EXISTS update_citation_cache_updated_at ON citation_cache;
CREATE TRIGGER set_updated_at_citation_cache
  BEFORE UPDATE ON citation_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- citation_verifications (from 018_workflow_v72_citation_system.sql) ---
DROP TRIGGER IF EXISTS update_citation_verifications_timestamp ON citation_verifications;
CREATE TRIGGER set_updated_at_citation_verifications
  BEFORE UPDATE ON citation_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- clerk_expertise (from 001_automation_tables.sql) ---
DROP TRIGGER IF EXISTS update_clerk_expertise_updated_at ON clerk_expertise;
CREATE TRIGGER set_updated_at_clerk_expertise
  BEFORE UPDATE ON clerk_expertise
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- conversations (from 005_conversations.sql) ---
DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- curated_overruled_cases (from 021_database_migrations_foundation.sql) ---
DROP TRIGGER IF EXISTS update_overruled_cases_timestamp ON curated_overruled_cases;
CREATE TRIGGER set_updated_at_curated_overruled_cases
  BEFORE UPDATE ON curated_overruled_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- hold_escalations (from 20260213000004 — this SP) ---
DROP TRIGGER IF EXISTS update_hold_escalations_updated_at ON hold_escalations;
CREATE TRIGGER set_updated_at_hold_escalations
  BEFORE UPDATE ON hold_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- model_routing_config (from 021_database_migrations_foundation.sql) ---
DROP TRIGGER IF EXISTS update_model_routing_config_timestamp ON model_routing_config;
CREATE TRIGGER set_updated_at_model_routing_config
  BEFORE UPDATE ON model_routing_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- motion_types (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_motion_types_timestamp ON motion_types;
CREATE TRIGGER set_updated_at_motion_types
  BEFORE UPDATE ON motion_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- order_citations (from 20260130_create_order_citations.sql) ---
DROP TRIGGER IF EXISTS update_order_citations_updated_at ON order_citations;
CREATE TRIGGER set_updated_at_order_citations
  BEFORE UPDATE ON order_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- parsed_documents (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_parsed_docs_timestamp ON parsed_documents;
CREATE TRIGGER set_updated_at_parsed_documents
  BEFORE UPDATE ON parsed_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- phase_prompts (from 023_workflow_v72_phase_system.sql) ---
DROP TRIGGER IF EXISTS update_phase_prompts_updated_at ON phase_prompts;
CREATE TRIGGER set_updated_at_phase_prompts
  BEFORE UPDATE ON phase_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- superprompt_templates (from 004_superprompt_templates.sql) ---
DROP TRIGGER IF EXISTS superprompt_templates_updated_at ON superprompt_templates;
CREATE TRIGGER set_updated_at_superprompt_templates
  BEFORE UPDATE ON superprompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- verified_citations (from 021 + 022 — has DUPLICATE triggers) ---
DROP TRIGGER IF EXISTS update_verified_citations_timestamp ON verified_citations;
DROP TRIGGER IF EXISTS verified_citations_updated_at ON verified_citations;
CREATE TRIGGER set_updated_at_verified_citations
  BEFORE UPDATE ON verified_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_citations (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_citations_timestamp ON workflow_citations;
CREATE TRIGGER set_updated_at_workflow_citations
  BEFORE UPDATE ON workflow_citations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_files (from 013_create_workflow_files.sql) ---
DROP TRIGGER IF EXISTS set_workflow_files_updated_at ON workflow_files;
CREATE TRIGGER set_updated_at_workflow_files
  BEFORE UPDATE ON workflow_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_phase_executions (from 003_motion_workflow_system.sql) ---
DROP TRIGGER IF EXISTS update_phase_executions_timestamp ON workflow_phase_executions;
CREATE TRIGGER set_updated_at_workflow_phase_executions
  BEFORE UPDATE ON workflow_phase_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- workflow_state (from 023_workflow_v72_phase_system.sql) ---
DROP TRIGGER IF EXISTS update_workflow_state_updated_at ON workflow_state;
CREATE TRIGGER set_updated_at_workflow_state
  BEFORE UPDATE ON workflow_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PRESERVED: order_workflows trigger using update_workflow_timestamp()
-- This function sets BOTH updated_at AND last_activity_at — NOT consolidated.
-- Trigger: update_order_workflows_timestamp ON order_workflows
-- ============================================================================

-- ============================================================================
-- STEP 3: Drop old functions (no longer referenced by any trigger)
-- Using CASCADE would be dangerous — IF EXISTS is sufficient since we
-- already dropped all triggers that reference them.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.update_generic_timestamp();
DROP FUNCTION IF EXISTS public.update_superprompt_templates_updated_at();
DROP FUNCTION IF EXISTS public.update_verified_citation_timestamp();
DROP FUNCTION IF EXISTS public.update_order_citations_timestamp();
DROP FUNCTION IF EXISTS public.update_conversation_timestamp();
DROP FUNCTION IF EXISTS public.update_workflow_files_updated_at();
DROP FUNCTION IF EXISTS public.update_citation_cache_timestamp();

-- ============================================================================
-- VERIFICATION (run manually):
--   -- Confirm unified function exists:
--   SELECT proname, proconfig FROM pg_proc WHERE proname = 'set_updated_at';
--
--   -- Confirm old functions are gone:
--   SELECT proname FROM pg_proc
--   WHERE proname IN (
--     'update_updated_at_column', 'update_generic_timestamp',
--     'update_superprompt_templates_updated_at', 'update_verified_citation_timestamp',
--     'update_order_citations_timestamp', 'update_conversation_timestamp',
--     'update_workflow_files_updated_at', 'update_citation_cache_timestamp'
--   );
--   -- Expected: 0 rows
--
--   -- Confirm all triggers now use set_updated_at:
--   SELECT tgrelid::regclass AS table_name, tgname, proname
--   FROM pg_trigger t
--   JOIN pg_proc p ON t.tgfoid = p.oid
--   WHERE proname LIKE '%updated%' OR proname = 'set_updated_at'
--   ORDER BY tgrelid::regclass::text;
-- ============================================================================
