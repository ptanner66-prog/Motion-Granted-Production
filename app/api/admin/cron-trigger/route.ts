/**
 * Admin Cron Trigger Proxy
 *
 * Allows admins to trigger cron jobs via authenticated session
 * instead of exposing CRON_SECRET to the browser via NEXT_PUBLIC_.
 *
 * POST /api/admin/cron-trigger
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-admin-cron-trigger');

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Forward to cron endpoint with server-side CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      log.error('NEXT_PUBLIC_APP_URL not configured');
      return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
    }
    const cronResponse = await fetch(`${baseUrl}/api/automation/cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify(body),
    });

    const data = await cronResponse.json();
    return NextResponse.json(data, { status: cronResponse.status });
  } catch (error) {
    log.error('Cron trigger error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Failed to trigger cron job' }, { status: 500 });
  }
}
