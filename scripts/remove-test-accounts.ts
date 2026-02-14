/**
 * SP-08 Task 9: Remove Test Accounts from Production
 *
 * This script safely removes test/demo accounts and all associated data.
 *
 * DEFAULT: DRY RUN — logs what would be deleted without making changes.
 * Set DRY_RUN=false to execute actual deletion.
 *
 * Usage:
 *   npx tsx scripts/remove-test-accounts.ts                    # Dry run
 *   DRY_RUN=false npx tsx scripts/remove-test-accounts.ts      # Actual deletion
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DRY_RUN = process.env.DRY_RUN !== 'false';

/**
 * Test account patterns to match.
 * Add email patterns, specific emails, or user IDs here.
 */
const TEST_EMAIL_PATTERNS = [
  '%@test.com',
  '%@example.com',
  '%+test@%',
  'test%@%',
  'demo%@%',
  'testuser%@%',
];

/**
 * Specific test emails to remove (exact match).
 * Add known test accounts here.
 */
const SPECIFIC_TEST_EMAILS: string[] = [
  // Add specific test emails, e.g.:
  // 'porter+test@motiongranted.com',
  // 'demo@motiongranted.com',
];

/**
 * Email patterns to NEVER delete (safety guard).
 */
const PROTECTED_PATTERNS = [
  '%@motiongranted.com',  // Protect all @motiongranted.com accounts by default
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Test Account Removal Script                            ║`);
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : '⚠️  LIVE DELETION ⚠️ '}                     ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Find test accounts
  console.log('Step 1: Finding test accounts...');

  // Get all auth users
  const { data: authUsersResponse, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    console.error('ERROR: Failed to list auth users:', authError.message);
    process.exit(1);
  }

  const allUsers = authUsersResponse.users;
  console.log(`  Total auth users found: ${allUsers.length}`);

  // Filter to test accounts
  const testUsers = allUsers.filter(user => {
    const email = (user.email || '').toLowerCase();

    // Never delete protected accounts
    for (const pattern of PROTECTED_PATTERNS) {
      const regex = patternToRegex(pattern);
      if (regex.test(email)) {
        return false;
      }
    }

    // Check specific emails
    if (SPECIFIC_TEST_EMAILS.some(e => e.toLowerCase() === email)) {
      return true;
    }

    // Check patterns
    for (const pattern of TEST_EMAIL_PATTERNS) {
      const regex = patternToRegex(pattern);
      if (regex.test(email)) {
        return true;
      }
    }

    return false;
  });

  if (testUsers.length === 0) {
    console.log('\n  No test accounts found. Nothing to do.');
    return;
  }

  console.log(`\n  Found ${testUsers.length} test account(s):`);
  for (const user of testUsers) {
    console.log(`    - ${user.email} (${user.id}) created ${user.created_at}`);
  }

  const testUserIds = testUsers.map(u => u.id);

  // Step 2: Find associated data
  console.log('\nStep 2: Scanning associated data...');

  // Get orders
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .in('client_id', testUserIds);

  const orderIds = (orders || []).map(o => o.id);
  console.log(`  Orders: ${orderIds.length}`);

  // Count data in dependent tables
  const tablesToCheck = [
    { table: 'profiles', column: 'id', ids: testUserIds, label: 'Profiles' },
    { table: 'login_attempts', column: 'user_id', ids: testUserIds, label: 'Login attempts' },
    { table: 'user_sessions', column: 'user_id', ids: testUserIds, label: 'User sessions' },
    { table: 'security_events', column: 'user_id', ids: testUserIds, label: 'Security events' },
    { table: 'activity_logs', column: 'user_id', ids: testUserIds, label: 'Activity logs' },
    { table: 'email_log', column: 'user_id', ids: testUserIds, label: 'Email logs' },
  ];

  if (orderIds.length > 0) {
    tablesToCheck.push(
      { table: 'conversation_messages', column: 'order_id', ids: orderIds, label: 'Conversation messages' },
      { table: 'conversations', column: 'order_id', ids: orderIds, label: 'Conversations' },
      { table: 'order_citations', column: 'order_id', ids: orderIds, label: 'Order citations' },
      { table: 'automation_logs', column: 'order_id', ids: orderIds, label: 'Automation logs' },
      { table: 'workflow_phase_executions', column: 'order_id', ids: orderIds, label: 'Phase executions' },
      { table: 'order_workflows', column: 'order_id', ids: orderIds, label: 'Workflows' },
      { table: 'documents', column: 'order_id', ids: orderIds, label: 'Documents' },
      { table: 'parties', column: 'order_id', ids: orderIds, label: 'Parties' },
      { table: 'verified_citations', column: 'order_id', ids: orderIds, label: 'Verified citations' },
    );
  }

  for (const check of tablesToCheck) {
    try {
      const { count } = await supabase
        .from(check.table)
        .select('*', { count: 'exact', head: true })
        .in(check.column, check.ids);
      console.log(`  ${check.label}: ${count ?? 0}`);
    } catch {
      console.log(`  ${check.label}: (table may not exist)`);
    }
  }

  // Step 3: Delete (or dry-run)
  if (DRY_RUN) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  DRY RUN COMPLETE — No changes made.                    ║');
    console.log('║  Set DRY_RUN=false to execute deletion.                 ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    return;
  }

  console.log('\nStep 3: Deleting test account data...');

  // Delete in FK-safe order: children first, then parents

  // 3a. Delete user-linked data
  const userTables = [
    'login_attempts', 'user_sessions', 'security_events',
    'activity_logs', 'email_log', 'document_downloads',
    'customer_feedback', 'feedback_requests', 'ai_disclosure_acceptances',
    'email_action_tokens', 'download_events',
  ];

  for (const table of userTables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .in('user_id', testUserIds);
      if (error && !error.message.includes('does not exist')) {
        console.warn(`  Warning: ${table}: ${error.message}`);
      } else {
        console.log(`  Deleted from ${table}`);
      }
    } catch {
      // Table may not exist
    }
  }

  // 3b. Delete order-linked data (child records first)
  if (orderIds.length > 0) {
    const orderTables = [
      'conversation_messages', 'conversations',
      'notification_queue', 'revision_requests',
      'order_citations', 'order_notes', 'order_feedback',
      'automation_logs', 'automation_tasks',
      'checkpoint_events', 'workflow_events',
      'workflow_phase_executions', 'order_workflows',
      'verified_citations', 'citation_banks', 'citation_verifications',
      'workflow_violations',
      'documents', 'parties', 'change_orders',
      'messages', 'conflict_matches', 'approval_queue', 'refunds',
    ];

    for (const table of orderTables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .in('order_id', orderIds);
        if (error && !error.message.includes('does not exist')) {
          console.warn(`  Warning: ${table}: ${error.message}`);
        } else {
          console.log(`  Deleted from ${table}`);
        }
      } catch {
        // Table may not exist
      }
    }

    // Delete orders
    const { error: ordersError } = await supabase
      .from('orders')
      .delete()
      .in('client_id', testUserIds);
    if (ordersError) {
      console.warn(`  Warning: orders: ${ordersError.message}`);
    } else {
      console.log(`  Deleted ${orderIds.length} orders`);
    }
  }

  // 3c. Delete profiles
  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .in('id', testUserIds);
  if (profileError) {
    console.warn(`  Warning: profiles: ${profileError.message}`);
  } else {
    console.log(`  Deleted ${testUserIds.length} profiles`);
  }

  // 3d. Delete auth users
  let authDeleteCount = 0;
  for (const userId of testUserIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`  Warning: auth user ${userId}: ${error.message}`);
    } else {
      authDeleteCount++;
    }
  }
  console.log(`  Deleted ${authDeleteCount} auth users`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  DELETION COMPLETE                                      ║`);
  console.log(`║  Removed ${testUsers.length} test account(s) and all associated data.  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a SQL LIKE pattern to a JavaScript RegExp.
 * % → .* and _ → .
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape regex chars
    .replace(/%/g, '.*')                       // SQL % → regex .*
    .replace(/_/g, '.');                       // SQL _ → regex .
  return new RegExp(`^${escaped}$`, 'i');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
