/**
 * Order Creation from Checkout Metadata (50-State Step 7.3)
 *
 * Populates the 4 new R1 columns (state, court_type, federal_district,
 * pricing_multiplier_applied) from the 12-field Stripe checkout metadata.
 *
 * Called by the Stripe webhook handler after successful checkout.
 *
 * @module order-creation
 */

import { createLogger } from '@/lib/security/logger';

const log = createLogger('order-creation');

interface CheckoutMetadata {
  order_id?: string;
  order_number?: string;
  motion_type?: string;
  tier?: string;
  rush_type?: string;
  client_id?: string;
  state_code?: string;
  court_type?: string;
  federal_circuit?: string;
  federal_district?: string;
  jurisdiction_legacy?: string;
  pricing_multiplier?: string;
}

/**
 * Validate checkout metadata fields before writing to the database.
 * Returns validated and sanitized data, or throws on invalid input.
 */
function validateMetadata(metadata: CheckoutMetadata): {
  state: string | null;
  court_type: string | null;
  federal_district: string | null;
  pricing_multiplier_applied: number;
} {
  const stateCode = metadata.state_code?.trim() || null;
  const courtType = metadata.court_type?.trim() || null;
  const federalDistrict = metadata.federal_district?.trim() || null;
  const rawMultiplier = metadata.pricing_multiplier?.trim();

  // Validate state_code: must be exactly 2 uppercase chars
  if (stateCode && (stateCode.length !== 2 || !/^[A-Z]{2}$/.test(stateCode))) {
    log.warn('Invalid state_code in checkout metadata', { stateCode });
    // Don't throw — use null as safe fallback
  }

  // Validate court_type: must be 'STATE' or 'FEDERAL'
  if (courtType && !['STATE', 'FEDERAL'].includes(courtType)) {
    log.warn('Invalid court_type in checkout metadata', { courtType });
  }

  // Validate pricing_multiplier: must be > 0 and <= 2.0 and not NaN
  let pricingMultiplier = 1.0;
  if (rawMultiplier) {
    const parsed = parseFloat(rawMultiplier);
    if (isNaN(parsed) || parsed <= 0 || parsed > 2.0) {
      log.warn('Invalid pricing_multiplier in checkout metadata', {
        rawMultiplier,
        parsed,
      });
      pricingMultiplier = 1.0;
    } else {
      pricingMultiplier = parsed;
    }
  }

  return {
    state: stateCode && /^[A-Z]{2}$/.test(stateCode) ? stateCode : null,
    court_type: courtType && ['STATE', 'FEDERAL'].includes(courtType) ? courtType : null,
    federal_district: federalDistrict || null,
    pricing_multiplier_applied: pricingMultiplier,
  };
}

/**
 * Populate R1 columns on an order from Stripe checkout session metadata.
 *
 * @param supabase - Supabase client (service role for webhook context)
 * @param orderId - The order ID to update
 * @param metadata - Stripe session metadata object
 * @returns Success/failure with optional error message
 */
export async function populateOrderFromCheckoutMetadata(
  supabase: { from: (table: string) => ReturnType<ReturnType<typeof import('@supabase/supabase-js').createClient>['from']> },
  orderId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const validated = validateMetadata(metadata as CheckoutMetadata);

    const { error } = await supabase
      .from('orders')
      .update({
        state: validated.state,
        court_type: validated.court_type,
        federal_district: validated.federal_district,
        pricing_multiplier_applied: validated.pricing_multiplier_applied,
      })
      .eq('id', orderId);

    if (error) {
      // The columns may not exist yet in the DB schema — log but don't fail
      log.warn('Failed to populate R1 columns (columns may not exist yet)', {
        orderId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    log.info('Populated R1 columns from checkout metadata', {
      orderId,
      state: validated.state,
      courtType: validated.court_type,
      pricingMultiplier: validated.pricing_multiplier_applied,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Error populating order from checkout metadata', {
      orderId,
      error: message,
    });
    return { success: false, error: message };
  }
}
