-- MIGRATION: Fix cp3_rejections — admin_id -> actor_id + actor_type
-- Source: D9 A-3 | SP-13 AM-3
-- R2v2 Binding Decision 4: CP3 actor is the attorney, not an admin.
-- The attorney_id TEXT column causes INSERT failures because the event payload
-- contains no adminId field. Replace with actor_id UUID + actor_type TEXT.

-- Step 1: Add new columns
ALTER TABLE cp3_rejections ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE cp3_rejections ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'attorney'
  CHECK (actor_type IN ('attorney', 'admin', 'system'));

-- Step 2: Migrate existing data (if any rows exist with attorney_id)
-- Cast text attorney_id to UUID where possible; null otherwise
UPDATE cp3_rejections
SET actor_id = CASE
  WHEN attorney_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN attorney_id::UUID
  ELSE NULL
END
WHERE actor_id IS NULL AND attorney_id IS NOT NULL;

-- Step 3: Drop the old column
ALTER TABLE cp3_rejections DROP COLUMN IF EXISTS attorney_id;

-- Step 4: Make actor_id NOT NULL (after migration)
-- Only set NOT NULL if all existing rows have been migrated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cp3_rejections WHERE actor_id IS NULL) THEN
    ALTER TABLE cp3_rejections ALTER COLUMN actor_id SET NOT NULL;
  END IF;
END $$;
