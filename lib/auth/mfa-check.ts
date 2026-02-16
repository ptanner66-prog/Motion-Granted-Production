/**
 * MFA Enforcement for Admin Routes (DST-11)
 *
 * Requires Supabase Pro tier for MFA support.
 * See lib/auth/mfa.ts for enrollment/verification utilities.
 *
 * ADMIN_MFA_MODE env var:
 *   'enforce' or 'on' = require MFA for admin routes (production — DEFAULT)
 *   'off'             = skip MFA check (development only — NEVER in production)
 *
 * Missing env var defaults to enforcement (secure default).
 *
 * Phase C Gate — MFA Prerequisites:
 * Before executing any Phase C task referencing MFA (SEC-06-E, CGA7-002, CGA7-005):
 * 1. Navigate to Supabase Dashboard > Project Settings > Billing
 * 2. Confirm "Pro" tier is displayed
 * 3. If "Free" tier: STOP. Upgrade to Pro ($25/mo) before proceeding.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';

/**
 * Enforce MFA (AAL2) for admin routes.
 *
 * Returns null if MFA is verified or skipped (development).
 * Returns a NextResponse redirect if MFA verification is needed.
 *
 * Usage in route handlers:
 *   const mfaRedirect = await enforceMFA(supabase, request);
 *   if (mfaRedirect) return mfaRedirect;
 */
export async function enforceMFA(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<NextResponse | null> {
  const mfaMode = (process.env.ADMIN_MFA_MODE || 'on').toLowerCase().trim();

  if (mfaMode === 'off') {
    return null; // Skip MFA in development
  }

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel === 'aal2') {
    return null; // MFA verified, continue
  }

  // Check if user has enrolled factors
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasEnrolled = factorsData?.totp?.some(
    (f: { status: string }) => f.status === 'verified'
  );

  // API routes get JSON 403; page routes get redirected
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'MFA required for admin access' },
      { status: 403 }
    );
  }

  if (hasEnrolled) {
    // Factor enrolled but session is AAL1 — need to verify
    return NextResponse.redirect(new URL('/admin/verify-mfa', request.url));
  }

  // No factor enrolled — need to set up MFA
  return NextResponse.redirect(new URL('/admin/setup-mfa', request.url));
}
