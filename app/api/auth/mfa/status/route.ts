/**
 * MFA Status API
 *
 * GET: Check MFA enrollment and verification status for the current user.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factorsData } = await supabase.auth.mfa.listFactors();

    const verifiedFactor = factorsData?.totp?.find(f => f.status === 'verified');

    return NextResponse.json({
      isEnrolled: !!verifiedFactor,
      isVerified: aalData?.currentLevel === 'aal2',
      currentAAL: aalData?.currentLevel || 'aal1',
      factorId: verifiedFactor?.id || null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get MFA status' }, { status: 500 });
  }
}
