/**
 * SP-2 Task 4 (DST-02): Service Role ALLOWLIST Import Analysis Test
 *
 * Catches both direct SERVICE_ROLE references AND getServiceSupabase imports.
 * ALLOWLIST must match SP-1 R4-01 (lib/supabase/admin.ts) exactly.
 *
 * Run: npx tsx test/security/rls-isolation.test.ts
 *   OR: npx jest test/security/rls-isolation.test.ts (if Jest is configured)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWLIST = [
  'lib/supabase/admin.ts',                     // The factory itself
  'app/api/payments/checkout/route.ts',          // #1: Pre-payment conflict check
  'lib/automation/conflict-checker.ts',          // #2: Post-payment AI party analysis
  'lib/inngest/',                                // #3: All Inngest workers (wildcard)
  'app/api/webhooks/stripe/route.ts',            // #4: Stripe webhook handler
  'lib/security/audit-log.ts',                   // #5: Immutable audit log writes
  'lib/delivery/signed-urls.ts',                // #6: Signed URL generation
  'app/api/webhooks/resend/route.ts',            // #7: Resend webhook handler
  'lib/retention/retention-manager.ts',          // #8: Data retention cascade
];

describe('Service role isolation', () => {
  test('Only ALLOWLIST files import or reference service role client', () => {
    let result = '';
    try {
      result = execSync(
        "grep -rn 'supabase/admin\\|getServiceSupabase\\|createAdminClient\\|SERVICE_ROLE' " +
        "--include='*.ts' --include='*.tsx' app/ lib/",
        { encoding: 'utf-8' }
      );
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: Buffer | string };
      // grep returns exit code 1 if no matches — that's a pass
      if (err.status === 1) {
        result = '';
      } else {
        throw e;
      }
    }

    const violations = result
      .split('\n')
      .filter((line: string) => line.trim())
      .filter((line: string) => !ALLOWLIST.some(allowed => line.includes(allowed)));

    if (violations.length > 0) {
      console.error('SERVICE_ROLE ALLOWLIST VIOLATIONS:');
      violations.forEach((v: string) => console.error(`  ${v}`));
    }

    expect(violations).toEqual([]);
  });

  test('No RLS policy references orders.user_id or orders.attorney_id', () => {
    let result = '';
    try {
      result = execSync(
        "grep -rn 'orders\\.user_id\\|orders\\.attorney_id' --include='*.sql' supabase/migrations/",
        { encoding: 'utf-8' }
      );
    } catch (e: unknown) {
      const err = e as { status?: number };
      if (err.status === 1) result = '';
      else throw e;
    }

    // Filter out the original stale migration superseded by SP-1 corrective migration
    const lines = result
      .split('\n')
      .filter((l: string) => l.trim())
      .filter((l: string) => !l.includes('20260128200000_conflict_matches.sql'));

    expect(lines).toEqual([]);
  });

  test('ALLOWLIST entries resolve to existing paths', () => {
    const missing: string[] = [];

    for (const entry of ALLOWLIST) {
      if (entry === 'lib/supabase/admin.ts') continue; // Must exist (SP-1)
      const fullPath = path.resolve(process.cwd(), entry);
      if (entry.endsWith('/')) {
        // Wildcard directory — must exist
        if (!fs.existsSync(fullPath)) missing.push(entry);
      } else {
        // Specific file — may not exist yet if domain not implemented
        // Log warning but don't fail
        if (!fs.existsSync(fullPath)) {
          console.warn(`ALLOWLIST entry not yet created: ${entry}`);
        }
      }
    }
    // Only fail on missing directories (files may come in later SPs)
    expect(missing).toEqual([]);
  });
});
