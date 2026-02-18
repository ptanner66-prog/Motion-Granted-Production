/**
 * D3 Cost Monitoring Crons (A3-ST5-001)
 *
 * Four cron functions for AI cost monitoring and alerting:
 *
 * 1. costAnomalyDetector  — Daily 7:00 AM CT: detect per-order cost spikes
 * 2. budgetAlertCron       — Daily 7:30 AM CT: check monthly spend vs budget
 * 3. costReportCron        — Weekly Monday 8:00 AM CT: generate weekly cost summary
 * 4. spendTrackerCron      — Daily 6:00 AM CT: record daily spend snapshot
 *
 * All costs computed from automation_logs (input_tokens, output_tokens)
 * using MODEL_COSTS from lib/config/models.ts.
 */

import { inngest } from '../inngest/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { MODEL_COSTS } from '@/lib/config/models';
import { ADMIN_EMAIL, ALERT_EMAIL, EMAIL_FROM } from '@/lib/config/notifications';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('cost-monitoring');

// ============================================================================
// SHARED HELPERS
// ============================================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createSupabaseClient(url, key);
}

/** Monthly budget cap in USD — override via MONTHLY_AI_BUDGET env var */
const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_AI_BUDGET) || 5000;

/** Per-order cost threshold in USD for anomaly detection */
const ANOMALY_THRESHOLD_USD = Number(process.env.COST_ANOMALY_THRESHOLD) || 50;

interface TokenUsage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Compute dollar cost from token usage using MODEL_COSTS.
 */
function computeCost(usage: TokenUsage): number {
  const modelCosts = MODEL_COSTS[usage.model || ''];
  if (!modelCosts) return 0;
  const inputCost = ((usage.inputTokens || 0) / 1_000_000) * modelCosts.input;
  const outputCost = ((usage.outputTokens || 0) / 1_000_000) * modelCosts.output;
  return inputCost + outputCost;
}

// ============================================================================
// 1. COST ANOMALY DETECTOR — Daily 7:00 AM CT
// ============================================================================

export const costAnomalyDetector = inngest.createFunction(
  { id: 'cost-anomaly-detector', name: 'Daily Cost Anomaly Detector' },
  { cron: 'TZ=America/Chicago 0 7 * * *' },
  async ({ step }) => {
    const supabase = getSupabase();

    const anomalies = await step.run('detect-anomalies', async () => {
      // Look at orders completed in the last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: logs } = await supabase
        .from('automation_logs')
        .select('order_id, action_details')
        .in('action_type', ['motion_generated', 'phase_completed'])
        .gte('created_at', since);

      if (!logs || logs.length === 0) return [];

      // Aggregate cost per order
      const orderCosts = new Map<string, number>();
      for (const entry of logs) {
        const details = entry.action_details as Record<string, unknown> | null;
        if (!details) continue;
        const cost = computeCost({
          model: details.model as string,
          inputTokens: details.inputTokens as number,
          outputTokens: details.outputTokens as number,
        });
        const current = orderCosts.get(entry.order_id) || 0;
        orderCosts.set(entry.order_id, current + cost);
      }

      // Flag orders above threshold
      const flagged: Array<{ orderId: string; costUsd: number }> = [];
      for (const [orderId, costUsd] of orderCosts) {
        if (costUsd > ANOMALY_THRESHOLD_USD) {
          flagged.push({ orderId, costUsd: Math.round(costUsd * 100) / 100 });
        }
      }
      return flagged;
    });

    if (anomalies.length > 0) {
      await step.run('alert-anomalies', async () => {
        log.warn('Cost anomalies detected', { count: anomalies.length, anomalies });

        // Queue email alert
        await supabase.from('email_queue').insert({
          to_email: ALERT_EMAIL,
          from_email: EMAIL_FROM.alerts,
          subject: `[COST ALERT] ${anomalies.length} order(s) exceeded $${ANOMALY_THRESHOLD_USD} threshold`,
          body: `Cost Anomaly Report\n\n${anomalies.map(a => `- Order ${a.orderId}: $${a.costUsd}`).join('\n')}\n\nThreshold: $${ANOMALY_THRESHOLD_USD}\nReview: ${process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com'}/admin/analytics`,
          priority: 8,
        });

        await supabase.from('automation_logs').insert({
          action_type: 'cost_anomaly_alert',
          action_details: { anomalies, threshold: ANOMALY_THRESHOLD_USD },
        });
      });
    }

    return { anomalyCount: anomalies.length, anomalies };
  },
);

// ============================================================================
// 2. BUDGET ALERT CRON — Daily 7:30 AM CT
// ============================================================================

