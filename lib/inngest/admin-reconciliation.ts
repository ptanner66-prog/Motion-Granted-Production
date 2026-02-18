/**
 * Admin Users Reconciliation Job — DST-06
 *
 * Daily cron (6 AM CT) that reconciles admin_users table against profiles:
 * 1. Detects orphaned admin_users rows (user no longer exists in profiles)
 * 2. Detects desynced roles (admin_users entry but profiles.role != 'admin')
 * 3. Alerts via email_queue if any issues found
 */

import { inngest } from '@/lib/inngest/client';
import { getServiceSupabase } from '@/lib/supabase/admin';

export const adminReconciliation = inngest.createFunction(
  { id: 'admin-reconciliation', retries: 2 },
  { cron: '0 6 * * *' }, // 6 AM CT daily
  async ({ step }) => {
    const results = await step.run('reconcile-admin-accounts', async () => {
      const supabase = getServiceSupabase();

      const { data: admins } = await supabase
        .from('admin_users')
        .select('user_id, role');

      let orphansFound = 0;
      let desyncsFound = 0;

      for (const admin of admins ?? []) {
        // Check 1: Does the user still exist in profiles?
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', admin.user_id)
          .single();

        if (!profile) {
          orphansFound++;
          console.warn(
            `[admin-reconciliation] Orphaned admin_users row: user_id ${admin.user_id} not found in profiles`
          );
          continue;
        }

        // Check 2: Does profiles.role match admin_users?
        if (profile.role !== 'admin') {
          desyncsFound++;
          console.warn(
            `[admin-reconciliation] Desync: admin_users has ${admin.user_id} but profiles.role = ${profile.role}`
          );
        }
      }

      return { totalAdmins: admins?.length ?? 0, orphansFound, desyncsFound };
    });

    // Alert if issues found
    if (results.orphansFound > 0 || results.desyncsFound > 0) {
      await step.run('send-reconciliation-alert', async () => {
        const supabase = getServiceSupabase();
        console.warn('[admin-reconciliation] Issues found:', results);
        // Queue admin alert email
        await supabase.from('email_queue').insert({
          order_id: null,
          template: 'admin-alert',
          data: {
            alertType: 'ADMIN_RECONCILIATION',
            message: `Found ${results.orphansFound} orphaned and ${results.desyncsFound} desynced admin accounts`,
            timestamp: new Date().toISOString(),
          },
          status: 'pending',
        });
      });
    }
  }
);
