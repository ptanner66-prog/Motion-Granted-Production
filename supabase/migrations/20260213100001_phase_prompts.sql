-- Phase Prompt Editing: Adds version tracking and admin edit capability
-- to the existing phase_prompts table (created in 023_workflow_v72_phase_system.sql).
--
-- Existing schema uses: phase VARCHAR(10) as unique key, prompt_content TEXT
-- This migration adds: updated_by, edit_version columns
-- And creates: phase_prompt_versions table for rollback history

-- ============================================================================
-- 1. Add columns to existing phase_prompts table
-- ============================================================================

-- Track who last edited a prompt
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Integer version counter for edits (separate from existing 'version' varchar field)
ALTER TABLE phase_prompts ADD COLUMN IF NOT EXISTS edit_version INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- 2. Create version history table (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase VARCHAR(10) NOT NULL,              -- matches phase_prompts.phase (e.g. 'I', 'V.1')
  prompt_content TEXT NOT NULL,            -- snapshot of the prompt at this version
  edit_version INTEGER NOT NULL,           -- version number
  edited_by TEXT,                          -- email or user ID
  edit_note TEXT,                          -- optional note about what changed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phase, edit_version)
);

-- Index for fast version history lookups (newest first)
CREATE INDEX IF NOT EXISTS idx_phase_prompt_versions_lookup
  ON phase_prompt_versions(phase, edit_version DESC);

-- ============================================================================
-- 3. RLS and policies
-- ============================================================================

ALTER TABLE phase_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for server-side reads from prompts/index.ts)
CREATE POLICY "Service role full access on phase_prompt_versions"
  ON phase_prompt_versions FOR ALL
  USING (true)
  WITH CHECK (true);
