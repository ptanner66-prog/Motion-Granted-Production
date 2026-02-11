/**
 * Formatting Fixtures Test Script
 *
 * Validates the 5 gold-standard state config fixtures and
 * tests the Rule Lookup Service override hierarchy.
 *
 * Run with: npx tsx scripts/test-formatting-fixtures.ts
 */

import { RuleLookupService } from '../lib/services/formatting/rule-lookup';
import { JurisdictionConfig } from '../lib/services/formatting/types';

type CheckFn = (c: JurisdictionConfig) => true | string;

interface TestCase {
  state: string;
  label: string;
  checks: CheckFn[];
}

async function testFixtures(): Promise<void> {
  const service = RuleLookupService.getInstance();
  await service.initialize();

  let passed = 0;
  let failed = 0;

  const tests: TestCase[] = [
    {
      state: 'ca',
      label: 'California',
      checks: [
        (c) => c.paperSize.heightDXA === 15840 || `Paper should be Letter (15840), got ${c.paperSize.heightDXA}`,
        (c) => c.lineNumbering?.enabled === true || 'Line numbering should be enabled',
        (c) => c.lineNumbering?.linesPerPage === 28 || `Should be 28 lines/page, got ${c.lineNumbering?.linesPerPage}`,
        (c) => c.jurat.type === 'declaration' || `Jurat should be declaration, got ${c.jurat.type}`,
        (c) => c.footer?.contentBelowLineNumber === true || 'Footer contentBelowLineNumber should be true',
        (c) => c.footer?.minFontSizePoints === 10 || `Footer min font should be 10pt, got ${c.footer?.minFontSizePoints}`,
        (c) => c.caption.courtNameFormat.includes('SUPERIOR COURT') || 'Court name should include SUPERIOR COURT',
      ],
    },
    {
      state: 'la',
      label: 'Louisiana',
      checks: [
        (c) => c.paperSize.heightDXA === 20160 || `Paper should be Legal (20160), got ${c.paperSize.heightDXA}`,
        (c) => c.paperSize.name === 'legal' || `Paper name should be legal, got ${c.paperSize.name}`,
        (c) => c.jurat.type === 'affidavit' || `Jurat should be affidavit, got ${c.jurat.type}`,
        (c) => c.margins.topDXA >= 2880 || `Top margin should be >= 2" (2880 DXA), got ${c.margins.topDXA}`,
        (c) => c.caption.courtNameFormat.includes('JUDICIAL DISTRICT COURT') || 'Court name should include JUDICIAL DISTRICT COURT',
        (c) => c.caption.courtNameFormat.includes('PARISH') || 'Court name should include PARISH',
      ],
    },
    {
      state: 'fl',
      label: 'Florida',
      checks: [
        (c) => c.paperSize.heightDXA === 15840 || `Paper should be Letter (15840), got ${c.paperSize.heightDXA}`,
        (c) => c.firstPage?.recordingSpace != null || 'Should have recording space',
        (c) => c.firstPage?.recordingSpace?.widthInches === 3 || `Recording space width should be 3", got ${c.firstPage?.recordingSpace?.widthInches}`,
        (c) => c.firstPage?.recordingSpace?.heightInches === 3 || `Recording space height should be 3", got ${c.firstPage?.recordingSpace?.heightInches}`,
        (c) => c.firstPage?.recordingSpace?.position === 'top-right' || `Recording space position should be top-right, got ${c.firstPage?.recordingSpace?.position}`,
        (c) => c.jurat.type === 'declaration' || `Jurat should be declaration, got ${c.jurat.type}`,
      ],
    },
    {
      state: 'tx',
      label: 'Texas',
      checks: [
        (c) => c.caption.caseNumberLabel === 'CAUSE NO.' || `Should use CAUSE NO., got ${c.caption.caseNumberLabel}`,
        (c) => c.caption.sectionSymbol === true || 'Should use section symbols',
        (c) => c.jurat.type === 'declaration' || `Jurat should be declaration, got ${c.jurat.type}`,
        (c) => c.paperSize.heightDXA === 15840 || `Paper should be Letter, got ${c.paperSize.heightDXA}`,
      ],
    },
    {
      state: 'ny',
      label: 'New York',
      checks: [
        (c) => c.caption.caseNumberLabel === 'Index No.' || `Should use Index No., got ${c.caption.caseNumberLabel}`,
        (c) => c.caption.courtNameFormat.includes('SUPREME COURT') || 'Trial court = Supreme Court in NY',
        (c) => c.jurat.type === 'declaration' || `Jurat should be declaration, got ${c.jurat.type}`,
        (c) => c.paperSize.heightDXA === 15840 || `Paper should be Letter, got ${c.paperSize.heightDXA}`,
      ],
    },
  ];

  console.log('=== State Config Fixture Tests ===\n');

  for (const test of tests) {
    const config = service.getConfig(test.state);
    if (!config) {
      console.error(`  \u274C ${test.label}: config not found`);
      failed++;
      continue;
    }

    console.log(`  ${test.label}:`);
    for (const check of test.checks) {
      try {
        const result = check(config);
        if (result === true) {
          console.log(`    \u2705 PASS`);
          passed++;
        } else {
          console.error(`    \u274C FAIL: ${result}`);
          failed++;
        }
      } catch (err) {
        console.error(`    \u274C ERROR: ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }
  }

  // Federal override tests
  console.log('\n=== Federal Override Tests ===\n');

  // LA federal should use letter paper
  const laFederal = service.getFormattingRules({
    stateCode: 'la',
    isFederal: true,
    federalDistrict: 'edla',
  });
  if (laFederal.paperSize.heightDXA === 15840) {
    console.log('  \u2705 LA Federal: Letter paper (override works)');
    passed++;
  } else {
    console.error(`  \u274C LA Federal: Should be Letter (15840), got ${laFederal.paperSize.heightDXA}`);
    failed++;
  }

  // LA federal should use declaration jurat (not affidavit)
  if (laFederal.jurat.type === 'declaration') {
    console.log('  \u2705 LA Federal: Declaration jurat (override works)');
    passed++;
  } else {
    console.error(`  \u274C LA Federal: Should use declaration, got ${laFederal.jurat.type}`);
    failed++;
  }

  // CA federal should have line numbering disabled
  const caFederal = service.getFormattingRules({
    stateCode: 'ca',
    isFederal: true,
    federalDistrict: 'cdca',
  });
  if (caFederal.lineNumbering === null) {
    console.log('  \u2705 CA Federal: Line numbering disabled (override works)');
    passed++;
  } else {
    console.error(`  \u274C CA Federal: Line numbering should be null, got ${JSON.stringify(caFederal.lineNumbering)}`);
    failed++;
  }

  // CA state should have line numbering enabled
  const caState = service.getFormattingRules({
    stateCode: 'ca',
    isFederal: false,
  });
  if (caState.lineNumbering?.enabled === true) {
    console.log('  \u2705 CA State: Line numbering enabled');
    passed++;
  } else {
    console.error(`  \u274C CA State: Line numbering should be enabled`);
    failed++;
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`  Loaded ${service.getAllLoadedStates().length} state configs: ${service.getAllLoadedStates().join(', ')}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);
  console.log(`  Status: ${failed === 0 ? '\u2705 ALL PASS' : `\u274C ${failed} FAILURES`}`);

  if (failed > 0) {
    process.exit(1);
  }
}

testFixtures().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
