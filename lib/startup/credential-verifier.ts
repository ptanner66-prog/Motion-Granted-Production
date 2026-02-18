/**
 * API Credential Verification on Startup (Task 63)
 *
 * Verifies all API credentials are valid before allowing full operation.
 * On failure: Log error, set service to degraded mode, alert admin.
 *
 * Credentials verified:
 * - ANTHROPIC_API_KEY — call models endpoint
 * - OPENAI_API_KEY — call models endpoint
 * - COURTLISTENER_API_KEY — call search endpoint
 * - PACER_USERNAME + PACER_PASSWORD — login test
 * - STRIPE_SECRET_KEY — call account endpoint
 * - RESEND_API_KEY — call domains endpoint
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — call health endpoint
 *
 * Source: Chunk 9, Task 63 - Gap Analysis B-1
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { createLogger } from '@/lib/security/logger';

const log = createLogger('startup-credential-verifier');
// ============================================================================
// TYPES
// ============================================================================

export interface CredentialStatus {
  service: string;
  valid: boolean;
  error?: string;
  checkedAt: Date;
}

export interface CredentialVerificationResult {
  allValid: boolean;
  results: CredentialStatus[];
}

interface CachedResult extends CredentialVerificationResult {
  cachedAt: Date;
}

// ============================================================================
// CACHE
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedResult: CachedResult | null = null;

/**
 * Get cached credential status if still valid
 */
export async function getCachedCredentialStatus(): Promise<{
  allValid: boolean;
  results: CredentialStatus[];
  cachedAt: Date;
} | null> {
  if (!cachedResult) return null;

  const age = Date.now() - cachedResult.cachedAt.getTime();
  if (age > CACHE_TTL_MS) {
    cachedResult = null;
    return null;
  }

  return cachedResult;
}

/**
 * Clear the credential cache
 */
export function clearCredentialCache(): void {
  cachedResult = null;
}

// ============================================================================
// INDIVIDUAL VERIFIERS
// ============================================================================

/**
 * Verify Anthropic API key by calling models endpoint
 */
