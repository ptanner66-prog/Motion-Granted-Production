/**
 * Health Check API
 *
 * GET: Returns system health status
 *      Use this for monitoring, uptime checks, and debugging
 *
 * Returns:
 * - status: "healthy" | "degraded" | "unhealthy"
 * - checks: individual service statuses
 * - timestamp: current server time
 */

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface HealthCheck {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export async function GET() {
  const checks: HealthCheck[] = [];
  const startTime = Date.now();

  // Check 1: Supabase Database
  try {
    const dbStart = Date.now();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      checks.push({
        name: 'database',
        status: 'error',
        error: 'Missing Supabase configuration',
      });
    } else {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('orders').select('id').limit(1);

      checks.push({
        name: 'database',
        status: error ? 'error' : 'ok',
        latencyMs: Date.now() - dbStart,
        error: error?.message,
      });
    }
  } catch (error) {
    checks.push({
      name: 'database',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check 2: Anthropic API Key configured
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from('automation_settings')
        .select('setting_value')
        .eq('setting_key', 'anthropic_api_key')
        .single();

      if (data?.setting_value) {
        hasApiKey = true;
      }
    }

    checks.push({
      name: 'anthropic_api',
      status: hasApiKey ? 'ok' : 'error',
      error: hasApiKey ? undefined : 'No API key configured',
    });
  } catch (error) {
    checks.push({
      name: 'anthropic_api',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check 3: Resend Email configured
  checks.push({
    name: 'email',
    status: process.env.RESEND_API_KEY ? 'ok' : 'error',
    error: process.env.RESEND_API_KEY ? undefined : 'RESEND_API_KEY not configured',
  });

  // Check 4: Inngest configured
  checks.push({
    name: 'queue',
    status: process.env.INNGEST_EVENT_KEY ? 'ok' : 'error',
    error: process.env.INNGEST_EVENT_KEY ? undefined : 'INNGEST_EVENT_KEY not configured (queue may not work)',
  });

  // Determine overall status
  const hasErrors = checks.some((c) => c.status === 'error');
  const criticalErrors = checks
    .filter((c) => ['database', 'anthropic_api'].includes(c.name))
    .some((c) => c.status === 'error');

  const overallStatus = criticalErrors ? 'unhealthy' : hasErrors ? 'degraded' : 'healthy';

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    checks,
    version: process.env.npm_package_version || '1.0.0',
  }, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
  });
}
