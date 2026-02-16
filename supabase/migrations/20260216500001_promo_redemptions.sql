-- SP-11 AD-1: Per-user promo redemption tracking
-- Source: D7-R3-004

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  promo_code TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promo_user_code ON promo_redemptions (user_id, promo_code);
CREATE INDEX idx_promo_redeemed_at ON promo_redemptions (redeemed_at);

-- Stripe health reports table for AF-1
CREATE TABLE IF NOT EXISTS stripe_health_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_data JSONB NOT NULL,
  alert_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
