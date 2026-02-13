-- ============================================================================
-- Migration: 20260213000003_expand_authority_level_constraint.sql
-- SP19 BUG #5: Verify and expand authority_level CHECK constraint
--
-- The authority_level column exists on order_citations (confirmed in migrations
-- 20260130, 20260205, and 20260212000002). Current CHECK constraint allows:
--   'binding', 'persuasive', 'unknown'
--
-- The spec requires 'statutory' and 'secondary' to be valid values for proper
-- citation classification. This migration expands the constraint while
-- preserving backward compatibility with existing 'unknown' values.
-- ============================================================================

-- Step 1: Drop the existing constraint
ALTER TABLE order_citations
  DROP CONSTRAINT IF EXISTS order_citations_authority_level_check;

-- Step 2: Add expanded constraint with all valid authority levels
ALTER TABLE order_citations
  ADD CONSTRAINT order_citations_authority_level_check
  CHECK (
    authority_level IS NULL
    OR authority_level IN (
      'binding',     -- Controlling jurisdiction: appellate courts and above
      'persuasive',  -- Other jurisdiction or lower court decisions
      'statutory',   -- Statutes, rules, regulations, constitutional provisions
      'secondary',   -- Treatises, law reviews, restatements, legal encyclopedias
      'unknown'      -- Legacy default; to be classified during verification
    )
  );

-- Step 3: Add comment documenting the expanded values
COMMENT ON COLUMN order_citations.authority_level IS
  'Citation authority classification. Values:
   binding  — controlling jurisdiction appellate+ decisions
   persuasive — other jurisdiction or lower court decisions
   statutory — statutes, rules, regulations, constitutional provisions
   secondary — treatises, law reviews, restatements
   unknown — legacy default, pending classification';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run manually):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'order_citations'::regclass
--   AND conname = 'order_citations_authority_level_check';
-- ============================================================================
