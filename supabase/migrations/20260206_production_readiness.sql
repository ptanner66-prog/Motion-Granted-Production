-- ============================================================
-- PRODUCTION READINESS MIGRATION
-- Date: 2026-02-06
-- Covers: Batch A fixes, Batch B document generation, Batch D hardening
-- ============================================================

-- ============================================================
-- BATCH A: Stop-ship fixes — order_citations enhancements
-- ============================================================

ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS courtlistener_url text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS courtlistener_opinion_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_id text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS proposition_text text;
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS topical_relevance_score numeric(4,3);
ALTER TABLE order_citations ADD COLUMN IF NOT EXISTS search_query_used text;

CREATE INDEX IF NOT EXISTS idx_order_citations_display_order
  ON order_citations(order_id, display_order);

-- ============================================================
-- BATCH B: Document generation — order document columns
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS document_generated_at timestamptz;

-- NOTE: Storage bucket 'order-documents' must be created manually
-- in Supabase Dashboard > Storage > New Bucket:
--   Bucket name: order-documents
--   Public: false
--   File size limit: 50MB
--   Allowed MIME types:
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document
--     application/pdf

-- ============================================================
-- BATCH D: Workflow hardening — phase history & metrics
-- ============================================================

-- Phase history tracking on workflow state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflow_state' AND column_name = 'phase_started_at'
  ) THEN
    ALTER TABLE order_workflow_state ADD COLUMN phase_started_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_workflow_state' AND column_name = 'phase_history'
  ) THEN
    ALTER TABLE order_workflow_state ADD COLUMN phase_history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Generation metrics table for cost tracking and analytics
CREATE TABLE IF NOT EXISTS generation_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  phase text NOT NULL,
  model text NOT NULL,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_usd numeric(8,4) DEFAULT 0,
  duration_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_metrics_order
  ON generation_metrics(order_id);

-- Enable RLS on generation_metrics
ALTER TABLE generation_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only read access to generation metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generation_metrics' AND policyname = 'Admin can read generation metrics'
  ) THEN
    CREATE POLICY "Admin can read generation metrics"
    ON generation_metrics FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- Service role insert policy for generation metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'generation_metrics' AND policyname = 'Service role can insert generation metrics'
  ) THEN
    CREATE POLICY "Service role can insert generation metrics"
    ON generation_metrics FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;
