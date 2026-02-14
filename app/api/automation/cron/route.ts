import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  processTasks,
  scheduleRecurringTasks,
  processNotificationQueue,
} from '@/lib/automation';
import { inngest, calculatePriority } from '@/lib/inngest/client';
import { ADMIN_EMAIL, ALERT_EMAIL } from '@/lib/config/notifications';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-automation-cron');

// Timing constants for stuck order recovery
const STUCK_ORDER_THRESHOLD_MINUTES = 15;
const GENERATION_TIMEOUT_MINUTES = 10;
const DEADLINE_WARNING_HOURS = 48;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * POST /api/automation/cron
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to process automation tasks.
 *
 * It handles:
 * - Processing pending automation tasks
 * - Scheduling recurring tasks (reports, deadline checks, etc.)
 * - Processing notification queue
 *
 * Security: Requires CRON_SECRET header to match environment variable
 * IMPORTANT: Always requires authentication, even in development
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret - ALWAYS required
    const headersList = await headers();
    const cronSecret = headersList.get('x-cron-secret') || headersList.get('authorization')?.replace('Bearer ', '');
    const expectedSecret = process.env.CRON_SECRET;

    // Require CRON_SECRET to be set and match (constant-time comparison)
    if (!expectedSecret || expectedSecret.length < 16) {
      log.error('CRON_SECRET not configured or too short');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!cronSecret || !secureCompare(cronSecret, expectedSecret)) {
      log.warn('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { taskTypes, maxTasks, scheduleRecurring = true, processNotifications = true } = body;

    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    // 1. Schedule recurring tasks (if enabled)
    if (scheduleRecurring) {
      const scheduleResult = await scheduleRecurringTasks();
      results.recurring = {
        success: scheduleResult.success,
        error: scheduleResult.error,
      };
    }

    // 2. Process pending tasks
    const taskResult = await processTasks({
      taskTypes,
      maxTasks: maxTasks || 20,
    });

    results.tasks = {
      success: taskResult.success,
      data: taskResult.data,
      error: taskResult.error,
    };

    // 3. Process notification queue (if enabled)
    if (processNotifications) {
      const notifyResult = await processNotificationQueue();
      results.notifications = {
        success: notifyResult.success,
        data: notifyResult.data,
        error: notifyResult.error,
      };
    }

    // 4. RECOVER STUCK ORDERS - Critical for E2E reliability
    const supabase = getSupabase();
    const stuckOrderResults = { recovered: 0, failed: 0, timedOut: 0, deadlineWarnings: 0, errors: [] as string[] };

    try {
      // 4a. Find orders stuck in submitted/under_review that were paid but never queued
      const stuckThreshold = new Date(Date.now() - STUCK_ORDER_THRESHOLD_MINUTES * 60 * 1000).toISOString();

      const { data: stuckOrders } = await supabase
        .from('orders')
        .select('id, order_number, filing_deadline, status, created_at')
        .in('status', ['submitted', 'under_review'])
        .eq('stripe_payment_status', 'succeeded')
        .lt('updated_at', stuckThreshold)
        .is('generation_started_at', null)
        .limit(10);

      if (stuckOrders && stuckOrders.length > 0) {
        for (const order of stuckOrders) {
          try {
            const priority = calculatePriority(order.filing_deadline);
            await inngest.send({
              name: 'order/submitted',
              data: { orderId: order.id, priority, filingDeadline: order.filing_deadline, recoveryAttempt: true },
            });

            await supabase.from('orders').update({ status: 'under_review', updated_at: new Date().toISOString() }).eq('id', order.id);
            await supabase.from('automation_logs').insert({
              order_id: order.id,
              action_type: 'order_recovered',
              action_details: { stuckSince: order.created_at, source: 'cron_recovery' },
            });

            stuckOrderResults.recovered++;
            log.info('Recovered stuck order', { orderNumber: order.order_number });
          } catch (err) {
            stuckOrderResults.failed++;
            stuckOrderResults.errors.push(`${order.order_number}: ${err instanceof Error ? err.message : 'Unknown'}`);
          }
        }
      }

      // 4b. Find orders with timed-out generation (in_progress too long)
      const timeoutThreshold = new Date(Date.now() - GENERATION_TIMEOUT_MINUTES * 60 * 1000).toISOString();

      const { data: timedOutOrders } = await supabase
        .from('orders')
        .select('id, order_number, filing_deadline, generation_attempts, generation_started_at')
        .eq('status', 'in_progress')
        .lt('generation_started_at', timeoutThreshold)
        .limit(5);

      if (timedOutOrders && timedOutOrders.length > 0) {
        for (const order of timedOutOrders) {
          const attempts = order.generation_attempts || 0;

          if (attempts >= 3) {
            // Max retries - mark as failed and alert admin
            await supabase.from('orders').update({
              status: 'generation_failed',
              generation_error: 'Maximum generation attempts exceeded',
              updated_at: new Date().toISOString(),
            }).eq('id', order.id);

            await supabase.from('notification_queue').insert({
              notification_type: 'generation_failed',
              recipient_email: ALERT_EMAIL,
              order_id: order.id,
              subject: `[ALERT] Order ${order.order_number} generation failed`,
              template_data: { orderNumber: order.order_number, attempts: 3 },
              priority: 10,
              status: 'pending',
            });

            stuckOrderResults.timedOut++;
          } else {
            // Retry generation
            const priority = calculatePriority(order.filing_deadline) + 2;
            await inngest.send({
              name: 'order/submitted',
              data: { orderId: order.id, priority, filingDeadline: order.filing_deadline, isRetry: true },
            });
            stuckOrderResults.recovered++;
          }
        }
      }

      // 4c. Warn about approaching deadlines
      const deadlineThreshold = new Date(Date.now() + DEADLINE_WARNING_HOURS * 60 * 60 * 1000).toISOString();

      const { data: urgentOrders } = await supabase
        .from('orders')
        .select('id, order_number, case_caption, motion_type, filing_deadline, status')
        .lt('filing_deadline', deadlineThreshold)
        .not('status', 'in', '(completed,cancelled,draft_delivered)')
        .is('deadline_warned', null)
        .limit(10);

      if (urgentOrders && urgentOrders.length > 0) {
        for (const order of urgentOrders) {
          const hoursLeft = Math.round((new Date(order.filing_deadline).getTime() - Date.now()) / (1000 * 60 * 60));

          await supabase.from('notification_queue').insert({
            notification_type: hoursLeft <= 24 ? 'deadline_critical' : 'deadline_warning',
            recipient_email: ADMIN_EMAIL,
            order_id: order.id,
            subject: `[${hoursLeft <= 24 ? 'CRITICAL' : 'WARNING'}] ${order.order_number} deadline in ${hoursLeft}h`,
            template_data: { orderNumber: order.order_number, hoursRemaining: hoursLeft },
            priority: hoursLeft <= 24 ? 10 : 8,
            status: 'pending',
          });

          await supabase.from('orders').update({ deadline_warned: new Date().toISOString() }).eq('id', order.id);
          stuckOrderResults.deadlineWarnings++;
        }
      }
    } catch (recoveryError) {
      log.error('Recovery error', { error: recoveryError instanceof Error ? recoveryError.message : recoveryError });
      stuckOrderResults.errors.push(`Recovery error: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown'}`);
    }

    results.stuckOrderRecovery = stuckOrderResults;

    // Determine overall success
    const success = taskResult.success &&
      (!scheduleRecurring || results.recurring) &&
      (!processNotifications || (results.notifications as { success?: boolean })?.success !== false);

    return NextResponse.json({
      success,
      results,
    });
  } catch (error) {
    log.error('Cron error', { error: error instanceof Error ? error.message : error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/automation/cron
 *
 * Health check endpoint for the cron system
 * Requires authentication to prevent information disclosure
 */
export async function GET() {
  const headersList = await headers();
  const cronSecret = headersList.get('x-cron-secret') || headersList.get('authorization')?.replace('Bearer ', '');
  const expectedSecret = process.env.CRON_SECRET;

  // Require authentication for health check too
  if (!expectedSecret || !cronSecret || !secureCompare(cronSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
