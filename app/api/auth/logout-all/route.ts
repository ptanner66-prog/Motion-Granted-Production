// /app/api/auth/logout-all/route.ts
// Logout all devices endpoint
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invalidateAllSessions } from '@/lib/auth/session';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-auth-logout-all');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keepCurrent } = await request.json().catch(() => ({ keepCurrent: false }));

    // Get current session ID from cookie or header
    const currentSessionId = request.headers.get('x-session-id') || undefined;

    const invalidatedCount = await invalidateAllSessions(
      user.id,
      keepCurrent ? currentSessionId : undefined
    );

    return NextResponse.json({
      success: true,
      invalidatedCount,
      message: `Logged out of ${invalidatedCount} device(s)`,
    });
  } catch (error) {
    log.error('Logout all error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Failed to logout all devices' }, { status: 500 });
  }
}
