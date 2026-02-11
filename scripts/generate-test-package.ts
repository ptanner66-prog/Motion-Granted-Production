#!/usr/bin/env npx tsx
/**
 * Generate a test filing package for visual verification.
 *
 * Creates a complete Louisiana Motion to Compel Discovery filing package
 * using hardcoded content — no AI APIs called, no database access required.
 *
 * Run: npx tsx scripts/generate-test-package.ts
 * Output: ./tmp/test-package/
 *
 * Manual verification checklist after generation:
 *   [ ] Legal paper (8.5 x 14)?
 *   [ ] 2" top margin?
 *   [ ] Caption says "NINETEENTH JUDICIAL DISTRICT COURT, PARISH OF EAST BATON ROUGE"?
 *   [ ] Declaration uses AFFIDAVIT jurat (notarized, not perjury)?
 *   [ ] Signature block has LA bar number?
 *   [ ] All text is 12pt Times New Roman, double-spaced?
 */

import { assembleFilingPackage } from '../lib/generators/filing-package-assembler';
import { RuleLookupService } from '../lib/services/formatting/rule-lookup';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const TEST_ATTORNEY = {
  name: 'Clayton A. Tanner',
  firmName: 'Tanner Law Office',
  barNumber: '12345',
  barState: 'LA',
  address: ['123 Main Street', 'Suite 400', 'Baton Rouge, LA 70801'],
  phone: '(225) 555-0100',
  email: 'clay@tannerlaw.com',
  representingParty: 'Plaintiff Richardson Medical Supply, LLC',
};

const TEST_CASE = {
  courtName: 'NINETEENTH JUDICIAL DISTRICT COURT',
  parish: 'East Baton Rouge',
  caseNumber: '2026-CV-01234',
  plaintiffs: ['Richardson Medical Supply, LLC'],
  defendants: ['Bayou Healthcare Systems, Inc.'],
  clientRole: 'plaintiff' as const,
  motionTitle: 'MOTION TO COMPEL DISCOVERY',
  isFederal: false,
};

const TEST_CONTENT = {
  motionBody: [
    'NOW INTO COURT, through undersigned counsel, comes plaintiff Richardson Medical Supply, LLC,',
    'who respectfully moves this Honorable Court for an order compelling defendant Bayou Healthcare',
    'Systems, Inc. to provide complete responses to plaintiff\'s First Set of Interrogatories and',
    'First Request for Production of Documents, served on December 15, 2025, and for all additional',
    'relief as this Court deems just and proper. This motion is supported by the attached Memorandum',
    'of Points and Authorities and the Declaration of Clayton A. Tanner.',
  ].join(' '),

  memorandumBody: [
    'I. INTRODUCTION',
    '',
    'Plaintiff Richardson Medical Supply, LLC ("Richardson") filed this action against defendant',
    'Bayou Healthcare Systems, Inc. ("Bayou Healthcare") for breach of contract arising from',
    'defendant\'s failure to pay for medical supplies delivered between January 2024 and September 2025.',
    'On December 15, 2025, plaintiff served its First Set of Interrogatories (20 interrogatories)',
    'and First Request for Production of Documents (15 requests) on defendant. Despite multiple',
    'extensions of time, defendant has failed to provide adequate responses.',
    '',
    'II. STATEMENT OF FACTS',
    '',
    'On January 15, 2024, Richardson and Bayou Healthcare entered into a supply agreement whereby',
    'Richardson would provide medical supplies to Bayou Healthcare\'s facilities across southern',
    'Louisiana. Over the course of the agreement, Richardson delivered supplies valued at $847,293.00.',
    'Bayou Healthcare has paid only $312,000.00, leaving an outstanding balance of $535,293.00.',
    '',
    'III. LEGAL STANDARD',
    '',
    'Under Louisiana Code of Civil Procedure Article 1461, a party may serve interrogatories on',
    'any other party. La. C.C.P. art. 1461. The responding party must answer each interrogatory',
    'fully in writing under oath. La. C.C.P. art. 1462. Similarly, La. C.C.P. art. 1461 authorizes',
    'requests for production of documents. If a party fails to respond adequately, the requesting',
    'party may move to compel responses under La. C.C.P. art. 1469.',
    '',
    'IV. ARGUMENT',
    '',
    'Defendant\'s responses are deficient in multiple respects. First, defendant objected to',
    'Interrogatories Nos. 3, 7, 12, and 15 on grounds of "overbreadth" without specifying how',
    'the requests are overbroad. Blanket objections without specific factual support are insufficient',
    'under Louisiana law. Second, defendant produced only 47 pages of documents in response to',
    '15 document requests spanning a 21-month business relationship, suggesting a manifestly',
    'incomplete production.',
    '',
    'V. CONCLUSION',
    '',
    'For the foregoing reasons, plaintiff respectfully requests that this Court grant this Motion',
    'to Compel and order defendant to provide complete, verified responses within fifteen (15) days.',
  ].join('\n'),

  proposedOrderRelief: [
    'IT IS HEREBY ORDERED that defendant Bayou Healthcare Systems, Inc. shall provide complete, verified responses to plaintiff\'s First Set of Interrogatories, Nos. 1 through 20, within fifteen (15) days of the date of this Order.',
    'IT IS FURTHER ORDERED that defendant shall produce all documents responsive to plaintiff\'s First Request for Production of Documents, Nos. 1 through 15, within fifteen (15) days of the date of this Order.',
    'IT IS FURTHER ORDERED that defendant shall bear the costs of this motion, including reasonable attorney\'s fees, in accordance with La. C.C.P. art. 1469.',
  ],
};

