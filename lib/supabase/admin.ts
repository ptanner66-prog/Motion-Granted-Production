/**
 * Service Role Supabase Client (R4-01)
 *
 * SERVICE_ROLE_ALLOWLIST: Only these files may use service_role access.
 * Adding a new entry requires updating this list AND the SEC-02-B test (DST-02).
 * Undocumented service_role usage is a P0 violation.
 *
 * This file provides a centralized getServiceSupabase() function.
 * Over time, all direct service_role client creation across the codebase
 * should be migrated to use this function.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Authorized service_role usage locations.
 * Each entry documents WHY service_role is required (RLS bypass justification).
 */
const SERVICE_ROLE_ALLOWLIST = [
  'app/api/payments/checkout/route.ts',       // #1: Pre-payment conflict check (CC-R3-02)
  'lib/automation/conflict-checker.ts',        // #2: Post-payment AI party analysis
  'lib/inngest/',                              // #3: All Inngest background workers (wildcard)
  'app/api/webhooks/stripe/route.ts',          // #4: Stripe webhook handler
  'lib/security/audit-log.ts',                 // #5: Immutable audit log writes
  'lib/delivery/signed-urls.ts',               // #6: Supabase Storage signed URL generation
  'app/api/webhooks/resend/route.ts',          // #7: Resend webhook handler
  'lib/retention/retention-manager.ts',        // #8: Data retention cascade (DST-04)
] as const;

/**
 * Create a Supabase client with service_role privileges.
 * Bypasses ALL Row-Level Security policies.
 *
 * ONLY use from files listed in SERVICE_ROLE_ALLOWLIST above.
 * NEVER expose the service_role key to client-side code.
 *
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing.
 */
export function getServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL. ' +
      'Do NOT fall back to anon key -- service_role operations require elevated privileges.'
    );
  }

  return createClient(url, key);
}

// Export ALLOWLIST for test verification (DST-02)
export { SERVICE_ROLE_ALLOWLIST };
