// /app/api/auth/login/route.ts
// Login endpoint with lockout integration
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { shouldBlockLogin, recordLoginAttempt, clearFailedAttempts } from '@/lib/auth/lockout';
import { createSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Check lockout status
    const lockoutCheck = await shouldBlockLogin(email);
    if (lockoutCheck.blocked) {
      return NextResponse.json({
        error: lockoutCheck.reason,
        locked: true,
        minutesRemaining: lockoutCheck.minutesRemaining,
      }, { status: 429 });
    }

    // Attempt login
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Record attempt
    await recordLoginAttempt({
      userId: data?.user?.id,
      email,
      success: !error,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });

    if (error) {
      // Check if this attempt triggered a lockout
      const newStatus = await shouldBlockLogin(email);

      return NextResponse.json({
        error: 'Invalid email or password',
        attemptsRemaining: newStatus.blocked ? 0 : undefined,
        locked: newStatus.blocked,
        minutesRemaining: newStatus.minutesRemaining,
      }, { status: 401 });
    }

    // Successful login - create session
    const sessionId = await createSession(data.user.id, ipAddress, userAgent);

    // Clear any lockout state
    await clearFailedAttempts(email);

    return NextResponse.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      sessionId,
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
