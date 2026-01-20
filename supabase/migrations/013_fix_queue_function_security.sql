-- ============================================================================
-- Migration 013: Fix Queue Function Security
-- ============================================================================
-- This migration fixes:
-- 1. SECURITY: Missing SET search_path = '' in queue functions from migration 012
-- 2. PERFORMANCE: Add missing indexes for common queries
-- ============================================================================

-- Fix get_queue_position function
CREATE OR REPLACE FUNCTION public.get_queue_position(order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  position INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO position
  FROM public.orders
  WHERE status IN ('submitted', 'under_review', 'in_progress')
    AND filing_deadline < (SELECT filing_deadline FROM public.orders WHERE id = order_id)
    AND id != order_id;
  RETURN position;
END;
$$;

-- Fix get_queue_stats function
CREATE OR REPLACE FUNCTION public.get_queue_stats()
RETURNS TABLE (
  queue_depth BIGINT,
  processing_count BIGINT,
  completed_today BIGINT,
  failed_count BIGINT,
  avg_generation_seconds NUMERIC,
  oldest_pending_minutes NUMERIC
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.orders WHERE status IN ('submitted', 'under_review'))::BIGINT AS queue_depth,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'in_progress')::BIGINT AS processing_count,
    (SELECT COUNT(*) FROM public.orders WHERE status IN ('pending_review', 'draft_delivered', 'completed') AND generation_completed_at >= CURRENT_DATE)::BIGINT AS completed_today,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'generation_failed')::BIGINT AS failed_count,
    (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (generation_completed_at - generation_started_at))), 0) FROM public.orders WHERE generation_completed_at IS NOT NULL AND generation_started_at IS NOT NULL AND generation_completed_at >= CURRENT_DATE - INTERVAL '7 days')::NUMERIC AS avg_generation_seconds,
    (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60), 0) FROM public.orders WHERE status IN ('submitted', 'under_review'))::NUMERIC AS oldest_pending_minutes;
END;
$$;

-- Fix update_queue_positions_trigger function
CREATE OR REPLACE FUNCTION public.update_queue_positions_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only update if status changed to/from queue-related statuses
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Recalculate positions for all queued orders
    WITH ranked_orders AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY filing_deadline ASC) as new_position
      FROM public.orders
      WHERE status IN ('submitted', 'under_review', 'in_progress')
    )
    UPDATE public.orders o
    SET queue_position = ro.new_position
    FROM ranked_orders ro
    WHERE o.id = ro.id;

    -- Clear position for completed/failed orders
    UPDATE public.orders
    SET queue_position = NULL
    WHERE status NOT IN ('submitted', 'under_review', 'in_progress');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 2: Add Missing Indexes for Performance
-- ============================================================================

-- Index for quick user profile lookups by role (used in many auth checks)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Index for order client lookups (used in ownership checks)
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(client_id);

-- Index for order clerk lookups
CREATE INDEX IF NOT EXISTS idx_orders_clerk_id ON public.orders(clerk_id) WHERE clerk_id IS NOT NULL;

-- Index for document order lookups
CREATE INDEX IF NOT EXISTS idx_documents_order_id ON public.documents(order_id);

-- Index for parties order lookups
CREATE INDEX IF NOT EXISTS idx_parties_order_id ON public.parties(order_id);

-- Index for automation logs by order
CREATE INDEX IF NOT EXISTS idx_automation_logs_order_id ON public.automation_logs(order_id) WHERE order_id IS NOT NULL;

-- Index for conversations by order
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON public.conversations(order_id);

-- Index for pending notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON public.notification_queue(status) WHERE status = 'pending';

-- Index for pending automation tasks
CREATE INDEX IF NOT EXISTS idx_automation_tasks_status_scheduled ON public.automation_tasks(status, scheduled_for) WHERE status = 'pending';

-- ============================================================================
-- PART 3: Add Missing Constraints
-- ============================================================================

-- Ensure order_number is unique
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- Ensure valid status values (if not already enum)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('submitted', 'under_review', 'assigned', 'in_progress', 'pending_review', 'draft_delivered', 'revision_requested', 'revision_delivered', 'completed', 'cancelled', 'blocked', 'generation_failed'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Constraint already exists
END $$;

-- Ensure valid turnaround values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_turnaround_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_turnaround_check
      CHECK (turnaround IN ('standard', 'rush_72', 'rush_48'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Constraint already exists
END $$;

-- Ensure prices are non-negative
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_price_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_total_price_check CHECK (total_price >= 0);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration was successful:

-- Check functions have search_path set
-- SELECT proname, prosecdef, proconfig
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
-- AND proname IN ('get_queue_position', 'get_queue_stats', 'update_queue_positions_trigger')
-- AND proconfig::text LIKE '%search_path%';

-- Check indexes exist
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
