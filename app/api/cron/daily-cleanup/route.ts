/**
 * CRON: Daily Cleanup
 *
 * Runs once daily at 6:00 AM UTC (midnight CST) via Vercel Cron.
 * Handles:
 * 1. Email dedup cache cleanup
 * 2. Rate limit store cleanup
 * 3. Stale workflow detection (orders stuck in processing >48h)
 *
 * Auth: Vercel sends Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCronAuth } from '@/lib/security/cron-auth';
import { cleanupEmailDedup } from '@/lib/email/client';
// V-001: Rate limit cleanup no longer needed — Upstash Redis handles TTL automatically
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('api-cron-daily-cleanup');

const STALE_WORKFLOW_HOURS = 48;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export const GET = withCronAuth(async (_request: NextRequest) => {
  const startTime = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // 1. Email dedup cache cleanup
  try {
    cleanupEmailDedup();
    results.emailDedup = { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Email dedup cleanup failed: ${msg}`);
    results.emailDedup = { success: false, error: msg };
  }

  // 2. Rate limit store cleanup — V-001: handled by Upstash Redis TTL
  results.rateLimits = { success: true, note: 'Redis TTL auto-cleanup' };

  // 3. Stale workflow detection
  try {
    const supabase = getServiceSupabase();
    const staleThreshold = new Date(
      Date.now() - STALE_WORKFLOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: staleOrders, error: queryError } = await supabase
      .from('orders')
      .select('id, order_number, status, updated_at, generation_started_at')
      .in('status', ['PROCESSING', 'UNDER_REVIEW'])
      .lt('updated_at', staleThreshold)
      .limit(20);

    if (queryError) {
      throw new Error(queryError.message);
    }

    if (staleOrders && staleOrders.length > 0) {
      for (const order of staleOrders) {
        const hoursSinceUpdate = Math.round(
          (Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60)
        );

        log.warn('STALE WORKFLOW detected', { orderNumber: order.order_number, status: order.status, staleHours: hoursSinceUpdate });

        // Log warning to automation_logs (non-fatal)
        try {
          await supabase.from('automation_logs').insert({
            order_id: order.id,
            action_type: 'stale_workflow_detected',
            action_details: {
              orderNumber: order.order_number,
              status: order.status,
              hoursSinceUpdate,
              lastUpdated: order.updated_at,
              generationStartedAt: order.generation_started_at,
              detectedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
            },
          });
        } catch {
          // Non-fatal
        }
      }

      results.staleWorkflows = {
        success: true,
        count: staleOrders.length,
        orders: staleOrders.map((o) => ({
          orderNumber: o.order_number,
          status: o.status,
          lastUpdated: o.updated_at,
        })),
      };
    } else {
      results.staleWorkflows = { success: true, count: 0 };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Stale workflow detection failed: ${msg}`);
    results.staleWorkflows = { success: false, error: msg };
  }

  const duration = Date.now() - startTime;

  // Log CRON execution
  try {
    const supabase = getServiceSupabase();
    await supabase.from('automation_logs').insert({
      action_type: 'daily_cleanup_cron',
      action_details: {
        results,
        errors,
        duration,
        timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
      },
    });
  } catch {
    log.error('Failed to log to automation_logs');
  }

  log.info('Daily cleanup complete', { errorCount: errors.length, durationMs: duration });

  return NextResponse.json({
    success: errors.length === 0,
    results,
    errors,
    duration,
  });
});