export const budgetAlertCron = inngest.createFunction(
  { id: 'budget-alert-cron', name: 'Daily Budget Alert Check' },
  { cron: 'TZ=America/Chicago 30 7 * * *' },
  async ({ step }) => {
    const supabase = getSupabase();

    const result = await step.run('check-budget', async () => {
      // Current month boundaries
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: logs } = await supabase
        .from('automation_logs')
        .select('action_details')
        .in('action_type', ['motion_generated', 'phase_completed'])
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      let totalSpend = 0;
      for (const entry of logs || []) {
        const details = entry.action_details as Record<string, unknown> | null;
        if (!details) continue;
        totalSpend += computeCost({
          model: details.model as string,
          inputTokens: details.inputTokens as number,
          outputTokens: details.outputTokens as number,
        });
      }

      const percentUsed = MONTHLY_BUDGET_USD > 0 ? (totalSpend / MONTHLY_BUDGET_USD) * 100 : 0;
      return {
        totalSpendUsd: Math.round(totalSpend * 100) / 100,
        budgetUsd: MONTHLY_BUDGET_USD,
        percentUsed: Math.round(percentUsed * 10) / 10,
      };
    });

    // Alert at 80% and 95% thresholds
    if (result.percentUsed >= 80) {
      await step.run('send-budget-alert', async () => {
        const level = result.percentUsed >= 95 ? 'CRITICAL' : 'WARNING';
        log.warn('Budget threshold reached', { level, ...result });

        await supabase.from('email_queue').insert({
          to_email: ALERT_EMAIL,
          from_email: EMAIL_FROM.alerts,
          subject: `[${level}] Monthly AI budget at ${result.percentUsed}% ($${result.totalSpendUsd}/$${result.budgetUsd})`,
          body: `Budget Alert\n\nCurrent spend: $${result.totalSpendUsd}\nMonthly budget: $${result.budgetUsd}\nUsage: ${result.percentUsed}%\n\nReview: ${process.env.NEXT_PUBLIC_APP_URL || 'https://motion-granted.com'}/admin/analytics`,
          priority: result.percentUsed >= 95 ? 10 : 8,
        });

        await supabase.from('automation_logs').insert({
          action_type: 'budget_alert',
          action_details: { level, ...result },
        });
      });
    }

    return result;
  },
);

// ============================================================================
// 3. COST REPORT CRON — Weekly Monday 8:00 AM CT
// ============================================================================

export const costReportCron = inngest.createFunction(
  { id: 'cost-report-cron', name: 'Weekly Cost Report' },
  { cron: 'TZ=America/Chicago 0 8 * * 1' },
  async ({ step }) => {
    const supabase = getSupabase();

    const report = await step.run('generate-report', async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: logs } = await supabase
        .from('automation_logs')
        .select('order_id, action_type, action_details, created_at')
        .in('action_type', ['motion_generated', 'phase_completed'])
        .gte('created_at', weekAgo);

      let totalSpend = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const modelBreakdown = new Map<string, number>();
      const orderCount = new Set<string>();

      for (const entry of logs || []) {
        const details = entry.action_details as Record<string, unknown> | null;
        if (!details) continue;

        const model = (details.model as string) || 'unknown';
        const inputTokens = (details.inputTokens as number) || 0;
        const outputTokens = (details.outputTokens as number) || 0;
        const cost = computeCost({ model, inputTokens, outputTokens });

        totalSpend += cost;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        modelBreakdown.set(model, (modelBreakdown.get(model) || 0) + cost);
        if (entry.order_id) orderCount.add(entry.order_id);
      }

      return {
        periodStart: weekAgo,
        periodEnd: new Date().toISOString(),
        totalSpendUsd: Math.round(totalSpend * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        ordersProcessed: orderCount.size,
        modelBreakdown: Object.fromEntries(
          Array.from(modelBreakdown.entries()).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
        avgCostPerOrder: orderCount.size > 0
          ? Math.round((totalSpend / orderCount.size) * 100) / 100
          : 0,
      };
    });

    await step.run('store-and-notify', async () => {
      // Store report
      await supabase.from('automation_logs').insert({
        action_type: 'weekly_cost_report',
        action_details: report,
      });

      // Send summary email
      const modelLines = Object.entries(report.modelBreakdown)
        .map(([model, cost]) => `  ${model}: $${cost}`)
        .join('\n');

      await supabase.from('email_queue').insert({
        to_email: ADMIN_EMAIL,
        from_email: EMAIL_FROM.notifications,
        subject: `Weekly AI Cost Report: $${report.totalSpendUsd} (${report.ordersProcessed} orders)`,
        body: `Weekly Cost Report (${report.periodStart.split('T')[0]} to ${report.periodEnd.split('T')[0]})\n\nTotal Spend: $${report.totalSpendUsd}\nOrders Processed: ${report.ordersProcessed}\nAvg Cost/Order: $${report.avgCostPerOrder}\n\nModel Breakdown:\n${modelLines}\n\nTotal Tokens: ${report.totalInputTokens.toLocaleString()} in / ${report.totalOutputTokens.toLocaleString()} out`,
        priority: 5,
      });

      log.info('Weekly cost report generated', report);
    });

    return report;
  },
);

// ============================================================================
// 4. SPEND TRACKER CRON — Daily 6:00 AM CT
// ============================================================================

export const spendTrackerCron = inngest.createFunction(
  { id: 'spend-tracker-cron', name: 'Daily Spend Tracker' },
  { cron: 'TZ=America/Chicago 0 6 * * *' },
  async ({ step }) => {
    const supabase = getSupabase();

    const snapshot = await step.run('record-daily-spend', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
      const dayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString();

      const { data: logs } = await supabase
        .from('automation_logs')
        .select('order_id, action_details')
        .in('action_type', ['motion_generated', 'phase_completed'])
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

      let dailySpend = 0;
      const orderIds = new Set<string>();

      for (const entry of logs || []) {
        const details = entry.action_details as Record<string, unknown> | null;
        if (!details) continue;
        dailySpend += computeCost({
          model: details.model as string,
          inputTokens: details.inputTokens as number,
          outputTokens: details.outputTokens as number,
        });
        if (entry.order_id) orderIds.add(entry.order_id);
      }

      const result = {
        date: dayStart.split('T')[0],
        dailySpendUsd: Math.round(dailySpend * 100) / 100,
        ordersProcessed: orderIds.size,
      };

      // Store daily snapshot
      await supabase.from('automation_logs').insert({
        action_type: 'daily_spend_snapshot',
        action_details: result,
      });

      log.info('Daily spend snapshot recorded', result);
      return result;
    });

    return snapshot;
  },
);
