/**
 * SP-1 R4-09: CI Check — client_id Propagation Audit
 *
 * Ensures no RLS migration references orders.user_id or orders.attorney_id.
 * The canonical column is orders.client_id (CST-01 P0 fix).
 *
 * Run: npx tsx scripts/check-client-id-propagation.ts
 * Exit code 0 = pass, 1 = violations found
 */

import { execSync } from 'child_process';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function checkClientIdPropagation(): boolean {
  let violations: string[] = [];

  // Check for orders.user_id in SQL migrations
  try {
    const result = execSync(
      `grep -rn 'orders\\.user_id' --include='*.sql' "${MIGRATIONS_DIR}"`,
      { encoding: 'utf-8' }
    );
    violations.push(...result.split('\n').filter(l => l.trim()));
  } catch {
    // grep returns exit code 1 when no matches found — that's the desired state
  }

  // Check for orders.attorney_id in SQL migrations (excluding the original
  // migration that is superseded by the corrective migration)
  try {
    const result = execSync(
      `grep -rn 'orders\\.attorney_id' --include='*.sql' "${MIGRATIONS_DIR}"`,
      { encoding: 'utf-8' }
    );
    // Filter out the original stale migration (superseded by 20260216000001)
    const activeViolations = result
      .split('\n')
      .filter(l => l.trim())
      .filter(l => !l.includes('20260128200000_conflict_matches.sql'));
    violations.push(...activeViolations);
  } catch {
    // No matches — good
  }

  if (violations.length > 0) {
    console.error('FAIL: Found orders.user_id or orders.attorney_id in active SQL migrations:');
    violations.forEach(v => console.error(`  ${v}`));
    console.error('');
    console.error('The canonical column is orders.client_id (CST-01).');
    console.error('Fix all references before proceeding with RLS policy creation.');
    return false;
  }

  console.log('PASS: No orders.user_id or orders.attorney_id violations found in active SQL migrations.');
  return true;
}

const passed = checkClientIdPropagation();
process.exit(passed ? 0 : 1);
