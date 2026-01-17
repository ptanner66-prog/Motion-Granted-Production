-- ============================================================================
-- Migration: Add revision tracking columns to orders table
-- Description: Adds columns for tracking revision requests and history
-- ============================================================================

-- Add revision tracking columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS revision_notes TEXT,
ADD COLUMN IF NOT EXISTS revision_requested_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN orders.revision_count IS 'Number of revisions requested for this order';
COMMENT ON COLUMN orders.revision_notes IS 'Current/latest revision request notes';
COMMENT ON COLUMN orders.revision_requested_at IS 'Timestamp of the last revision request';

-- Create index for querying orders with pending revisions
CREATE INDEX IF NOT EXISTS idx_orders_revision_status
ON orders (status)
WHERE status IN ('revision_requested', 'revision_delivered');

-- Update the status constraint to include revision statuses if not already present
-- (The existing schema should already have these, but we'll make sure)
DO $$
BEGIN
  -- Check if constraint exists and drop it first
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_status_check'
    AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;

  -- Add updated constraint with all statuses
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'submitted',
    'under_review',
    'assigned',
    'in_progress',
    'in_review',
    'draft_delivered',
    'revision_requested',
    'revision_in_progress',
    'revision_delivered',
    'completed',
    'cancelled',
    'on_hold',
    'refunded'
  ));
EXCEPTION
  WHEN others THEN
    -- If constraint doesn't exist or can't be modified, just continue
    NULL;
END $$;
