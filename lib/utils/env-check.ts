/**
 * Environment validation utility
 *
 * Call this at startup to ensure all required environment variables are set.
 */

export interface EnvCheckResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const RECOMMENDED_VARS = [
  'ANTHROPIC_API_KEY',
  'ENCRYPTION_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

/**
 * Check if all required environment variables are set
 */
export function checkEnvironment(): EnvCheckResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required vars
  for (const varName of REQUIRED_VARS) {
    const value = process.env[varName];
    if (!value || value.includes('xxxxx') || value === 'your-key-here') {
      missing.push(varName);
    }
  }

  // Check recommended vars
  for (const varName of RECOMMENDED_VARS) {
    const value = process.env[varName];
    if (!value || value.includes('xxxxx') || value === 'your-key-here') {
      warnings.push(`${varName} not configured - some features may not work`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Log environment check results
 */
export function logEnvironmentCheck(): void {
  const result = checkEnvironment();

  if (!result.valid) {
    console.error('❌ Environment validation failed!');
    console.error('Missing required variables:', result.missing.join(', '));
  } else {
    console.log('✓ Environment validation passed');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
}

/**
 * Get a summary of configured integrations
 */
export function getConfiguredIntegrations(): {
  database: boolean;
  anthropic: boolean;
  email: boolean;
  payments: boolean;
  encryption: boolean;
} {
  return {
    database: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: !!(process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('xxxxx')),
    email: !!(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('xxxxx')),
    payments: !!(process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('xxxxx')),
    encryption: !!(process.env.ENCRYPTION_SECRET && !process.env.ENCRYPTION_SECRET.includes('xxxxx')),
  };
}
