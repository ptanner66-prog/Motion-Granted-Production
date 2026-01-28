/**
 * Deadline Check Cron Module
 *
 * Runs daily to check for orders with urgent deadlines.
 * Can be triggered via:
 * 1. Inngest scheduled function (preferred)
 * 2. Vercel Cron
 * 3. Manual API call
 *
 * Sends alerts for orders due within 24 hours that aren't completed.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ALERT_EMAIL, EMAIL_FROM } from "@/lib/config/notifications";

// Initialize Supabase client for background jobs
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

export interface UrgentOrder {
  id: string;
  order_number: string;
  case_caption: string;
  motion_type: string;
  filing_deadline: string;
  status: string;
  client_id: string;
  hoursUntilDeadline: number;
}

export interface DeadlineCheckResult {
  urgentCount: number;
  urgentOrders: UrgentOrder[];
  alertSent: boolean;
  error?: string;
}

/**
 * Check for orders with urgent deadlines
 *
 * @param hoursThreshold - Hours until deadline to consider urgent (default: 24)
 * @returns List of urgent orders
 */
export async function findUrgentOrders(
  hoursThreshold: number = 24
): Promise<UrgentOrder[]> {
  const supabase = getSupabase();

  const deadlineThreshold = new Date(
    Date.now() + hoursThreshold * 60 * 60 * 1000
  ).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, case_caption, motion_type, filing_deadline, status, client_id"
    )
    .lt("filing_deadline", deadlineThreshold)
    .not("status", "in", "(completed,delivered,cancelled)")
    .order("filing_deadline", { ascending: true });

  if (error) {
    console.error("Failed to fetch urgent orders:", error);
    throw error;
  }

  // Add hours until deadline calculation
  return (orders || []).map((order) => ({
    ...order,
    hoursUntilDeadline: Math.round(
      (new Date(order.filing_deadline).getTime() - Date.now()) / (1000 * 60 * 60)
    ),
  }));
}

/**
 * Send deadline alerts via email
 *
 * @param urgentOrders - List of orders with urgent deadlines
 * @returns Whether the alert was sent successfully
 */
export async function sendDeadlineAlert(
  urgentOrders: UrgentOrder[]
): Promise<boolean> {
  if (urgentOrders.length === 0) {
    return true;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Build order list
    const orderList = urgentOrders
      .map((o) => {
        const icon =
          o.hoursUntilDeadline < 12
            ? "🚨"
            : o.hoursUntilDeadline < 24
              ? "⚠️"
              : "📋";
        return `${icon} ${o.order_number}: ${o.case_caption} (${o.motion_type})
   Deadline: ${new Date(o.filing_deadline).toLocaleString()}
   Time Left: ${o.hoursUntilDeadline}h
   Status: ${o.status}`;
      })
      .join("\n\n");

    // Categorize by urgency
    const critical = urgentOrders.filter((o) => o.hoursUntilDeadline < 12);
    const urgent = urgentOrders.filter(
      (o) => o.hoursUntilDeadline >= 12 && o.hoursUntilDeadline < 24
    );
    const approaching = urgentOrders.filter((o) => o.hoursUntilDeadline >= 24);

    const subject =
      critical.length > 0
        ? `🚨 CRITICAL: ${critical.length} order(s) due within 12 hours`
        : `⚠️ URGENT: ${urgentOrders.length} order(s) due within 24 hours`;

    await resend.emails.send({
      from: EMAIL_FROM.alerts,
      to: ALERT_EMAIL,
      subject,
      text: `
Deadline Alert - Orders Requiring Attention
============================================

Summary:
- Critical (<12h): ${critical.length}
- Urgent (<24h): ${urgent.length}
- Approaching (<72h): ${approaching.length}

Details:
--------

${orderList}

---

Action Required:
Review these orders immediately in the admin dashboard:
${process.env.NEXT_PUBLIC_APP_URL}/admin/queue

---
Motion Granted Automated Alert System
Report generated: ${new Date().toLocaleString()}
      `.trim(),
    });

    // Log the alert
    const supabase = getSupabase();
    await supabase.from("automation_logs").insert({
      action_type: "deadline_alert_sent",
      action_details: {
        urgentCount: urgentOrders.length,
        criticalCount: critical.length,
        orderIds: urgentOrders.map((o) => o.id),
        reportTime: new Date().toISOString(),
      },
    });

    return true;
  } catch (error) {
    console.error("Failed to send deadline alert:", error);
    return false;
  }
}

/**
 * Run the complete deadline check
 *
 * @param hoursThreshold - Hours until deadline to consider urgent
 * @returns Result of the deadline check
 */
export async function runDeadlineCheck(
  hoursThreshold: number = 24
): Promise<DeadlineCheckResult> {
  try {
    const urgentOrders = await findUrgentOrders(hoursThreshold);

    if (urgentOrders.length === 0) {
      return {
        urgentCount: 0,
        urgentOrders: [],
        alertSent: false,
      };
    }

    const alertSent = await sendDeadlineAlert(urgentOrders);

    return {
      urgentCount: urgentOrders.length,
      urgentOrders,
      alertSent,
    };
  } catch (error) {
    return {
      urgentCount: 0,
      urgentOrders: [],
      alertSent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
