// lib/inngest/retention-jobs.ts
// Scheduled retention jobs
// Tasks 46-47 | Version 1.0 — January 28, 2026

import { inngest } from './client';
import {
  getOrdersDueForReminder,
  markReminderSent,
  getExpiredOrders,
  getStuckExpiredOrders,
} from '@/lib/retention';
import { deleteOrderData } from '@/lib/retention';
import { sendDeletionReminderEmail } from '@/lib/email/retention-emails';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('retention-jobs');

/**
 * Daily: Send deletion reminders (9 AM Central)
 * Runs for orders expiring in 14 days
 */
export const sendDeletionReminders = inngest.createFunction(
  {
    id: 'retention-send-reminders',
    name: 'Send Deletion Reminder Emails',
    retries: 3,
  },
  { cron: 'TZ=America/Chicago 0 9 * * *' }, // 9 AM Central daily
  async ({ step, logger }) => {
    const ordersToRemind = await step.run('fetch-orders-due', async () => {
      return getOrdersDueForReminder();
    });

    logger.info(`Found ${ordersToRemind.length} orders due for reminder`);

    if (ordersToRemind.length === 0) {
      return { total: 0, sent: 0, failed: 0 };
    }

    const results = { total: ordersToRemind.length, sent: 0, failed: 0 };

    for (const order of ordersToRemind) {
      const success = await step.run(`remind-${order.id}`, async () => {
        try {
          const supabase = await createClient();

          // Get user email
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', order.user_id)
            .single();

          if (!profile?.email) {
            logger.warn(`No email for user ${order.user_id}`);
            return false;
          }

          // Send reminder email
          await sendDeletionReminderEmail({
            to: profile.email,
            userName: profile.full_name || 'Attorney',
            orderId: order.id,
            motionType: order.motion_type,
            caseNumber: order.case_number || 'N/A',
            deletionDate: order.retention_expires_at,
          });

          // Mark reminder sent
          await markReminderSent(order.id);

          return true;
        } catch (error) {
          logger.error(`Failed to send reminder for order ${order.id}:`, error);
          return false;
        }
      });

      if (success) {
        results.sent++;
      } else {
        results.failed++;
      }
    }

    logger.info(`Reminder job complete: ${results.sent} sent, ${results.failed} failed`);
    return results;
  }
);

/**
 * Daily: Auto-delete expired orders (2 AM Central)
 * Deletes orders past their retention_expires_at date
 */
export const autoDeleteExpired = inngest.createFunction(
  {
    id: 'retention-auto-delete',
    name: 'Auto Delete Expired Orders',
    retries: 2,
  },
  { cron: 'TZ=America/Chicago 0 2 * * *' }, // 2 AM Central daily
  async ({ step, logger }) => {
    const expiredOrders = await step.run('fetch-expired', async () => {
      return getExpiredOrders();
    });

    logger.info(`Found ${expiredOrders.length} expired orders`);

    if (expiredOrders.length === 0) {
      return { total: 0, deleted: 0, failed: 0 };
    }

    const results = { total: expiredOrders.length, deleted: 0, failed: 0 };

    for (const order of expiredOrders) {
      const success = await step.run(`delete-${order.id}`, async () => {
        try {
          const result = await deleteOrderData(order.id, 'AUTO');
          return result.success;
        } catch (error) {
          logger.error(`Failed to delete order ${order.id}:`, error);
          return false;
        }
      });

      if (success) {
        results.deleted++;
        logger.info(`Deleted order ${order.id}`);
      } else {
        results.failed++;
      }
    }

    // ST6-01: Detect non-terminal orders with expired retention (anomalies)
    const stuckOrders = await step.run('detect-stuck-orders', async () => {
      return getStuckExpiredOrders();
    });

    if (stuckOrders.length > 0) {
      log.warn('[AUTO-DELETE] Stuck orders detected — active orders with expired retention', {
        count: stuckOrders.length,
        orders: stuckOrders.map((o: { id: string; status: string; retention_expires_at: string }) => ({
          id: o.id, status: o.status, expires: o.retention_expires_at,
        })),
      });
    }

    logger.info(`Auto-delete complete: ${results.deleted} deleted, ${results.failed} failed, ${stuckOrders.length} stuck`);
    return { ...results, stuck: stuckOrders.length };
  }
);

// Export all retention jobs
export const retentionJobs = [sendDeletionReminders, autoDeleteExpired];
