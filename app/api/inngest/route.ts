// Vercel Pro Plan: Extended function duration — MUST be before imports for Next.js detection
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// v7.4.2: Complete function registration — fixes PASS14-P0-001 (12 unregistered functions)
// Primary workflow + CP3 approval (Fn1 + Fn2 + failure handlers)
import {
  generateOrderWorkflow,
  handleWorkflowFailure,
  handleWorkflowTimeout,
  workflowCheckpointApproval,
} from "@/lib/inngest/workflow-orchestration";

// Supporting functions from barrel file
// NOTE: handleCheckpointApproval (simple logger) REMOVED — same Inngest ID as
// workflowCheckpointApproval (real Fn2). Only one can be registered.
import {
  deadlineCheck,
  updateQueuePositions,
} from "@/lib/inngest/functions";

// Conflict checking
import { conflictCheckJob } from "@/lib/inngest/conflict-check-job";

// Data retention cron jobs
import { sendDeletionReminders, autoDeleteExpired } from "@/lib/inngest/retention-jobs";

// Orphan sweep + retention purge (SP-17 D6 Phase 6)
import { orphanSweepCron } from "@/lib/inngest/orphan-sweep";

// SP-23 ST6-02: Raw upload purge (7-day post-completion cleanup)
import { purgeRawUploads } from "@/lib/inngest/purge-raw-uploads";

// SP-10: D7 Wave 2+ — payment reconciliation + conflict auto-cancel v2
import { paymentReconciliation } from "@/lib/inngest/functions/payment-reconciliation";
import { conflictAutoCancelV2 } from "@/lib/inngest/functions/conflict-auto-cancel";

// SP-11: D7 Wave 5-8 — Stripe health monitor + webhook archival
import { stripeHealthMonitor } from "@/lib/inngest/functions/stripe-health-monitor";
import { webhookArchival } from "@/lib/inngest/functions/webhook-archival";

// SP-22: HOLD checkpoint subsystem — timer cascade (24h → 72h → 7d terminal)
import { hold24hReminder } from "@/lib/inngest/functions/hold-24h-reminder";
import { hold72hEscalation } from "@/lib/inngest/functions/hold-72h-escalation";
import { hold7dTerminalAction } from "@/lib/inngest/functions/hold-7d-terminal-action";
import { holdRecoveryCron } from "@/lib/inngest/functions/hold-recovery-cron";

// SP-21: Checkpoint recovery cron (stuck AWAITING_APPROVAL orders)
import { checkpointRecoveryCron } from "@/lib/inngest/checkpoint-recovery";

// FIX-D: Email queue consumer (reads email_queue → Resend, every 60s)
import { processEmailQueue } from "@/lib/inngest/process-email-queue";

// T-32: Abandoned cart + stale order cleanup (daily cron)
import { abandonedCartCleanup } from "@/lib/inngest/functions/abandoned-cart";

/**
 * Inngest API Route Handler
 *
 * This endpoint serves the Inngest SDK and handles:
 * - Function registration with the Inngest cloud/dev server
 * - Incoming event webhooks
 * - Function execution requests
 *
 * In production, set these environment variables:
 * - INNGEST_EVENT_KEY: For sending events
 * - INNGEST_SIGNING_KEY: For verifying webhook signatures
 */

// All registered Inngest functions — v7.4.4: 21 functions (removed handleGenerationFailure, conflictAutoCancel v1)
const registeredFunctions = [
  // PRIMARY: 14-phase workflow (handles order/submitted, revision-requested, protocol-10-exit)
  generateOrderWorkflow,
  handleWorkflowFailure,
  handleWorkflowTimeout,
  // FN2: CP3 approval lifecycle (checkpoint/cp3.reached → two-stage timeout → delivery)
  workflowCheckpointApproval,
  // SUPPORTING: Deadlines, queue management
  deadlineCheck,
  updateQueuePositions,
  // CONFLICT CHECK: Runs on order/created events
  conflictCheckJob,
  conflictAutoCancelV2,
  // RETENTION: Scheduled cron jobs for data lifecycle
  sendDeletionReminders,
  autoDeleteExpired,
  // ORPHAN SWEEP: Weekly storage cleanup + 180-day archive purge (SP-17 D6)
  orphanSweepCron,
  // RAW UPLOAD PURGE: Daily 7-day post-completion cleanup (SP-23 ST6-02)
  purgeRawUploads,
  // SP-10: Payment reconciliation (daily Stripe-to-Supabase sweep)
  paymentReconciliation,
  // SP-11: Stripe health + webhook archival
  stripeHealthMonitor,
  webhookArchival,
  // SP-22: HOLD timer cascade (24h reminder → 72h escalation → 7d terminal action)
  hold24hReminder,
  hold72hEscalation,
  hold7dTerminalAction,
  holdRecoveryCron,
  // SP-21: Checkpoint recovery (every 6h: recover stuck AWAITING_APPROVAL orders)
  checkpointRecoveryCron,
  // FIX-D: Email queue consumer (every 60s: email_queue → Resend)
  processEmailQueue,
  // T-32: Abandoned cart + stale order cleanup (daily)
  abandonedCartCleanup,
];

// IV-003: Required function registration validator
// If any required function is missing, module throws → Vercel build fails
const REQUIRED_FUNCTION_EXPORTS = [
  { ref: generateOrderWorkflow, name: 'generateOrderWorkflow' },
  { ref: handleWorkflowFailure, name: 'handleWorkflowFailure' },
  { ref: handleWorkflowTimeout, name: 'handleWorkflowTimeout' },
  { ref: workflowCheckpointApproval, name: 'workflowCheckpointApproval' },
  { ref: deadlineCheck, name: 'deadlineCheck' },
  { ref: updateQueuePositions, name: 'updateQueuePositions' },
  { ref: conflictCheckJob, name: 'conflictCheckJob' },
  { ref: conflictAutoCancelV2, name: 'conflictAutoCancelV2' },
  { ref: sendDeletionReminders, name: 'sendDeletionReminders' },
  { ref: autoDeleteExpired, name: 'autoDeleteExpired' },
  { ref: orphanSweepCron, name: 'orphanSweepCron' },
  { ref: purgeRawUploads, name: 'purgeRawUploads' },
  { ref: paymentReconciliation, name: 'paymentReconciliation' },
  { ref: stripeHealthMonitor, name: 'stripeHealthMonitor' },
  { ref: webhookArchival, name: 'webhookArchival' },
  { ref: hold24hReminder, name: 'hold24hReminder' },
  { ref: hold72hEscalation, name: 'hold72hEscalation' },
  { ref: hold7dTerminalAction, name: 'hold7dTerminalAction' },
  { ref: holdRecoveryCron, name: 'holdRecoveryCron' },
  { ref: checkpointRecoveryCron, name: 'checkpointRecoveryCron' },
  { ref: processEmailQueue, name: 'processEmailQueue' },
  { ref: abandonedCartCleanup, name: 'abandonedCartCleanup' },
] as const;

const missingFns = REQUIRED_FUNCTION_EXPORTS.filter(f => !f.ref);
if (missingFns.length > 0) {
  throw new Error(
    `FATAL: Missing Inngest function exports: ${missingFns.map(f => f.name).join(', ')}`
  );
}

const EXPECTED_COUNT = REQUIRED_FUNCTION_EXPORTS.length;
if (registeredFunctions.length !== EXPECTED_COUNT) {
  throw new Error(
    `FATAL: Expected ${EXPECTED_COUNT} Inngest functions, got ${registeredFunctions.length}. ` +
    `Check registeredFunctions array for missing or extra entries.`
  );
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: registeredFunctions,
});
