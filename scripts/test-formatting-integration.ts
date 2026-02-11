#!/usr/bin/env npx tsx
/**
 * SP9 Integration Test — Formatting Pipeline
 *
 * Verifies that jurisdiction strings produce correct document formatting
 * when routed through the RuleLookupService bridge in formatting-engine.ts.
 *
 * Run with: npx tsx scripts/test-formatting-integration.ts
 */

import { RuleLookupService } from '../lib/services/formatting/rule-lookup';
import { getFormattingRules } from '../lib/documents/formatting-engine';

/**
 * Test expectations are derived from the JSON configs in data/formatting/configs/states/.
 * The JSON configs are the source of truth. If a test fails, check the JSON first.
 */
const TESTS: Array<{
  jurisdiction: string;
  expectPaper: string;
  expectTopMargin: number;    // inches
  expectLeftMargin: number;   // inches
  expectLineNumbers: boolean;
}> = [
  // Louisiana state — LEGAL paper, 2" top, 1.5" left, no line numbers
  {
    jurisdiction: 'la_state',
    expectPaper: 'legal',
    expectTopMargin: 2,
    expectLeftMargin: 1.5,
    expectLineNumbers: false,
  },
  // California superior — LETTER paper, 1" margins, HAS line numbers
  {
    jurisdiction: 'ca_superior',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: true,
  },
  // California federal — LETTER paper, NO line numbers (federal override)
  {
    jurisdiction: 'ca_federal',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: false,
  },
  // Federal 5th circuit — LETTER paper (even though LA uses legal)
  {
    jurisdiction: 'federal_5th',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: false,
  },
  // Texas state — LETTER paper
  {
    jurisdiction: 'tx_state',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: false,
  },
  // Florida state — LETTER paper
  {
    jurisdiction: 'fl_state',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: false,
  },
  // New York state — LETTER paper, 1" margins (per ny JSON config: all 1440 DXA)
  {
    jurisdiction: 'ny_state',
    expectPaper: 'letter',
    expectTopMargin: 1,
    expectLeftMargin: 1,
    expectLineNumbers: false,
  },
];

async function main() {
  // Initialize RuleLookupService before running tests
  const service = RuleLookupService.getInstance();
  await service.initialize();

  const loadedStates = service.getAllLoadedStates();
  console.log(`RuleLookupService loaded ${loadedStates.length} state configs`);

  if (loadedStates.length === 0) {
    console.error('FATAL: No state configs loaded. Check data/formatting/configs/states/ directory.');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  console.log('\nSP9 Formatting Integration Test');
  console.log('================================\n');

  for (const test of TESTS) {
    const rules = getFormattingRules(test.jurisdiction);

    const paperName = rules.paperSize?.name ?? 'letter';
    const errors: string[] = [];

    if (paperName !== test.expectPaper) {
      errors.push(`Paper: got ${paperName}, expected ${test.expectPaper}`);
    }

    // Allow 0.1 inch tolerance for margin comparison
    if (Math.abs(rules.margins.top - test.expectTopMargin) > 0.1) {
      errors.push(`Top margin: got ${rules.margins.top}", expected ${test.expectTopMargin}"`);
    }

    if (Math.abs(rules.margins.left - test.expectLeftMargin) > 0.1) {
      errors.push(`Left margin: got ${rules.margins.left}", expected ${test.expectLeftMargin}"`);
    }

    if (rules.lineNumbers !== test.expectLineNumbers) {
      errors.push(`Line numbers: got ${rules.lineNumbers}, expected ${test.expectLineNumbers}`);
    }

    if (errors.length === 0) {
      console.log(`  PASS  ${test.jurisdiction}: paper=${paperName}, top=${rules.margins.top}", left=${rules.margins.left}", lineNum=${rules.lineNumbers}`);
      passed++;
    } else {
      console.log(`  FAIL  ${test.jurisdiction}:`);
      for (const e of errors) {
        console.log(`   ${e}`);
      }
      failed++;
    }
  }

  console.log(`\n================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${TESTS.length}`);

  if (failed > 0) {
    console.error('\nFORMATTING TESTS FAILED — documents will have wrong dimensions');
    process.exit(1);
  }

  console.log('\nAll formatting tests passed — documents will use correct jurisdiction-specific formatting');
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
