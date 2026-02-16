/**
 * Stripe Account Health Monitoring (SP-11 AF-1)
 *
 * Source: D7-R3-013 | Priority: P1
 *
 * Weekly cron (Monday 6:00 AM CT) calculates:
 * - Dispute rate (warning: 0.5%, critical: 0.75%)
 * - Refund rate (warning: 5%, critical: 8%)
 * - Success rate
 *
 * Alerts only fire when volume >= 50 charges (prevents false alarms).
 * Reports stored in stripe_health_reports table.
 *
 * @module inngest/functions/stripe-health-monitor
 */

import { inngest } from '../client';

export interface StripeHealthReport {
  periodStart: Date;
  periodEnd: Date;
  totalCharges: number;
  totalDisputes: number;
  totalRefunds: number;
  disputeRate: number;
  refundRate: number;
  successRate: number;
  alerts: StripeHealthAlert[];
  volumeSufficient: boolean;
}

interface StripeHealthAlert {
  metric: 'dispute_rate' | 'refund_rate';
  level: 'warning' | 'critical';
  currentValue: number;
  threshold: number;
}

export const stripeHealthMonitor = inngest.createFunction(
  { id: 'stripe-health-monitor', name: 'Weekly Stripe Health Check' },
  { cron: '0 6 * * 1' }, // Monday 6:00 AM CT
  async ({ step }) => {
    const report = await step.run('calculate-health', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: events } = await supabase
        .from('payment_events')
        .select('event_type')
        .gte('created_at', thirtyDaysAgo);

      if (!events || events.length === 0) {
        return {
          periodStart: new Date(thirtyDaysAgo),
          periodEnd: new Date(),
          totalCharges: 0,
          totalDisputes: 0,
          totalRefunds: 0,
          disputeRate: 0,
          refundRate: 0,
          successRate: 1,
          alerts: [],
          volumeSufficient: false,
        } as StripeHealthReport;
      }

      const totalCharges = events.filter(e => e.event_type === 'CHARGE_COMPLETED').length;
      const totalDisputes = events.filter(e => e.event_type === 'DISPUTE_OPENED').length;
      const totalRefunds = events.filter(e => e.event_type === 'REFUND_PROCESSED').length;
      const volumeSufficient = totalCharges >= 50;

      const disputeRate = totalCharges > 0 ? totalDisputes / totalCharges : 0;
      const refundRate = totalCharges > 0 ? totalRefunds / totalCharges : 0;
      const successRate = totalCharges > 0 ? 1 - ((totalDisputes + totalRefunds) / totalCharges) : 1;

      const alerts: StripeHealthAlert[] = [];
      if (volumeSufficient) {
        if (disputeRate > 0.0075) {
          alerts.push({ metric: 'dispute_rate', level: 'critical', currentValue: disputeRate, threshold: 0.0075 });
        } else if (disputeRate > 0.005) {
          alerts.push({ metric: 'dispute_rate', level: 'warning', currentValue: disputeRate, threshold: 0.005 });
        }
        if (refundRate > 0.08) {
          alerts.push({ metric: 'refund_rate', level: 'critical', currentValue: refundRate, threshold: 0.08 });
        } else if (refundRate > 0.05) {
          alerts.push({ metric: 'refund_rate', level: 'warning', currentValue: refundRate, threshold: 0.05 });
        }
      }

      return {
        periodStart: new Date(thirtyDaysAgo),
        periodEnd: new Date(),
        totalCharges,
        totalDisputes,
        totalRefunds,
        disputeRate,
        refundRate,
        successRate,
        alerts,
        volumeSufficient,
      } as StripeHealthReport;
    });

    // Write report
    await step.run('write-report', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      await supabase.from('stripe_health_reports').insert({
        report_data: JSON.stringify(report),
        alert_count: report.alerts.length,
      });
    });

    // Alert if needed
    if (report.alerts.length > 0) {
      await step.run('send-alerts', async () => {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const hasCritical = report.alerts.some(a => a.level === 'critical');

        await resend.emails.send({
          from: 'Motion Granted <alerts@motiongranted.com>',
          to: process.env.ADMIN_ALERT_EMAIL || 'admin@motiongranted.com',
          subject: `[${hasCritical ? 'CRITICAL' : 'WARNING'}] Stripe Health Alert`,
          text: `Weekly health check found ${report.alerts.length} alert(s).\n\nDispute rate: ${(report.disputeRate * 100).toFixed(2)}%\nRefund rate: ${(report.refundRate * 100).toFixed(2)}%\nCharges (30d): ${report.totalCharges}\n\nAlerts:\n${report.alerts.map(a => `- ${a.metric}: ${(a.currentValue * 100).toFixed(2)}% (threshold: ${(a.threshold * 100).toFixed(2)}%)`).join('\n')}`,
        });
      });
    }

    return report;
  },
);
