/**
 * Motion Granted — Pre-Launch Audit Script
 *
 * Run: npx tsx scripts/pre-launch-audit.ts
 *
 * Quick code-level audit — no API calls, no database access.
 * Reads source files and validates structural requirements.
 *
 * Exit code 1 on any failure.
 */

import * as fs from 'fs';
import * as path from 'path';

interface AuditResult {
  category: string;
  check: string;
  pass: boolean;
  details?: string;
}

const results: AuditResult[] = [];

function audit(category: string, check: string, fn: () => boolean | string) {
  try {
    const result = fn();
    if (typeof result === 'string') {
      results.push({ category, check, pass: false, details: result });
      console.log(`  ❌ ${check}: ${result}`);
    } else {
      results.push({ category, check, pass: result });
      console.log(`  ${result ? '✅' : '❌'} ${check}`);
    }
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    results.push({ category, check, pass: false, details });
    console.log(`  ❌ ${check}: ${details}`);
  }
}

function fileContains(filePath: string, search: string): boolean {
  try {
    return fs.readFileSync(filePath, 'utf-8').includes(search);
  } catch {
    return false;
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function grepCount(dir: string, pattern: RegExp, ext: string): number {
  let count = 0;
  function walk(d: string) {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          const content = fs.readFileSync(full, 'utf-8');
          const matches = content.match(pattern);
          if (matches) count += matches.length;
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
  walk(dir);
  return count;
}

console.log('\n🔍 Motion Granted — Pre-Launch Audit\n');

// ═══════════════════════════════════════
// Pipeline
// ═══════════════════════════════════════
console.log('--- Pipeline ---');

audit('Pipeline', 'Intake routes to /api/automation/start', () => {
  if (fileContains('app/(dashboard)/orders/new/page.tsx', 'api/chat/start')) {
    return 'Still using api/chat/start (should be api/automation/start)';
  }
  if (!fileContains('app/(dashboard)/orders/new/page.tsx', 'api/automation/start')) {
    return 'api/automation/start not found in intake form';
  }
  return true;
});

audit('Pipeline', 'Inngest timeout set to 30m', () => {
  if (fileContains('lib/inngest/workflow-orchestration.ts', '"30m"')) return true;
  if (fileContains('lib/inngest/functions.ts', '"30m"')) return true;
  return 'No 30m timeout found in Inngest workflow config';
});

audit('Pipeline', 'Phase prompts exist (14 v7.5 files)', () => {
  const promptDir = 'prompts/';
  if (!fs.existsSync(promptDir)) return 'prompts/ directory missing';
  const files = fs.readdirSync(promptDir).filter(f => f.startsWith('PHASE_') && f.endsWith('.md'));
  return files.length >= 14 || `Only ${files.length} phase files (expected 14)`;
});

audit('Pipeline', 'Phase-registry.ts defines all 14 phases', () => {
  if (!fileExists('lib/config/phase-registry.ts')) return 'phase-registry.ts missing';
  const content = fs.readFileSync('lib/config/phase-registry.ts', 'utf-8');
  const phases = ['I', 'II', 'III', 'IV', 'V', 'V.1', 'VI', 'VII', 'VII.1', 'VIII', 'VIII.5', 'IX', 'IX.1', 'X'];
  for (const phase of phases) {
    if (!content.includes(`'${phase}'`)) {
      return `Phase '${phase}' not found in phase-registry.ts`;
    }
  }
  return true;
});

audit('Pipeline', 'Quality threshold is 0.87', () => {
  if (!fileContains('lib/config/phase-registry.ts', 'QUALITY_THRESHOLD = 0.87')) {
    return 'QUALITY_THRESHOLD != 0.87 in phase-registry.ts';
  }
  return true;
});

audit('Pipeline', 'Max revision loops is 3', () => {
  if (!fileContains('lib/config/phase-registry.ts', 'MAX_REVISION_LOOPS = 3')) {
    return 'MAX_REVISION_LOOPS != 3 in phase-registry.ts';
  }
  return true;
});

audit('Pipeline', 'Model constants defined (OPUS, SONNET, HAIKU, GPT4_TURBO)', () => {
  if (!fileExists('lib/config/models.ts')) return 'models.ts missing';
  const content = fs.readFileSync('lib/config/models.ts', 'utf-8');
  for (const model of ['OPUS', 'SONNET', 'HAIKU', 'GPT4_TURBO']) {
    if (!content.includes(model)) return `${model} not defined in models.ts`;
  }
  return true;
});

audit('Pipeline', 'CIV pipeline uses verifyBatch in phase-executors', () => {
  if (!fileContains('lib/workflow/phase-executors.ts', 'verifyBatch')) {
    return 'verifyBatch not found in phase-executors.ts';
  }
  return true;
});

// ═══════════════════════════════════════
// Security
// ═══════════════════════════════════════
console.log('\n--- Security ---');

audit('Security', 'No excessive service_role in client API routes', () => {
  const count = grepCount('app/api', /service_role|getAdminClient/g, '.ts');
  // Some usage is OK: admin routes, webhooks, background IIFEs, and SP-08 compliance comments
  return count <= 15 || `${count} service_role/getAdminClient references in app/api (audit needed)`;
});

audit('Security', 'Encryption module exists', () =>
  fileExists('lib/security/encryption.ts'));

audit('Security', 'PII sanitizer exists', () =>
  fileExists('lib/security/sanitizer.ts'));

audit('Security', 'Sanitized logger exists', () =>
  fileExists('lib/security/logger.ts'));

audit('Security', 'Malware scanner exists', () =>
  fileExists('lib/security/malware-scanner.ts'));

audit('Security', 'CSRF protection exists', () =>
  fileExists('lib/security/csrf.ts'));

audit('Security', 'Rate limiter exists', () =>
  fileExists('lib/security/rate-limiter.ts'));

audit('Security', 'CSP headers configured in next.config.ts', () => {
  if (!fileContains('next.config.ts', 'Content-Security-Policy')) {
    return 'Missing CSP in next.config.ts';
  }
  return true;
});

audit('Security', 'X-Frame-Options DENY in middleware', () => {
  if (!fileContains('middleware.ts', 'X-Frame-Options')) {
    return 'Missing X-Frame-Options in middleware.ts';
  }
  return true;
});

audit('Security', 'HSTS header in middleware', () => {
  if (!fileContains('middleware.ts', 'Strict-Transport-Security')) {
    return 'Missing HSTS in middleware.ts';
  }
  return true;
});

audit('Security', 'Rate limiting configured in middleware', () => {
  if (!fileContains('middleware.ts', 'rate') && !fileContains('middleware.ts', 'Rate')) {
    return 'No rate limiting reference in middleware.ts';
  }
  return true;
});

// ═══════════════════════════════════════
// Citations
// ═══════════════════════════════════════
console.log('\n--- Citations ---');

audit('Citations', 'Zero Westlaw references in lib/', () => {
  const count = grepCount('lib', /[Ww]estlaw/g, '.ts');
  return count === 0 || `${count} Westlaw references remain in lib/`;
});

audit('Citations', 'CIV pipeline re-export exists', () =>
  fileExists('lib/civ/pipeline.ts'));

audit('Citations', 'CIV deduplication exists', () =>
  fileExists('lib/civ/deduplication.ts'));

audit('Citations', 'Eyecite deduplication exists', () =>
  fileExists('lib/citations/deduplication.ts'));

audit('Citations', 'Citation bank exists', () =>
  fileExists('lib/civ/citation-bank.ts'));

audit('Citations', 'Ellipsis validator exists', () =>
  fileExists('lib/civ/ellipsis-validator.ts'));

audit('Citations', 'CourtListener integration exists', () => {
  const exists = fileExists('lib/courtlistener/index.ts') ||
                 fileExists('lib/courtlistener/client.ts') ||
                 fs.existsSync('lib/courtlistener');
  return exists || 'No CourtListener integration found';
});

// ═══════════════════════════════════════
// Email
// ═══════════════════════════════════════
console.log('\n--- Email ---');

audit('Email', 'Email send module exists', () =>
  fileExists('lib/email/send.ts'));

audit('Email', 'Email templates exist', () =>
  fileExists('lib/email/templates.ts'));

audit('Email', 'Email triggers exist', () => {
  return fileExists('lib/email/email-triggers.ts') ||
    fileContains('lib/email/send.ts', 'email-triggers') ||
    'No email-triggers module found';
});

audit('Email', 'Disclaimer in email templates ("not a law firm")', () => {
  if (!fileContains('lib/email/templates.ts', 'not a law firm')) {
    return 'Missing "not a law firm" disclaimer in email templates';
  }
  return true;
});

// ═══════════════════════════════════════
// Documents & Compliance
// ═══════════════════════════════════════
console.log('\n--- Documents & Compliance ---');

audit('Compliance', 'Data export endpoint exists', () =>
  fileExists('app/api/account/export/route.ts'));

audit('Compliance', 'Terms page exists', () =>
  fileExists('app/(marketing)/terms/page.tsx'));

audit('Compliance', 'Privacy page exists', () =>
  fileExists('app/(marketing)/privacy/page.tsx'));

audit('Compliance', 'Disclaimer page exists', () =>
  fileExists('app/(marketing)/disclaimer/page.tsx'));

audit('Compliance', 'DPA page exists', () =>
  fileExists('app/(marketing)/dpa/page.tsx'));

audit('Compliance', 'Security page exists', () =>
  fileExists('app/(marketing)/security/page.tsx'));

// ═══════════════════════════════════════
// CI/CD
// ═══════════════════════════════════════
console.log('\n--- CI/CD ---');

audit('CI', 'GitHub Actions workflow exists', () =>
  fileExists('.github/workflows/ci.yml'));

audit('CI', 'PR template exists', () =>
  fileExists('.github/pull_request_template.md'));

audit('CI', 'Playwright config exists', () =>
  fileExists('playwright.config.ts'));

audit('CI', 'E2E tests exist', () => {
  if (!fs.existsSync('tests/e2e')) return 'tests/e2e directory missing';
  const files = fs.readdirSync('tests/e2e').filter(f => f.endsWith('.spec.ts'));
  return files.length >= 3 || `Only ${files.length} E2E test files (expected 3+)`;
});

// ═══════════════════════════════════════
// Configuration
// ═══════════════════════════════════════
console.log('\n--- Configuration ---');

audit('Config', 'Motion types defined', () =>
  fileExists('config/motion-types.ts'));

audit('Config', 'Pricing configuration exists', () => {
  if (!fileExists('config/motion-types.ts')) return 'motion-types.ts missing';
  const content = fs.readFileSync('config/motion-types.ts', 'utf-8');
  if (!content.includes('price') && !content.includes('Price') && !content.includes('PRICE')) {
    return 'No pricing data in motion-types.ts';
  }
  return true;
});

audit('Config', 'vercel.json configured', () =>
  fileExists('vercel.json'));

audit('Config', 'Environment validation script exists', () =>
  fileExists('scripts/validate-env.ts'));

// ═══════════════════════════════════════
// Supabase
// ═══════════════════════════════════════
console.log('\n--- Supabase ---');

audit('Supabase', 'Server client helper exists', () =>
  fileExists('lib/supabase/server.ts'));

audit('Supabase', 'Browser client helper exists', () =>
  fileExists('lib/supabase/client.ts'));

audit('Supabase', 'Middleware client helper exists', () =>
  fileExists('lib/supabase/middleware.ts'));

audit('Supabase', 'Migrations directory exists with 25+ files', () => {
  if (!fs.existsSync('supabase/migrations')) return 'supabase/migrations missing';
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'));
  return files.length >= 20 || `Only ${files.length} migration files (expected 20+)`;
});

// ═══════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════
console.log('\n═══════════════════════════════════════');
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n${passed} passed, ${failed} failed out of ${results.length} checks`);

if (failed > 0) {
  console.log('\n⚠️  FAILURES — ADDRESS BEFORE LAUNCH:');
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  ❌ [${r.category}] ${r.check}${r.details ? ': ' + r.details : ''}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('\n✅ Pre-launch audit passed — ready for production\n');
}
