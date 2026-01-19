import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import {
  processTasks,
  scheduleRecurringTasks,
  processNotificationQueue,
} from '@/lib/automation';

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
      console.error('[Cron] CRON_SECRET not configured or too short');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!cronSecret || !secureCompare(cronSecret, expectedSecret)) {
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
