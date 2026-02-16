-- ==========================================================================
-- MIGRATION: Fix PRE-001 -- Rebuild ai_usage_logs with correct FK
-- AUDIT REF: PRE-001 (P1 HIGH)
-- DATE: 2026-02-16 CST
-- ==========================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES order_workflows(id) ON DELETE SET NULL,
  phase VARCHAR(20),
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  latency_ms INTEGER,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_logs_admin" ON ai_usage_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_order ON ai_usage_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model);
