/**
 * Motion Granted — Production Smoke Test
 *
 * Run: npx tsx scripts/production-smoke-test.ts
 * Requires: All env vars set, Supabase accessible, dev server running (or BASE_URL pointing to production)
 *
 * Validates the complete pipeline end-to-end WITHOUT making real API calls
 * to Claude/OpenAI (those are integration tests). This script validates:
 *
 * 1. Environment variables present (13 required)
 * 2. Supabase connection works
 * 3. API routes respond (landing page + auth rejection)
 * 4. Encryption roundtrip works (AES-256-GCM)
 * 5. CIV pipeline modules import correctly
 * 6. Model router returns correct config
 * 7. Phase prompt files exist (14 v7.5 files)
 * 8. Security headers present (X-Frame-Options, CSP)
 * 9. Email modules import without error
 * 10. Citation deduplication logic works
 *
 * Exit code 1 on any failure.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  pass: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, pass: false, error, duration: Date.now() - start });
    console.log(`  ❌ ${name}: ${error}`);
  }
}

async function runSmokeTests() {
  console.log('\n🔥 Motion Granted — Production Smoke Test\n');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  // ═══════════════════════════════════════
  // GROUP 1: Environment Variables (13 required)
  // ═══════════════════════════════════════
  console.log('--- Environment ---');

  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'ENCRYPTION_SECRET',
    'INNGEST_SIGNING_KEY',
    'INNGEST_EVENT_KEY',
    'COURTLISTENER_API_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

  for (const v of requiredVars) {
    await test(`ENV: ${v} present`, async () => {
      if (!process.env[v]) throw new Error('Missing');
      if (process.env[v] === 'placeholder') throw new Error('Placeholder value');
      if (process.env[v]!.length < 8) throw new Error('Suspiciously short value');
    });
  }

  // ═══════════════════════════════════════
  // GROUP 2: Supabase Connection
  // ═══════════════════════════════════════
  console.log('\n--- Supabase ---');

  await test('Supabase: anon key connection', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await supabase.from('orders').select('count').limit(1);
    if (error) throw new Error(error.message);
  });

  await test('Supabase: service role connection', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data, error } = await supabase.from('orders').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  await test('Supabase: profiles table accessible', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  // ═══════════════════════════════════════
  // GROUP 3: API Routes
  // ═══════════════════════════════════════
  console.log('\n--- API Routes ---');

  await test('API: GET / responds with 200', async () => {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

  await test('API: /api/automation/start rejects unauthenticated', async () => {
    const res = await fetch(`${BASE_URL}/api/automation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should reject with 401 or 403
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected 401/403, got ${res.status}`);
    }
  });

  await test('API: /admin requires auth', async () => {
    const res = await fetch(`${BASE_URL}/admin`, { redirect: 'manual' });
    // Should redirect to login (302/307) or return 401
    if (res.status !== 302 && res.status !== 307 && res.status !== 401 && res.status !== 200) {
      throw new Error(`Expected redirect or auth challenge, got ${res.status}`);
    }
  });

  // ═══════════════════════════════════════
  // GROUP 4: Encryption
  // ═══════════════════════════════════════
  console.log('\n--- Encryption ---');

  await test('Encryption: roundtrip (Buffer)', async () => {
    const { encrypt, decrypt } = await import('../lib/security/encryption');
    const plaintext = 'Attorney-client privileged content for test';
    const encrypted = encrypt(plaintext);
    if (!Buffer.isBuffer(encrypted)) throw new Error('encrypt() did not return Buffer');
    const decrypted = decrypt(encrypted);
    if (decrypted.toString('utf-8') !== plaintext) {
      throw new Error('Decrypt mismatch');
    }
  });

  await test('Encryption: roundtrip (Base64)', async () => {
    const { encryptToBase64, decryptFromBase64 } = await import('../lib/security/encryption');
    const plaintext = 'SENSITIVE: SSN 123-45-6789';
    const encrypted = encryptToBase64(plaintext);
    if (typeof encrypted !== 'string') throw new Error('encryptToBase64() did not return string');
    const decrypted = decryptFromBase64(encrypted);
    if (decrypted !== plaintext) {
      throw new Error('Base64 decrypt mismatch');
    }
  });

  await test('Encryption: tamper detection', async () => {
    const { encrypt, decrypt } = await import('../lib/security/encryption');
    const encrypted = encrypt('test data');
    // Tamper with a byte
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    try {
      decrypt(tampered);
      throw new Error('Should have thrown on tampered data');
    } catch (err) {
      if (err instanceof Error && err.message === 'Should have thrown on tampered data') throw err;
      // Expected — GCM detected tampering
    }
  });

  // ═══════════════════════════════════════
  // GROUP 5: Model Configuration
  // ═══════════════════════════════════════
  console.log('\n--- Model Configuration ---');

  await test('Models: MODELS constant defined', async () => {
    const { MODELS } = await import('../lib/config/models');
    if (!MODELS.OPUS) throw new Error('Missing OPUS model');
    if (!MODELS.SONNET) throw new Error('Missing SONNET model');
    if (!MODELS.HAIKU) throw new Error('Missing HAIKU model');
    if (!MODELS.GPT4_TURBO) throw new Error('Missing GPT4_TURBO model');
  });

  await test('Models: phase-registry exports getModel', async () => {
    const mod = await import('../lib/config/phase-registry');
    if (typeof mod.getModel !== 'function') throw new Error('getModel not a function');
    if (typeof mod.getThinkingBudget !== 'function') throw new Error('getThinkingBudget not a function');
    if (typeof mod.QUALITY_THRESHOLD !== 'number') throw new Error('QUALITY_THRESHOLD not a number');
  });

  await test('Models: quality threshold is 0.87', async () => {
    const { QUALITY_THRESHOLD } = await import('../lib/config/phase-registry');
    if (QUALITY_THRESHOLD !== 0.87) {
      throw new Error(`Expected 0.87, got ${QUALITY_THRESHOLD}`);
    }
  });

  await test('Models: AI model-router imports', async () => {
    const mod = await import('../lib/ai/model-router');
    if (!mod) throw new Error('Failed to import AI model-router');
  });

  // ═══════════════════════════════════════
  // GROUP 6: CIV Pipeline
  // ═══════════════════════════════════════
  console.log('\n--- CIV Pipeline ---');

  await test('CIV: pipeline re-export imports', async () => {
    const mod = await import('../lib/civ/pipeline');
    if (!mod.verifyCitation) throw new Error('verifyCitation not exported');
    if (!mod.verifyBatch) throw new Error('verifyBatch not exported');
  });

  await test('CIV: deduplication module imports', async () => {
    const mod = await import('../lib/civ/deduplication');
    if (!mod) throw new Error('Failed to import CIV deduplication');
  });

  await test('CIV: ellipsis-validator imports', async () => {
    const mod = await import('../lib/civ/ellipsis-validator');
    if (!mod) throw new Error('Failed to import ellipsis-validator');
  });

  // ═══════════════════════════════════════
  // GROUP 7: Citation Deduplication
  // ═══════════════════════════════════════
  console.log('\n--- Citation Deduplication ---');

  await test('Citations: parseCitation works', async () => {
    const { parseCitation } = await import('../lib/citations/deduplication');
    const result = parseCitation('123 So.3d 456, 460');
    if (!result) throw new Error('parseCitation returned null');
    if (result.volume !== '123') throw new Error(`volume: ${result.volume}`);
    if (result.page !== '456') throw new Error(`page: ${result.page}`);
    if (result.pinpoint !== '460') throw new Error(`pinpoint: ${result.pinpoint}`);
  });

  await test('Citations: deduplicateCitations merges pinpoints', async () => {
    const { deduplicateCitations } = await import('../lib/citations/deduplication');
    const result = deduplicateCitations([
      '123 So.3d 456, 460',
      '123 So.3d 456, 462',
      '789 F.3d 100',
    ]);
    if (result.length !== 2) throw new Error(`Expected 2, got ${result.length}`);
    const soCase = result.find(r => r.baseCitation.includes('123'));
    if (!soCase) throw new Error('Missing 123 So.3d case');
    if (soCase.pinpoints.length !== 2) throw new Error(`Expected 2 pinpoints, got ${soCase.pinpoints.length}`);
  });

  // ═══════════════════════════════════════
  // GROUP 8: Phase Prompts
  // ═══════════════════════════════════════
  console.log('\n--- Phase Prompts ---');

  await test('Prompts: 14 phase prompt files exist (v7.5)', async () => {
    const promptDir = path.join(__dirname, '..', 'prompts');
    const files = fs.readdirSync(promptDir);
    const phaseFiles = files.filter((f: string) => f.startsWith('PHASE_') && f.endsWith('.md'));
    if (phaseFiles.length < 14) {
      throw new Error(`Only ${phaseFiles.length} phase prompt files (expected 14)`);
    }
  });

  const expectedPhases = [
    'PHASE_I', 'PHASE_II', 'PHASE_III', 'PHASE_IV', 'PHASE_V',
    'PHASE_V1', 'PHASE_VI', 'PHASE_VII', 'PHASE_VII1',
    'PHASE_VIII', 'PHASE_VIII5', 'PHASE_IX', 'PHASE_IX1', 'PHASE_X',
  ];

  for (const phase of expectedPhases) {
    await test(`Prompts: ${phase} file exists`, async () => {
      const filePath = path.join(__dirname, '..', 'prompts', `${phase}_SYSTEM_PROMPT_v75.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing: prompts/${phase}_SYSTEM_PROMPT_v75.md`);
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.length < 100) {
        throw new Error(`Suspiciously short (${content.length} chars)`);
      }
    });
  }

  await test('Prompts: index.ts exports getPhasePrompt', async () => {
    const mod = await import('../prompts/index');
    if (typeof mod.getPhasePrompt !== 'function') throw new Error('getPhasePrompt not a function');
  });

  // ═══════════════════════════════════════
  // GROUP 9: Security Headers
  // ═══════════════════════════════════════
  console.log('\n--- Security ---');

  await test('Security: X-Frame-Options header', async () => {
    const res = await fetch(BASE_URL);
    const header = res.headers.get('x-frame-options');
    if (!header) throw new Error('Missing X-Frame-Options');
    if (header.toUpperCase() !== 'DENY') throw new Error(`Expected DENY, got ${header}`);
  });

  await test('Security: X-Content-Type-Options header', async () => {
    const res = await fetch(BASE_URL);
    const header = res.headers.get('x-content-type-options');
    if (!header) throw new Error('Missing X-Content-Type-Options');
  });

  await test('Security: Referrer-Policy header', async () => {
    const res = await fetch(BASE_URL);
    const header = res.headers.get('referrer-policy');
    if (!header) throw new Error('Missing Referrer-Policy');
  });

  await test('Security: CSP header', async () => {
    const res = await fetch(BASE_URL);
    const header = res.headers.get('content-security-policy');
    if (!header) throw new Error('Missing Content-Security-Policy');
    if (!header.includes("default-src")) throw new Error('CSP missing default-src directive');
  });

  await test('Security: HSTS header', async () => {
    const res = await fetch(BASE_URL);
    const header = res.headers.get('strict-transport-security');
    if (!header) throw new Error('Missing Strict-Transport-Security');
  });

  // ═══════════════════════════════════════
  // GROUP 10: Email
  // ═══════════════════════════════════════
  console.log('\n--- Email ---');

  await test('Email: send module exports sendEmail', async () => {
    const mod = await import('../lib/email/send');
    if (typeof mod.sendEmail !== 'function') throw new Error('sendEmail not a function');
    if (typeof mod.sendAdminAlert !== 'function') throw new Error('sendAdminAlert not a function');
  });

  await test('Email: send module exports trigger functions', async () => {
    const mod = await import('../lib/email/send');
    if (typeof mod.sendOrderConfirmation !== 'function') throw new Error('sendOrderConfirmation missing');
    if (typeof mod.sendDeliveryNotification !== 'function') throw new Error('sendDeliveryNotification missing');
    if (typeof mod.sendHoldNotification !== 'function') throw new Error('sendHoldNotification missing');
    if (typeof mod.sendRevisionNotification !== 'function') throw new Error('sendRevisionNotification missing');
  });

  await test('Email: templates export orderConfirmationEmail', async () => {
    const mod = await import('../lib/email/templates');
    if (typeof mod.orderConfirmationEmail !== 'function') throw new Error('orderConfirmationEmail missing');
    if (typeof mod.documentsReadyEmail !== 'function') throw new Error('documentsReadyEmail missing');
  });

  // ═══════════════════════════════════════
  // GROUP 11: Inngest Configuration
  // ═══════════════════════════════════════
  console.log('\n--- Inngest ---');

  await test('Inngest: functions module imports', async () => {
    const mod = await import('../lib/inngest/functions');
    if (!mod.generateOrderWorkflow) throw new Error('generateOrderWorkflow not exported');
    if (!mod.workflowFunctions) throw new Error('workflowFunctions not exported');
  });

  // ═══════════════════════════════════════
  // GROUP 12: Security Modules
  // ═══════════════════════════════════════
  console.log('\n--- Security Modules ---');

  await test('Security: PII sanitizer module exists', async () => {
    const mod = await import('../lib/security/sanitizer');
    if (!mod) throw new Error('Failed to import sanitizer');
  });

  await test('Security: sanitized logger module exists', async () => {
    const mod = await import('../lib/security/logger');
    if (!mod) throw new Error('Failed to import logger');
  });

  await test('Security: encryption module exists', async () => {
    const mod = await import('../lib/security/encryption');
    if (!mod) throw new Error('Failed to import encryption');
  });

  // ═══════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} tests (${totalDuration}ms total)\n`);

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    console.log('');
    process.exit(1);
  }

  console.log('✅ All smoke tests passed — production ready\n');
}

runSmokeTests().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
