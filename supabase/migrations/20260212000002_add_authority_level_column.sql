-- SP17 Bug 3: Add missing authority_level column to order_citations
-- This column is referenced in code and earlier migration definitions but was
-- never applied to production Supabase.

ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS authority_level VARCHAR(20);

-- Add check constraint (use DO block to handle if already exists)
DO $$
BEGIN
  ALTER TABLE order_citations ADD CONSTRAINT order_citations_authority_level_check
    CHECK (authority_level IS NULL OR authority_level IN ('binding', 'persuasive', 'unknown'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
