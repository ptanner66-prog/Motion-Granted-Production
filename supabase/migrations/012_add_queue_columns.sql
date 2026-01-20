-- Migration: Add queue management columns to orders table
-- Purpose: Support Inngest-based job queue with visibility into queue status

-- Add queue visibility columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_attempts INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Index for efficient queue queries (orders by status and deadline)
CREATE INDEX IF NOT EXISTS idx_orders_status_deadline ON orders(status, filing_deadline);

-- Index for queue position lookups
CREATE INDEX IF NOT EXISTS idx_orders_queue_position ON orders(queue_position) WHERE queue_position IS NOT NULL;

-- Index for generation tracking
CREATE INDEX IF NOT EXISTS idx_orders_generation_status ON orders(status, generation_started_at) WHERE status IN ('in_progress', 'generation_failed');

-- Add new status values for generation states
-- Note: This assumes status is a text field. If it's an enum, you'll need to alter the enum instead.
COMMENT ON COLUMN orders.status IS 'Order status: submitted, under_review, in_progress, pending_review, draft_delivered, revision_requested, revision_delivered, completed, cancelled, blocked, generation_failed';

-- Function to calculate queue position based on filing deadline
CREATE OR REPLACE FUNCTION get_queue_position(order_id UUID)
RETURNS INTEGER AS $$
DECLARE
  position INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO position
  FROM orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
    AND filing_deadline < (SELECT filing_deadline FROM orders WHERE id = order_id)
    AND id != order_id;
  RETURN position;
END;
$$ LANGUAGE plpgsql;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats()
RETURNS TABLE (
  queue_depth BIGINT,
  processing_count BIGINT,
  completed_today BIGINT,
  failed_count BIGINT,
  avg_generation_seconds NUMERIC,
  oldest_pending_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM orders WHERE status IN ('submitted', 'under_review'))::BIGINT AS queue_depth,
    (SELECT COUNT(*) FROM orders WHERE status = 'in_progress')::BIGINT AS processing_count,
    (SELECT COUNT(*) FROM orders WHERE status IN ('pending_review', 'draft_delivered', 'completed') AND generation_completed_at >= CURRENT_DATE)::BIGINT AS completed_today,
    (SELECT COUNT(*) FROM orders WHERE status = 'generation_failed')::BIGINT AS failed_count,
    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (generation_completed_at - generation_started_at))), 0) FROM orders WHERE generation_completed_at IS NOT NULL AND generation_started_at IS NOT NULL AND generation_completed_at >= CURRENT_DATE - INTERVAL '7 days')::NUMERIC AS avg_generation_seconds,
    (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60), 0) FROM orders WHERE status IN ('submitted', 'under_review'))::NUMERIC AS oldest_pending_minutes;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update queue positions when order status changes
CREATE OR REPLACE FUNCTION update_queue_positions_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if status changed to/from queue-related statuses
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Recalculate positions for all queued orders
    WITH ranked_orders AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
      FROM orders
      WHERE status IN ('submitted', 'under_review', 'in_progress')
    )
    UPDATE orders o
    SET queue_position = ro.new_position
    FROM ranked_orders ro
    WHERE o.id = ro.id;

    -- Clear position for completed/failed orders
    UPDATE orders
    SET queue_position = NULL
    WHERE status NOT IN ('submitted', 'under_review', 'in_progress');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_update_queue_positions ON orders;
CREATE TRIGGER trg_update_queue_positions
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_queue_positions_trigger();

-- Initialize queue positions for existing queued orders
WITH ranked_orders AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
  FROM orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
)
UPDATE orders o
SET queue_position = ro.new_position
FROM ranked_orders ro
WHERE o.id = ro.id;
