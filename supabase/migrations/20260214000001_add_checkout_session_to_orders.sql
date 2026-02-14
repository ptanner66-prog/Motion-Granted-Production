-- SP-11: Add stripe_checkout_session_id to orders table for checkout reconciliation
-- The webhook handler already uses stripe_payment_status; this adds checkout session tracking.
-- Safe to re-run: uses IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'stripe_checkout_session_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN stripe_checkout_session_id TEXT;
    CREATE INDEX idx_orders_stripe_checkout_session ON orders (stripe_checkout_session_id)
      WHERE stripe_checkout_session_id IS NOT NULL;
  END IF;
END $$;
