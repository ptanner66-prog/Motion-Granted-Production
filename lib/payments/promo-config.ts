/**
 * Per-user Promo Redemption Tracking + Velocity Check (SP-11 AD-1)
 *
 * Source: D7-R3-004 | Priority: P1
 *
 * - One-time use per promo code per user
 * - Velocity check: 3+ promos in 24h triggers admin alert (fail-open)
 * - Stripe coupon restrictions serve as backup enforcement
 *
 * Usage:
 * - validatePromoUsage() → call from checkout route BEFORE creating Stripe session
 * - recordPromoRedemption() → call from webhook handler AFTER successful payment
 *
 * @module payments/promo-config
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function validatePromoUsage(
  userId: string,
  promoCode: string,
  orderId: string,
  supabase: SupabaseClient,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Normalize promo code to uppercase
    const normalizedCode = promoCode.toUpperCase().trim();

    // Check: has this user already redeemed this promo?
    const { data: existing } = await supabase
      .from('promo_redemptions')
      .select('id')
      .eq('user_id', userId)
      .eq('promo_code', normalizedCode);

    if (existing && existing.length > 0) {
      return { allowed: false, reason: 'Promo code already used' };
    }

    // Velocity check: 3+ promos in 24 hours = admin alert (do NOT block)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('promo_redemptions')
      .select('id')
      .eq('user_id', userId)
      .gte('redeemed_at', twentyFourHoursAgo);

    if (recent && recent.length >= 3) {
      console.warn(`[PROMO_VELOCITY] User ${userId} has ${recent.length} promo uses in 24h`);
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureMessage(`Promo velocity alert: user ${userId} — ${recent.length} in 24h`, 'warning');
      } catch {
        // Sentry not available
      }
      // Allow but flag — Stripe's own coupon restrictions serve as backup
    }

    return { allowed: true };
  } catch (error) {
    // Fail-open: allow promo if DB is unavailable (Stripe restrictions are backup)
    console.warn('[PROMO] Validation failed, allowing promo (fail-open):', error);
    return { allowed: true };
  }
}

export async function recordPromoRedemption(
  userId: string,
  promoCode: string,
  orderId: string,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from('promo_redemptions').insert({
    user_id: userId,
    promo_code: promoCode.toUpperCase().trim(),
    order_id: orderId,
  });
}
