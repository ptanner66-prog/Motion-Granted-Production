-- IV-006: Add workflow_id to delivery_packages for waitForEvent match persistence
-- The workflow_id is written by the Inngest function at Phase X Stage 5.
-- Dashboard approval API reads workflow_id from delivery_packages to correlate
-- with the correct Inngest run. Never construct workflowId from scratch.

ALTER TABLE delivery_packages ADD COLUMN IF NOT EXISTS workflow_id TEXT;

-- Index for efficient lookup by workflow_id (used by approval API)
CREATE INDEX IF NOT EXISTS idx_delivery_packages_workflow_id
  ON delivery_packages (workflow_id)
  WHERE workflow_id IS NOT NULL;

COMMENT ON COLUMN delivery_packages.workflow_id IS 'Inngest run ID for waitForEvent correlation. Written at Phase X Stage 5, read by checkpoint approval API.';
