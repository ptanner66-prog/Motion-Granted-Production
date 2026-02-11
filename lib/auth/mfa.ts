/**
 * MFA (Multi-Factor Authentication) Utilities
 *
 * SEC-002: Admin accounts MUST use TOTP-based MFA (AAL2).
 * Uses Supabase Auth's built-in MFA with TOTP factors.
 *
 * Flow:
 * 1. Admin enrolls via /admin/setup-mfa (generates QR code)
 * 2. Admin verifies TOTP code to activate factor
 * 3. Middleware checks AAL level on every admin route
 * 4. If AAL1 with enrolled factor → redirect to /admin/verify-mfa
 * 5. If AAL1 with no factor → redirect to /admin/setup-mfa
 */

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MFAStatus {
  isEnrolled: boolean;
  isVerified: boolean;
  currentAAL: 'aal1' | 'aal2';
  factorId: string | null;
}

/**
 * Check MFA status for the current user.
 * Returns enrollment state and current assurance level.
 */
export async function getMFAStatus(): Promise<MFAStatus> {
  const supabase = await createClient();
  return getMFAStatusWithClient(supabase);
}

/**
 * Check MFA status using an existing Supabase client.
 * Used by middleware where createClient() is not available.
 */
export async function getMFAStatusWithClient(supabase: SupabaseClient): Promise<MFAStatus> {
  const defaultStatus: MFAStatus = {
    isEnrolled: false,
    isVerified: false,
    currentAAL: 'aal1',
    factorId: null,
  };

  try {
    // Get current AAL
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || !aalData) return defaultStatus;

    // Get enrolled factors
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factorsData) {
      return {
        ...defaultStatus,
        currentAAL: aalData.currentLevel as 'aal1' | 'aal2',
      };
    }

    // Find verified TOTP factor
    const verifiedFactor = factorsData.totp.find(f => f.status === 'verified');
    // SP10: cast status to string to allow 'unverified' comparison (SDK type is overly narrow)
    const unverifiedFactor = factorsData.totp.find(f => (f.status as string) === 'unverified');

    return {
      isEnrolled: !!verifiedFactor,
      isVerified: aalData.currentLevel === 'aal2',
      currentAAL: aalData.currentLevel as 'aal1' | 'aal2',
      factorId: verifiedFactor?.id || unverifiedFactor?.id || null,
    };
  } catch {
    return defaultStatus;
  }
}

/**
 * Enroll a new TOTP factor.
 * Returns the QR code URI and factor ID for the setup page.
 */
export async function enrollTOTP(): Promise<{
  success: boolean;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Motion Granted Admin TOTP',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to enroll TOTP',
    };
  }
}

/**
 * Verify a TOTP code to complete enrollment or authenticate.
 * After successful verification, the session is upgraded to AAL2.
 */
export async function verifyTOTP(
  factorId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      return { success: false, error: challengeError.message };
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      return { success: false, error: verifyError.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'TOTP verification failed',
    };
  }
}

/**
 * Unenroll a TOTP factor (admin action).
 */
export async function unenrollTOTP(factorId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unenroll TOTP',
    };
  }
}
