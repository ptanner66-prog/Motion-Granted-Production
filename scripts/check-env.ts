#!/usr/bin/env npx tsx
/**
 * Environment Variable Checker
 *
 * Validates all required and optional environment variables.
 * Run: npx tsx scripts/check-env.ts
 *
 * Exit code 1 if any required variables are missing.
 */

const REQUIRED = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', desc: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desc: 'Supabase anon/public key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', desc: 'Supabase service role key' },
  { key: 'ANTHROPIC_API_KEY', desc: 'Claude API key' },
  { key: 'STRIPE_SECRET_KEY', desc: 'Stripe secret key' },
  { key: 'STRIPE_WEBHOOK_SECRET', desc: 'Stripe webhook signing secret' },
  { key: 'RESEND_API_KEY', desc: 'Resend email API key' },
  { key: 'CRON_SECRET', desc: 'Secret for CRON job authentication' },
  { key: 'INNGEST_EVENT_KEY', desc: 'Inngest event key' },
  { key: 'INNGEST_SIGNING_KEY', desc: 'Inngest signing key' },
  { key: 'ENCRYPTION_SECRET', desc: 'API key encryption (openssl rand -base64 32)' },
];

const OPTIONAL = [
  { key: 'OPENAI_API_KEY', desc: 'OpenAI API key (citation verification)' },
  { key: 'COURTLISTENER_API_KEY', desc: 'CourtListener API key' },
  { key: 'PACER_USERNAME', desc: 'PACER credentials (federal unpublished)' },
  { key: 'PACER_PASSWORD', desc: 'PACER credentials' },
  { key: 'NEXT_PUBLIC_APP_URL', desc: 'App URL for email links' },
  { key: 'EMAIL_FROM_ADDRESS', desc: 'From address for emails' },
  { key: 'EMAIL_REPLY_TO', desc: 'Reply-to address for emails' },
  { key: 'UPSTASH_REDIS_REST_URL', desc: 'Redis URL for distributed rate limiting' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', desc: 'Redis auth token' },
];

console.log('');
console.log('MOTION GRANTED — ENVIRONMENT CHECK');
console.log('===================================');
console.log('');

let missing = 0;

console.log('REQUIRED:');
for (const { key, desc } of REQUIRED) {
  const val = process.env[key];
  if (val && val.length > 0) {
    const masked = val.length > 8
      ? val.slice(0, 4) + '...' + val.slice(-4)
      : '****';
    console.log(`  [OK]   ${key} = ${masked}`);
  } else {
    console.log(`  [MISS] ${key} — ${desc}`);
    missing++;
  }
}

console.log('');
console.log('OPTIONAL:');
for (const { key, desc } of OPTIONAL) {
  const val = process.env[key];
  if (val && val.length > 0) {
    console.log(`  [OK]   ${key} = set`);
  } else {
    console.log(`  [ -- ] ${key} — ${desc}`);
  }
}

console.log('');
if (missing > 0) {
  console.log(`${missing} required variable(s) missing. Fix before deploying.`);
  process.exit(1);
} else {
  console.log('All required environment variables are set.');
}