export async function verifyAnthropicKey(): Promise<CredentialStatus> {
  const service = 'anthropic';
  const checkedAt = new Date();

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { service, valid: false, error: 'API key not configured', checkedAt };
  }

  try {
    // Verify by making a simple API call
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 64000,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    // Even a 400 error means the key is valid (just bad request)
    // Only 401/403 means invalid key
    if (response.status === 401 || response.status === 403) {
      return { service, valid: false, error: 'Invalid API key', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify OpenAI API key by calling models endpoint
 */
export async function verifyOpenAIKey(): Promise<CredentialStatus> {
  const service = 'openai';
  const checkedAt = new Date();

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // OpenAI is optional
    return { service, valid: true, error: 'Not configured (optional)', checkedAt };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      return { service, valid: false, error: 'Invalid API key', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify CourtListener API key by calling search endpoint
 */
export async function verifyCourtListenerKey(): Promise<CredentialStatus> {
  const service = 'courtlistener';
  const checkedAt = new Date();

  const apiKey = process.env.COURTLISTENER_API_KEY;

  if (!apiKey) {
    // CourtListener can work without key (rate limited)
    return { service, valid: true, error: 'Not configured (rate limited mode)', checkedAt };
  }

  try {
    const response = await fetch('https://www.courtlistener.com/api/rest/v3/search/?q=test&type=o', {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401 || response.status === 403) {
      return { service, valid: false, error: 'Invalid API key', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify PACER credentials by attempting login
 */
export async function verifyPACERCredentials(): Promise<CredentialStatus> {
  const service = 'pacer';
  const checkedAt = new Date();

  const username = process.env.PACER_USERNAME;
  const password = process.env.PACER_PASSWORD;

  if (!username || !password) {
    // PACER is optional
    return { service, valid: true, error: 'Not configured (optional)', checkedAt };
  }

  try {
    // PACER login endpoint
    const response = await fetch('https://pacer.login.uscourts.gov/csologin/login.jsf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        login: username,
        password: password,
      }),
      signal: AbortSignal.timeout(15000),
    });

    // Check if login was successful
    const text = await response.text();
    if (text.includes('Invalid username or password') || text.includes('Login failed')) {
      return { service, valid: false, error: 'Invalid credentials', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify Stripe API key by calling account endpoint
 */
export async function verifyStripeKey(): Promise<CredentialStatus> {
  const service = 'stripe';
  const checkedAt = new Date();

  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    return { service, valid: false, error: 'API key not configured', checkedAt };
  }

  // Validate key format
  if (!apiKey.startsWith('sk_')) {
    return { service, valid: false, error: 'Invalid key format', checkedAt };
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      return { service, valid: false, error: 'Invalid API key', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify Resend API key by calling domains endpoint
 */
export async function verifyResendKey(): Promise<CredentialStatus> {
  const service = 'resend';
  const checkedAt = new Date();

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { service, valid: false, error: 'API key not configured', checkedAt };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401 || response.status === 403) {
      return { service, valid: false, error: 'Invalid API key', checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

/**
 * Verify Supabase connection
 */
export async function verifySupabaseConnection(): Promise<CredentialStatus> {
  const service = 'supabase';
  const checkedAt = new Date();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { service, valid: false, error: 'Credentials not configured', checkedAt };
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Simple query to verify connection
    const { error } = await supabase.from('orders').select('id').limit(1);

    if (error) {
      return { service, valid: false, error: error.message, checkedAt };
    }

    return { service, valid: true, checkedAt };
  } catch (error) {
    return {
      service,
      valid: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      checkedAt,
    };
  }
}

// ============================================================================
// MAIN VERIFICATION FUNCTION
// ============================================================================

/**
 * Verify all API credentials
 */
export async function verifyAllCredentials(): Promise<CredentialVerificationResult> {
  // Check cache first
  const cached = await getCachedCredentialStatus();
  if (cached) {
    return { allValid: cached.allValid, results: cached.results };
  }

  // Run all verifications in parallel
  const results = await Promise.all([
    verifyAnthropicKey(),
    verifyOpenAIKey(),
    verifyCourtListenerKey(),
    verifyPACERCredentials(),
    verifyStripeKey(),
    verifyResendKey(),
    verifySupabaseConnection(),
  ]);

  // Critical services that must be valid
  const criticalServices = ['anthropic', 'stripe', 'supabase'];
  const criticalResults = results.filter((r) => criticalServices.includes(r.service));
  const allCriticalValid = criticalResults.every((r) => r.valid);

  // All services valid check (non-critical can have "Not configured" as valid)
  const allValid = results.every((r) => r.valid);

  const result: CredentialVerificationResult = {
    allValid: allCriticalValid && allValid,
    results,
  };

  // Cache the result
  cachedResult = {
    ...result,
    cachedAt: new Date(),
  };

  // Log results
  const failed = results.filter((r) => !r.valid && !r.error?.includes('Not configured'));
  if (failed.length > 0) {
    log.error('[CredentialVerifier] Failed credentials:', failed);
    // Alert admin if critical services failed
    if (!allCriticalValid) {
      await alertAdminOfFailure(failed);
    }
  }

  return result;
}

/**
 * Alert admin of credential failures
 */
async function alertAdminOfFailure(failed: CredentialStatus[]): Promise<void> {
  try {
    const { sendAlertEmail } = await import('@/lib/monitoring/alert-sender');

    await sendAlertEmail({
      to: process.env.ADMIN_ALERT_EMAIL || 'admin@motiongranted.io',
      subject: '[Motion Granted] CRITICAL: API Credential Verification Failed',
      level: 'FATAL',
      message: 'Critical API credentials failed verification on startup',
      metadata: {
        failedServices: failed.map((f) => ({
          service: f.service,
          error: f.error,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error('[CredentialVerifier] Failed to send alert:', error);
  }
}

/**
 * Set system to degraded mode
 */
export async function setDegradedMode(failedServices: string[]): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    await supabase.from('automation_settings').upsert({
      setting_key: 'system_status',
      setting_value: JSON.stringify({
        status: 'degraded',
        reason: `Failed credentials: ${failedServices.join(', ')}`,
        failedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    log.error('[CredentialVerifier] Failed to set degraded mode:', error);
  }
}

/**
 * Run verification and handle failures
 */
export async function runStartupVerification(): Promise<{
  success: boolean;
  results: CredentialStatus[];
}> {
  const { allValid, results } = await verifyAllCredentials();

  if (!allValid) {
    const failedCritical = results
      .filter(
        (r) =>
          !r.valid &&
          ['anthropic', 'stripe', 'supabase'].includes(r.service) &&
          !r.error?.includes('Not configured')
      )
      .map((r) => r.service);

    if (failedCritical.length > 0) {
      await setDegradedMode(failedCritical);
    }
  }

  return { success: allValid, results };
}
