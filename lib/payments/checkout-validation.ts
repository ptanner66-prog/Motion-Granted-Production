/**
 * Checkout Validation (SP-10 AB-2, AB-3)
 *
 * Contains:
 * - validatePriceConsistency() — D7-R3-005, $1.00 tolerance
 * - validateCheckoutMetadata() — D7-R5-004-VALID, 12-field validation
 * - validateCheckoutMetadataLegacy() — 50-State Step 7.4 DB-driven validation
 *
 * @module payments/checkout-validation
 */

import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('checkout-validation');

// ============================================================
// PRICE CONSISTENCY (AB-2)
// Source: D7-R3-005 | BD-XD-001v3 Step 12.5
// ============================================================

export interface PriceConsistencyResult {
  consistent: boolean;
  divergence: number;
}

export function validatePriceConsistency(
  displayedPriceCents: number | null,
  calculatedPriceCents: number,
  toleranceCents: number = 100, // $1.00 default
): PriceConsistencyResult {
  // Null/undefined: legacy frontend — treat as consistent
  if (displayedPriceCents === null || displayedPriceCents === undefined) {
    return { consistent: true, divergence: 0 };
  }

  // NaN/negative: treat as null (legacy), log warning
  if (isNaN(displayedPriceCents) || displayedPriceCents < 0) {
    console.warn(`[PRICE_CONSISTENCY] Invalid displayedPriceCents: ${displayedPriceCents}`);
    return { consistent: true, divergence: 0 };
  }

  // calculatedPriceCents validation (should have been caught by Step 12)
  if (isNaN(calculatedPriceCents) || calculatedPriceCents <= 0) {
    throw new Error(`Invalid calculatedPriceCents: ${calculatedPriceCents}`);
  }

  const divergence = Math.abs(displayedPriceCents - calculatedPriceCents);
  return {
    consistent: divergence <= toleranceCents, // <= not < (exactly $1.00 is OK)
    divergence,
  };
}

// ============================================================
// CHECKOUT METADATA VALIDATION (AB-3)
// Source: D7-R5-004-VALID | 12 fields
// ============================================================

export interface MetadataValidationResult {
  valid: boolean;
  errors: string[];
  format: '7-field' | '12-field';
}

const VALID_TIERS = ['A', 'B', 'C', 'D'] as const;
const VALID_COURT_TYPES = ['STATE', 'FEDERAL'] as const;
const VALID_RUSH_TYPES = ['STANDARD', '48HR', '24HR', 'standard', 'rush_72', 'rush_48', 'rush_48hr', 'rush_24hr'] as const;

export function validateCheckoutMetadata(
  session: Stripe.Checkout.Session,
): MetadataValidationResult {
  const meta = session.metadata || {};
  const errors: string[] = [];

  // Detect format: 12-field if stateCode present, else 7-field
  const is12Field = 'stateCode' in meta && meta.stateCode !== '';
  const format = is12Field ? '12-field' : '7-field';

  // === Common fields (both formats) ===
  // orderId: UUID format — check both orderId and order_id (legacy)
  const orderId = meta.orderId || meta.order_id;
  if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    errors.push('orderId: missing or invalid UUID format');
  }

  // motionType: non-empty — check both motionType and motion_type (legacy)
  const motionType = meta.motionType || meta.motion_type;
  if (!motionType) {
    errors.push('motionType: missing or empty');
  }

  // tier: A/B/C/D
  const tier = meta.tier;
  if (!tier || !VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
    errors.push(`tier: must be one of ${VALID_TIERS.join(', ')}, got '${tier}'`);
  }

  // rushType — check both rushType and rush_type (legacy)
  const rushType = meta.rushType || meta.rush_type;
  if (rushType && !VALID_RUSH_TYPES.includes(rushType as typeof VALID_RUSH_TYPES[number])) {
    errors.push(`rushType: must be one of ${VALID_RUSH_TYPES.join(', ')}, got '${rushType}'`);
  }

  // === 12-field specific ===
  if (is12Field) {
    // stateCode: 2 uppercase chars
    if (!/^[A-Z]{2}$/.test(meta.stateCode || '')) {
      errors.push(`stateCode: must be 2 uppercase chars, got '${meta.stateCode}'`);
    }

    // courtType
    if (meta.courtType && !VALID_COURT_TYPES.includes(meta.courtType as typeof VALID_COURT_TYPES[number])) {
      errors.push(`courtType: must be STATE or FEDERAL, got '${meta.courtType}'`);
    }

    // pricingMultiplier: number > 0 and <= 2.0
    const multiplier = parseFloat(meta.pricingMultiplier || '');
    if (isNaN(multiplier) || multiplier <= 0 || multiplier > 2.0) {
      errors.push(`pricingMultiplier: must be > 0 and <= 2.0, got '${meta.pricingMultiplier}'`);
    }

    // clientId: non-empty
    if (!meta.clientId) {
      errors.push('clientId: missing or empty');
    }

    // orderNumber: non-empty
    if (!meta.orderNumber) {
      errors.push('orderNumber: missing or empty');
    }
  }

  // session_type (D7-R5-005-META)
  if (meta.session_type && !['initial', 'tier_upgrade', 'revision'].includes(meta.session_type)) {
    errors.push(`session_type: unrecognized value '${meta.session_type}'`);
  }

  return { valid: errors.length === 0, errors, format };
}

// ============================================================
// LEGACY DB-DRIVEN VALIDATION (50-State Step 7.4)
// Preserved for backward compatibility
// ============================================================

export async function validateCheckoutMetadataLegacy(
  metadata: Record<string, string>,
): Promise<void> {
  const stateCode = metadata.state_code?.trim();
  const courtType = metadata.court_type?.trim();

  // Validate state_code against the states table
  if (stateCode) {
    const supabase = await createClient();
    const { data: state, error } = await supabase
      .from('states')
      .select('code')
      .eq('code', stateCode)
      .eq('enabled', true)
      .single();

    if (error || !state) {
      log.warn('State validation failed', { stateCode, error: error?.message });
      throw new Error(`Invalid state_code: ${stateCode}`);
    }
  }

  // Validate court_type
  if (courtType && !['STATE', 'FEDERAL'].includes(courtType)) {
    throw new Error(`Invalid court_type: ${courtType}`);
  }

  // Validate pricing_multiplier if present
  if (metadata.pricing_multiplier) {
    const multiplier = parseFloat(metadata.pricing_multiplier);
    if (isNaN(multiplier) || multiplier <= 0 || multiplier > 2.0) {
      throw new Error(
        `Invalid pricing_multiplier: ${metadata.pricing_multiplier} (must be > 0 and <= 2.0)`,
      );
    }
  }
}
