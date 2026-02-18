/**
 * Environment Validation Script (SP-15, Task 7)
 *
 * Validates all required and optional environment variables at startup.
 * Run: pnpm validate-env
 *
 * Exit code 1 on missing required vars.
 */

const REQUIRED_VARS = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', hint: 'Supabase project URL (e.g., https://abc.supabase.co)' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', hint: 'Supabase anonymous key (public, safe to commit)' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', hint: 'Supabase service role key (NEVER expose client-side)' },
  { name: 'ANTHROPIC_API_KEY', hint: 'Anthropic API key for Claude (motion drafting)' },
  { name: 'OPENAI_API_KEY', hint: 'OpenAI API key for citation verification Stage 1' },
  { name: 'STRIPE_SECRET_KEY', hint: 'Stripe secret key (server-only)' },
  { name: 'STRIPE_WEBHOOK_SECRET', hint: 'Stripe webhook signing secret (whsec_...)' },
  { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', hint: 'Stripe publishable key (client-safe)' },
  { name: 'RESEND_API_KEY', hint: 'Resend email API key for transactional emails' },
  { name: 'ENCRYPTION_SECRET', hint: 'Base64-encoded 32-byte key for AES-256-GCM file encryption' },
  { name: 'INNGEST_SIGNING_KEY', hint: 'Inngest function signing key' },
  { name: 'INNGEST_EVENT_KEY', hint: 'Inngest event sending key' },
  { name: 'COURTLISTENER_API_KEY', hint: 'CourtListener API key for citation lookup' },
];

const OPTIONAL_VARS = [
  { name: 'SENTRY_DSN', hint: 'Sentry error tracking DSN' },
  { name: 'NEXT_PUBLIC_SENTRY_DSN', hint: 'Sentry client-side DSN' },
  { name: 'NEXT_PUBLIC_APP_URL', hint: 'Public app URL for email links (default: https://motion-granted.com)' },
  { name: 'ADMIN_EMAIL', hint: 'Admin notification email address' },
  { name: 'ALERT_EMAIL', hint: 'Alert notification email address' },
  { name: 'CRON_SECRET', hint: 'Secret for authenticating cron job requests' },
  { name: 'PACER_USERNAME', hint: 'PACER credentials for federal case lookup' },
  { name: 'PACER_PASSWORD', hint: 'PACER password' },
  { name: 'UPSTASH_REDIS_REST_URL', hint: 'Upstash Redis URL for distributed rate limiting' },
  { name: 'UPSTASH_REDIS_REST_TOKEN', hint: 'Upstash Redis token' },
  { name: 'SENTRY_AUTH_TOKEN', hint: 'Sentry auth token for source map uploads' },
  { name: 'SENTRY_ORG', hint: 'Sentry organization slug' },
  { name: 'SENTRY_PROJECT', hint: 'Sentry project slug' },
];

const PLACEHOLDER_VALUES = [
  'placeholder', 'your-key-here', 'xxxxx', 'changeme', 'TODO',
  'sk_live_xxxxx', 'sk_test_xxxxx', 'whsec_xxxxx', 're_xxxxx',
];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_VALUES.some(p => lower.includes(p.toLowerCase()));
}

function validate(): void {
  // eslint-disable-next-line no-console
  console.log('\n  Motion Granted — Environment Validation\n');

  let errors = 0;
  let warnings = 0;

  // eslint-disable-next-line no-console
  console.log('--- Required ---');
  for (const { name, hint } of REQUIRED_VARS) {
    const value = process.env[name];
    if (!value) {
      // eslint-disable-next-line no-console
      console.error(`  MISSING: ${name} — ${hint}`);
      errors++;
    } else if (isPlaceholder(value)) {
      // eslint-disable-next-line no-console
      console.warn(`  PLACEHOLDER: ${name} — has placeholder value, not a real key`);
      warnings++;
    } else {
      // eslint-disable-next-line no-console
      console.log(`  OK: ${name}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n--- Optional ---');
  for (const { name, hint } of OPTIONAL_VARS) {
    const value = process.env[name];
    if (!value) {
      // eslint-disable-next-line no-console
      console.warn(`  NOT SET: ${name} — ${hint}`);
      warnings++;
    } else {
      // eslint-disable-next-line no-console
      console.log(`  OK: ${name}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n--- Validation Checks ---');

  // Validate ENCRYPTION_SECRET length
  const encSecret = process.env.ENCRYPTION_SECRET;
  if (encSecret && !isPlaceholder(encSecret)) {
    try {
      const decoded = Buffer.from(encSecret, 'base64');
      if (decoded.length !== 32) {
        // eslint-disable-next-line no-console
        console.error(`  INVALID: ENCRYPTION_SECRET decodes to ${decoded.length} bytes (need exactly 32)`);
        errors++;
      } else {
        // eslint-disable-next-line no-console
        console.log('  OK: ENCRYPTION_SECRET is valid 32-byte key');
      }
    } catch {
      // eslint-disable-next-line no-console
      console.error('  INVALID: ENCRYPTION_SECRET is not valid base64');
      errors++;
    }
  }

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !isPlaceholder(supabaseUrl)) {
    if (!supabaseUrl.includes('supabase.co') && !supabaseUrl.includes('localhost')) {
      // eslint-disable-next-line no-console
      console.warn('  CHECK: NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase URL');
      warnings++;
    } else {
      // eslint-disable-next-line no-console
      console.log('  OK: NEXT_PUBLIC_SUPABASE_URL format valid');
    }
  }

  // Validate Stripe key prefixes
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !isPlaceholder(stripeKey)) {
    if (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('sk_test_')) {
      // eslint-disable-next-line no-console
      console.warn('  CHECK: STRIPE_SECRET_KEY should start with sk_live_ or sk_test_');
      warnings++;
    } else {
      const mode = stripeKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
      // eslint-disable-next-line no-console
      console.log(`  OK: STRIPE_SECRET_KEY is ${mode} mode`);
    }
  }

  // Validate Anthropic key prefix
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && !isPlaceholder(anthropicKey)) {
    if (!anthropicKey.startsWith('sk-ant-')) {
      // eslint-disable-next-line no-console
      console.warn('  CHECK: ANTHROPIC_API_KEY should start with sk-ant-');
      warnings++;
    } else {
      // eslint-disable-next-line no-console
      console.log('  OK: ANTHROPIC_API_KEY format valid');
    }
  }

  // Summary
  // eslint-disable-next-line no-console
  console.log(`\n${errors === 0 ? 'PASS' : 'FAIL'}: ${errors} error(s), ${warnings} warning(s)\n`);

  if (errors > 0) {
    process.exit(1);
  }
}

validate();
