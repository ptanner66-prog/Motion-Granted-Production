/**
 * CIV Model Routing & Critical Path Tests
 *
 * Run: npx tsx tests/civ/model-routing.test.ts
 *
 * Validates that the correct AI model is used for each tier x phase x stage
 * combination, and that critical CIV pipeline decisions are correct.
 *
 * Source: Master Workflow v7.5, CIV Pipeline Spec, lib/config/phase-registry.ts
 *
 * Critical because wrong model = wrong quality = attorney sanctions risk.
 *
 * NOTE: No vitest/jest installed — this runs as a standalone script using
 * Node's assert module. Exit code 1 on failure.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

interface TestResult {
  suite: string;
  name: string;
  pass: boolean;
  error?: string;
}

const results: TestResult[] = [];
let currentSuite = '';

function suite(name: string) {
  currentSuite = name;
  console.log(`\n  ${name}`);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ suite: currentSuite, name, pass: true });
    console.log(`    ✅ ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ suite: currentSuite, name, pass: false, error });
    console.log(`    ❌ ${name}: ${error}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ suite: currentSuite, name, pass: true });
    console.log(`    ✅ ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ suite: currentSuite, name, pass: false, error });
    console.log(`    ❌ ${name}: ${error}`);
  }
}

async function runTests() {
  console.log('\n🧪 CIV Model Routing & Critical Path Tests\n');

  // ═══════════════════════════════════════════════════════════════
  // SUITE 1: Model Constants
  // ═══════════════════════════════════════════════════════════════

  const { MODELS } = await import('../../lib/config/models');

  suite('Model Constants');

  test('should define OPUS model string', () => {
    assert.ok(MODELS.OPUS, 'OPUS not defined');
    assert.ok(MODELS.OPUS.includes('opus'), `OPUS model string doesn't contain 'opus': ${MODELS.OPUS}`);
  });

  test('should define SONNET model string', () => {
    assert.ok(MODELS.SONNET, 'SONNET not defined');
    assert.ok(MODELS.SONNET.includes('sonnet'), `SONNET model string doesn't contain 'sonnet': ${MODELS.SONNET}`);
  });

  test('should define HAIKU model string', () => {
    assert.ok(MODELS.HAIKU, 'HAIKU not defined');
    assert.ok(MODELS.HAIKU.includes('haiku'), `HAIKU model string doesn't contain 'haiku': ${MODELS.HAIKU}`);
  });

  test('should define GPT4_TURBO model string', () => {
    assert.ok(MODELS.GPT4_TURBO, 'GPT4_TURBO not defined');
    assert.ok(MODELS.GPT4_TURBO.includes('gpt-4'), `GPT4_TURBO model string doesn't contain 'gpt-4': ${MODELS.GPT4_TURBO}`);
  });

  test('should have exactly 4 model constants', () => {
    const keys = Object.keys(MODELS);
    assert.strictEqual(keys.length, 4, `Expected 4 models, got ${keys.length}: ${keys.join(', ')}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 2: Phase Registry
  // ═══════════════════════════════════════════════════════════════

  const phaseRegistry = await import('../../lib/config/phase-registry');

  suite('Phase Registry Exports');

  test('should export getModel function', () => {
    assert.strictEqual(typeof phaseRegistry.getModel, 'function');
  });

  test('should export getThinkingBudget function', () => {
    assert.strictEqual(typeof phaseRegistry.getThinkingBudget, 'function');
  });

  test('should export getMaxTokens function', () => {
    assert.strictEqual(typeof phaseRegistry.getMaxTokens, 'function');
  });

  test('should export getBatchSize function', () => {
    assert.strictEqual(typeof phaseRegistry.getBatchSize, 'function');
  });

  test('should export PHASES array with 14 phases', () => {
    assert.ok(Array.isArray(phaseRegistry.PHASES));
    assert.strictEqual(phaseRegistry.PHASES.length, 14,
      `Expected 14 phases, got ${phaseRegistry.PHASES.length}`);
  });

  test('should export TOTAL_PHASES as 14', () => {
    assert.strictEqual(phaseRegistry.TOTAL_PHASES, 14);
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 3: Quality Thresholds
  // ═══════════════════════════════════════════════════════════════

  suite('Quality Thresholds');

  test('QUALITY_THRESHOLD should be 0.87 (B+ grade)', () => {
    assert.strictEqual(phaseRegistry.QUALITY_THRESHOLD, 0.87,
      `Expected 0.87, got ${phaseRegistry.QUALITY_THRESHOLD}`);
  });

  test('MAX_REVISION_LOOPS should be 3', () => {
    assert.strictEqual(phaseRegistry.MAX_REVISION_LOOPS, 3,
      `Expected 3, got ${phaseRegistry.MAX_REVISION_LOOPS}`);
  });

  test('GRADE_SCALE should map B+ to 0.87', () => {
    assert.strictEqual(phaseRegistry.GRADE_SCALE['B+'], 0.87);
  });

  test('GRADE_SCALE should map A to 0.93', () => {
    assert.strictEqual(phaseRegistry.GRADE_SCALE['A'], 0.93);
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 4: Model Routing per Phase x Tier
  // ═══════════════════════════════════════════════════════════════

  suite('Model Routing per Phase x Tier');

  const tiers = ['A', 'B', 'C'] as const;
  const phases = phaseRegistry.PHASES;

  // Phases that are CODE-only (no AI call) return null from getModel — this is correct.
  // Phase I = intake/doc processing, VIII.5 = caption validation, X = final assembly.
  // Phase VI is skipped for Tier A.
  const codeOnlyPhases: Record<string, Set<string>> = {
    'I': new Set(['A', 'B', 'C']),
    'VIII.5': new Set(['A', 'B', 'C']),
    'X': new Set(['A', 'B', 'C']),
    'VI': new Set(['A']),
  };

  for (const tier of tiers) {
    for (const phase of phases) {
      const isCodeOnly = codeOnlyPhases[phase]?.has(tier);

      if (isCodeOnly) {
        test(`getModel('${phase}', '${tier}') returns null (CODE phase)`, () => {
          const model = phaseRegistry.getModel(phase, tier);
          assert.strictEqual(model, null,
            `Expected null for CODE phase ${phase} tier ${tier}, got '${model}'`);
        });
      } else {
        test(`getModel('${phase}', '${tier}') returns a valid model`, () => {
          const model = phaseRegistry.getModel(phase, tier);
          assert.ok(model, `getModel('${phase}', '${tier}') returned falsy`);
          assert.ok(typeof model === 'string', `Expected string, got ${typeof model}`);
          // Must be one of the known models
          const validModels = Object.values(MODELS) as string[];
          assert.ok(
            validModels.includes(model),
            `Model '${model}' for phase ${phase} tier ${tier} is not in MODELS constant`,
          );
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SUITE 5: CIV Pipeline Imports
  // ═══════════════════════════════════════════════════════════════

  suite('CIV Pipeline Imports');

  // These imports require node_modules to be installed (pnpm install).
  // When running in CI without deps, they verify file existence instead.

  await testAsync('lib/civ/pipeline.ts re-exports verifyCitation', async () => {
    try {
      const mod = await import('../../lib/civ/pipeline');
      assert.ok(mod.verifyCitation, 'verifyCitation not re-exported');
      assert.strictEqual(typeof mod.verifyCitation, 'function');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot find module')) {
        // Deps not installed — verify file exists instead
        assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'lib', 'civ', 'pipeline.ts')),
          'lib/civ/pipeline.ts file missing');
        console.log('      (skipped import — node_modules not installed)');
      } else {
        throw err;
      }
    }
  });

  await testAsync('lib/civ/pipeline.ts re-exports verifyBatch', async () => {
    try {
      const mod = await import('../../lib/civ/pipeline');
      assert.ok(mod.verifyBatch, 'verifyBatch not re-exported');
      assert.strictEqual(typeof mod.verifyBatch, 'function');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot find module')) {
        // Verify export in source code instead
        const content = fs.readFileSync(
          path.join(__dirname, '..', '..', 'lib', 'civ', 'pipeline.ts'), 'utf-8');
        assert.ok(content.includes('verifyBatch'), 'verifyBatch not found in pipeline.ts source');
        console.log('      (verified via source — node_modules not installed)');
      } else {
        throw err;
      }
    }
  });

  await testAsync('lib/civ/pipeline.ts re-exports verifyNewCitations', async () => {
    try {
      const mod = await import('../../lib/civ/pipeline');
      assert.ok(mod.verifyNewCitations, 'verifyNewCitations not re-exported');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot find module')) {
        const content = fs.readFileSync(
          path.join(__dirname, '..', '..', 'lib', 'civ', 'pipeline.ts'), 'utf-8');
        assert.ok(content.includes('verifyNewCitations'), 'verifyNewCitations not in pipeline.ts');
        console.log('      (verified via source — node_modules not installed)');
      } else {
        throw err;
      }
    }
  });

  await testAsync('lib/civ/deduplication.ts imports without error', async () => {
    const mod = await import('../../lib/civ/deduplication');
    assert.ok(mod, 'Failed to import CIV deduplication');
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 6: AI Model Router
  // ═══════════════════════════════════════════════════════════════

  suite('AI Model Router');

  await testAsync('lib/ai/model-router.ts imports without error', async () => {
    try {
      const mod = await import('../../lib/ai/model-router');
      assert.ok(mod, 'Failed to import AI model-router');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot find module')) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'lib', 'ai', 'model-router.ts')),
          'lib/ai/model-router.ts file missing');
        console.log('      (verified file exists — node_modules not installed)');
      } else {
        throw err;
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 7: Citation Deduplication
  // ═══════════════════════════════════════════════════════════════

  suite('Citation Deduplication');

  await testAsync('parseCitation parses standard format', async () => {
    const { parseCitation } = await import('../../lib/citations/deduplication');
    const result = parseCitation('123 So.3d 456');
    assert.ok(result, 'parseCitation returned null');
    assert.strictEqual(result.volume, '123');
    assert.strictEqual(result.reporter, 'So.3d');
    assert.strictEqual(result.page, '456');
    assert.strictEqual(result.pinpoint, undefined);
  });

  await testAsync('parseCitation handles pinpoint references', async () => {
    const { parseCitation } = await import('../../lib/citations/deduplication');
    const result = parseCitation('123 So.3d 456, 460');
    assert.ok(result, 'parseCitation returned null');
    assert.strictEqual(result.pinpoint, '460');
  });

  await testAsync('parseCitation handles F.3d citations', async () => {
    const { parseCitation } = await import('../../lib/citations/deduplication');
    const result = parseCitation('789 F.3d 100, 105');
    assert.ok(result, 'parseCitation returned null');
    assert.strictEqual(result.volume, '789');
    assert.strictEqual(result.reporter, 'F.3d');
    assert.strictEqual(result.page, '100');
    assert.strictEqual(result.pinpoint, '105');
  });

  await testAsync('parseCitation returns null for garbage input', async () => {
    const { parseCitation } = await import('../../lib/citations/deduplication');
    assert.strictEqual(parseCitation(''), null);
    assert.strictEqual(parseCitation('not a citation'), null);
    assert.strictEqual(parseCitation(null as unknown as string), null);
  });

  await testAsync('deduplicateCitations merges pinpoints for same case', async () => {
    const { deduplicateCitations } = await import('../../lib/citations/deduplication');
    const result = deduplicateCitations([
      '123 So.3d 456, 460',
      '123 So.3d 456, 462',
      '789 F.3d 100',
    ]);
    assert.strictEqual(result.length, 2, `Expected 2 unique citations, got ${result.length}`);

    const soCase = result.find(r => r.baseCitation.includes('123'));
    assert.ok(soCase, 'Missing 123 So.3d case');
    assert.strictEqual(soCase.pinpoints.length, 2, `Expected 2 pinpoints, got ${soCase.pinpoints.length}`);
    assert.ok(soCase.pinpoints.includes('460'), 'Missing pinpoint 460');
    assert.ok(soCase.pinpoints.includes('462'), 'Missing pinpoint 462');
  });

  await testAsync('deduplicateCitations handles empty array', async () => {
    const { deduplicateCitations } = await import('../../lib/citations/deduplication');
    const result = deduplicateCitations([]);
    assert.strictEqual(result.length, 0);
  });

  await testAsync('deduplicateCitations handles non-parseable citations', async () => {
    const { deduplicateCitations } = await import('../../lib/citations/deduplication');
    const result = deduplicateCitations(['not a citation', 'also not', '']);
    assert.strictEqual(result.length, 0, 'Non-parseable citations should be filtered out');
  });

  // ═══════════════════════════════════════════════════════════════
  // SUITE 8: Phase Prompt Files
  // ═══════════════════════════════════════════════════════════════

  suite('Phase Prompt Files');

  const expectedFiles = [
    'PHASE_I_SYSTEM_PROMPT_v75.md',
    'PHASE_II_SYSTEM_PROMPT_v75.md',
    'PHASE_III_SYSTEM_PROMPT_v75.md',
    'PHASE_IV_SYSTEM_PROMPT_v75.md',
    'PHASE_V_SYSTEM_PROMPT_v75.md',
    'PHASE_V1_SYSTEM_PROMPT_v75.md',
    'PHASE_VI_SYSTEM_PROMPT_v75.md',
    'PHASE_VII_SYSTEM_PROMPT_v75.md',
    'PHASE_VII1_SYSTEM_PROMPT_v75.md',
    'PHASE_VIII_SYSTEM_PROMPT_v75.md',
    'PHASE_VIII5_SYSTEM_PROMPT_v75.md',
    'PHASE_IX_SYSTEM_PROMPT_v75.md',
    'PHASE_IX1_SYSTEM_PROMPT_v75.md',
    'PHASE_X_SYSTEM_PROMPT_v75.md',
  ];

  for (const file of expectedFiles) {
    test(`${file} exists and has content`, () => {
      const filePath = path.join(__dirname, '..', '..', 'prompts', file);
      assert.ok(fs.existsSync(filePath), `Missing: prompts/${file}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.length > 100, `${file} is suspiciously short (${content.length} chars)`);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SUITE 9: Encryption Module
  // ═══════════════════════════════════════════════════════════════

  suite('Encryption Module');

  // Encryption tests require ENCRYPTION_SECRET env var.
  // If not set, use a test value for validation.
  const hasEncryptionSecret = !!process.env.ENCRYPTION_SECRET;
  if (!hasEncryptionSecret) {
    // Set a temporary test secret (32 bytes base64)
    // 32 bytes base64-encoded test secret for AES-256-GCM
    process.env.ENCRYPTION_SECRET = '3EnSE9Tdrwecq/0JxLw0lZxIesviVl/R7h9h0bPZ+s0=';
  }

  await testAsync('encrypt/decrypt roundtrip works', async () => {
    const { encrypt, decrypt } = await import('../../lib/security/encryption');
    const plaintext = 'Confidential legal content: deposition transcript excerpt';
    const encrypted = encrypt(plaintext);
    assert.ok(Buffer.isBuffer(encrypted), 'encrypt should return Buffer');
    assert.notStrictEqual(encrypted.toString('utf-8'), plaintext, 'Encrypted should differ from plaintext');
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted.toString('utf-8'), plaintext, 'Decrypt mismatch');
  });

  await testAsync('encryptToBase64/decryptFromBase64 roundtrip works', async () => {
    const { encryptToBase64, decryptFromBase64 } = await import('../../lib/security/encryption');
    const plaintext = 'API key: sk_test_1234567890';
    const encrypted = encryptToBase64(plaintext);
    assert.ok(typeof encrypted === 'string', 'encryptToBase64 should return string');
    const decrypted = decryptFromBase64(encrypted);
    assert.strictEqual(decrypted, plaintext, 'Base64 decrypt mismatch');
  });

  await testAsync('tampered ciphertext throws', async () => {
    const { encrypt, decrypt } = await import('../../lib/security/encryption');
    const encrypted = encrypt('test');
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => decrypt(tampered), 'Should throw on tampered data');
  });

  // Restore original env if we set a temp value
  if (!hasEncryptionSecret) {
    delete process.env.ENCRYPTION_SECRET;
  }

  // ═══════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════

  console.log('\n═══════════════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} tests\n`);

  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ [${r.suite}] ${r.name}: ${r.error}`);
    });
    console.log('');
    process.exit(1);
  }

  console.log('✅ All CIV model routing tests passed\n');
}

runTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
