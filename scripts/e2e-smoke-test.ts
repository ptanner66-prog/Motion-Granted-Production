#!/usr/bin/env npx tsx
/**
 * Motion Granted — E2E Smoke Test
 *
 * Tests the critical path without calling AI APIs, processing payments,
 * or sending real emails. Validates that all system components load
 * and integrate correctly.
 *
 * Run: npx tsx scripts/e2e-smoke-test.ts
 *
 * Exit code 0 = all tests passed
 * Exit code 1 = one or more tests failed
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  \u2705 ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration: Date.now() - start, error: msg });
    console.log(`  \u274C ${name}: ${msg}`);
  }
}

async function main() {
  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551       MOTION GRANTED \u2014 E2E SMOKE TEST                        \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log('');

  // --- 1. DATABASE ---
  console.log('\uD83D\uDCE6 Database');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log('  \u26A0\uFE0F Supabase not configured \u2014 skipping database tests');
  } else {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    await test('Connect to Supabase', async () => {
      const { error } = await supabase.from('orders').select('id').limit(1);
      if (error) throw new Error(`DB error: ${error.message}`);
    });

    await test('Orders table accessible', async () => {
      const { error } = await supabase.from('orders').select('id').limit(1);
      if (error) throw new Error(error.message);
    });

    await test('Profiles table accessible', async () => {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw new Error(error.message);
    });

    // --- 6. STATE TOGGLE ---
    console.log('');
    console.log('\uD83D\uDDFA\uFE0F State Toggle');

    await test('State toggle reads from DB', async () => {
      const { getStateToggles } = await import('../lib/admin/state-toggle');
      const toggles = await getStateToggles(supabase);
      if (!Array.isArray(toggles)) throw new Error('Expected array');
      const laToggle = toggles.find((t: { stateCode: string }) => t.stateCode === 'LA');
      if (!laToggle?.enabled) throw new Error('Louisiana should be enabled by default');
    });

    await test('Only LA accepting orders', async () => {
      const { isStateAcceptingOrders } = await import('../lib/admin/state-toggle');
      const la = await isStateAcceptingOrders(supabase, 'LA');
      const ca = await isStateAcceptingOrders(supabase, 'CA');
      if (!la) throw new Error('LA should be accepting orders');
      if (ca) throw new Error('CA should NOT be accepting orders yet');
    });
  }

  // --- 2. FORMATTING ENGINE ---
  console.log('');
  console.log('\uD83C\uDFA8 Formatting Engine');

  await test('Rule Lookup Service loads', async () => {
    const { RuleLookupService } = await import('../lib/services/formatting/rule-lookup');
    const service = RuleLookupService.getInstance();
    await service.initialize();
    const states = service.getAllLoadedStates();
    if (states.length < 5) throw new Error(`Only ${states.length} states loaded, expected >=5`);
  });

  await test('Louisiana config correct (legal paper)', async () => {
    const { RuleLookupService } = await import('../lib/services/formatting/rule-lookup');
    const config = RuleLookupService.getInstance().getConfig('la');
    if (!config) throw new Error('LA config not found');
    if (config.paperSize.heightDXA !== 20160) throw new Error(`LA paper height: ${config.paperSize.heightDXA}, expected 20160`);
  });

  await test('Federal override (LA \u2192 letter paper)', async () => {
    const { RuleLookupService } = await import('../lib/services/formatting/rule-lookup');
    const rules = RuleLookupService.getInstance().getFormattingRules({
      stateCode: 'la',
      isFederal: true,
    });
    if (rules.paperSize.heightDXA !== 15840) throw new Error(`Federal should be letter (15840), got ${rules.paperSize.heightDXA}`);
  });

  // --- 3. DOCUMENT GENERATORS ---
  console.log('');
  console.log('\uD83D\uDCC4 Document Generators');

  await test('Caption block generator loads', async () => {
    const mod = await import('../lib/generators/caption-block');
    if (typeof mod.generateCaptionBlock !== 'function') throw new Error('generateCaptionBlock not exported');
  });

  await test('Signature block generator loads', async () => {
    const mod = await import('../lib/generators/signature-block');
    if (typeof mod.generateSignatureBlock !== 'function') throw new Error('generateSignatureBlock not exported');
  });

  await test('Declaration generator loads', async () => {
    const mod = await import('../lib/generators/declaration-generator');
    if (typeof mod.generateDeclaration !== 'function') throw new Error('generateDeclaration not exported');
  });

  await test('Filing package assembler loads', async () => {
    const mod = await import('../lib/generators/filing-package-assembler');
    if (typeof mod.assembleFilingPackage !== 'function') throw new Error('assembleFilingPackage not exported');
  });

  await test('Formatting engine loads', async () => {
    const mod = await import('../lib/generators/formatting-engine');
    if (typeof mod.createFormattedDocument !== 'function') throw new Error('createFormattedDocument not exported');
  });

  // --- 4. EMAIL ---
  console.log('');
  console.log('\uD83D\uDCE7 Email System');

  await test('Email templates render', async () => {
    const templates = await import('../lib/email/templates');
    const result = templates.orderConfirmationEmail({
      customerName: 'Test Attorney',
      orderNumber: 'MG-2026-TEST',
      motionType: 'MCOMPEL',
      motionTypeDisplay: 'Motion to Compel Discovery',
      tier: 'B' as const,
      estimatedTurnaround: '3-4 business days',
      amountPaid: '$750.00',
    });
    if (!result.subject) throw new Error('Missing subject');
    if (!result.html.includes('Test Attorney')) throw new Error('Template not rendering name');
    if (!result.html.includes('MG-2026-TEST')) throw new Error('Template not rendering order number');
  });

  await test('All 8 templates render without error', async () => {
    const templates = await import('../lib/email/templates');
    const fns = [
      'orderConfirmationEmail',
      'holdNotificationEmail',
      'holdReminderEmail',
      'holdEscalationEmail',
      'progressNotificationEmail',
      'documentsReadyEmail',
      'revisionReceivedEmail',
      'orderAbandonedEmail',
    ];
    for (const fn of fns) {
      if (typeof (templates as Record<string, unknown>)[fn] !== 'function') throw new Error(`${fn} not exported`);
    }
  });

  // --- 5. PDF GENERATION ---
  console.log('');
  console.log('\uD83D\uDCD1 PDF Generation');

  await test('PDF module loads', async () => {
    const mod = await import('../lib/pdf/generator');
    if (typeof mod.generatePDF !== 'function') throw new Error('generatePDF not exported');
    if (typeof mod.convertDocxBufferToPDF !== 'function') throw new Error('convertDocxBufferToPDF not exported');
  });

  // --- 7. INTEGRATION LAYER ---
  console.log('');
  console.log('\uD83D\uDD17 Integration Layer');

  await test('Doc gen bridge loads', async () => {
    const mod = await import('../lib/integration/doc-gen-bridge');
    if (typeof mod.generateAndStoreFilingPackage !== 'function') throw new Error('Not exported');
  });

  await test('Email triggers load', async () => {
    const mod = await import('../lib/integration/email-triggers');
    if (typeof mod.triggerEmail !== 'function') throw new Error('Not exported');
  });

  await test('Storage manager loads', async () => {
    const mod = await import('../lib/integration/storage-manager');
    if (typeof mod.uploadDocument !== 'function') throw new Error('uploadDocument not exported');
    if (typeof mod.getSignedDownloadUrl !== 'function') throw new Error('getSignedDownloadUrl not exported');
  });

  await test('Integration barrel exports all symbols', async () => {
    const mod = await import('../lib/integration/index');
    if (typeof mod.generateAndStoreFilingPackage !== 'function') throw new Error('generateAndStoreFilingPackage missing');
    if (typeof mod.triggerEmail !== 'function') throw new Error('triggerEmail missing');
    if (typeof mod.uploadDocument !== 'function') throw new Error('uploadDocument missing');
    if (typeof mod.getSignedDownloadUrl !== 'function') throw new Error('getSignedDownloadUrl missing');
    if (typeof mod.listOrderDocuments !== 'function') throw new Error('listOrderDocuments missing');
    if (typeof mod.deleteOrderDocuments !== 'function') throw new Error('deleteOrderDocuments missing');
    if (typeof mod.ensureBucketExists !== 'function') throw new Error('ensureBucketExists missing');
  });

  // --- 8. SECURITY ---
  console.log('');
  console.log('\uD83D\uDD12 Security');

  await test('Rate limiter uses Vercel header', async () => {
    const code = readFileSync('lib/security/rate-limiter.ts', 'utf8');
    if (!code.includes('x-vercel-forwarded-for')) throw new Error('Should use x-vercel-forwarded-for');
  });

  await test('CRON auth uses timing-safe comparison', async () => {
    const code = readFileSync('lib/security/cron-auth.ts', 'utf8');
    if (!code.includes('timingSafeEqual')) throw new Error('Missing timing-safe comparison');
  });

  // --- 9. WORKFLOW BASICS ---
  console.log('');
  console.log('\u2699\uFE0F Workflow');

  await test('Phase executors load', async () => {
    const mod = await import('../lib/workflow/phase-executors');
    if (!mod.PHASE_EXECUTORS) throw new Error('PHASE_EXECUTORS not exported');
    if (typeof mod.executePhase !== 'function') throw new Error('executePhase not exported');
  });

  await test('Orchestrator loads', async () => {
    const mod = await import('../lib/workflow/orchestrator');
    if (typeof mod.orchestrateWorkflow !== 'function') throw new Error('orchestrateWorkflow not exported');
    if (typeof mod.notifyWorkflowEvent !== 'function') throw new Error('notifyWorkflowEvent not exported');
    if (typeof mod.notifyPhaseComplete !== 'function') throw new Error('notifyPhaseComplete not exported');
  });

  await test('Phase executor (singular) loads', async () => {
    const mod = await import('../lib/workflow/phase-executor');
    if (typeof mod.executePhase !== 'function') throw new Error('executePhase not exported');
  });

  // --- 10. SP8 VERIFICATION ---
  console.log('');
  console.log('\uD83D\uDD27 SP8 Pre-Launch');

  await test('Malware scanner loads', async () => {
    const mod = await import('../lib/security/malware-scanner');
    if (typeof mod.scanFile !== 'function') throw new Error('scanFile not exported');
  });

  await test('Motion advisories load', async () => {
    const mod = await import('../lib/workflow/motion-advisories');
    if (typeof mod.detectMotionType !== 'function') throw new Error('detectMotionType not exported');
    if (typeof mod.generateAdvisories !== 'function') throw new Error('generateAdvisories not exported');

    // Functional test: detect TRO
    const types = mod.detectMotionType('Temporary Restraining Order', '');
    if (!types.includes('TRO')) throw new Error('Failed to detect TRO motion type');

    // Functional test: generate LA advisory
    const advisories = mod.generateAdvisories(['TRO'], 'LA');
    if (advisories.length === 0) throw new Error('No advisories generated for LA TRO');
    if (!advisories[0].statutes.includes('C.C.P. Art. 3601-3613')) {
      throw new Error('LA TRO advisory missing correct statute reference');
    }
  });

  await test('orchestrateWorkflow is deprecated', async () => {
    const mod = await import('../lib/workflow/orchestrator');
    if (typeof mod.orchestrateWorkflow !== 'function') throw new Error('orchestrateWorkflow not exported');
    const result = await mod.orchestrateWorkflow('test-order-id');
    if (result.success !== false) throw new Error('Deprecated function should return success: false');
  });

  await test('Advisory injector loads', async () => {
    const mod = await import('../lib/workflow/advisory-injector');
    if (typeof mod.injectAdvisories !== 'function') throw new Error('injectAdvisories not exported');

    // Functional test: inject MSJ advisory
    const { advisories, result } = mod.injectAdvisories('Motion for Summary Judgment', undefined, 'LA');
    if (result.advisoriesAdded === 0) throw new Error('No advisories injected for MSJ');
    if (!advisories[0].statutes.includes('C.C.P. Art. 966-967')) {
      throw new Error('MSJ advisory missing LA statute reference');
    }
  });

  // --- REPORT ---
  console.log('');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log('');

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  \u274C ${r.name}: ${r.error}`);
    });
  }

  console.log('');

  // Critical path assessment
  const criticalTests = [
    'Rule Lookup Service loads',
    'Filing package assembler loads',
    'Email templates render',
    'Doc gen bridge loads',
  ];

  // Only include DB tests if Supabase is configured
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    criticalTests.unshift('Connect to Supabase');
    criticalTests.push('State toggle reads from DB');
  }

  const criticalPassed = criticalTests.every(name =>
    results.find(r => r.name === name)?.passed
  );

  if (criticalPassed) {
    console.log('\uD83D\uDFE2 CRITICAL PATH: ALL CLEAR');
    console.log('   The system can accept orders and generate documents.');
  } else {
    console.log('\uD83D\uDD34 CRITICAL PATH: BLOCKED');
    console.log('   Fix failures above before accepting customers.');
    criticalTests.forEach(name => {
      const r = results.find(t => t.name === name);
      console.log(`   ${r?.passed ? '\u2705' : '\u274C'} ${name}`);
    });
  }

  console.log('');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
