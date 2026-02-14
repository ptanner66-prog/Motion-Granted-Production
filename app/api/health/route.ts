/**
 * Health Check API
 *
 * GET: Returns system health status
 *      Use this for monitoring and uptime checks
 *
 * Returns:
 * - status: "healthy" | "degraded" | "unhealthy"
 * - timestamp: current server time
 *
 * Note: Detailed error information is logged server-side only,
 * not exposed to clients for security.
 */

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-health');

interface HealthCheck {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
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
      checks.push({ name: 'database', status: 'error' });
    } else {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('orders').select('id').limit(1);

      if (error) {
        log.error('Database check failed', { error: error.message });
      }

      checks.push({
        name: 'database',
        status: error ? 'error' : 'ok',
        latencyMs: Date.now() - dbStart,
      });
    }
  } catch (error) {
    log.error('Database check exception', { error: error instanceof Error ? error.message : error });
    checks.push({ name: 'database', status: 'error' });
  }

  // Check 2: Anthropic API Key configured (don't reveal which source)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    if (!hasApiKey && supabaseUrl && supabaseKey) {
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
      name: 'ai_service',
      status: hasApiKey ? 'ok' : 'error',
    });
  } catch (error) {
    log.error('AI service check failed', { error: error instanceof Error ? error.message : error });
    checks.push({ name: 'ai_service', status: 'error' });
  }

  // Check 3: Email service configured
  checks.push({
    name: 'email_service',
    status: process.env.RESEND_API_KEY ? 'ok' : 'error',
  });

  // Check 4: Queue service configured
  checks.push({
    name: 'queue_service',
    status: process.env.INNGEST_EVENT_KEY ? 'ok' : 'error',
  });

  // Determine overall status
  const hasErrors = checks.some((c) => c.status === 'error');
  const criticalErrors = checks
    .filter((c) => ['database', 'ai_service'].includes(c.name))
    .some((c) => c.status === 'error');

  const overallStatus = criticalErrors ? 'unhealthy' : hasErrors ? 'degraded' : 'healthy';

  // Log details server-side for debugging
  if (hasErrors) {
    log.error('System status check', { status: overallStatus, checks });
  }

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    // Only return status, not error details
    services: checks.map(c => ({ name: c.name, status: c.status })),
  }, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
  });
}
