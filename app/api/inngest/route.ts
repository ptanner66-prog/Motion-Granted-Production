// Vercel Pro Plan: Extended function duration — MUST be before imports for Next.js detection
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// v7.4.1: Explicit imports for reliable function registration
// Primary workflow handler
import { generateOrderWorkflow, handleWorkflowFailure } from "@/lib/inngest/workflow-orchestration";

// Supporting functions
import {
  handleGenerationFailure,
  deadlineCheck,
  updateQueuePositions,
  handleCheckpointApproval,
} from "@/lib/inngest/functions";

// Conflict checking
import { conflictCheckJob } from "@/lib/inngest/conflict-check-job";

// Data retention cron jobs
import { sendDeletionReminders, autoDeleteExpired } from "@/lib/inngest/retention-jobs";

// Orphan sweep + retention purge (SP-17 D6 Phase 6)
import { orphanSweepCron } from "@/lib/inngest/orphan-sweep";

// SP-23 ST6-02: Raw upload purge (7-day post-completion cleanup)
import { purgeRawUploads } from "@/lib/inngest/purge-raw-uploads";

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

// All registered Inngest functions
const registeredFunctions = [
  // PRIMARY: 14-phase workflow (handles order/submitted)
  generateOrderWorkflow,
  handleWorkflowFailure,
  // SUPPORTING: Error handling, deadlines, queue management
  handleGenerationFailure,
  deadlineCheck,
  updateQueuePositions,
  handleCheckpointApproval,
  // CONFLICT CHECK: Runs on order/created events
  conflictCheckJob,
  // RETENTION: Scheduled cron jobs for data lifecycle
  sendDeletionReminders,
  autoDeleteExpired,
  // ORPHAN SWEEP: Weekly storage cleanup + 180-day archive purge (SP-17 D6)
  orphanSweepCron,
  // RAW UPLOAD PURGE: Daily 7-day post-completion cleanup (SP-23 ST6-02)
  purgeRawUploads,
];

// IV-003: Required function registration validator
// If any required function is missing, module throws → Vercel build fails
const REQUIRED_FUNCTION_EXPORTS = [
  { ref: generateOrderWorkflow, name: 'generateOrderWorkflow' },
  { ref: handleWorkflowFailure, name: 'handleWorkflowFailure' },
  { ref: handleGenerationFailure, name: 'handleGenerationFailure' },
  { ref: deadlineCheck, name: 'deadlineCheck' },
  { ref: updateQueuePositions, name: 'updateQueuePositions' },
  { ref: handleCheckpointApproval, name: 'handleCheckpointApproval' },
  { ref: conflictCheckJob, name: 'conflictCheckJob' },
  { ref: sendDeletionReminders, name: 'sendDeletionReminders' },
  { ref: autoDeleteExpired, name: 'autoDeleteExpired' },
  { ref: orphanSweepCron, name: 'orphanSweepCron' },
  { ref: purgeRawUploads, name: 'purgeRawUploads' },
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
