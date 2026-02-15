// /app/api/auth/change-password/route.ts
// Password change endpoint with session invalidation
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validatePassword } from '@/lib/auth/password-validation';
import { onPasswordChange } from '@/lib/auth/session';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-auth-change-password');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password required' }, { status: 400 });
    }

    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Password does not meet requirements',
        details: validation.errors,
        suggestions: validation.suggestions,
      }, { status: 400 });
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Invalidate all other sessions
    const currentSessionId = request.headers.get('x-session-id') || undefined;
    await onPasswordChange(user.id, currentSessionId);

    return NextResponse.json({
      success: true,
      message: 'Password updated. All other sessions have been logged out.',
    });
  } catch (error) {
    log.error('Change password error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
