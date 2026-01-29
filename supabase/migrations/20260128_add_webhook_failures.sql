-- Migration: Add webhook_failures table for Stripe webhook error tracking
-- Task 13: Webhook Null Safety
-- Version: 1.0 — January 28, 2026

-- Create webhook_failures table
CREATE TABLE IF NOT EXISTS webhook_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Failure classification
  failure_type VARCHAR(50) NOT NULL,
  -- Types: MISSING_SIGNATURE, INVALID_SIGNATURE, MISSING_DATA,
  --        MISSING_METADATA, MISSING_ORDER_ID, DB_UPDATE_FAILED,
  --        PAYMENT_FAILED, HANDLER_ERROR, UNKNOWN_ERROR

  -- Stripe event reference (may be null if signature verification failed)
  stripe_event_id VARCHAR(100),
  stripe_event_type VARCHAR(100),

  -- Error details
  details TEXT,
  error_message TEXT,

  -- Request context
  ip_address INET,
  user_agent TEXT,
  request_headers JSONB,

  -- Related entities (may be null depending on failure point)
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- For tracking resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_webhook_failures_type ON webhook_failures(failure_type);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created ON webhook_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_stripe_event ON webhook_failures(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_order ON webhook_failures(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_unresolved ON webhook_failures(resolved_at) WHERE resolved_at IS NULL;

-- RLS policies
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook failures
CREATE POLICY "Admins can view webhook failures"
  ON webhook_failures
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can insert (from webhook handler)
CREATE POLICY "Service role can insert webhook failures"
  ON webhook_failures
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admins can update (for resolution)
CREATE POLICY "Admins can update webhook failures"
  ON webhook_failures
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Comment for documentation
COMMENT ON TABLE webhook_failures IS 'Tracks Stripe webhook processing failures for debugging and monitoring. Task 13.';
