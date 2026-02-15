/**
 * Checkout Metadata Validation (50-State Step 7.4)
 *
 * Database-driven validation replacing the hardcoded jurisdiction enum.
 * Validates state_code and court_type against the states table.
 *
 * @module checkout-validation
 */

import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('checkout-validation');

/**
 * Validate checkout metadata against the database.
 *
 * Checks:
 * - state_code exists in the states table and is enabled
 * - court_type is either 'STATE' or 'FEDERAL'
 *
 * @throws Error if validation fails
 */
export async function validateCheckoutMetadata(
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
