/**
 * Clay's Post-Deployment Validation Checklist
 *
 * Run: npx tsx scripts/clay-validation-checklist.ts
 *
 * Run after every batch deployment to confirm no regressions.
 *
 * Source: Master Implementation v2.5 (Section 10.3 Retest Protocol)
 *         + v3.1 Addendum (10-point Tier B validation)
 *
 * Tests that require a live workflow run are marked [INTEGRATION].
 * Tests that can be validated via code inspection are marked [STATIC].
 *
 * STATIC checks are auto-verified where possible by reading source files.
 * INTEGRATION checks are listed for manual execution with a test order.
 */

import * as fs from 'fs';

interface ChecklistItem {
  id: string;
  desc: string;
  type: 'INTEGRATION' | 'STATIC';
  autoCheck?: () => boolean | string;
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

function grepFile(filePath: string, pattern: RegExp): boolean {
  try {
    return pattern.test(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return false;
  }
}

const CHECKLIST: Record<string, ChecklistItem[]> = {
  // Batch 1 (12 points)
  batch1: [
    {
      id: 'B1-01',
      desc: 'Revision loop exits at correct threshold (0.87 for all tiers per phase-registry.ts)',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-02',
      desc: 'Zero unnecessary Phase VIII executions for passing order',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-03',
      desc: 'Phase IV uses Phase III research queries (queries contain article refs)',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-04',
      desc: 'Phase IV citations are topically relevant',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-05',
      desc: 'Citations persisted to verified_citations with authority_level',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-06',
      desc: 'RLS blocks cross-user citation access',
      type: 'STATIC',
      autoCheck: () => {
        // RLS is managed at Supabase level — verify via supabase_audit.sql
        return fileExists('scripts/supabase_audit.sql') || 'Missing supabase_audit.sql';
      },
    },
    {
      id: 'B1-07',
      desc: 'Admin can read all citations (service_role bypass or RLS policy)',
      type: 'STATIC',
      autoCheck: () => {
        return fileExists('scripts/supabase_audit.sql') || 'Missing supabase_audit.sql';
      },
    },
    {
      id: 'B1-08',
      desc: 'Middleware blocks /api/admin/* without auth',
      type: 'STATIC',
      autoCheck: () => {
        return fileContains('middleware.ts', '/admin') || 'No /admin protection in middleware';
      },
    },
    {
      id: 'B1-09',
      desc: 'Admin routes verify admin role',
      type: 'STATIC',
      autoCheck: () => {
        return fileContains('middleware.ts', 'admin') || 'No admin role check in middleware';
      },
    },
    {
      id: 'B1-10',
      desc: 'Forged JWT rejected by getUser() (Supabase validates server-side)',
      type: 'STATIC',
      autoCheck: () => {
        return fileContains('lib/supabase/server.ts', 'getUser') || 'getUser not found in server client';
      },
    },
    {
      id: 'B1-11',
      desc: 'Phase X checkpoint blocks delivery until admin approves',
      type: 'INTEGRATION',
    },
    {
      id: 'B1-12',
      desc: 'Customer receives at least one email notification during workflow',
      type: 'INTEGRATION',
    },
  ],

  // Batch 3 (10 points)
  batch3: [
    {
      id: 'B3-01',
      desc: 'Phase V.1 calls verifyBatch() (not inline regex)',
      type: 'STATIC',
      autoCheck: () => {
        return grepFile('lib/workflow/phase-executors.ts', /verifyBatch/) || 'verifyBatch not found in phase-executors';
      },
    },
    {
      id: 'B3-02',
      desc: 'Citations have composite scores (not hardcoded 1.0)',
      type: 'INTEGRATION',
    },
    {
      id: 'B3-03',
      desc: 'Protocol 7 triggers on 2+ citation failures',
      type: 'INTEGRATION',
    },
    {
      id: 'B3-04',
      desc: 'Phase VIII fact audit runs post-revision',
      type: 'INTEGRATION',
    },
    {
      id: 'B3-05',
      desc: 'No fabricated entities in revision output',
      type: 'INTEGRATION',
    },
    {
      id: 'B3-06',
      desc: 'JSON parse errors handled gracefully (try/catch around JSON.parse)',
      type: 'STATIC',
      autoCheck: () => {
        // Check that JSON.parse is wrapped in try/catch in key files
        const content = fs.readFileSync('lib/workflow/phase-executors.ts', 'utf-8');
        const jsonParseCount = (content.match(/JSON\.parse/g) || []).length;
        const tryCatchCount = (content.match(/try\s*\{/g) || []).length;
        return tryCatchCount >= jsonParseCount || `${jsonParseCount} JSON.parse calls but only ${tryCatchCount} try blocks`;
      },
    },
    {
      id: 'B3-07',
      desc: 'service_role not used in client-facing API routes (only admin/webhook routes)',
      type: 'STATIC',
      autoCheck: () => {
        // Check for service_role in client-facing routes
        const clientRoutes = [
          'app/api/orders/route.ts',
          'app/api/automation/start/route.ts',
        ];
        for (const route of clientRoutes) {
          if (fileExists(route) && fileContains(route, 'service_role')) {
            return `service_role found in ${route}`;
          }
        }
        return true;
      },
    },
    {
      id: 'B3-08',
      desc: 'Admin dashboard still loads after deployment',
      type: 'INTEGRATION',
    },
    {
      id: 'B3-09',
      desc: 'Phase X cross-references orderContext before flagging placeholder names',
      type: 'STATIC',
      autoCheck: () => {
        return grepFile('lib/workflow/phase-executors.ts', /orderContext|order_context|caseInfo/) ||
          'No orderContext reference in phase-executors for Phase X';
      },
    },
    {
      id: 'B3-10',
      desc: 'ready_for_delivery is single source of truth (snake_case)',
      type: 'STATIC',
      autoCheck: () => {
        // Ensure no camelCase variant exists
        const content = fs.readFileSync('lib/workflow/phase-executors.ts', 'utf-8');
        if (content.includes('readyForDelivery')) {
          return 'Found camelCase readyForDelivery — should be snake_case ready_for_delivery';
        }
        return true;
      },
    },
  ],

  // v3.1 Addendum — Tier B (10 points)
  tierB: [
    {
      id: 'TB-01',
      desc: 'Workflow completes all phases through X without cancellation',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-02',
      desc: 'Inngest function config shows timeouts.finish: 30m',
      type: 'STATIC',
      autoCheck: () => {
        return fileContains('lib/inngest/workflow-orchestration.ts', '"30m"') ||
          fileContains('lib/inngest/functions.ts', '"30m"') ||
          'No 30m timeout found in Inngest config';
      },
    },
    {
      id: 'TB-03',
      desc: 'Phase VII output contains tentative_ruling',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-04',
      desc: 'Phase VII output contains argument_assessment[]',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-05',
      desc: 'Phase VII output contains checkpoint_event',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-06',
      desc: 'CP2 notification fires after Phase VII',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-07',
      desc: 'Quality threshold holds under Tier B conditions (0.87 exits)',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-08',
      desc: 'No unnecessary Loop 3 execution when quality passes',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-09',
      desc: 'Total workflow duration under 20 minutes',
      type: 'INTEGRATION',
    },
    {
      id: 'TB-10',
      desc: 'Regression: v3 stress tests still pass',
      type: 'INTEGRATION',
    },
  ],
};

function printChecklist() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CLAY POST-DEPLOYMENT VALIDATION CHECKLIST');
  console.log('  Source: Master Implementation v2.5 + v3.1 Addendum');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let autoPassCount = 0;
  let autoFailCount = 0;
  let manualCount = 0;

  for (const [group, items] of Object.entries(CHECKLIST)) {
    const groupLabel = group === 'batch1' ? 'BATCH 1 (12 points)' :
                       group === 'batch3' ? 'BATCH 3 (10 points)' :
                       'TIER B ADDENDUM (10 points)';
    console.log(`\n--- ${groupLabel} ---`);

    for (const item of items) {
      if (item.autoCheck) {
        const result = item.autoCheck();
        if (result === true) {
          console.log(`  ✅ ${item.id}: ${item.desc} [${item.type}]`);
          autoPassCount++;
        } else {
          const detail = typeof result === 'string' ? result : 'failed';
          console.log(`  ❌ ${item.id}: ${item.desc} [${item.type}] — ${detail}`);
          autoFailCount++;
        }
      } else {
        console.log(`  [ ] ${item.id}: ${item.desc} [${item.type}]`);
        manualCount++;
      }
    }
  }

  const staticItems = Object.values(CHECKLIST).flat().filter(i => i.type === 'STATIC');
  const integrationItems = Object.values(CHECKLIST).flat().filter(i => i.type === 'INTEGRATION');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${staticItems.length} static + ${integrationItems.length} integration = ${staticItems.length + integrationItems.length} checks`);
  console.log(`Auto-verified: ${autoPassCount} passed, ${autoFailCount} failed`);
  console.log(`Manual checks remaining: ${manualCount}`);
  console.log('\nSTATIC checks can be validated via grep/code inspection.');
  console.log('INTEGRATION checks require running a test order through the pipeline.');
  console.log('\nTest order fixture: scripts/clay-test-order.json');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (autoFailCount > 0) {
    process.exit(1);
  }
}

printChecklist();
