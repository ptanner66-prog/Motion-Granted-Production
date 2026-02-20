-- T-15: Create phase_execution_logs table for structured workflow logging
-- Source: R8 T-15, Wave 1
-- Used by: T-16 (step-logger.ts), T-17 (orchestration logging), T-18 (admin diagnostics)

CREATE TABLE IF NOT EXISTS public.phase_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  run_id TEXT,
  phase_code VARCHAR(10) NOT NULL,
  step_name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'STARTED',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_phase_exec_logs_order_id
  ON public.phase_execution_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_phase_exec_logs_run_id
  ON public.phase_execution_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_phase_exec_logs_phase_code
  ON public.phase_execution_logs(phase_code);
CREATE INDEX IF NOT EXISTS idx_phase_exec_logs_status
  ON public.phase_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_phase_exec_logs_created
  ON public.phase_execution_logs(created_at DESC);

-- RLS
ALTER TABLE public.phase_execution_logs ENABLE ROW LEVEL SECURITY;

-- Admin read-only policy
CREATE POLICY "admin_read_phase_logs"
  ON public.phase_execution_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role full access (for Inngest writes via step-logger)
CREATE POLICY "service_role_full_phase_logs"
  ON public.phase_execution_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.phase_execution_logs IS 'Structured per-phase execution logs for workflow debugging and admin diagnostics';
