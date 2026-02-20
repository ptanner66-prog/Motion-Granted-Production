-- T-43: Citation metrics tracking table
-- Stores per-citation verification performance data from CIV pipeline
-- Source: R8:230 | Atomic Change #125

CREATE TABLE IF NOT EXISTS public.citation_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  citation_id UUID,
  phase_code VARCHAR(10) NOT NULL,           -- 'V.1', 'VII.1', 'IX.1'
  tier VARCHAR(1) NOT NULL,                  -- 'A', 'B', 'C', 'D'

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  -- Per-step timing (nullable — step may not run)
  step1_duration_ms INTEGER,                 -- Existence check
  step2_duration_ms INTEGER,                 -- Holding verification
  step3_duration_ms INTEGER,                 -- Dicta classification
  step4_duration_ms INTEGER,                 -- Quote verification
  step5_duration_ms INTEGER,                 -- Bad law check
  step6_duration_ms INTEGER,                 -- Strength scoring
  step7_duration_ms INTEGER,                 -- Output assembly

  -- Results
  verification_status VARCHAR(30),           -- 'VERIFIED', 'FLAGGED', 'REMOVED', 'FAILED'
  composite_confidence DECIMAL(4,3),         -- 0.000 to 1.000
  steps_completed INTEGER DEFAULT 0,
  steps_skipped INTEGER DEFAULT 0,

  -- Source tracking
  primary_api VARCHAR(30),                   -- 'courtlistener_v4', 'courtlistener_v3', 'case_law'
  fallback_used BOOLEAN DEFAULT FALSE,
  api_errors INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query patterns
CREATE INDEX idx_citation_metrics_order_id ON public.citation_metrics(order_id);
CREATE INDEX idx_citation_metrics_phase ON public.citation_metrics(phase_code);
CREATE INDEX idx_citation_metrics_created ON public.citation_metrics(created_at DESC);
CREATE INDEX idx_citation_metrics_status ON public.citation_metrics(verification_status);

-- RLS
ALTER TABLE public.citation_metrics ENABLE ROW LEVEL SECURITY;

-- Admin read-only
CREATE POLICY "admin_read_citation_metrics"
  ON public.citation_metrics FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role full access (for pipeline writes)
CREATE POLICY "service_role_citation_metrics"
  ON public.citation_metrics FOR ALL
  USING (auth.role() = 'service_role');
