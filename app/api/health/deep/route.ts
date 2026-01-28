/**
 * Deep Health Check API (Task 60)
 *
 * GET: Returns comprehensive health status of all dependencies
 *
 * Checks:
 * - Database (Supabase)
 * - Anthropic API
 * - OpenAI API (if configured)
 * - CourtListener API
 * - Stripe API
 * - Resend API
 * - Storage (Supabase)
 *
 * Source: Chunk 8, Task 60 - Code Mode Spec Section 22
 */

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getCachedCredentialStatus, verifyAllCredentials } from '@/lib/startup/credential-verifier';

// ============================================================================
// TYPES
// ============================================================================

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        service: 'database',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: 'Missing credentials',
      };
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('orders').select('id').limit(1);

    return {
      service: 'database',
      status: error ? 'unhealthy' : 'healthy',
      latencyMs: Date.now() - start,
      error: error?.message,
    };
  } catch (error) {
    return {
      service: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkAnthropic(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Try to get from database
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
        const { data } = await supabase
          .from('automation_settings')
          .select('setting_value')
          .eq('setting_key', 'anthropic_api_key')
          .single();

        if (!data?.setting_value) {
          return {
            service: 'anthropic',
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            error: 'API key not configured',
          };
        }
      } else {
        return {
          service: 'anthropic',
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          error: 'API key not configured',
        };
      }
    }

    // Don't make actual API call to save costs, just verify key exists
    return {
      service: 'anthropic',
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'anthropic',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenAI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        service: 'openai',
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: 'Not configured (optional)',
      };
    }

    return {
      service: 'openai',
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'openai',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkCourtListener(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await fetch('https://www.courtlistener.com/api/rest/v3/', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return {
      service: 'courtlistener',
      status: response.ok ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      service: 'courtlistener',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function checkStripe(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (!apiKey) {
      return {
        service: 'stripe',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: 'API key not configured',
      };
    }

    // Verify key format without making API call
    if (!apiKey.startsWith('sk_')) {
      return {
        service: 'stripe',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: 'Invalid API key format',
      };
    }

    return {
      service: 'stripe',
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'stripe',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkResend(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        service: 'resend',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: 'API key not configured',
      };
    }

    // Verify key exists without making API call
    return {
      service: 'resend',
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'resend',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        service: 'storage',
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: 'Missing credentials',
      };
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Try to list buckets
    const { error } = await supabase.storage.listBuckets();

    return {
      service: 'storage',
      status: error ? 'unhealthy' : 'healthy',
      latencyMs: Date.now() - start,
      error: error?.message,
    };
  } catch (error) {
    return {
      service: 'storage',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkQueue(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const eventKey = process.env.INNGEST_EVENT_KEY;

    if (!eventKey) {
      return {
        service: 'queue',
        status: 'degraded',
        latencyMs: Date.now() - start,
        error: 'Inngest not configured',
      };
    }

    return {
      service: 'queue',
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      service: 'queue',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET() {
  const startTime = Date.now();

  // Run all checks in parallel, including credential verification
  const [checks, credentialStatus] = await Promise.all([
    Promise.all([
      checkDatabase(),
      checkAnthropic(),
      checkOpenAI(),
      checkCourtListener(),
      checkStripe(),
      checkResend(),
      checkStorage(),
      checkQueue(),
    ]),
    // Get cached credential status or run fresh verification
    getCachedCredentialStatus().then((cached) => cached || verifyAllCredentials()),
  ]);

  // Determine overall status
  const criticalServices = ['database', 'anthropic', 'stripe'];
  const criticalChecks = checks.filter((c) => criticalServices.includes(c.service));
  const hasCriticalFailure = criticalChecks.some((c) => c.status === 'unhealthy');
  const hasAnyFailure = checks.some((c) => c.status === 'unhealthy');
  const hasAnyDegraded = checks.some((c) => c.status === 'degraded');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (hasCriticalFailure) {
    overallStatus = 'unhealthy';
  } else if (hasAnyFailure || hasAnyDegraded) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    checks: checks.map((c) => ({
      service: c.service,
      status: c.status,
      latencyMs: c.latencyMs,
      ...(c.error && { error: c.error }),
    })),
    credentials: {
      allValid: credentialStatus.allValid,
      results: credentialStatus.results.map((r) => ({
        service: r.service,
        valid: r.valid,
        ...(r.error && { error: r.error }),
      })),
    },
    summary: {
      total: checks.length,
      healthy: checks.filter((c) => c.status === 'healthy').length,
      degraded: checks.filter((c) => c.status === 'degraded').length,
      unhealthy: checks.filter((c) => c.status === 'unhealthy').length,
    },
  };

  // Log if unhealthy
  if (overallStatus !== 'healthy') {
    console.error('[Health/Deep] System degraded:', JSON.stringify(response.summary));
  }

  return NextResponse.json(response, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
  });
}