async function main() {
  console.log('Generating test filing package for Louisiana...');

  const outputDir = join(process.cwd(), 'tmp', 'test-package');
  await mkdir(outputDir, { recursive: true });

  // Initialize formatting engine
  const ruleLookup = RuleLookupService.getInstance();
  await ruleLookup.initialize();

  const laConfig = ruleLookup.getConfig('la');
  if (!laConfig) throw new Error('Louisiana config not found');

  console.log(`  Loaded ${ruleLookup.getAllLoadedStates().length} state configs`);

  const rules = ruleLookup.getFormattingRules({ stateCode: 'la', isFederal: false });

  // Build declarations with real rules
  const declarations = [{
    declarant: {
      name: 'Clayton A. Tanner',
      title: 'Attorney for Plaintiff',
      relationship: 'Counsel of Record',
    },
    content: [
      'I am an attorney duly licensed to practice law in the State of Louisiana and am counsel of record for plaintiff Richardson Medical Supply, LLC in this matter.',
      'On December 15, 2025, I caused to be served on counsel for defendant Bayou Healthcare Systems, Inc. plaintiff\'s First Set of Interrogatories and First Request for Production of Documents.',
      'Defendant\'s responses were due on January 14, 2026. After granting two extensions of time, I received defendant\'s responses on February 1, 2026.',
      'Defendant\'s responses to Interrogatories Nos. 3, 7, 12, and 15 consist solely of boilerplate objections without any substantive response.',
      'Defendant produced only 47 pages of documents despite requests covering a 21-month business relationship involving over $800,000 in transactions.',
      'On February 5, 2026, I wrote to defense counsel requesting supplemental responses. As of the date of this declaration, I have received no supplemental responses.',
    ],
    rules,
    isFederal: false,
    executionCity: 'Baton Rouge',
    executionState: 'Louisiana',
  }];

  // Generate filing package
  const result = await assembleFilingPackage({
    orderId: 'test-order-001',
    orderNumber: 'MG-2026-TEST',
    jurisdiction: { stateCode: 'LA', isFederal: false, parish: 'East Baton Rouge' },
    motionType: 'MCOMPEL',
    motionTypeDisplay: 'Motion to Compel Discovery',
    tier: 'B',
    caseInfo: TEST_CASE,
    attorney: TEST_ATTORNEY,
    content: {
      ...TEST_CONTENT,
      declarations,
    },
    filingDeadline: '2026-03-15',
    localRuleFlags: ['19th JDC requires courtesy copy to chambers'],
    citationWarnings: [],
  });

  console.log(`\n  Generated ${result.documents.length} documents:`);

  for (const doc of result.documents) {
    const filepath = join(outputDir, `${doc.filename}.docx`);
    await writeFile(filepath, doc.buffer);
    console.log(`    \uD83D\uDCC4 ${doc.type}: ${doc.filename}.docx (${doc.pageCount} pages, ${doc.wordCount} words)`);
  }

  if (result.warnings.length > 0) {
    console.log('\n  \u26A0\uFE0F Warnings:');
    result.warnings.forEach(w => console.log(`    - ${w}`));
  }

  console.log(`\n  Output: ${outputDir}`);
  console.log('  Open the .docx files in Word/LibreOffice to verify formatting.');
  console.log('');
  console.log('  CHECK:');
  console.log('  \u25A1 Legal paper (8.5\u00D714)?');
  console.log('  \u25A1 2" top margin?');
  console.log('  \u25A1 Caption says "NINETEENTH JUDICIAL DISTRICT COURT, PARISH OF EAST BATON ROUGE"?');
  console.log('  \u25A1 Declaration uses AFFIDAVIT jurat (notarized, not perjury)?');
  console.log('  \u25A1 Signature block has LA bar number?');
  console.log('  \u25A1 All text is 12pt Times New Roman, double-spaced?');
}

main().catch(err => {
  console.error('Test package generation failed:', err);
  process.exit(1);
});
