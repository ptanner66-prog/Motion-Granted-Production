import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import {
  processTasks,
  scheduleRecurringTasks,
  processNotificationQueue,
} from '@/lib/automation';

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
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret
    const headersList = await headers();
    const cronSecret = headersList.get('x-cron-secret') || headersList.get('authorization')?.replace('Bearer ', '');
    const expectedSecret = process.env.CRON_SECRET;

    // In development, allow without secret
    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev && (!expectedSecret || cronSecret !== expectedSecret)) {
      console.warn('[Cron] Unauthorized cron request');
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

    // Determine overall success
    const success = taskResult.success &&
      (!scheduleRecurring || results.recurring) &&
      (!processNotifications || (results.notifications as { success?: boolean })?.success !== false);

    return NextResponse.json({
      success,
      results,
    });
  } catch (error) {
    console.error('[Cron] Error:', error);
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
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Automation cron endpoint is running',
  });
}
