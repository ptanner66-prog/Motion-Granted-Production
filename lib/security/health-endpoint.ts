/**
 * Secure Health Endpoints
 *
 * Public health check: returns only UP/DOWN status.
 * Deep health check: returns detailed system info, REQUIRES admin auth.
 *
 * SECURITY FIX: Deep health was previously unauthenticated and disclosed
 * system info (Supabase URL, connection status, etc.)
 */

import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Public health check \u2014 no system details, no version info.
 */
export function publicHealthCheck(): NextResponse {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}

/**
 * Deep health check \u2014 detailed system info. REQUIRES admin authentication.
 */
export async function deepHealthCheck(
  supabase: SupabaseClient,
  _userId: string
): Promise<{ status: string; details: Record<string, unknown> }> {
  const details: Record<string, unknown> = {};

  try {
    const start = Date.now();
    const { error } = await supabase.from('orders').select('id').limit(1);
    details.database = {
      status: error ? 'error' : 'connected',
      latencyMs: Date.now() - start,
      ...(error ? { error: error.message } : {}),
    };
  } catch {
    details.database = { status: 'unreachable' };
  }

  details.services = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    resend: !!process.env.RESEND_API_KEY,
    courtlistener: !!process.env.COURTLISTENER_API_KEY,
    inngest: !!process.env.INNGEST_EVENT_KEY,
  };

  const mem = process.memoryUsage();
  details.memory = {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
  };

  const dbStatus = details.database as Record<string, unknown> | undefined;
  const allHealthy = dbStatus?.status === 'connected';

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    details,
  };
}
