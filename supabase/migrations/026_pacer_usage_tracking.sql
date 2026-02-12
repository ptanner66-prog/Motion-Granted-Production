-- ============================================================================
-- Migration 020: PACER Usage Tracking
-- ============================================================================
-- Creates pacer_usage table for tracking PACER API costs
-- Target budget: <$50/month
-- Cost per lookup: ~$0.10
--
-- Source: Chunk 4, Task 22
-- ============================================================================

-- ============================================================================
-- PACER USAGE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacer_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  citation_searched TEXT NOT NULL,
  normalized_citation TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 10,
  result_found BOOLEAN NOT NULL DEFAULT false,
  source TEXT CHECK (source IN ('PACER', 'RECAP', 'NONE')),
  case_number TEXT,
  court TEXT,
  error_message TEXT,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pacer_usage_searched_at ON pacer_usage(searched_at);
CREATE INDEX IF NOT EXISTS idx_pacer_usage_order ON pacer_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_pacer_usage_month ON pacer_usage(DATE_TRUNC('month', searched_at));

-- ============================================================================
-- MONTHLY BUDGET TRACKING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW pacer_monthly_spend AS
SELECT
  DATE_TRUNC('month', searched_at) AS month,
  COUNT(*) AS total_searches,
  SUM(cost_cents) AS total_cost_cents,
  SUM(cost_cents) / 100.0 AS total_cost_dollars,
  COUNT(*) FILTER (WHERE result_found = true) AS successful_searches,
  COUNT(*) FILTER (WHERE source = 'PACER') AS pacer_direct_searches,
  COUNT(*) FILTER (WHERE source = 'RECAP') AS recap_searches,
  5000 - COALESCE(SUM(cost_cents), 0) AS budget_remaining_cents
FROM pacer_usage
GROUP BY DATE_TRUNC('month', searched_at)
ORDER BY month DESC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current month's PACER spend
CREATE OR REPLACE FUNCTION get_pacer_monthly_spend()
RETURNS TABLE (
  total_cost_cents INTEGER,
  total_cost_dollars NUMERIC,
  search_count INTEGER,
  budget_remaining_cents INTEGER,
  budget_exceeded BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(pu.cost_cents)::INTEGER, 0) AS total_cost_cents,
    COALESCE(SUM(pu.cost_cents), 0) / 100.0 AS total_cost_dollars,
    COUNT(*)::INTEGER AS search_count,
    (5000 - COALESCE(SUM(pu.cost_cents), 0))::INTEGER AS budget_remaining_cents,
    COALESCE(SUM(pu.cost_cents), 0) >= 5000 AS budget_exceeded
  FROM pacer_usage pu
  WHERE DATE_TRUNC('month', pu.searched_at) = DATE_TRUNC('month', NOW());
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if PACER can be used (budget not exceeded)
CREATE OR REPLACE FUNCTION can_use_pacer()
RETURNS BOOLEAN AS $$
DECLARE
  current_spend INTEGER;
BEGIN
  SELECT COALESCE(SUM(cost_cents), 0)
  INTO current_spend
  FROM pacer_usage
  WHERE DATE_TRUNC('month', searched_at) = DATE_TRUNC('month', NOW());

  RETURN current_spend < 5000; -- $50 budget in cents
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to log a PACER usage
CREATE OR REPLACE FUNCTION log_pacer_usage(
  p_order_id UUID,
  p_citation TEXT,
  p_normalized_citation TEXT,
  p_found BOOLEAN,
  p_source TEXT,
  p_cost_cents INTEGER DEFAULT 10,
  p_case_number TEXT DEFAULT NULL,
  p_court TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO pacer_usage (
    order_id,
    citation_searched,
    normalized_citation,
    cost_cents,
    result_found,
    source,
    case_number,
    court,
    error_message
  ) VALUES (
    p_order_id,
    p_citation,
    p_normalized_citation,
    p_cost_cents,
    p_found,
    p_source,
    p_case_number,
    p_court,
    p_error
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE pacer_usage ENABLE ROW LEVEL SECURITY;

-- Admins can see all PACER usage
CREATE POLICY "Admins can view all pacer usage" ON pacer_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can insert (via service role)
CREATE POLICY "Service can insert pacer usage" ON pacer_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE pacer_usage IS 'Tracks PACER API usage for budget management. Target: <$50/month.';
COMMENT ON COLUMN pacer_usage.cost_cents IS 'Cost in cents. Default 10 cents (~$0.10) per lookup.';
COMMENT ON COLUMN pacer_usage.source IS 'Where the result came from: PACER (direct, costs money), RECAP (free mirror), NONE (not found)';
COMMENT ON VIEW pacer_monthly_spend IS 'Monthly aggregation of PACER spending for budget monitoring.';
