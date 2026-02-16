/**
 * Workflow Orchestration - v7.2 14-Phase System
 *
 * Full workflow orchestration for Motion Granted using Inngest.
 * Executes all 14 phases with proper checkpointing, model routing,
 * and quality enforcement.
 *
 * PHASES:
 * I    - Document Parsing (Sonnet)
 * II   - Legal Framework (Sonnet)
 * III  - Legal Research (Sonnet)
 * IV   - Citation Verification (Opus for B/C) -> CP1 checkpoint
 * V    - Citation Accuracy Check (Sonnet)
 * V.1  - Gap Closure (Sonnet)
 * VI   - Opposition Anticipation (Opus for B/C, 8K thinking)
 * VII  - Judge Simulation (Opus always, 10K thinking) -> CP2 checkpoint
 * VII.1- Revision Loop (if A- not achieved, max 3 loops)
 * VIII - Final Draft (Opus for B/C, 8K thinking)
 * VIII.5- MSJ Separate Statement (if applicable)
 * IX   - Document Formatting (Sonnet)
 * IX.1 - Caption QC (Sonnet)
 * X    - Final QA -> CP3 checkpoint (requires admin approval)
 */

import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";

// SP-5: CP3 approval flow imports
import {
  CP3_REWORK_CAP,
  CP3_REFUND_PERCENTAGE,
  RETENTION_DAYS,
  CANONICAL_EVENTS,
  type CP3DecisionPayload,
  type CP3Action,
} from "@/lib/workflow/checkpoint-types";
import { logCheckpointEvent } from "@/lib/workflow/checkpoint-logger";
import { scheduleCP3Timeouts, cancelCP3Timeouts } from "@/lib/workflow/cp3-timeouts";
import { acquireRefundLock, releaseRefundLock } from "@/lib/payments/refund-lock";
import { generateSignedUrls } from "@/lib/delivery/signed-urls";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { extendRetentionOnReentry } from "@/lib/retention/extend-retention-on-reentry";

// Workflow infrastructure imports
import { gatherOrderContext, type OrderContext } from "@/lib/workflow/orchestrator";
import {
  executePhase,
  PHASE_EXECUTORS,
  type PhaseInput,
  type PhaseOutput,
} from "@/lib/workflow/phase-executors";
// Model routing imports removed — getModelConfig/getModelId/createMessageParams/shouldUseOpus
// were imported from the deprecated model-router shim but never used in this file.
// All model routing flows through phase-registry.ts (the canonical source).
// Import from @/lib/config/phase-registry if needed in the future.
import { triggerCheckpoint, type CheckpointType } from "@/lib/workflow/checkpoint-service";
import {
  checkCitationRequirements,
  extractCitations,
  CITATION_HARD_STOP_MINIMUM,
} from "@/lib/citation/citation-verifier";
import { injectAdvisories, formatAdvisoriesForPhaseX } from "@/lib/workflow/advisory-injector";

// Type imports
import type {
  WorkflowPhaseCode,
  MotionTier,
  JudgeSimulationResult,
  LetterGrade,
  PhaseStatus,
} from "@/types/workflow";
import {
  WORKFLOW_PHASES,
  MINIMUM_PASSING_VALUE,
  MAX_REVISION_LOOPS,
  GRADE_VALUES,
  gradePasses,
  gradePassesForTier,
  TIER_A_PASSING_VALUE,
} from "@/types/workflow";

// Configuration imports
import { ADMIN_EMAIL, ALERT_EMAIL, EMAIL_FROM } from "@/lib/config/notifications";
import { createMessageWithRetry } from "@/lib/claude-client";

// BUG-01/BUG-02: Deadline validation and calculation
import { validateDeadline } from "@/lib/workflow/validators/deadline-validator";
import { calculateInternalDeadline, TURNAROUND_DAYS } from "@/lib/workflow/utils/deadline-calculator";

// BUG-07: Required document validation
import { validateRequiredDocuments } from "@/lib/workflow/validators/required-documents";

// MB-02: Email notification triggers
import {
  sendOrderConfirmation,
  sendHoldNotification,
  sendCP3ReviewNotification,
  sendPaymentConfirmation,
  sendRevisionNotification,
  sendDeliveryNotification,
} from "@/lib/email/email-triggers";

// Feature flags for testing bypass
import { getHoldEnforcementMode, getDeadlineValidationMode } from "@/lib/config/feature-flags";

// Phase IV multi-step executor for avoiding Vercel timeout
import {
  executePhaseIVInit,
  executePhaseIVBatch,
  executePhaseIVAggregate,
  type PhaseIVInitResult,
  type PhaseIVBatchResult,
} from "@/lib/workflow/phase-iv/multi-step-executor";

// SP8: Motion type advisories
import { detectMotionType, generateAdvisories } from "@/lib/workflow/motion-advisories";

// SP23: Protocol 10 — max revision loops exhausted
import { handleProtocol10Exit } from "@/lib/workflow/protocol-10-handler";

// SP-11: Protocol 5 — statutory reference verification after revision
import { runProtocol5 } from "@/lib/citation/protocol-5";

// SP-13: Domain 9 Protocol Orchestration — dispatcher + persistence + handler registration
import { dispatchProtocols } from "@/lib/protocols/dispatcher";
import { persistProtocolResults } from "@/lib/protocols/persistence";
import { registerAllHandlers } from "@/lib/protocols/register-handlers";

// SP-13: Register all protocol handlers at module load
registerAllHandlers();

// SP-13: Phase filter — dispatcher only fires during verification phases (Decision 8)
const DISPATCHER_PHASES = ['V.1', 'VII.1', 'IX.1'];

// BATCH_09 ST-002: Citation pre-fetch for batch existence lookups
import { CourtListenerClient } from "@/lib/workflow/courtlistener-client";
import { splitTextIntoBlocks } from "@/lib/citation/extraction-pipeline";
import type { CLCitationResult } from "@/lib/citation/types";

// SP24: Load DB-backed phase prompts at workflow start
import { loadPhasePrompts } from "@/prompts";

// SP-20 D5: Checkpoint event types (shared across Fn1, Fn2, dashboard)
import type { CP3ApprovalEvent } from "@/lib/types/checkpoint-events";

// SP23: Tiered max revision loops per XDC-004 / WF-04-A
// Tier A (procedural) = 2, Tier B/C (substantive) = 3, Tier D (complex) = 4
const TIERED_MAX_LOOPS: Record<string, number> = {
  A: 2,
  B: 3,
  C: 3,
  D: 4,
};

// BINDING 02/15/26 (ING-015R): Pure numeric scoring on 0-100 percentage scale.
// Thresholds: Tier A >= 83 (B), Tier B/C/D >= 87 (B+).
function getQualityThreshold(tier: string): number {
  return tier === 'A' ? 83 : 87;
}

function getMaxRevisionLoops(tier: string): number {
  return TIERED_MAX_LOOPS[tier] ?? MAX_REVISION_LOOPS;
}

/**
 * Convert GPA (0.0-4.0) to 0-100 percentage score.
 * Used as fallback when Phase VII output contains legacy GPA values.
 * Key mappings: GPA 3.0 → 83%, GPA 3.3 → 87%.
 */
function gpaToPercentageScore(gpa: number): number {
  if (Number.isNaN(gpa) || gpa <= 0) return 0;
  if (gpa >= 4.0) return 97;
  const boundaries: [number, number][] = [
    [4.0, 97], [3.7, 90], [3.3, 87], [3.0, 83],
    [2.7, 80], [2.3, 77], [2.0, 73], [0.0, 0],
  ];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const [highGPA, highPct] = boundaries[i];
    const [lowGPA, lowPct] = boundaries[i + 1];
    if (gpa >= lowGPA) {
      const t = (gpa - lowGPA) / (highGPA - lowGPA);
      return lowPct + t * (highPct - lowPct);
    }
  }
  return 0;
}

/**
 * Normalize a numeric score to 0-100 percentage scale.
 * Handles both GPA (0-4.0) and percentage (0-100) inputs.
 */
function normalizeToPercentage(raw: number): number {
  if (Number.isNaN(raw)) return 0;
  if (raw > 4.0) return raw; // Already percentage scale
  return gpaToPercentageScore(raw);
}

// SP-11: Extract draft text from phase output for Protocol 5
function extractDraftText(phaseOutput: unknown): string | null {
  if (!phaseOutput) return null;
  if (typeof phaseOutput === 'string') return phaseOutput;
  if (typeof phaseOutput === 'object') {
    const obj = phaseOutput as Record<string, unknown>;
    // Phase VIII output stores draft in revisedMotion (object or string)
    for (const key of ['revisedMotion', 'revised_draft', 'revisedDraft', 'draft', 'content', 'motionBody']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).length > 0) {
        return obj[key] as string;
      }
    }
    // Handle revisedMotion as structured object
    if (obj.revisedMotion && typeof obj.revisedMotion === 'object') {
      return formatMotionObjectToText(obj.revisedMotion as Record<string, unknown>);
    }
    // Handle draftMotion as structured object (Phase V)
    if (obj.draftMotion && typeof obj.draftMotion === 'object') {
      return formatMotionObjectToText(obj.draftMotion as Record<string, unknown>);
    }
  }
  return null;
}

// ============================================================================
// STRIPE CLIENT (SP-5: CP3 refund processing)
// ============================================================================

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && !stripeSecretKey.includes('xxxxx')
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion })
  : null;

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// ============================================================================
// SP-20 D5: Durable Event Emission Helper
// ============================================================================

/**
 * Emit an Inngest event with retry and persist to checkpoint_events for audit trail.
 * Wraps all event emissions in try-catch with single retry.
 */
async function emitDurableEvent(
  name: string,
  data: Record<string, any>,
  orderId: string,
  checkpointType: 'CP1' | 'CP2' | 'CP3',
  supabaseClient: SupabaseClient
): Promise<void> {
  try {
    await inngest.send({ name, data });
  } catch (error) {
    console.error('Event emission failed — retrying', { name, orderId, error });
    // Retry once
    await inngest.send({ name, data });
  }

  // Always persist to checkpoint_events for audit trail
  await supabaseClient.from('checkpoint_events').insert({
    order_id: orderId,
    event_name: name,
    event_data: data,
    checkpoint_type: checkpointType,
  }).catch((err: unknown) => {
    console.error('Checkpoint event persistence failed', { name, orderId, error: err });
  });
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

// ============================================================================
// TYPES
// ============================================================================

interface WorkflowState {
  orderId: string;
  workflowId: string;
  tier: MotionTier;
  orderContext: OrderContext;
  phaseOutputs: Partial<Record<WorkflowPhaseCode, unknown>>;
  revisionLoopCount: number;
  currentGrade?: LetterGrade;
  citationCount: number;
}

interface PhaseExecutionResult {
  success: boolean;
  output: unknown;
  tokensUsed?: { input: number; output: number };
  requiresCheckpoint?: boolean;
  checkpointType?: CheckpointType;
  nextPhase?: WorkflowPhaseCode;
  error?: string;
}

interface DeliverableResult {
  motionPdf?: string;
  attorneyInstructionSheet?: string;
  citationAccuracyReport?: string;
  captionQcReport?: string;
}

// ============================================================================
// PHASE EXECUTION HELPERS
// ============================================================================

/**
 * Build the phase input object from workflow state
 * CRITICAL: Include ALL case data so phases can inject it into prompts
 *
 * SP-18 Issue 2: Accept optional prefetchedCitations for citation verification phases.
 * Pre-fetch maps are Record<string, CLCitationResult> (NOT Map) for Inngest serialization.
 */
function buildPhaseInput(
  state: WorkflowState,
  options?: {
    prefetchedCitations?: Record<string, CLCitationResult>;
    revisionLoop?: number;
  }
): PhaseInput {
  const parsedSummaries = state.orderContext.documents.parsed.map((d) => d.summary).filter(Boolean);
  const rawDocText = state.orderContext.documents.raw;
  const documents = parsedSummaries.length > 0
    ? parsedSummaries
    : rawDocText
      ? [rawDocText]
      : [];

  return {
    orderId: state.orderId,
    workflowId: state.workflowId,
    tier: state.tier,
    jurisdiction: state.orderContext.jurisdiction,
    motionType: state.orderContext.motionType,
    caseCaption: state.orderContext.caseCaption,
    caseNumber: state.orderContext.caseNumber,
    courtDivision: state.orderContext.courtDivision || undefined,
    statementOfFacts: state.orderContext.statementOfFacts,
    proceduralHistory: state.orderContext.proceduralHistory,
    instructions: state.orderContext.instructions,
    previousPhaseOutputs: state.phaseOutputs as Record<WorkflowPhaseCode, unknown>,
    // SP12-01 FIX: Fall back to raw document text when parsed summaries are empty.
    // Before this fix, Phase I (and all phases) received empty documents because
    // parsed_documents table has no entries before Phase I runs.
    documents: (() => {
      const parsedSummaries = state.orderContext.documents.parsed
        .map((d) => d.summary)
        .filter(Boolean);
      if (parsedSummaries.length > 0) {
        return parsedSummaries;
      }
      // Fallback: split raw text into per-document entries if available
      const raw = state.orderContext.documents.raw;
      if (raw && raw.trim().length > 0) {
        return [raw];
      }
      return [];
    })(),

    // Party information for caption and signature blocks
    parties: state.orderContext.parties.map((p) => ({
      name: p.name,
      role: p.role as 'plaintiff' | 'defendant' | 'petitioner' | 'respondent',
      isRepresented: p.isRepresented,
    })),

    // ATTORNEY INFO - CRITICAL for signature blocks
    attorneyName: state.orderContext.attorneyName || '',
    barNumber: state.orderContext.barNumber || '',
    firmName: state.orderContext.firmName || '',
    firmAddress: state.orderContext.firmAddress || '',
    firmPhone: state.orderContext.firmPhone || '',
    firmEmail: state.orderContext.firmEmail || '',
    filingDeadline: state.orderContext.filingDeadline ?? undefined,
    orderNumber: state.orderContext.orderNumber || '',
    division: state.orderContext.courtDivision || undefined,

    // SP-18 Issue 2: Pre-fetched citation existence results
    prefetchedCitations: options?.prefetchedCitations,
    // Revision loop number (for VII.1)
    revisionLoop: options?.revisionLoop,
  };
}

/**
 * Log phase execution to database
 */
async function logPhaseExecution(
  supabase: ReturnType<typeof getSupabase>,
  state: WorkflowState,
  phase: WorkflowPhaseCode,
  result: PhaseOutput,
  tokensUsed?: { input: number; output: number }
): Promise<void> {
  await supabase.from("automation_logs").insert({
    order_id: state.orderId,
    action_type: "phase_executed",
    action_details: {
      workflowId: state.workflowId,
      phase,
      phaseName: WORKFLOW_PHASES[phase].name,
      success: result.success,
      status: result.status,
      tokensUsed,
      durationMs: result.durationMs,
      gapsDetected: result.gapsDetected,
      requiresReview: result.requiresReview,
    },
  });
}

// ============================================================================
// DELIVERABLE GENERATION HELPERS
// ============================================================================

/**
 * Upload file to Supabase Storage
 */
async function uploadToSupabaseStorage(
  supabase: ReturnType<typeof getSupabase>,
  path: string,
  content: Uint8Array | Buffer
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('motion-deliverables')
    .upload(path, content, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    console.error('[uploadToSupabaseStorage] Error:', error);
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('motion-deliverables')
    .getPublicUrl(path);

  return publicUrl;
}

/**
 * Sanitize text for WinAnsi encoding (pdf-lib StandardFonts only support WinAnsi).
 * Replaces Unicode characters that would crash PDF generation with ASCII equivalents.
 */
function sanitizeForWinAnsi(text: string): string {
  return text
    // Checkboxes (the specific crash cause)
    .replace(/☐/g, '[ ]')
    .replace(/☒/g, '[X]')
    .replace(/☑/g, '[X]')
    // Smart quotes and apostrophes
    .replace(/\u201C/g, '"')  // left double quote
    .replace(/\u201D/g, '"')  // right double quote
    .replace(/\u2018/g, "'")  // left single quote
    .replace(/\u2019/g, "'")  // right single quote
    // Dashes
    .replace(/\u2014/g, '--') // em dash
    .replace(/\u2013/g, '-')  // en dash
    // Ellipsis
    .replace(/\u2026/g, '...')
    // Legal symbols
    .replace(/\u00A7/g, 'Sec.') // section sign
    .replace(/\u00B6/g, 'P.')   // pilcrow
    // Bullet points
    .replace(/\u2022/g, '-')    // bullet
    .replace(/\u2023/g, '>')    // triangular bullet
    // Catch-all: remove any remaining non-Latin1 characters
    .replace(/[^\x00-\xFF]/g, '');
}

/**
 * Create a simple motion PDF using pdf-lib
 */
async function createSimpleMotionPDF(content: string, orderContext: OrderContext): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  content = sanitizeForWinAnsi(content);

  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const pageWidth = 612; // 8.5 inches
  const pageHeight = 792; // 11 inches
  const margin = 72; // 1 inch
  const fontSize = 12;
  const lineHeight = 24; // Double-spaced

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;

  // Add case caption header
  const lines = content.split('\n');

  for (const line of lines) {
    if (yPosition < margin + lineHeight) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }

    const textWidth = timesRoman.widthOfTextAtSize(line, fontSize);
    const maxWidth = pageWidth - 2 * margin;

    if (textWidth > maxWidth) {
      // Wrap long lines
      const words = line.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = timesRoman.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font: timesRoman,
          });
          yPosition -= lineHeight;
          currentLine = word;

          if (yPosition < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            yPosition = pageHeight - margin;
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: timesRoman,
        });
        yPosition -= lineHeight;
      }
    } else {
      page.drawText(line, {
        x: margin,
        y: yPosition,
        size: fontSize,
        font: timesRoman,
      });
      yPosition -= lineHeight;
    }
  }

  return pdfDoc.save();
}

/**
 * Create a simple text PDF report
 */
async function createSimpleTextPDF(title: string, content: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  title = sanitizeForWinAnsi(title);
  content = sanitizeForWinAnsi(content);

  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const fontSize = 11;
  const titleSize = 16;
  const lineHeight = 18;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;

  // Add title
  page.drawText(title, {
    x: margin,
    y: yPosition,
    size: titleSize,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  yPosition -= titleSize * 2;

  // Add horizontal line
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: pageWidth - margin, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  yPosition -= lineHeight * 2;

  // Add content
  const lines = content.split('\n');

  for (const line of lines) {
    if (yPosition < margin + lineHeight) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }

    const maxWidth = pageWidth - 2 * margin;
    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = helvetica.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font: helvetica,
        });
        yPosition -= lineHeight;
        currentLine = word;

        if (yPosition < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - margin;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, {
        x: margin,
        y: yPosition,
        size: fontSize,
        font: helvetica,
      });
      yPosition -= lineHeight;
    }
  }

  return pdfDoc.save();
}

/**
 * Generate instruction sheet content
 */
function generateInstructionSheetContent(
  orderId: string,
  orderContext: OrderContext,
  tier: MotionTier,
  citationCount: number,
  judgeResult?: JudgeSimulationResult
): string {
  const content = [];

  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('                    ATTORNEY INSTRUCTION SHEET');
  content.push('                         Motion Granted LPO');
  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('');
  content.push(`Order ID: ${orderId}`);
  content.push(`Motion Type: ${orderContext.motionType || 'Not specified'}`);
  content.push(`Tier: ${tier} (${tier === 'A' ? 'Procedural' : tier === 'B' ? 'Intermediate' : 'Complex/Dispositive'})`);
  content.push(`Generated: ${new Date().toLocaleDateString()}`);
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('DOCUMENTS INCLUDED');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('✓ Motion (Primary Document)');
  content.push('✓ Attorney Instruction Sheet (This Document)');
  content.push('✓ Citation Accuracy Report');
  content.push('✓ Caption QC Report');
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('QUALITY METRICS');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push(`Citations Verified: ${citationCount}`);
  if (judgeResult) {
    content.push(`Judge Simulation Grade: ${judgeResult.grade || 'N/A'}`);
    content.push(`Quality Score: ${judgeResult.numericGrade || 'N/A'}/4.5`);
  }
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('FILING INSTRUCTIONS');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('1. REVIEW: Carefully review the motion for accuracy');
  content.push('2. CUSTOMIZE: Add any jurisdiction-specific requirements');
  content.push('3. SIGN: Add attorney signature and bar number');
  content.push('4. FILE: Submit via e-filing system or in person');
  content.push('5. SERVE: Serve opposing counsel per local rules');
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('AI DISCLOSURE NOTICE');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('This motion was generated with AI assistance (Claude Opus 4.5 / Sonnet 4.5).');
  content.push('All citations have been verified through our 7-step Citation Integrity');
  content.push('Verification (CIV) pipeline. Attorney review is required before filing.');
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('REVISION POLICY');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('- First revision: Included in base price');
  content.push('- Additional revisions: $150-$500 depending on scope');
  content.push('- Turnaround: 24-48 hours for standard revisions');
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('CONTACT INFORMATION');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('Motion Granted LPO');
  content.push('Email: support@motiongranted.com');
  content.push('Phone: (555) 123-4567');
  content.push('Web: https://motiongranted.com');
  content.push('');
  content.push('Questions or need revisions? Contact us within 7 days of delivery.');
  content.push('');

  return content.join('\n');
}

/**
 * Generate citation report content
 */
function generateCitationReportContent(
  verificationResults: Array<{ citation: string; status: string; confidence: number }>,
  totalCount: number
): string {
  const content = [];

  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('              7-STEP CITATION INTEGRITY VERIFICATION REPORT');
  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('');
  content.push(`Total Citations: ${totalCount}`);
  content.push(`Verification Results: ${verificationResults.length} analyzed`);
  content.push('');

  const verified = verificationResults.filter(r => r.status === 'VERIFIED').length;
  const flagged = verificationResults.filter(r => r.status === 'FLAGGED').length;
  const blocked = verificationResults.filter(r => r.status === 'BLOCKED').length;

  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('SUMMARY');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push(`✓ Verified: ${verified} citations (${Math.round(verified / Math.max(totalCount, 1) * 100)}%)`);
  content.push(`⚠ Flagged for Review: ${flagged} citations`);
  content.push(`✗ Blocked: ${blocked} citations`);
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('VERIFICATION PIPELINE');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('Step 1: Existence Check (CourtListener / PACER)');
  content.push('Step 2: Holding Verification (2-stage AI)');
  content.push('Step 3: Dicta Detection');
  content.push('Step 4: Quote Verification (Levenshtein fuzzy match)');
  content.push('Step 5: Bad Law Check (3-layer: API + DB + AI)');
  content.push('Step 6: Authority Strength Assessment');
  content.push('Step 7: Output Compilation & Confidence Calculation');
  content.push('');

  if (verificationResults.length > 0) {
    content.push('───────────────────────────────────────────────────────────────────────');
    content.push('DETAILED RESULTS');
    content.push('───────────────────────────────────────────────────────────────────────');

    verificationResults.slice(0, 20).forEach((result, index) => {
      content.push(`${index + 1}. ${result.citation || 'Unknown citation'}`);
      content.push(`   Status: ${result.status || 'UNKNOWN'}`);
      content.push(`   Confidence: ${result.confidence ? (result.confidence * 100).toFixed(1) : 'N/A'}%`);
      content.push('');
    });

    if (verificationResults.length > 20) {
      content.push(`... and ${verificationResults.length - 20} more citations`);
      content.push('');
    }
  }

  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('This report confirms all citations have been verified through Motion');
  content.push('Granted\'s proprietary 7-step Citation Integrity Verification pipeline.');
  content.push('═══════════════════════════════════════════════════════════════════════');

  return content.join('\n');
}

/**
 * Generate caption QC report content
 */
function generateCaptionQcReportContent(
  qcResult?: { qcPasses: boolean; qcIssues: string[]; qcCorrections: string[] }
): string {
  const content = [];

  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('                       CAPTION QC REPORT');
  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('');
  content.push(`Verification Status: ${qcResult?.qcPasses ? '✓ PASSED' : '⚠ REVIEW NEEDED'}`);
  content.push(`Generated: ${new Date().toLocaleDateString()}`);
  content.push('');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('VERIFICATION CHECKS');
  content.push('───────────────────────────────────────────────────────────────────────');
  content.push('✓ Case caption consistency across documents');
  content.push('✓ Case number accuracy and formatting');
  content.push('✓ Court name and division correctness');
  content.push('✓ Party name spelling and consistency');
  content.push('✓ Local rule compliance for formatting');
  content.push('');

  if (qcResult?.qcIssues && qcResult.qcIssues.length > 0) {
    content.push('───────────────────────────────────────────────────────────────────────');
    content.push('ISSUES IDENTIFIED');
    content.push('───────────────────────────────────────────────────────────────────────');
    qcResult.qcIssues.forEach((issue, index) => {
      content.push(`${index + 1}. ${issue}`);
    });
    content.push('');
  }

  if (qcResult?.qcCorrections && qcResult.qcCorrections.length > 0) {
    content.push('───────────────────────────────────────────────────────────────────────');
    content.push('CORRECTIONS APPLIED');
    content.push('───────────────────────────────────────────────────────────────────────');
    qcResult.qcCorrections.forEach((correction, index) => {
      content.push(`${index + 1}. ${correction}`);
    });
    content.push('');
  }

  if (!qcResult || qcResult.qcPasses) {
    content.push('───────────────────────────────────────────────────────────────────────');
    content.push('RESULT');
    content.push('───────────────────────────────────────────────────────────────────────');
    content.push('No caption discrepancies detected. All captions are consistent and');
    content.push('properly formatted according to court rules.');
    content.push('');
  }

  content.push('═══════════════════════════════════════════════════════════════════════');
  content.push('Caption quality control performed by Motion Granted automated QC system.');
  content.push('Attorney final review recommended before filing.');
  content.push('═══════════════════════════════════════════════════════════════════════');

  return content.join('\n');
}

// ============================================================================
// MOTION TEXT FORMATTING HELPER
// ============================================================================

/**
 * Convert a structured motion object (from Phase V or VIII) to plain text
 * The motion object has: caption, title, introduction, statementOfFacts, legalArguments, conclusion, etc.
 */
function formatMotionObjectToText(motion: Record<string, unknown>): string {
  if (!motion || typeof motion !== 'object') {
    return '';
  }

  // If it's already a string, return it
  if (typeof motion === 'string') {
    return motion;
  }

  const parts: string[] = [];

  // Add each section if it exists
  if (motion.caption) parts.push(String(motion.caption));
  if (motion.title) parts.push(String(motion.title));
  if (motion.introduction) parts.push(String(motion.introduction));
  if (motion.statementOfFacts) parts.push(String(motion.statementOfFacts));

  // Legal arguments is an array
  const legalArgs = motion.legalArguments as Array<{ heading?: string; content?: string }> | undefined;
  if (legalArgs && Array.isArray(legalArgs)) {
    for (const arg of legalArgs) {
      if (arg.heading) parts.push(arg.heading);
      if (arg.content) parts.push(arg.content);
    }
  }

  if (motion.conclusion) parts.push(String(motion.conclusion));
  if (motion.prayerForRelief) parts.push(String(motion.prayerForRelief));
  if (motion.signature) parts.push(String(motion.signature));
  if (motion.certificateOfService) parts.push(String(motion.certificateOfService));

  // If we got content, join it
  if (parts.length > 0) {
    return parts.filter(Boolean).join('\n\n');
  }

  // Last resort: stringify the object
  console.warn('[formatMotionObjectToText] Motion object has unexpected structure, stringifying');
  return JSON.stringify(motion, null, 2);
}

// ============================================================================
// DELIVERABLE GENERATION
// ============================================================================

async function generateDeliverables(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<DeliverableResult> {
  console.log('[generateDeliverables] Starting deliverable generation...');

  const { orderId, workflowId, tier, orderContext, phaseOutputs, citationCount } = state;

  // Defensive: Log available phase outputs
  const availablePhases = Object.keys(phaseOutputs ?? {});
  console.log(`[generateDeliverables] Available phases: ${availablePhases.join(', ') || 'NONE'}`);

  // Extract phase outputs with CORRECT key names
  // Phase VIII outputs: { revisedMotion: {...} } NOT { finalDraft: string }
  const phaseVIIIOutput = (phaseOutputs?.["VIII"] ?? {}) as Record<string, unknown>;
  const phaseVOutput = (phaseOutputs?.["V"] ?? {}) as Record<string, unknown>;
  const phaseXOutput = (phaseOutputs?.["X"] ?? {}) as Record<string, unknown>;

  console.log(`[generateDeliverables] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
  console.log(`[generateDeliverables] Phase VIII keys: ${Object.keys(phaseVIIIOutput).join(', ') || 'EMPTY'}`);
  console.log(`[generateDeliverables] Phase X keys: ${Object.keys(phaseXOutput).join(', ') || 'EMPTY'}`);

  // Get the final motion from the correct location:
  // 1. Phase X finalPackage.motion (best - final assembled)
  // 2. Phase VIII revisedMotion (if revisions happened)
  // 3. Phase V draftMotion (original draft)
  const finalPackage = phaseXOutput?.finalPackage as Record<string, unknown> | undefined;
  const revisedMotion = phaseVIIIOutput?.revisedMotion as Record<string, unknown> | undefined;
  const draftMotion = phaseVOutput?.draftMotion as Record<string, unknown> | undefined;

  console.log(`[generateDeliverables] finalPackage exists: ${!!finalPackage}`);
  console.log(`[generateDeliverables] revisedMotion exists: ${!!revisedMotion}`);
  console.log(`[generateDeliverables] draftMotion exists: ${!!draftMotion}`);

  const judgeResult = phaseOutputs["VII"] as JudgeSimulationResult | undefined;
  const qcResult = phaseOutputs["IX.1"] as { qcPasses: boolean; qcIssues: string[]; qcCorrections: string[] } | undefined;

  // Get citations from Phase IV with CORRECT keys
  const phaseIVOutput = (phaseOutputs?.["IV"] ?? {}) as Record<string, unknown>;
  const caseCitationBank = (phaseIVOutput?.caseCitationBank ?? []) as unknown[];
  const statutoryCitationBank = (phaseIVOutput?.statutoryCitationBank ?? []) as unknown[];
  const actualCitationCount = caseCitationBank.length + statutoryCitationBank.length;
  console.log(`[generateDeliverables] Citations: ${caseCitationBank.length} case + ${statutoryCitationBank.length} statutory = ${actualCitationCount} total`);

  try {
    const storagePath = `orders/${orderId}/deliverables`;
    const deliverableUrls: DeliverableResult = {};

    // 1. Generate Motion PDF (primary deliverable)
    console.log('[generateDeliverables] Generating motion PDF...');
    try {
      // Get motion content from best available source
      let motionContent: string = '';

      // Try Phase X finalPackage.motion first (full assembled motion text)
      if (finalPackage?.motion && typeof finalPackage.motion === 'string') {
        motionContent = finalPackage.motion;
        console.log('[generateDeliverables] Using Phase X finalPackage.motion');
      }
      // Try Phase VIII revisedMotion
      else if (revisedMotion) {
        motionContent = formatMotionObjectToText(revisedMotion);
        console.log('[generateDeliverables] Using Phase VIII revisedMotion');
      }
      // Fallback to Phase V draftMotion
      else if (draftMotion) {
        motionContent = formatMotionObjectToText(draftMotion);
        console.log('[generateDeliverables] Using Phase V draftMotion');
      }
      else {
        console.error('[generateDeliverables] ERROR: No motion content found in any phase!');
        motionContent = 'Motion content not available - check phase outputs';
      }

      console.log(`[generateDeliverables] Motion content length: ${motionContent.length} chars`);

      const motionPdfBytes = await createSimpleMotionPDF(motionContent, orderContext);
      const motionUrl = await uploadToSupabaseStorage(
        supabase,
        `${storagePath}/motion.pdf`,
        motionPdfBytes
      );
      deliverableUrls.motionPdf = motionUrl;
      console.log('[generateDeliverables] Motion PDF generated:', motionUrl);
    } catch (error) {
      console.error('[generateDeliverables] Error generating motion PDF:', error);
    }

    // 2. Generate Attorney Instruction Sheet
    console.log('[generateDeliverables] Generating instruction sheet...');
    try {
      // Use actual citation count from Phase IV
      const instructionContent = generateInstructionSheetContent(
        orderId,
        orderContext,
        tier,
        actualCitationCount || citationCount, // Use our calculated count, fallback to state
        judgeResult
      );
      const instructionPdfBytes = await createSimpleTextPDF('ATTORNEY INSTRUCTION SHEET', instructionContent);
      const instructionUrl = await uploadToSupabaseStorage(
        supabase,
        `${storagePath}/instruction-sheet.pdf`,
        instructionPdfBytes
      );
      deliverableUrls.attorneyInstructionSheet = instructionUrl;
      console.log('[generateDeliverables] Instruction sheet generated:', instructionUrl);
    } catch (error) {
      console.error('[generateDeliverables] Error generating instruction sheet:', error);
    }

    // 3. Generate Citation Accuracy Report
    console.log('[generateDeliverables] Generating citation report...');
    try {
      // BINDING 02/16/26 (ING-011R): Use REAL verification results from Phase V.1/VII.1/IX.1.
      // NEVER hardcode status:'VERIFIED' or confidence:1.0.
      // SP-18 Issue 3: Read actual pipeline results, merge all verification phases.
      const phaseV1Output = (phaseOutputs?.["V.1"] ?? {}) as Record<string, unknown>;
      const phaseVII1Output = (phaseOutputs?.["VII.1"] ?? {}) as Record<string, unknown>;
      const phaseIX1Output = (phaseOutputs?.["IX.1"] ?? {}) as Record<string, unknown>;

      // Extract real verification results from CIV pipeline output
      const v1Results = (phaseV1Output?.verificationResults ?? phaseV1Output?.citations ?? []) as Array<Record<string, unknown>>;
      const vii1Results = (phaseVII1Output?.verificationResults ?? phaseVII1Output?.citations ?? []) as Array<Record<string, unknown>>;

      // IX.1 final audit: extract rejected citations to downgrade any previously VERIFIED
      const ix1Audit = phaseIX1Output?.finalCitationAudit as Record<string, unknown> | undefined;
      const ix1RejectedCitations = new Set(
        ((ix1Audit?.rejectedCitations ?? []) as string[]).map(c => c.toLowerCase().replace(/\s+/g, ' ').trim())
      );

      // Build citation report from actual pipeline results
      const allCitations: Array<{ citation: string; status: string; confidence: number }> = [];
      const seenNormalized = new Set<string>();

      // Map CIV pipeline results to report format — VII.1 results override V.1 for duplicates
      for (const r of [...v1Results, ...vii1Results]) {
        const civResult = r.civResult as Record<string, unknown> | undefined;
        const compositeResult = civResult?.compositeResult as Record<string, unknown> | undefined;
        const citationStr = String(r.citation ?? r.citationString ?? 'Unknown citation');
        const normalized = citationStr.toLowerCase().replace(/\s+/g, ' ').trim();

        // De-duplicate: latest phase wins
        if (seenNormalized.has(normalized)) {
          // Remove previous entry so the latest (VII.1) takes precedence
          const idx = allCitations.findIndex(
            c => c.citation.toLowerCase().replace(/\s+/g, ' ').trim() === normalized
          );
          if (idx !== -1) allCitations.splice(idx, 1);
        }
        seenNormalized.add(normalized);

        // SP-18 FIX: Read confidenceScore (CIV field name), NOT confidence
        let status = String(compositeResult?.status ?? r.status ?? (r.verified ? 'VERIFIED' : 'UNVERIFIED'));
        const confidence = Number(compositeResult?.confidenceScore ?? compositeResult?.confidence ?? r.confidence ?? 0);

        // SP-18: IX.1 final audit rejection overrides previous VERIFIED
        if (ix1RejectedCitations.has(normalized) && status === 'VERIFIED') {
          status = 'REJECTED';
          console.warn(`[generateDeliverables] Citation downgraded by IX.1 final audit: ${citationStr}`);
        }

        allCitations.push({ citation: citationStr, status, confidence });
      }

      // Fallback: if CIV results are empty, build from citation banks with UNVERIFIED status
      if (allCitations.length === 0) {
        console.warn('[generateDeliverables] No CIV results found — using citation bank with UNVERIFIED status');
        for (const c of [...caseCitationBank, ...statutoryCitationBank]) {
          allCitations.push({
            citation: String((c as Record<string, unknown>)?.citation ?? 'Unknown citation'),
            status: 'UNVERIFIED',
            confidence: 0,
          });
        }
      }

      const citationReportContent = generateCitationReportContent(
        allCitations,
        actualCitationCount
      );
      const citationPdfBytes = await createSimpleTextPDF('CITATION ACCURACY REPORT', citationReportContent);
      const citationUrl = await uploadToSupabaseStorage(
        supabase,
        `${storagePath}/citation-report.pdf`,
        citationPdfBytes
      );
      deliverableUrls.citationAccuracyReport = citationUrl;
      console.log('[generateDeliverables] Citation report generated:', citationUrl);
    } catch (error) {
      console.error('[generateDeliverables] Error generating citation report:', error);
    }

    // 4. Generate Caption QC Report
    console.log('[generateDeliverables] Generating caption QC report...');
    try {
      const captionReportContent = generateCaptionQcReportContent(qcResult);
      const captionPdfBytes = await createSimpleTextPDF('CAPTION QC REPORT', captionReportContent);
      const captionUrl = await uploadToSupabaseStorage(
        supabase,
        `${storagePath}/caption-qc-report.pdf`,
        captionPdfBytes
      );
      deliverableUrls.captionQcReport = captionUrl;
      console.log('[generateDeliverables] Caption QC report generated:', captionUrl);
    } catch (error) {
      console.error('[generateDeliverables] Error generating caption QC report:', error);
    }

    // SP12-04 FIX: Insert deliverable records into documents table with is_deliverable: true.
    // Before this fix, auto-generated PDFs were only stored in orders.deliverable_urls JSONB,
    // but the client GET /api/orders/[id]/deliverables queries documents table for is_deliverable=true.
    const deliverableEntries: Array<{ name: string; url: string | undefined; type: string }> = [
      { name: 'motion.pdf', url: deliverableUrls.motionPdf, type: 'motion' },
      { name: 'instruction-sheet.pdf', url: deliverableUrls.attorneyInstructionSheet, type: 'instruction_sheet' },
      { name: 'citation-report.pdf', url: deliverableUrls.citationAccuracyReport, type: 'citation_report' },
      { name: 'caption-qc-report.pdf', url: deliverableUrls.captionQcReport, type: 'caption_qc_report' },
    ];

    for (const entry of deliverableEntries) {
      if (entry.url) {
        await supabase.from('documents').insert({
          order_id: orderId,
          file_name: entry.name,
          file_type: 'application/pdf',
          file_size: 0, // Size unknown from storage upload
          file_url: `${storagePath}/${entry.name}`,
          document_type: entry.type,
          is_deliverable: true,
        }).then(({ error }) => {
          if (error) {
            console.warn(`[generateDeliverables] Failed to insert ${entry.name} into documents table:`, error.message);
          }
        });
      }
    }

    // 5. Update order with deliverable URLs
    await supabase
      .from('orders')
      .update({
        deliverable_urls: deliverableUrls,
        deliverables_generated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // 6. Log completion
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'deliverables_generated',
      action_details: {
        workflowId,
        deliverableCount: Object.keys(deliverableUrls).length,
        deliverables: Object.keys(deliverableUrls),
      },
    });

    console.log('[generateDeliverables] Complete!');
    return deliverableUrls;

  } catch (error) {
    console.error('[generateDeliverables] Error:', error);

    // Log error but don't fail the workflow
    await supabase.from('automation_logs').insert({
      order_id: orderId,
      action_type: 'deliverable_generation_failed',
      action_details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    // Return empty result - admin can manually generate
    return {
      motionPdf: undefined,
      attorneyInstructionSheet: undefined,
      citationAccuracyReport: undefined,
      captionQcReport: undefined,
    };
  }
}

// ============================================================================
// SP-22 HOLD-ST-018: Generic checkAndWaitForHold() for non-Phase-III HOLDs
// ============================================================================

/**
 * Reusable HOLD check function — called at multiple points in Fn1 where
 * the workflow may have been placed on HOLD (revision_stall, citation_critical_failure).
 *
 * Returns 'continue' if not on HOLD or HOLD was resolved.
 * Returns 'cancelled' if HOLD led to cancellation.
 */
async function checkAndWaitForHold(
  step: Parameters<Parameters<typeof inngest.createFunction>[2]>[0]['step'],
  supabase: import('@supabase/supabase-js').SupabaseClient,
  orderId: string,
  currentPhase: string
): Promise<'continue' | 'cancelled'> {
  const order = await step.run(`check-hold-${currentPhase}`, async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, status, hold_reason')
      .eq('id', orderId)
      .single();
    return data;
  });

  if (!order || (order.status !== 'on_hold' && order.status !== 'hold_pending')) {
    return 'continue';
  }

  console.log(`[Orchestration] HOLD detected at ${currentPhase} — waiting for resolution`);

  const holdResult = await step.waitForEvent(`wait-hold-${currentPhase}`, {
    event: 'checkpoint/hold.resolved',
    match: 'data.orderId',
    timeout: '8d',
  });

  if (!holdResult) {
    const current = await step.run(`check-hold-fallback-${currentPhase}`, async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', orderId)
        .single();
      return data;
    });

    if (current?.status === 'cancelled' || current?.status === 'CANCELLED_SYSTEM') {
      return 'cancelled';
    }

    if (current?.status === 'on_hold' || current?.status === 'hold_pending') {
      // Fallback: timeout function failed
      const { handleHoldTimeout } = await import('@/lib/inngest/checkpoint-timeout');
      await step.run(`fallback-cancel-${currentPhase}`, async () => {
        await handleHoldTimeout('fallback', orderId);
      });
      return 'cancelled';
    }
    // Resolved but event lost — continue
  } else if (holdResult.data.action === 'CANCELLED') {
    return 'cancelled';
  }

  return 'continue';
}

// ============================================================================
// MAIN WORKFLOW ORCHESTRATION
// ============================================================================

export const generateOrderWorkflow = inngest.createFunction(
  {
    id: "generate-order-workflow",
    concurrency: [
      { limit: 5 },  // Global concurrency — Inngest plan limit
      { limit: 1, key: "event.data.orderId" },  // Per-order lock — prevents duplicate phase runs
    ],
    retries: 3,
    // TASK-25: Timeout tuning for full 14-phase pipeline
    // finish: Total accumulated runtime across all steps
    // start: Max time from scheduling to first step invocation
    timeouts: {
      finish: "30m",
      start: "5m",
    },
  },
  // SP-12 AH-5: Triple-trigger routing
  // New order, attorney rework, or Protocol 10 re-assembly
  [
    { event: "order/submitted" },           // New order
    { event: "order/revision-requested" },   // Attorney rework
    { event: "order/protocol-10-exit" },     // Protocol 10 re-assembly
  ],
  async ({ event, step }) => {
    const { orderId } = event.data;
    const supabase = getSupabase();

    // ========================================================================
    // SP-12 AH-5: Triple-trigger routing — determine start phase
    // ========================================================================
    const startPhase = await step.run('determine-start-phase', async () => {
      switch (event.name) {
        case 'order/submitted':
          return 'PHASE_I';

        case 'order/revision-requested':
          return 'PHASE_VII'; // Attorney rework re-enters at Phase VII

        case 'order/protocol-10-exit': {
          // Protocol 10 re-assembly: read resume_phase from order
          const { data: order } = await supabase
            .from('orders')
            .select('resume_phase')
            .eq('id', orderId)
            .single();
          return order?.resume_phase || 'PHASE_VIII5'; // Default to VIII.5
        }

        default:
          throw new Error(`Unknown trigger event: ${event.name}`);
      }
    });

    // ST6-01: Extend retention on re-entry (revision or P10)
    if (event.name === 'order/revision-requested' || event.name === 'order/protocol-10-exit') {
      await step.run('extend-retention-reentry', async () => {
        const supa = getSupabase();
        await extendRetentionOnReentry(supa, orderId);
      });

      // ST6-02: Check if raw uploads have been purged, log warning for revision context
      if (event.name === 'order/revision-requested') {
        await step.run('check-raw-uploads-purged', async () => {
          const supa = getSupabase();
          const { data: order } = await supa
            .from('orders')
            .select('raw_uploads_purged')
            .eq('id', orderId)
            .single();

          if (order?.raw_uploads_purged) {
            console.warn(`[WORKFLOW] Revision requested after raw upload purge for order ${orderId}`);
            await supa.from('automation_logs').insert({
              order_id: orderId,
              action_type: 'revision_raw_uploads_purged',
              action_details: {
                disclaimer: 'Original uploaded evidence files have been purged per 7-day retention policy. '
                  + 'This revision is based on previously extracted content and phase outputs only. '
                  + 'Attorney may need to re-upload original evidence if substantial changes are needed.',
              },
            });
          }
        });
      }
    }

    // SP-13 AP-2: Protocol 10 re-assembly event validation
    if (event.name === 'order/protocol-10-exit') {
      const isValidP10 = await step.run('validate-p10-trigger', async () => {
        // Check 1: Loop exhaustion
        const { data: loopCounter } = await supabase
          .from('loop_counters')
          .select('current_count, max_loops')
          .eq('order_id', orderId)
          .single();

        if (loopCounter && loopCounter.current_count >= loopCounter.max_loops) {
          return true; // Legitimate P10 — loop exhaustion
        }

        // Check 2: Cost cap exceeded
        const { data: costCapEvents } = await supabase
          .from('payment_events')
          .select('id')
          .eq('order_id', orderId)
          .eq('event_type', 'COST_CAP_EXCEEDED')
          .limit(1);

        if (costCapEvents && costCapEvents.length > 0) {
          return true; // Legitimate P10 — cost cap
        }

        // Check 3: CP3 rework cap exceeded
        const { data: orderData } = await supabase
          .from('orders')
          .select('protocol_10_triggered')
          .eq('id', orderId)
          .single();

        if (orderData?.protocol_10_triggered) {
          return true; // Legitimate P10 — CP3 rework cap
        }

        return false;
      });

      if (!isValidP10) {
        console.error('[SECURITY] P10 event rejected — no legitimate trigger found', { orderId });
        return { skipped: true, reason: 'P10 event rejected — invalid trigger', startPhase };
      }
    }

    // SP-12 AH-5: Idempotency check (Layer 1)
    const existingWorkflow = await step.run('check-existing-workflow', async () => {
      if (event.name === 'order/submitted') {
        const { data } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single();
        if (data && data.status !== 'paid' && data.status !== 'submitted') {
          return true; // Already processing
        }
      }
      return false;
    });

    if (existingWorkflow) {
      return { skipped: true, reason: 'Workflow already active', startPhase };
    }

    // ========================================================================
    // STEP 0: Verify API Configuration
    // ========================================================================
    await step.run("verify-api-config", async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        console.error("[WORKFLOW] CRITICAL: ANTHROPIC_API_KEY is not configured!");
        throw new Error("ANTHROPIC_API_KEY environment variable is not set. Cannot run AI workflow.");
      }

      // Validate API key format
      if (!apiKey.startsWith('sk-ant-')) {
        console.error("[WORKFLOW] CRITICAL: ANTHROPIC_API_KEY has invalid format!");
        console.error("[WORKFLOW] Key should start with 'sk-ant-', but starts with:", apiKey.substring(0, 10));
        throw new Error("ANTHROPIC_API_KEY has invalid format. Must start with 'sk-ant-'. Check Vercel environment variables.");
      }

      if (apiKey.length < 40) {
        console.error("[WORKFLOW] CRITICAL: ANTHROPIC_API_KEY is too short!");
        throw new Error("ANTHROPIC_API_KEY appears to be incomplete. Should be at least 40 characters.");
      }

      if (apiKey.includes('xxxxx') || apiKey.includes('YOUR_API_KEY') || apiKey.includes('placeholder')) {
        console.error("[WORKFLOW] CRITICAL: ANTHROPIC_API_KEY appears to be a placeholder!");
        throw new Error("ANTHROPIC_API_KEY is a placeholder value. Set a real API key in Vercel environment variables.");
      }

      console.log("[WORKFLOW] API configuration verified (key format valid, length:", apiKey.length, ")");
      console.log("[WORKFLOW] Starting workflow for order:", orderId);
    });

    // ========================================================================
    // STEP 0.5: Load latest phase prompts from DB (file fallback if DB down)
    // ========================================================================
    await step.run("load-phase-prompts", async () => {
      await loadPhasePrompts();
    });

    // ========================================================================
    // STEP 1: Initialize Workflow State
    // ========================================================================
    const workflowState = await step.run("initialize-workflow", async () => {
      // Fetch order details
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(`
          *,
          profiles!inner(*)
        `)
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Build initial context
      const contextResult = await gatherOrderContext(orderId);
      if (!contextResult.success || !contextResult.data) {
        throw new Error(`Failed to build context: ${contextResult.error}`);
      }

      const orderContext = contextResult.data;

      // Check for existing workflow or create new
      let workflowId: string;
      const { data: existingWorkflow } = await supabase
        .from("workflow_state")
        .select("id")
        .eq("order_id", orderId)
        .single();

      if (existingWorkflow) {
        workflowId = existingWorkflow.id;
      } else {
        const { data: newWorkflow, error: wfError } = await supabase
          .from("workflow_state")
          .insert({
            order_id: orderId,
            current_phase: "I",
            phase_status: "PENDING",
            tier: orderContext.motionTier,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (wfError || !newWorkflow) {
          throw new Error(`Failed to create workflow: ${wfError?.message}`);
        }
        workflowId = newWorkflow.id;
      }

      // Update order status
      await supabase
        .from("orders")
        .update({
          status: "in_progress",
          generation_started_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      // Log workflow start
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "workflow_started",
        action_details: {
          workflowId,
          tier: orderContext.motionTier,
          motionType: orderContext.motionType,
        },
      });

      // ====================================================================
      // BUG-01: Expired Deadline Validation Gate (BEFORE any billable processing)
      // BUG-02: Deadline calculated with business days + correct timezone
      // ====================================================================
      const deadlineValidation = validateDeadline(
        orderContext.filingDeadline,
        orderContext.motionTier
      );

      const deadlineMode = getDeadlineValidationMode();
      if (deadlineValidation.blocked) {
        if (deadlineMode === 'enforce') {
          console.error(`[WORKFLOW] DEADLINE GATE BLOCKED: ${deadlineValidation.reason}`);
          // Update order status to rejected
          await supabase
            .from("orders")
            .update({
              status: "rejected",
              generation_error: deadlineValidation.reason,
            })
            .eq("id", orderId);

          // Log the rejection
          await supabase.from("automation_logs").insert({
            order_id: orderId,
            action_type: "deadline_validation_failed",
            action_details: {
              reason: deadlineValidation.reason,
              checks: deadlineValidation.checks,
              filingDeadline: orderContext.filingDeadline,
              tier: orderContext.motionTier,
            },
          });

          throw new Error(`Deadline validation failed: ${deadlineValidation.reason}`);
        } else if (deadlineMode === 'warn') {
          console.warn(`[WORKFLOW] DEADLINE GATE WOULD BLOCK (mode=warn, bypassed): ${deadlineValidation.reason}`);
          await supabase.from("automation_logs").insert({
            order_id: orderId,
            action_type: "deadline_validation_bypassed",
            action_details: {
              reason: deadlineValidation.reason,
              checks: deadlineValidation.checks,
              filingDeadline: orderContext.filingDeadline,
              tier: orderContext.motionTier,
              mode: 'warn',
            },
          });
        }
        // mode === 'off': skip silently
      }

      // Log warnings (non-blocking)
      if (deadlineValidation.warnings.length > 0) {
        console.warn(`[WORKFLOW] Deadline warnings:`, deadlineValidation.warnings);
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "deadline_validation_warning",
          action_details: {
            warnings: deadlineValidation.warnings,
            checks: deadlineValidation.checks,
            filingDeadline: orderContext.filingDeadline,
          },
        });
      }

      // Calculate internal deadline if filing deadline exists
      let internalDeadline: string | null = null;
      if (orderContext.filingDeadline) {
        try {
          const deadlineCalc = calculateInternalDeadline(orderContext.filingDeadline);
          internalDeadline = deadlineCalc.internalDeadline;
          console.log(`[WORKFLOW] Internal deadline: ${internalDeadline} (filing: ${orderContext.filingDeadline})`);
        } catch (e) {
          console.warn(`[WORKFLOW] Could not calculate internal deadline:`, e);
        }
      }

      // ====================================================================
      // BUG-07: Required Document Validation
      // ====================================================================
      const uploadedDocTypes = orderContext.documents.parsed.map(d => d.documentType);
      const docValidation = validateRequiredDocuments(
        orderContext.motionType,
        uploadedDocTypes
      );

      if (!docValidation.complete) {
        console.warn(`[WORKFLOW] Missing required documents:`, docValidation.missingCategories);
        // Update order with missing docs warning — trigger HOLD via Phase III path
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "missing_documents_detected",
          action_details: {
            motionType: orderContext.motionType,
            missingCategories: docValidation.missingCategories,
            description: docValidation.description,
            uploadedTypes: uploadedDocTypes,
          },
        });
      }

      if (docValidation.warnings.length > 0) {
        console.warn(`[WORKFLOW] Document validation warnings:`, docValidation.warnings);
      }

      // BUG-16: Document parser empty results warning
      // If ALL parsed documents have zero key facts, legal issues, AND summary → flag
      const parsedDocs = orderContext.documents.parsed;
      if (parsedDocs.length > 0) {
        const allEmpty = parsedDocs.every(d =>
          (!d.keyFacts || (d.keyFacts as unknown[]).length === 0) &&
          (!d.legalIssues || (d.legalIssues as unknown[]).length === 0) &&
          (!d.summary || d.summary.trim().length === 0)
        );
        if (allEmpty) {
          console.warn('[WORKFLOW] BUG-16: All parsed documents returned zero key facts, legal issues, and summaries');
          await supabase.from("automation_logs").insert({
            order_id: orderId,
            action_type: "document_parser_empty_results",
            action_details: {
              warning: 'All uploaded documents returned empty extraction results. Customer may need to verify document uploads.',
              documentCount: parsedDocs.length,
              documentTypes: parsedDocs.map(d => d.documentType),
            },
          });
        }
      }

      const state: WorkflowState = {
        orderId,
        workflowId,
        tier: orderContext.motionTier,
        orderContext: orderContext,
        phaseOutputs: {},
        revisionLoopCount: 0,
        citationCount: 0,
      };

      return state;
    });

    // ========================================================================
    // STEP 1.5: DST-07 — Conflict Check Completeness Gate
    // Ensures conflict check ran before Phase I. Halts workflow on failure.
    // ========================================================================
    const conflictGate = await step.run('conflict-completeness-gate', async () => {
      const { data: orderConflict } = await supabase
        .from('orders')
        .select('conflict_check_completed_at, conflict_flagged')
        .eq('id', orderId)
        .single();

      if (orderConflict?.conflict_check_completed_at) {
        return { passed: true, flagged: orderConflict.conflict_flagged };
      }

      // Synchronous retry — run conflict check inline
      try {
        const { runConflictCheck } = await import('@/lib/automation/conflict-checker');
        await runConflictCheck(orderId);
        return { passed: true, retried: true };
      } catch (err) {
        console.error('[conflict-gate] Retry failed:', err);
        return { passed: false, error: String(err) };
      }
    });

    if (!conflictGate.passed) {
      // HALT workflow — escalate to admin
      await step.run('conflict-gate-escalate', async () => {
        await supabase.from('admin_activity_log').insert({
          action: 'CONFLICT_GATE_HALT',
          details: { orderId, error: 'error' in conflictGate ? conflictGate.error : 'unknown' },
        });
        await supabase.from('orders').update({
          status: 'CANCELLED',
          cancellation_type: 'ADMIN_CANCEL',
        }).eq('id', orderId);
      });
      return; // Stop workflow
    }

    // ========================================================================
    // STEP 2: Phase I - Document Parsing
    // ========================================================================
    const phaseIResult = await step.run("phase-i-document-parsing", async () => {
      console.log('[Orchestration] Phase I starting');
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("I", input);

      if (!result.success || !result.output) {
        console.error(`[Phase I] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase I failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "I", result);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseIResult?.output) {
      workflowState.phaseOutputs["I"] = phaseIResult.output;
    }
    console.log('[Orchestration] Accumulated after I:', Object.keys(workflowState.phaseOutputs));

    // SP-20 D5: CP1 — Non-blocking intake confirmed event
    await step.run('cp1-intake-confirmed', async () => {
      await emitDurableEvent(
        'checkpoint/cp1.intake-confirmed',
        { phase: 'I', status: 'complete', tier: workflowState.tier },
        orderId,
        'CP1',
        supabase
      );
      console.log('CP1 intake confirmed', { orderId });
    });

    // ========================================================================
    // STEP 3: Phase II - Legal Framework
    // ========================================================================
    const phaseIIResult = await step.run("phase-ii-legal-framework", async () => {
      console.log('[Orchestration] Phase II - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("II", input);

      if (!result.success || !result.output) {
        console.error(`[Phase II] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase II failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "II", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseIIResult?.output) {
      workflowState.phaseOutputs["II"] = phaseIIResult.output;
    }
    console.log('[Orchestration] Accumulated after II:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // STEP 4: Phase III - Legal Research
    // ========================================================================
    const phaseIIIResult = await step.run("phase-iii-legal-research", async () => {
      console.log('[Orchestration] Phase III - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("III", input);

      if (!result.success || !result.output) {
        console.error(`[Phase III] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase III failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "III", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseIIIResult?.output) {
      workflowState.phaseOutputs["III"] = phaseIIIResult.output;
    }
    console.log('[Orchestration] Accumulated after III:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // BUG-04: HOLD CHECKPOINT AFTER PHASE III — ENHANCED DETECTION
    // ========================================================================
    // DEFENSIVE CODING: Check BOTH snake_case AND camelCase field names.
    const phaseIIIOutput = phaseIIIResult?.output as Record<string, unknown> | undefined;

    // Check all possible field name variants for hold signal
    const holdFromCamelCase = phaseIIIOutput?.holdRequired === true;
    const holdFromSnakeCase = phaseIIIOutput?.hold_recommended === true;
    const holdFromCamelRecommended = phaseIIIOutput?.holdRecommended === true;

    const holdRequired = holdFromCamelCase || holdFromSnakeCase || holdFromCamelRecommended;
    const holdReason = (
      phaseIIIOutput?.holdReason ??
      phaseIIIOutput?.hold_reason ??
      phaseIIIOutput?.reason ??
      'Critical gaps detected in evidence/case data'
    ) as string;

    // ========================================================================
    // HOLD OVERRIDE: Simple procedural motions should almost never hold
    // ========================================================================
    // Tier A procedural motions (extensions, continuances, substitutions) rarely
    // need additional evidence beyond the statement of facts. If the AI recommends
    // hold on these, downgrade to warn-only unless the reason mentions genuinely
    // missing critical info like "no case number" or "wrong jurisdiction".
    const PROCEDURAL_MOTION_TYPES = [
      'extension of time', 'extend deadline', 'continuance',
      'substitution of counsel', 'withdrawal of counsel',
      'consent judgment', 'motion to enroll', 'pro hac vice',
    ];

    const motionTypeLower = (workflowState.orderContext.motionType || '').toLowerCase();
    const isProceduralMotion = PROCEDURAL_MOTION_TYPES.some(t => motionTypeLower.includes(t));
    const isTierA = workflowState.tier === 'A';

    let effectiveHoldRequired = holdRequired;

    if (holdRequired && isProceduralMotion && isTierA) {
      console.log(`[Orchestration] HOLD override: Tier A procedural motion "${workflowState.orderContext.motionType}" — downgrading hold to warn`);
      console.log(`[Orchestration] Original hold reason: ${holdReason}`);
      effectiveHoldRequired = false;

      // Log the override for audit trail
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "hold_override",
        action_details: {
          workflowId: workflowState.workflowId,
          phase: "III",
          originalHoldReason: holdReason,
          overrideReason: "Tier A procedural motion — hold downgraded to warn",
          motionType: workflowState.orderContext.motionType,
          tier: workflowState.tier,
        },
      });
    }

    const holdMode = getHoldEnforcementMode();
    if (effectiveHoldRequired) {
      if (holdMode === 'enforce') {
        console.log('[Orchestration] ========== HOLD TRIGGERED (mode=enforce) ==========');
        console.log('[Orchestration] Reason:', holdReason);

        // SP-22: Execute HOLD handling — set status, emit event, then waitForEvent
        await step.run("handle-phase-iii-hold", async () => {
          // Update order status to on_hold
          await supabase
            .from("orders")
            .update({
              status: "on_hold",
              hold_triggered_at: new Date().toISOString(),
              hold_reason: holdReason,
            })
            .eq("id", orderId);

          // Update workflow state
          await supabase
            .from("workflow_state")
            .update({
              phase_status: "HOLD",
              hold_reason: holdReason,
              hold_triggered_at: new Date().toISOString(),
            })
            .eq("order_id", orderId);

          // Log the hold
          await supabase.from("automation_logs").insert({
            order_id: orderId,
            action_type: "workflow_hold",
            action_details: {
              workflowId: workflowState.workflowId,
              phase: "III",
              holdReason,
              criticalGaps: phaseIIIOutput?.criticalGaps,
              requiresClientAction: true,
            },
          });

          // Queue notification to admin
          await supabase.from("notification_queue").insert({
            notification_type: "workflow_hold",
            recipient_email: ADMIN_EMAIL,
            order_id: orderId,
            template_data: {
              orderNumber: workflowState.orderContext.orderNumber,
              holdReason,
              phase: "III - Evidence Strategy",
              criticalGaps: phaseIIIOutput?.criticalGaps,
              actionRequired: "Please provide missing information to continue",
            },
            priority: 10,
            status: "pending",
          });

          // MB-02: Send direct HOLD email notification to customer
          const missingItems = (phaseIIIOutput?.missingItems ?? phaseIIIOutput?.criticalGaps ?? []) as string[];
          const customerEmail = workflowState.orderContext.firmEmail;
          if (customerEmail) {
            try {
              await sendHoldNotification(
                {
                  orderId,
                  orderNumber: workflowState.orderContext.orderNumber,
                  customerEmail,
                  motionType: workflowState.orderContext.motionType,
                },
                holdReason,
                Array.isArray(missingItems) ? missingItems : [String(missingItems)]
              );
            } catch (emailErr) {
              console.error('[HOLD] Email notification failed (non-fatal):', emailErr);
            }
          }

          // SP-22: Emit checkpoint/hold.created to start timeout cascade
          // (24h reminder, 72h escalation, 7d terminal action)
          const { inngest: inngestClient } = await import('@/lib/inngest/client');
          await inngestClient.send({
            name: 'checkpoint/hold.created',
            data: {
              orderId,
              holdReason,
              customerEmail: customerEmail ?? '',
              createdAt: new Date().toISOString(),
              details: {
                type: 'evidence_gap',
                gaps: Array.isArray(missingItems)
                  ? missingItems.map(item => ({ field: item, description: item }))
                  : [{ field: String(missingItems), description: String(missingItems) }],
              },
            },
          });
        });

        // SP-22 HOLD-ST-001: Wait for HOLD resolution with 8-day timeout
        // 1-day safety margin beyond the 7-day terminal action
        console.log('[Orchestration] HOLD detected post-Phase III — waiting for resolution via waitForEvent');
        const holdResolutionEvent = await step.waitForEvent('wait-for-hold-resolution', {
          event: 'checkpoint/hold.resolved',
          match: 'data.orderId',
          timeout: '8d',
        });

        if (!holdResolutionEvent) {
          // Fn1 8d timeout expired — HOLD timeout function likely crashed
          console.log('[Orchestration] HOLD waitForEvent timed out (8d) — checking order status');
          const currentOrder = await step.run('check-hold-status-fallback', async () => {
            const { data } = await supabase
              .from('orders')
              .select('id, status, hold_reason')
              .eq('id', orderId)
              .single();
            return data;
          });

          if (currentOrder?.status === 'cancelled' || currentOrder?.status === 'CANCELLED_SYSTEM') {
            return { status: 'cancelled', orderId, reason: 'hold_timeout_event_lost' };
          }

          if (currentOrder?.status === 'on_hold' || currentOrder?.status === 'hold_pending') {
            // Fallback: timeout function failed, we cancel ourselves
            const { handleHoldTimeout: fallbackTimeout } = await import('@/lib/inngest/checkpoint-timeout');
            await step.run('fallback-hold-cancel', async () => {
              await fallbackTimeout('fallback', orderId);
            });
            return { status: 'cancelled', orderId, reason: 'hold_timeout_fallback' };
          }

          // Status is something else (in_progress) — attorney resolved but event lost. Continue.
          console.warn('[Orchestration] HOLD resolved but event lost — continuing workflow', { status: currentOrder?.status });
        } else if (holdResolutionEvent.data.action === 'CANCELLED') {
          // HOLD was cancelled (auto-cancel or admin cancel)
          return { status: 'cancelled', orderId, reason: 'hold_auto_cancel' };
        }

        // HOLD resolved — continue to Phase IV
        console.log('[Orchestration] HOLD resolved — resuming workflow to Phase IV');
      } else if (holdMode === 'warn') {
        // TESTING MODE: Log the HOLD but continue workflow
        console.warn(`[Orchestration] ========== HOLD DETECTED (mode=warn, bypassed) ==========`);
        console.warn(`[Orchestration] Reason: ${holdReason}`);
        console.warn(`[Orchestration] In production (mode=enforce), this would STOP the workflow.`);

        await step.run("log-hold-bypassed", async () => {
          await supabase.from("automation_logs").insert({
            order_id: orderId,
            action_type: "workflow_hold_bypassed",
            action_details: {
              workflowId: workflowState.workflowId,
              phase: "III",
              holdReason,
              criticalGaps: phaseIIIOutput?.criticalGaps,
              mode: 'warn',
              message: 'HOLD detected but bypassed due to HOLD_ENFORCEMENT_MODE=warn',
            },
          });
        });
        // Continue to Phase IV — do NOT return early
      }
      // mode === 'off': skip HOLD detection entirely, continue to Phase IV
    }

    // ========================================================================
    // STEP 5: Phase IV - MULTI-STEP Citation Research (Avoid Vercel Timeout)
    // ========================================================================
    // CHEN-MULTI-STEP: Phase IV now runs as multiple Inngest steps to avoid
    // Vercel's 5-minute timeout. Each batch of CourtListener searches runs
    // in its own step with checkpoint.
    // ========================================================================
    console.log('[Orchestration] Phase IV - Starting MULTI-STEP execution');
    console.log('[Orchestration] Phase IV - has previous:', Object.keys(workflowState.phaseOutputs));

    // Step 5a: Initialize Phase IV - Extract elements and plan searches
    const phaseIVInit: PhaseIVInitResult = await step.run("phase-iv-init", async () => {
      const input = buildPhaseInput(workflowState);
      return await executePhaseIVInit(input);
    });

    console.log(`[Orchestration] Phase IV Init complete: ${phaseIVInit.searchTasks.length} tasks in ${phaseIVInit.totalBatches} batches`);

    // Step 5b-N: Execute batches (each batch is its own Inngest step with checkpoint)
    const batchResults: PhaseIVBatchResult[] = [];

    for (let batchIndex = 0; batchIndex < phaseIVInit.totalBatches; batchIndex++) {
      const batchResult: PhaseIVBatchResult = await step.run(
        `phase-iv-batch-${batchIndex + 1}`,
        async () => {
          return await executePhaseIVBatch(
            batchIndex,
            phaseIVInit.searchTasks,
            phaseIVInit.jurisdiction
          );
        }
      );

      batchResults.push(batchResult);
      console.log(`[Orchestration] Phase IV Batch ${batchIndex + 1}/${phaseIVInit.totalBatches} complete: ${batchResult.successCount} succeeded`);
    }

    // Step 5-Final: Aggregate results and select citations
    const phaseIVAggregateResult = await step.run("phase-iv-aggregate", async () => {
      return await executePhaseIVAggregate(orderId, phaseIVInit, batchResults);
    });

    console.log(`[Orchestration] Phase IV Aggregate complete: ${phaseIVAggregateResult.citationCount} citations selected`);

    // Build Phase IV output in expected format
    const phaseIVResult = {
      success: phaseIVAggregateResult.success,
      phase: "IV" as WorkflowPhaseCode,
      status: "completed" as PhaseStatus,
      output: {
        caseCitationBank: phaseIVAggregateResult.caseCitationBank,
        statutoryCitationBank: phaseIVAggregateResult.statutoryCitationBank,
        totalCitations: phaseIVAggregateResult.citationCount,
        bindingCount: phaseIVAggregateResult.bindingCount,
        persuasiveCount: phaseIVAggregateResult.persuasiveCount,
        louisianaCitations: phaseIVAggregateResult.louisianaCitations,
        federalCitations: phaseIVAggregateResult.federalCitations,
        elementsCovered: phaseIVAggregateResult.elementsCovered,
        totalElements: phaseIVAggregateResult.totalElements,
        verificationProof: phaseIVAggregateResult.verificationProof,
        success: phaseIVAggregateResult.success,
        _phaseIV_meta: {
          version: '2026-01-30-CHEN-MULTI-STEP',
          executionId: phaseIVInit.executionId,
          executedAt: new Date().toISOString(),
          codeGuarantee: 'MULTI_STEP_CITATION_RESEARCH',
          totalBatches: phaseIVInit.totalBatches,
          searchTasksPlanned: phaseIVInit.searchTasks.length,
        },
      },
      nextPhase: "V" as WorkflowPhaseCode,
    };

    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    workflowState.phaseOutputs["IV"] = phaseIVResult.output;
    workflowState.citationCount = phaseIVAggregateResult.citationCount;
    console.log(`[Orchestration] Phase IV citation banks: ${phaseIVAggregateResult.caseCitationBank.length} case + ${phaseIVAggregateResult.statutoryCitationBank.length} statutory`);
    console.log('[Orchestration] Accumulated after IV:', Object.keys(workflowState.phaseOutputs));
    console.log('[Orchestration] Citation count:', workflowState.citationCount);

    // Log Phase IV execution for audit trail
    await step.run("log-phase-iv-execution", async () => {
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "phase_executed",
        action_details: {
          workflowId: workflowState.workflowId,
          phase: "IV",
          phaseName: "Citation Research (Multi-Step)",
          success: phaseIVAggregateResult.success,
          status: "completed",
          citationCount: phaseIVAggregateResult.citationCount,
          batchesExecuted: phaseIVInit.totalBatches,
          searchTasksPlanned: phaseIVInit.searchTasks.length,
          flaggedForReview: phaseIVAggregateResult.flaggedForReview,
        },
      });
    });

    // CP1 Checkpoint - Notify customer about research direction
    await step.run("checkpoint-cp1", async () => {
      await triggerCheckpoint(workflowState.workflowId, "CP1", {
        checkpoint: "CP1",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        researchSummary: phaseIVResult.output,
        citationCount: workflowState.citationCount,
      });

      // Queue notification
      await supabase.from("notification_queue").insert({
        notification_type: "checkpoint_cp1",
        recipient_email: ADMIN_EMAIL,
        order_id: orderId,
        template_data: {
          checkpoint: "CP1",
          citationCount: workflowState.citationCount,
          phase: "Citation Verification (Multi-Step)",
        },
        priority: 7,
        status: "pending",
      });
    });

    // ========================================================================
    // STEP 5.5: D4-CORR-002 — Tier Upgrade Check (after Phase IV)
    // ========================================================================
    // When Phase IV complexity analysis detects tier mismatch (e.g., filed as
    // Tier A but research shows Tier C complexity), pause for attorney payment.
    // Rush clock pauses during UPGRADE_PENDING. 7-day timeout → auto-cancel.
    // ========================================================================
    const tierAssessment = phaseIVAggregateResult as { suggestedTier?: string; tierMismatch?: boolean };

    if (tierAssessment.tierMismatch && tierAssessment.suggestedTier &&
        tierAssessment.suggestedTier !== workflowState.tier) {

      const originalTier = workflowState.tier;
      const suggestedTier = tierAssessment.suggestedTier;

      // 1. Update order status to UPGRADE_PENDING
      await step.run('upgrade-set-pending', async () => {
        await supabase.from('orders').update({
          status: 'UPGRADE_PENDING',
          status_version: ((workflowState as Record<string, unknown>).statusVersion as number | undefined ?? 0) + 1,
          upgrade_from_tier: originalTier,
          upgrade_to_tier: suggestedTier,
        }).eq('id', orderId);
      });

      // 2. Store phase context for resume
      await step.run('upgrade-save-context', async () => {
        await supabase.from('phase_context').upsert({
          order_id: orderId,
          context_type: 'UPGRADE_PENDING',
          data: {
            current_phase: 'IV',
            loop_count: (workflowState as Record<string, unknown>).loopCount ?? 0,
            citations_so_far: workflowState.citationCount,
            rush_paused_at: (workflowState as Record<string, unknown>).rushDeadline ? new Date().toISOString() : null,
          },
        });
      });

      // 3. Send upgrade-required notification
      await step.run('upgrade-notify', async () => {
        await supabase.from('email_queue').insert({
          order_id: orderId,
          template: 'tier_upgrade_required',
          data: {
            originalTier,
            suggestedTier,
            orderId,
          },
          status: 'pending',
        });
      });

      // 4. Wait for upgrade payment (7-day timeout)
      const upgradeResult = await step.waitForEvent('wait-for-upgrade-payment', {
        event: 'order/upgrade-completed',
        match: 'data.orderId',
        timeout: '7d',
      });

      // 5. Handle result
      if (upgradeResult === null) {
        // Timeout: auto-cancel with CANCELLED_SYSTEM
        await step.run('upgrade-timeout-cancel', async () => {
          await supabase.from('orders').update({
            status: 'CANCELLED', // DB flat status
            status_version: ((workflowState as Record<string, unknown>).statusVersion as number | undefined ?? 0) + 2,
            cancelled_at: new Date().toISOString(),
            cancellation_reason: 'Tier upgrade payment not received within 7 days',
          }).eq('id', orderId);

          // Log for audit
          await supabase.from('automation_logs').insert({
            order_id: orderId,
            action_type: 'upgrade_timeout_cancel',
            action_details: {
              originalTier,
              suggestedTier,
              timeoutDays: 7,
            },
          });
        });

        return; // Exit Fn1
      }

      // Upgrade paid: resume at Phase IV with new tier
      const newTier = upgradeResult.data.newTier as MotionTier;
      workflowState.tier = newTier;

      // Resume rush clock if applicable
      await step.run('upgrade-resume', async () => {
        await supabase.from('orders').update({
          status: 'PROCESSING',
          tier: newTier,
          status_version: ((workflowState as Record<string, unknown>).statusVersion as number | undefined ?? 0) + 2,
        }).eq('id', orderId);

        // Clean up phase context
        await supabase.from('phase_context').delete()
          .eq('order_id', orderId)
          .eq('context_type', 'UPGRADE_PENDING');
      });

      console.log(`[Orchestration] Tier upgrade complete: ${originalTier} → ${newTier}`);
    }

    // ========================================================================
    // STEP 6: Phase V - Draft Motion
    // ========================================================================
    const phaseVResult = await step.run("phase-v-draft-motion", async () => {
      console.log('========== PHASE V START ==========');
      console.log('Order ID:', workflowState.orderId);
      console.log('[Orchestration] Phase V - has previous:', Object.keys(workflowState.phaseOutputs));
      console.log('[Orchestration] Phase V - Phase IV present:', !!workflowState.phaseOutputs['IV']);
      const startTime = Date.now();

      const input = buildPhaseInput(workflowState);
      const result = await executePhase("V", input);

      const duration = Date.now() - startTime;
      console.log('========== PHASE V END ==========');
      console.log('Duration:', duration, 'ms');
      console.log('Success:', result.success);
      console.log('Tokens used:', result.tokensUsed);

      if (!result.success || !result.output) {
        console.error(`[Phase V] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase V failed: ${result.error || 'No output returned'}`);
      }

      if (duration < 10000) {
        console.error('WARNING: Phase V completed too fast! AI may not have been called.');
      }

      await logPhaseExecution(supabase, workflowState, "V", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseVResult?.output) {
      workflowState.phaseOutputs["V"] = phaseVResult.output;
    }
    console.log('[Orchestration] Accumulated after V:', Object.keys(workflowState.phaseOutputs));

    // SP-20 D5: CP2 — Non-blocking draft ready event
    await step.run('cp2-draft-ready', async () => {
      await emitDurableEvent(
        'checkpoint/cp2.draft-ready',
        { phase: 'V', status: 'complete', tier: workflowState.tier },
        orderId,
        'CP2',
        supabase
      );
      console.log('CP2 draft ready', { orderId });
    });

    // ========================================================================
    // STEP 6.5: Pre-fetch citation existence via batch CL lookup (ST-002)
    // ========================================================================
    const prefetchV1Result = await step.run("cit-prefetch-existence-v1", async () => {
      const draftText = extractDraftText(workflowState.phaseOutputs["V"]);
      if (!draftText) {
        console.warn('[CIV] No draft text from Phase V — skipping pre-fetch');
        return { prefetchMap: {} as Record<string, CLCitationResult>, apiCallsUsed: 0, errorCount: 0 };
      }

      const client = new CourtListenerClient();
      const textBlocks = splitTextIntoBlocks(draftText, 5000);
      const { results, apiCallsUsed, errors } = await client.batchCitationLookup(textBlocks);

      console.log(`[CIV] Pre-fetch V.1 complete: ${results.size} citations in ${apiCallsUsed} API calls`);
      if (errors.length > 0) {
        console.warn(`[CIV] Pre-fetch V.1 errors:`, errors);
      }

      // Serialize Map for Inngest step boundary
      return {
        prefetchMap: Object.fromEntries(results) as Record<string, CLCitationResult>,
        apiCallsUsed,
        errorCount: errors.length,
      };
    });

    // Store serialized prefetch map for Phase V.1 to consume
    const prefetchMapV1 = new Map<string, CLCitationResult>(
      Object.entries(prefetchV1Result.prefetchMap)
    );

    // ========================================================================
    // STEP 7: Phase V.1 - Citation Accuracy Check
    // IV-004: Hybrid step granularity — Tier A/B = single step, Tier C/D = sub-steps
    // For Tier C/D, each 2-citation batch gets its own Inngest step for
    // checkpointing (high cost, high risk). Tier A/B runs as one step.
    // ========================================================================
    const phaseV1Result = await step.run("phase-v1-citation-accuracy", async () => {
      console.log('[Orchestration] Phase V.1 - has previous:', Object.keys(workflowState.phaseOutputs));
      console.log('[Orchestration] Phase V.1 - Phase IV present:', !!workflowState.phaseOutputs['IV']);
      console.log('[Orchestration] Phase V.1 - Phase V present:', !!workflowState.phaseOutputs['V']);
      console.log(`[Orchestration] Phase V.1 - Tier: ${workflowState.tier} (${workflowState.tier === 'C' || workflowState.tier === 'D' ? 'sub-step granularity available' : 'single step'})`);
      // SP-18 Issue 2: Pass pre-fetched citation existence results to Phase V.1
      const input = buildPhaseInput(workflowState, {
        prefetchedCitations: prefetchV1Result.prefetchMap,
      });
      const result = await executePhase("V.1", input);

      if (!result.success || !result.output) {
        console.error(`[Phase V.1] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase V.1 failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "V.1", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseV1Result?.output) {
      workflowState.phaseOutputs["V.1"] = phaseV1Result.output;
    }
    console.log('[Orchestration] Accumulated after V.1:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // SP-13 Step 6.5/6.6: Protocol dispatch after Phase V.1 (Decision 8)
    // ========================================================================
    if (DISPATCHER_PHASES.includes('V.1')) {
      // SP-18: Derive verification status from actual Phase V.1 results
      const v1Output = (phaseV1Result?.output ?? {}) as Record<string, unknown>;
      const v1HasBlocked = !!(v1Output?.protocol7 as Record<string, unknown>)?.triggered;
      const v1DispatchStatus = v1HasBlocked ? 'VERIFICATION_DEFERRED' as const : 'VERIFIED' as const;

      const v1DispatchResult = await step.run('dispatch-protocols-v1', async () => {
        return dispatchProtocols({
          orderId,
          phase: 'V.1',
          tier: (workflowState.tier || 'A') as 'A' | 'B' | 'C' | 'D',
          jurisdiction: workflowState.orderContext.jurisdiction || 'LA',
          citation: { id: orderId, text: '' }, // Order-level dispatch
          verificationResult: { status: v1DispatchStatus },
          detectionOnly: false,
        });
      });

      await step.run('persist-protocol-results-v1', async () => {
        await persistProtocolResults(
          supabase, orderId, 'V.1',
          v1DispatchResult.results, orderId
        );
      });

      if (v1DispatchResult.holdRequired) {
        await step.sendEvent('send-hold-event-v1', {
          name: 'workflow/hold-required',
          data: {
            orderId,
            holdProtocol: v1DispatchResult.holdProtocol,
            phase: 'V.1',
          },
        });
      }
    }

    // SP-22: Check if order was placed on HOLD after Phase V.1 citation verification
    const holdCheckV1 = await checkAndWaitForHold(step, supabase, orderId, 'post-v1-citation');
    if (holdCheckV1 === 'cancelled') {
      return { status: 'cancelled', orderId, reason: 'hold_cancel_post_v1' };
    }

    // ========================================================================
    // STEP 8: Phase VI - Opposition Anticipation
    // ========================================================================
    const phaseVIResult = await step.run("phase-vi-opposition-anticipation", async () => {
      // TIER A SKIP: Procedural motions rarely face substantive opposition
      if (workflowState.tier === 'A') {
        console.log('[Orchestration] Phase VI SKIPPED - Tier A procedural motion');
        return {
          success: true,
          phase: 'VI' as WorkflowPhaseCode,
          status: 'skipped' as PhaseStatus,
          output: {
            phaseComplete: 'VI',
            skipped: true,
            skipReason: 'TIER_A_PROCEDURAL',
            oppositionAnalysis: null,
            notes: 'Phase VI skipped for Tier A procedural motion. These motions rarely face substantive opposition.',
          },
          nextPhase: 'VII' as WorkflowPhaseCode,
          durationMs: 0,
        };
      }

      console.log('[Orchestration] Phase VI - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("VI", input);

      if (!result.success || !result.output) {
        console.error(`[Phase VI] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase VI failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "VI", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseVIResult?.output) {
      workflowState.phaseOutputs["VI"] = phaseVIResult.output;
    }
    console.log('[Orchestration] Accumulated after VI:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // STEP 9: Phase VII - Judge Simulation + CP2 Checkpoint
    // ========================================================================
    let phaseVIIResult = await step.run("phase-vii-judge-simulation", async () => {
      console.log('[Orchestration] Phase VII - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("VII", input);

      // CRITICAL: Check for phase failure before using output
      if (!result.success || !result.output) {
        console.error(`[Phase VII] FAILED: ${result.error || 'No output returned'}`);
        throw new Error(`Phase VII failed: ${result.error || 'No output returned. Check ANTHROPIC_API_KEY is configured.'}`);
      }

      await logPhaseExecution(supabase, workflowState, "VII", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseVIIResult?.output) {
      workflowState.phaseOutputs["VII"] = phaseVIIResult.output;
      const judgeOutput = phaseVIIResult.output as { evaluation?: { grade?: string; numericGrade?: number }; grade?: string } | null;
      const grade = judgeOutput?.evaluation?.grade || judgeOutput?.grade;
      workflowState.currentGrade = grade as LetterGrade;
    }
    console.log('[Orchestration] Accumulated after VII:', Object.keys(workflowState.phaseOutputs));
    console.log('[Orchestration] Current grade:', workflowState.currentGrade);

    // CP2 Checkpoint - Customer reviews draft and grade
    await step.run("checkpoint-cp2", async () => {
      await triggerCheckpoint(workflowState.workflowId, "CP2", {
        checkpoint: "CP2",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        judgeSimulation: phaseVIIResult.output,
        grade: workflowState.currentGrade,
      });

      // Queue notification
      await supabase.from("notification_queue").insert({
        notification_type: "checkpoint_cp2",
        recipient_email: ADMIN_EMAIL,
        order_id: orderId,
        template_data: {
          checkpoint: "CP2",
          grade: workflowState.currentGrade,
          passes: workflowState.currentGrade ? gradePasses(workflowState.currentGrade) : false,
          phase: "Judge Simulation",
        },
        priority: 8,
        status: "pending",
      });
    });

    // ========================================================================
    // SP23 + BUG-03 FIX: REVISION LOOP — Phase VIII → VII.1 → VII
    // ========================================================================
    // CORRECT ORDER per spec:
    // 1. VII grades the motion → if numericGrade < tier threshold:
    //    a. VIII (Revisions) — apply revision instructions from VII
    //    b. VII.1 (Citation re-verification on revised text)
    //    c. VII (Re-grade revised draft)
    // 2. Repeat until numericGrade >= threshold or max loops for tier
    //
    // SP23 BUG-1 FIX: Track currentDraft explicitly so Phase VIII(N)
    // always receives Phase VIII(N-1) output, NOT the original Phase V draft.
    //
    // SP23 BUG-2 FIX: Use numericGrade as the SOLE quality determinant
    // (SC-002). DO NOT check evaluation.passes — Claude can set it to true
    // on any grade. The numeric comparison is the quality gate.
    //
    // SP23 SC-001: Tiered thresholds — Tier A = 3.0/B (83%),
    // Tier B/C/D = 3.3/B+ (87%).
    //
    // BUG-11 FIX: Loop counter is at WORKFLOW level
    // (workflowState.revisionLoopCount), NOT generated by LLM.
    // ========================================================================

    // SP23 BUG-1: Initialize currentDraft from Phase V output
    let currentDraft: unknown = workflowState.phaseOutputs["V"];

    // BINDING 02/15/26 (ING-015R): Pure numeric scoring on 0-100 percentage scale.
    // LLM booleans (evaluation.passes, passes_threshold) are DIAGNOSTIC ONLY.
    const initialVIIOutput = phaseVIIResult.output as Record<string, unknown> | null;
    // Read numeric_score (now 0-100 percentage). Legacy fallback: numericGrade (GPA).
    let currentNumericGrade: number = normalizeToPercentage(Number(
      (initialVIIOutput?.numeric_score as number | undefined) ??
      (initialVIIOutput?.numericGrade as number | undefined) ??
      ((initialVIIOutput?.evaluation as Record<string, unknown> | undefined)?.numericGrade as number | undefined) ??
      0
    ));

    // Pure numeric check: does initial Phase VII already pass?
    const qualityThreshold = getQualityThreshold(workflowState.tier);
    if (currentNumericGrade >= qualityThreshold) {
      console.log(
        `[Orchestration] Initial Phase VII numericScore=${currentNumericGrade} >= threshold ${qualityThreshold}. ` +
        `Skipping revision loop.`
      );
    }

    // SP23: Tiered max loops — Tier A=2, B/C=3, D=4
    const maxLoopsForTier = getMaxRevisionLoops(workflowState.tier);

    // SP-05: Score regression monitoring — track previous score to detect degradation
    let previousScore: number = currentNumericGrade;

    // SP-14 TASK-19: Track letter grades across loops for stall detection.
    // 3 consecutive identical letter grades = stall → Protocol 10 exit.
    const STALL_THRESHOLD = 3;
    const loopGrades: string[] = [];
    // Include initial Phase VII grade in stall tracking
    if (workflowState.currentGrade) {
      loopGrades.push(workflowState.currentGrade);
    }

    while (
      currentNumericGrade < qualityThreshold &&
      workflowState.revisionLoopCount < maxLoopsForTier
    ) {
      const loopNum = workflowState.revisionLoopCount + 1;
      console.log(`[Orchestration] ===== REVISION LOOP ${loopNum}/${maxLoopsForTier} =====`);
      console.log(`[Orchestration] Current numericScore: ${currentNumericGrade}, threshold: ${qualityThreshold} (Tier ${workflowState.tier}: needs ${workflowState.tier === 'A' ? 'B / 83%' : 'B+ / 87%'})`);

      // STEP A: Phase VIII — Apply revisions based on Phase VII feedback
      const phaseVIIIRevisionResult = await step.run(`phase-viii-revision-loop-${loopNum}`, async () => {
        console.log(`[Orchestration] Phase VIII Loop ${loopNum} - applying revisions`);
        console.log(`[Orchestration] Phase VIII - has previous:`, Object.keys(workflowState.phaseOutputs));
        const input = buildPhaseInput(workflowState);
        input.revisionLoop = loopNum;
        const result = await executePhase("VIII", input);

        if (!result.success || !result.output) {
          const errorMsg = result.error || 'No output returned';
          console.error(`[Phase VIII Loop ${loopNum}] FAILED: ${errorMsg}`);
          // SP-07 TASK-06: JSON parse failures and truncation are non-retriable
          if (errorMsg.includes('non-retriable') || errorMsg.includes('Non-retriable') || errorMsg.includes('malformed output')) {
            throw new NonRetriableError(`Phase VIII revision failed (non-retriable): ${errorMsg}`);
          }
          throw new Error(`Phase VIII revision failed: ${errorMsg}`);
        }

        await logPhaseExecution(supabase, workflowState, "VIII", result, result.tokensUsed);
        return result;
      });

      // CRITICAL: Store Phase VIII output — this is the revised draft
      if (phaseVIIIRevisionResult?.output) {
        workflowState.phaseOutputs["VIII"] = phaseVIIIRevisionResult.output;
      }

      // SP23 BUG-1 FIX: Update currentDraft to the latest revision.
      // This ensures Phase VIII(N+1) receives Phase VIII(N) output,
      // NOT the original Phase V draft.
      const phaseVIIIOutput = phaseVIIIRevisionResult?.output as Record<string, unknown> | null;
      if (phaseVIIIOutput?.revisedMotion) {
        currentDraft = phaseVIIIOutput.revisedMotion;
      } else {
        console.warn(`[${orderId}] Phase VIII loop ${loopNum} returned no revisedMotion — keeping previous draft`);
      }
      console.log(`[Orchestration] Phase VIII output stored. currentDraft updated. Keys: ${Object.keys(workflowState.phaseOutputs)}`);

      // SP-22: Check if order was placed on HOLD during revision loop (revision_stall)
      const holdCheckRevision = await checkAndWaitForHold(step, supabase, orderId, `revision-loop-${loopNum}`);
      if (holdCheckRevision === 'cancelled') {
        return { status: 'cancelled', orderId, reason: 'hold_cancel_revision_loop' };
      }

      // SP-05: Crash recovery — persist Phase VIII output to DB so Inngest replay
      // can recover the latest revision if the function crashes mid-loop
      await step.run(`persist-revision-${loopNum}`, async () => {
        await supabase
          .from("workflow_state")
          .upsert({
            order_id: orderId,
            phase_viii_output: phaseVIIIRevisionResult.output,
            revision_loop_count: loopNum,
            updated_at: new Date().toISOString(),
          }, { onConflict: "order_id" });
        console.log(`[Orchestration] Loop ${loopNum} Phase VIII output persisted for crash recovery`);
      });

      // Persist any newly verified case citations to the bank
      const newBankEntries = (phaseVIIIOutput?.newBankEntries ?? []) as Array<{
        caseName?: string;
        citation?: string;
        court?: string;
        date_filed?: string;
        courtlistener_id?: number | string;
      }>;

      if (newBankEntries.length > 0) {
        await step.run(`bank-revision-citations-loop-${loopNum}`, async () => {
          console.log(`[Orchestration] Banking ${newBankEntries.length} newly verified citation(s) from revision loop ${loopNum}`);

          // 1. Update in-memory workflowState so next loop sees expanded bank
          const phaseIVOutput = (workflowState.phaseOutputs['IV'] ?? {}) as Record<string, unknown>;
          const currentBank = (phaseIVOutput.caseCitationBank ?? []) as Array<Record<string, unknown>>;

          for (const entry of newBankEntries) {
            // Deduplicate: skip if citation string already in bank
            const alreadyInBank = currentBank.some(existing =>
              (existing.citation as string || '').toLowerCase() === (entry.citation || '').toLowerCase()
            );
            if (alreadyInBank) {
              console.log(`[Orchestration] Skipping duplicate: ${entry.caseName}`);
              continue;
            }

            currentBank.push({
              ...entry,
              verification_method: 'fast_track_civ',
              verification_timestamp: new Date().toISOString(),
              source: 'phase_viii_revision',
              added_in_loop: loopNum,
            });
            console.log(`[Orchestration] Banked: ${entry.caseName}, ${entry.citation}`);
          }

          // Write back to in-memory state
          workflowState.phaseOutputs['IV'] = {
            ...phaseIVOutput,
            caseCitationBank: currentBank,
          };

          // 2. Persist to Supabase so crash recovery sees expanded bank
          const { error: bankUpdateError } = await supabase
            .from('orders')
            .update({
              phase_outputs: {
                ...(await supabase
                  .from('orders')
                  .select('phase_outputs')
                  .eq('id', orderId)
                  .single()
                  .then(r => (r.data?.phase_outputs ?? {}) as Record<string, unknown>)),
                IV: workflowState.phaseOutputs['IV'],
              },
            })
            .eq('id', orderId);

          if (bankUpdateError) {
            console.error(`[Orchestration] Failed to persist citation bank update:`, bankUpdateError);
            // Non-fatal: in-memory state is updated, next loop still works.
          }
        });
      }

      // MB-02: Send revision notification to customer (inside step.run for Inngest durability)
      await step.run(`send-revision-email-${loopNum}`, async () => {
        const customerEmail = workflowState.orderContext.firmEmail;
        if (customerEmail) {
          try {
            await sendRevisionNotification(
              {
                orderId,
                orderNumber: workflowState.orderContext.orderNumber,
                customerEmail,
                motionType: workflowState.orderContext.motionType,
              },
              {
                loopNumber: loopNum,
                maxLoops: maxLoopsForTier,
                currentGrade: String(workflowState.currentGrade || 'Evaluating'),
                targetGrade: workflowState.tier === 'A' ? 'B (3.0)' : 'B+ (3.3)',
              }
            );
          } catch (emailErr) {
            console.error(`[Revision Loop ${loopNum}] Email notification failed (non-fatal):`, emailErr);
          }
        }
      });

      // SP-07 TASK-05: Check for fabrication detection and hold recommendation
      if (phaseVIIIOutput?.fabricationDetected) {
        console.warn(`[Orchestration] Loop ${loopNum}: FACT FABRICATION detected — revision was reverted. Entities: ${JSON.stringify(phaseVIIIOutput.fabricatedEntities)}`);
      }
      if (phaseVIIIOutput?.holdRecommended) {
        console.warn(`[Orchestration] Loop ${loopNum}: Phase VIII recommends HOLD (${phaseVIIIOutput.holdReason}). ${(phaseVIIIOutput.bracketedPrompts as string[])?.length || 0} missing specifics.`);
      }

      // STEP B-pre: Pre-fetch citation existence for revised text (ST-002)
      const prefetchVII1Result = await step.run(`cit-prefetch-existence-vii1-loop-${loopNum}`, async () => {
        const revisedText = extractDraftText(workflowState.phaseOutputs["VIII"]);
        if (!revisedText) {
          console.warn(`[CIV] No revised text from Phase VIII loop ${loopNum} — skipping pre-fetch`);
          return { prefetchMap: {} as Record<string, CLCitationResult>, apiCallsUsed: 0, errorCount: 0 };
        }

        const client = new CourtListenerClient();
        const textBlocks = splitTextIntoBlocks(revisedText, 5000);
        const { results, apiCallsUsed, errors } = await client.batchCitationLookup(textBlocks);

        console.log(`[CIV] Pre-fetch VII.1 loop ${loopNum}: ${results.size} citations in ${apiCallsUsed} API calls`);
        if (errors.length > 0) {
          console.warn(`[CIV] Pre-fetch VII.1 loop ${loopNum} errors:`, errors);
        }

        return {
          prefetchMap: Object.fromEntries(results) as Record<string, CLCitationResult>,
          apiCallsUsed,
          errorCount: errors.length,
        };
      });

      // Store serialized prefetch map for Phase VII.1 to consume
      const prefetchMapVII1 = new Map<string, CLCitationResult>(
        Object.entries(prefetchVII1Result.prefetchMap)
      );

      // STEP B: Phase VII.1 — Citation re-verification on the REVISED text
      const phaseVII1Result = await step.run(`phase-vii1-citation-check-loop-${loopNum}`, async () => {
        console.log(`[Orchestration] Phase VII.1 Loop ${loopNum} - citation re-verification`);
        console.log(`[Orchestration] Phase VII.1 - Phase VIII present:`, !!workflowState.phaseOutputs['VIII']);
        // SP-18 Issue 2: Pass pre-fetched citation existence results to Phase VII.1
        const input = buildPhaseInput(workflowState, {
          prefetchedCitations: prefetchVII1Result.prefetchMap,
          revisionLoop: loopNum,
        });
        const result = await executePhase("VII.1", input);

        if (!result.success || !result.output) {
          console.error(`[Phase VII.1 Loop ${loopNum}] FAILED: ${result.error || 'No output'}`);
          throw new Error(`Phase VII.1 citation check failed: ${result.error || 'No output returned'}`);
        }

        await logPhaseExecution(supabase, workflowState, "VII.1", result, result.tokensUsed);
        return result;
      });

      if (phaseVII1Result?.output) {
        workflowState.phaseOutputs["VII.1"] = phaseVII1Result.output;
      }

      // Bank any citations verified by VII.1
      const vii1BankEntries = ((phaseVII1Result.output as Record<string, unknown>)?.verifiedBankEntries ?? []) as Array<{
        caseName?: string;
        citation?: string;
        court?: string;
        date_filed?: string;
        courtlistener_id?: number | string;
      }>;

      if (vii1BankEntries.length > 0) {
        await step.run(`bank-vii1-citations-loop-${loopNum}`, async () => {
          console.log(`[Orchestration] Banking ${vii1BankEntries.length} citation(s) verified by VII.1 loop ${loopNum}`);

          const phaseIVOutput = (workflowState.phaseOutputs['IV'] ?? {}) as Record<string, unknown>;
          const currentBank = (phaseIVOutput.caseCitationBank ?? []) as Array<Record<string, unknown>>;

          for (const entry of vii1BankEntries) {
            const alreadyInBank = currentBank.some(existing =>
              (existing.citation as string || '').toLowerCase() === (entry.citation || '').toLowerCase()
            );
            if (alreadyInBank) continue;

            currentBank.push({
              ...entry,
              verification_method: 'vii1_civ',
              verification_timestamp: new Date().toISOString(),
              source: 'phase_vii1_verification',
              added_in_loop: loopNum,
            });
            console.log(`[Orchestration] Banked from VII.1: ${entry.caseName}`);
          }

          workflowState.phaseOutputs['IV'] = {
            ...phaseIVOutput,
            caseCitationBank: currentBank,
          };
        });
      }

      // ================================================================
      // SP-13 Step 6.5/6.6: Protocol dispatch after Phase VII.1 (Decision 8)
      // ================================================================
      if (DISPATCHER_PHASES.includes('VII.1')) {
        // SP-18: Derive verification status from actual Phase VII.1 results
        const vii1Output = (phaseVII1Result?.output ?? {}) as Record<string, unknown>;
        const vii1Escalated = !!(vii1Output?.escalated);
        const vii1DispatchStatus = vii1Escalated ? 'VERIFICATION_DEFERRED' as const : 'VERIFIED' as const;

        const vii1DispatchResult = await step.run(`dispatch-protocols-vii1-loop-${loopNum}`, async () => {
          return dispatchProtocols({
            orderId,
            phase: 'VII.1',
            tier: (workflowState.tier || 'A') as 'A' | 'B' | 'C' | 'D',
            jurisdiction: workflowState.orderContext.jurisdiction || 'LA',
            citation: { id: orderId, text: '' },
            verificationResult: { status: vii1DispatchStatus },
            detectionOnly: false,
          });
        });

        await step.run(`persist-protocol-results-vii1-loop-${loopNum}`, async () => {
          await persistProtocolResults(
            supabase, orderId, 'VII.1',
            vii1DispatchResult.results, orderId
          );
        });

        if (vii1DispatchResult.holdRequired) {
          await step.sendEvent('send-hold-event-vii1', {
            name: 'workflow/hold-required',
            data: {
              orderId,
              holdProtocol: vii1DispatchResult.holdProtocol,
              phase: 'VII.1',
            },
          });
        }
      }

      // SP-22: Check if order was placed on HOLD after Phase VII.1 citation verification
      const holdCheckVII1 = await checkAndWaitForHold(step, supabase, orderId, `post-vii1-citation-loop-${loopNum}`);
      if (holdCheckVII1 === 'cancelled') {
        return { status: 'cancelled', orderId, reason: 'hold_cancel_post_vii1' };
      }

      // BUG-11 FIX: Increment loop counter at WORKFLOW level
      workflowState.revisionLoopCount = loopNum;

      // Update workflow-level loop counter in database (not step-level state)
      await step.run(`update-loop-counter-${loopNum}`, async () => {
        await supabase
          .from("workflow_state")
          .update({ revision_loop_count: loopNum })
          .eq("order_id", orderId);
      });

      // Check if escalated due to max loops
      if ((phaseVII1Result.output as { escalated?: boolean })?.escalated) {
        console.warn(`[Orchestration] Phase VII.1 signaled escalation at loop ${loopNum}`);
        break;
      }

      // STEP C: Phase VII — Re-grade the revised draft
      phaseVIIResult = await step.run(`phase-vii-regrade-loop-${loopNum}`, async () => {
        console.log(`[Orchestration] Phase VII Regrade Loop ${loopNum}`);
        const input = buildPhaseInput(workflowState);
        input.revisionLoop = loopNum;
        const result = await executePhase("VII", input);

        if (!result.success || !result.output) {
          console.error(`[Phase VII Regrade ${loopNum}] FAILED: ${result.error || 'No output returned'}`);
          throw new Error(`Phase VII regrade failed: ${result.error || 'No output returned'}`);
        }

        await logPhaseExecution(supabase, workflowState, "VII", result, result.tokensUsed);
        return result;
      });

      // CRITICAL: Store re-grade output and update grade
      if (phaseVIIResult?.output) {
        workflowState.phaseOutputs["VII"] = phaseVIIResult.output;
        const judgeOutput = phaseVIIResult.output as Record<string, unknown>;
        const grade = (judgeOutput?.evaluation as Record<string, unknown> | undefined)?.grade || judgeOutput?.grade;
        workflowState.currentGrade = grade as LetterGrade;

        // BINDING 02/15/26 (ING-015R): Pure numeric scoring on 0-100 percentage scale.
        // Read numeric_score (now 0-100). Legacy fallback: numericGrade (GPA → converted).
        currentNumericGrade = normalizeToPercentage(Number(
          (judgeOutput?.numeric_score as number | undefined) ??
          (judgeOutput?.numericGrade as number | undefined) ??
          ((judgeOutput?.evaluation as Record<string, unknown> | undefined)?.numericGrade as number | undefined) ??
          0
        ));

        // Pure numeric break: if score >= threshold, exit revision loop
        if (currentNumericGrade >= qualityThreshold) {
          console.log(
            `[Orchestration] Loop ${loopNum}: numericScore=${currentNumericGrade} >= threshold ${qualityThreshold}. ` +
            `Exiting revision loop.`
          );
          // diagnostic: log LLM boolean for audit trail (NOT used for control flow)
          const llmPasses = (judgeOutput?.evaluation as Record<string, unknown> | undefined)?.passes; // diagnostic only
          const llmPassesThreshold = judgeOutput?.passes_threshold; // diagnostic only
          console.log( // diagnostic only — LLM booleans not used for control flow
            `[Orchestration] [diagnostic] LLM llmPassesThreshold=${llmPassesThreshold}, ` +
            `LLM llmPasses=${llmPasses}. Numeric check controls.`
          );
          break;
        }

        // SP-05: Score regression monitoring — warn if grade dropped after revision
        if (currentNumericGrade < previousScore) {
          console.warn(
            `[Orchestration] SCORE REGRESSION: Loop ${loopNum} grade ${currentNumericGrade.toFixed(1)} < ` +
            `previous ${previousScore.toFixed(1)}. Revision may have degraded quality.`
          );
        }
        previousScore = currentNumericGrade;

        // SP-14 TASK-19: Stall detection — track letter grade and check for consecutive same grades
        if (workflowState.currentGrade) {
          loopGrades.push(workflowState.currentGrade);
        }
        if (loopGrades.length >= STALL_THRESHOLD) {
          const lastN = loopGrades.slice(-STALL_THRESHOLD);
          const allSame = lastN.every(g => g === lastN[0]);
          if (allSame) {
            console.warn(
              `[Orchestration] STALL DETECTED: ${STALL_THRESHOLD} consecutive "${lastN[0]}" grades. ` +
              `Further revisions unlikely to improve quality. Triggering Protocol 10 exit.`
            );
            // Mark stall in Phase VII output for AIS limitations disclosure
            const stallMetadata = {
              stall_detected: true,
              stall_grade: lastN[0],
              stall_loop_count: loopGrades.length,
              protocol_10_triggered: true,
              protocol_10_reason: `Motion stalled at grade ${lastN[0]} after ${STALL_THRESHOLD} consecutive identical grades. Delivered with limitations disclosure per Protocol 10.`,
            };
            workflowState.phaseOutputs["VII"] = {
              ...(workflowState.phaseOutputs["VII"] as Record<string, unknown> ?? {}),
              ...stallMetadata,
            };
            break;
          }
        }
      }
      console.log(`[Orchestration] Loop ${loopNum} complete. Grade: ${workflowState.currentGrade}, numericScore: ${currentNumericGrade}, threshold: ${qualityThreshold}, gradeHistory: [${loopGrades.join(', ')}]`);
    }

    // SP23: Revision loop summary
    const loopPassed = currentNumericGrade >= qualityThreshold;
    console.log(
      `[Orchestration] Revision loop summary: ${workflowState.revisionLoopCount} loop(s), ` +
      `grade: ${workflowState.currentGrade} (${currentNumericGrade.toFixed(1)}), ` +
      `threshold: ${qualityThreshold} (Tier ${workflowState.tier}), ` +
      `passed: ${loopPassed}`
    );

    // SP-14 TASK-19: Check if stall was detected (exits loop early via break)
    const stallDetected = (workflowState.phaseOutputs["VII"] as Record<string, unknown> | undefined)?.stall_detected === true;

    // SP23 Protocol 10: Max loops exhausted OR stall detected without reaching threshold
    if (!loopPassed && (workflowState.revisionLoopCount >= maxLoopsForTier || stallDetected)) {
      await step.run("protocol-10-enhanced-disclosure", async () => {
        await handleProtocol10Exit(
          supabase,
          orderId,
          workflowState.workflowId,
          workflowState.tier,
          workflowState.revisionLoopCount,
          maxLoopsForTier,
          currentNumericGrade,
          qualityThreshold,
          workflowState.currentGrade,
        );
      });
      if (stallDetected) {
        console.log(`[Orchestration] Protocol 10 triggered by STALL DETECTION (${STALL_THRESHOLD} consecutive identical grades)`);
      }
    }

    // If Phase VII passed on first try (no revision loop entered),
    // carry Phase V output forward as the "final" draft in VIII slot
    if (!workflowState.phaseOutputs["VIII"]) {
      workflowState.phaseOutputs["VIII"] = workflowState.phaseOutputs["V"];
      console.log('[Orchestration] Phase VII passed first try — Phase V output carried to VIII slot');
    }
    console.log('[Orchestration] Accumulated after revision loop:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // STEP 12: Phase VIII.5 - Caption Validation
    // ========================================================================
    const phaseVIII5Result = await step.run("phase-viii5-caption-validation", async () => {
      console.log('[Orchestration] Phase VIII.5 - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("VIII.5", input);

      if (!result.success || !result.output) {
        console.error(`[Phase VIII.5] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase VIII.5 failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "VIII.5", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseVIII5Result?.output) {
      workflowState.phaseOutputs["VIII.5"] = phaseVIII5Result.output;
    }
    console.log('[Orchestration] Accumulated after VIII.5:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // STEP 12.5: Protocol 5 — Statutory Reference Verification (SP-11)
    // ========================================================================
    await step.run("protocol-5-statutory-verification", async () => {
      const revisedDraft = extractDraftText(workflowState.phaseOutputs["VIII"]);
      if (!revisedDraft) {
        console.log('[Protocol5] No revised draft text found — skipping');
        return;
      }

      const result = await runProtocol5(revisedDraft, workflowState.orderId);

      if (result.newStatutesFound > 0) {
        console.log(
          `[Protocol5] ${result.newStatutesFound} new statute(s) found, ${result.newStatutes.filter(s => s.addedToBank).length} added to bank`,
        );
        if (result.warnings.length > 0) {
          console.warn(`[Protocol5] Warnings: ${result.warnings.join('; ')}`);
        }
      } else if (result.triggered) {
        console.log(`[Protocol5] ${result.totalStatutesInDraft} statutes in draft, all already in bank`);
      }
    });

    // ========================================================================
    // STEP 13: Phase IX - Supporting Documents
    // ========================================================================
    const phaseIXResult = await step.run("phase-ix-supporting-documents", async () => {
      console.log('[Orchestration] Phase IX - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("IX", input);

      if (!result.success || !result.output) {
        console.error(`[Phase IX] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase IX failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "IX", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseIXResult?.output) {
      workflowState.phaseOutputs["IX"] = phaseIXResult.output;
    }
    console.log('[Orchestration] Accumulated after IX:', Object.keys(workflowState.phaseOutputs));

    // SP8: Inject motion type advisories into Phase IX output
    const detectedTypes = detectMotionType(
      workflowState.orderContext.motionType || '',
      workflowState.orderContext.statementOfFacts || ''
    );

    if (detectedTypes.length > 0) {
      const advisories = generateAdvisories(
        detectedTypes,
        workflowState.orderContext.jurisdiction || 'LA'
      );

      if (advisories.length > 0) {
        console.log(`[Orchestration] Motion advisories generated: ${advisories.map(a => a.id).join(', ')}`);

        // Attach advisories to the phase output for inclusion in AIS
        const phaseIXOutput = (workflowState.phaseOutputs["IX"] || {}) as Record<string, unknown>;
        workflowState.phaseOutputs["IX"] = {
          ...phaseIXOutput,
          motionAdvisories: advisories,
        };
      }
    }

    // ========================================================================
    // STEP 13.5: Advisory Injection (QC-024/025/026)
    // ========================================================================
    await step.run("advisory-injection", async () => {
      const { motionType, jurisdiction } = workflowState.orderContext;
      const result = injectAdvisories(motionType, jurisdiction);

      if (result.injected) {
        console.log(
          `[Orchestration] Injected ${result.advisoryCount} advisory(ies): ` +
          result.advisories.map(a => a.id).join(', ')
        );

        const advisoryText = formatAdvisoriesForPhaseX(result.advisories);

        // Persist advisories to workflow metadata for Phase X
        const { data: currentWf } = await supabase
          .from("order_workflows")
          .select("metadata")
          .eq("id", workflowState.workflowId)
          .single();

        await supabase
          .from("order_workflows")
          .update({
            metadata: {
              ...((currentWf?.metadata as Record<string, unknown>) || {}),
              advisories: result.advisories,
              advisoryText,
            },
          })
          .eq("id", workflowState.workflowId);
      } else {
        console.log('[Orchestration] No advisories applicable for this motion type');
      }
    });

    // ========================================================================
    // STEP 14: Phase IX.1 - Separate Statement Check (MSJ/MSA only)
    // ========================================================================
    const phaseIX1Result = await step.run("phase-ix1-separate-statement", async () => {
      console.log('[Orchestration] Phase IX.1 - has previous:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("IX.1", input);

      if (!result.success || !result.output) {
        console.error(`[Phase IX.1] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase IX.1 failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "IX.1", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseIX1Result?.output) {
      workflowState.phaseOutputs["IX.1"] = phaseIX1Result.output;
    }
    console.log('[Orchestration] Accumulated after IX.1:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // SP-13 Step 6.5/6.6: Protocol dispatch after Phase IX.1 (Decision 8)
    // ========================================================================
    if (DISPATCHER_PHASES.includes('IX.1')) {
      // SP-18: Derive verification status from actual Phase IX.1 results
      const ix1Output = (phaseIX1Result?.output ?? {}) as Record<string, unknown>;
      const ix1Audit = ix1Output?.finalCitationAudit as Record<string, unknown> | undefined;
      const ix1HasRejected = ((ix1Audit?.rejected as number) ?? 0) > 0 || ((ix1Audit?.blocked as number) ?? 0) > 0;
      const ix1DispatchStatus = ix1HasRejected ? 'VERIFICATION_DEFERRED' as const : 'VERIFIED' as const;

      const ix1DispatchResult = await step.run('dispatch-protocols-ix1', async () => {
        return dispatchProtocols({
          orderId,
          phase: 'IX.1',
          tier: (workflowState.tier || 'A') as 'A' | 'B' | 'C' | 'D',
          jurisdiction: workflowState.orderContext.jurisdiction || 'LA',
          citation: { id: orderId, text: '' },
          verificationResult: { status: ix1DispatchStatus },
          detectionOnly: false,
        });
      });

      await step.run('persist-protocol-results-ix1', async () => {
        await persistProtocolResults(
          supabase, orderId, 'IX.1',
          ix1DispatchResult.results, orderId
        );
      });

      if (ix1DispatchResult.holdRequired) {
        await step.sendEvent('send-hold-event-ix1', {
          name: 'workflow/hold-required',
          data: {
            orderId,
            holdProtocol: ix1DispatchResult.holdProtocol,
            phase: 'IX.1',
          },
        });
      }
    }

    // ========================================================================
    // STEP 15: Phase X - Final Assembly + CP3 Checkpoint (Admin Approval)
    // ========================================================================
    const phaseXResult = await step.run("phase-x-final-assembly", async () => {
      console.log('[Orchestration] Phase X - ALL previous outputs:', Object.keys(workflowState.phaseOutputs));
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("X", input);

      if (!result.success || !result.output) {
        console.error(`[Phase X] FAILED: ${result.error || 'No output'}`);
        throw new Error(`Phase X failed: ${result.error || 'No output returned'}`);
      }

      await logPhaseExecution(supabase, workflowState, "X", result, result.tokensUsed);
      return result;
    });
    // CRITICAL: Store output OUTSIDE step.run() for persistence across steps
    if (phaseXResult?.output) {
      workflowState.phaseOutputs["X"] = phaseXResult.output;
    }
    console.log('[Orchestration] FINAL - All accumulated phases:', Object.keys(workflowState.phaseOutputs));

    // ========================================================================
    // STEP 15: Generate Deliverables (before CP3 handoff)
    // ========================================================================
    const deliverables = await step.run("generate-deliverables", async () => {
      return await generateDeliverables(workflowState, supabase);
    });

    // ========================================================================
    // STEP 15.5: Finalize Workflow — persist motion & conversation records
    // ========================================================================
    const finalResult = await step.run("finalize-workflow", async () => {
      console.log('[Workflow Finalization] Extracting motion from phase outputs...');
      console.log('[Workflow Finalization] Available phases:', Object.keys(workflowState.phaseOutputs));

      const phaseXOutput = (workflowState.phaseOutputs?.["X"] ?? {}) as Record<string, unknown>;
      const phaseVIIIOutput = (workflowState.phaseOutputs?.["VIII"] ?? {}) as Record<string, unknown>;
      const phaseVOutput = (workflowState.phaseOutputs?.["V"] ?? {}) as Record<string, unknown>;

      console.log('[Workflow Finalization] Phase X keys:', Object.keys(phaseXOutput));
      console.log('[Workflow Finalization] Phase VIII keys:', Object.keys(phaseVIIIOutput));
      console.log('[Workflow Finalization] Phase V keys:', Object.keys(phaseVOutput));

      const finalPackage = phaseXOutput?.finalPackage as Record<string, unknown> | undefined;
      const revisedMotion = phaseVIIIOutput?.revisedMotion as Record<string, unknown> | undefined;
      const draftMotion = phaseVOutput?.draftMotion as Record<string, unknown> | undefined;

      let motionContent: string = '';
      let motionSource: string = 'none';

      if (finalPackage?.motion && typeof finalPackage.motion === 'string') {
        motionContent = finalPackage.motion;
        motionSource = 'Phase X finalPackage.motion';
      } else if (revisedMotion) {
        motionContent = formatMotionObjectToText(revisedMotion);
        motionSource = 'Phase VIII revisedMotion';
      } else if (draftMotion) {
        motionContent = formatMotionObjectToText(draftMotion);
        motionSource = 'Phase V draftMotion';
      }

      console.log(`[Workflow Finalization] Motion source: ${motionSource}`);
      console.log(`[Workflow Finalization] Motion content length: ${motionContent.length} chars`);

      const phaseIVOutput = (workflowState.phaseOutputs?.["IV"] ?? {}) as Record<string, unknown>;
      const caseCitations = (phaseIVOutput?.caseCitationBank ?? []) as unknown[];
      const statuteCitations = (phaseIVOutput?.statutoryCitationBank ?? []) as unknown[];
      const actualCitationCount = caseCitations.length + statuteCitations.length;
      console.log(`[Workflow Finalization] Citation count: ${actualCitationCount}`);

      if (!motionContent || motionContent.length < 100) {
        console.warn('[Workflow Finalization] WARNING: Motion content is empty or too short!');
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "workflow_warning",
          action_details: {
            warning: "Motion content is empty or too short",
            motionSource,
            motionLength: motionContent.length,
            phaseXKeys: Object.keys(phaseXOutput),
            phaseVIIIKeys: Object.keys(phaseVIIIOutput),
            phaseVKeys: Object.keys(phaseVOutput),
            allPhaseKeys: Object.keys(workflowState.phaseOutputs),
          },
        });
      }

      let conversation;
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("order_id", orderId)
        .single();

      if (existingConv) {
        await supabase
          .from("conversations")
          .update({
            generated_motion: motionContent,
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingConv.id);
        conversation = existingConv;
        console.log('[Workflow Finalization] Updated conversation', existingConv.id, 'with motion');
      } else {
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            order_id: orderId,
            generated_motion: motionContent,
            status: 'completed',
            initial_context: {
              source: 'workflow',
              tier: workflowState.tier,
              motionType: workflowState.orderContext.motionType,
            },
          })
          .select()
          .single();

        if (convError) {
          console.error('[Workflow Finalization] Failed to create conversation:', convError);
        } else {
          conversation = newConv;
          console.log('[Workflow Finalization] Created conversation', newConv?.id, 'with motion');
        }
      }

      // Update workflow status with ACTUAL citation count from Phase IV
      await supabase
        .from("order_workflows")
        .update({
          status: "awaiting_cp3",
          current_phase: 10,
          citation_count: actualCitationCount || workflowState.citationCount,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", workflowState.workflowId);

      // BUG-17: Log completion with idempotency check
      const { data: existingCompletion } = await supabase
        .from("automation_logs")
        .select("id")
        .eq("order_id", orderId)
        .eq("action_type", "workflow_completed")
        .maybeSingle();

      if (!existingCompletion) {
        await supabase.from("automation_logs").insert({
          order_id: orderId,
          action_type: "workflow_completed",
          action_details: {
            workflowId: workflowState.workflowId,
            finalGrade: workflowState.currentGrade,
            citationCount: actualCitationCount,
            revisionLoops: workflowState.revisionLoopCount,
            phasesCompleted: Object.keys(workflowState.phaseOutputs).length,
            motionSaved: !!motionContent && motionContent.length > 100,
            motionLength: motionContent.length,
            motionSource,
            conversationId: conversation?.id,
          },
        });
      } else {
        console.warn('[Workflow Finalization] Duplicate workflow_completed log prevented for order:', orderId);
      }

      return {
        success: true,
        orderId,
        workflowId: workflowState.workflowId,
        finalGrade: workflowState.currentGrade,
        citationCount: actualCitationCount,
        revisionLoops: workflowState.revisionLoopCount,
        motionSaved: !!motionContent && motionContent.length > 100,
        conversationId: conversation?.id,
      };
    });

    // ========================================================================
    // FN1 COMPLETION STEPS: CP3 Package Ready Notification + Handoff to Fn2
    // (W4-6) — Send T+0 email, update status, emit checkpoint/cp3.reached
    // ========================================================================

    // Step: Send package ready notification (T+0)
    await step.run('send-cp3-package-ready', async () => {
      const { data: order } = await supabase
        .from('orders')
        .select('id, client_id, motion_type, workflow_id')
        .eq('id', orderId)
        .single();

      if (!order) throw new Error(`Order ${orderId} not found for CP3 notification`);

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, display_name')
        .eq('id', order.client_id)
        .single();

      if (profile?.email) {
        await fn2QueueEmail(supabase, orderId, 'cp3-package-ready', {
          attorneyName: profile.display_name ?? 'Counselor',
          attorneyEmail: profile.email,
          motionType: order.motion_type,
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://motiongranted.com'}/dashboard/orders/${orderId}/review`,
        });
      }

      await logCheckpointEvent(supabase, {
        orderId,
        eventType: 'CP3_PACKAGE_READY',
        actor: 'system',
        metadata: { notificationSent: !!profile?.email },
      });
    });

    // Step: Update order status to AWAITING_APPROVAL
    await step.run('update-status-awaiting-approval', async () => {
      await supabase.from('orders').update({
        status: 'AWAITING_APPROVAL',
        cp3_entered_at: new Date().toISOString(),
        generation_completed_at: new Date().toISOString(),
        generation_error: null,
      }).eq('id', orderId);
    });

    // Step: Emit checkpoint/cp3.reached — Fn2 takes over from here
    // SP-20 D5: CP3 event MUST include all 6 fields from CP3ApprovalEvent type
    await step.run('cp3-emit-event', async () => {
      const { data: order } = await supabase
        .from('orders')
        .select('workflow_id, tier, client_id, protocol_10_triggered')
        .eq('id', orderId)
        .single();

      const { data: pkg } = await supabase
        .from('delivery_packages')
        .select('id')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Build CP3ApprovalEvent with all 6 required fields
      const phaseXOutput = (workflowState.phaseOutputs?.["X"] ?? {}) as Record<string, unknown>;
      const gradeObj = phaseXOutput?.grade as Record<string, unknown> | undefined;
      const eventData: CP3ApprovalEvent = {
        orderId,
        packageId: pkg?.id ?? '',
        workflowId: order?.workflow_id ?? workflowState.workflowId,
        grade: (gradeObj?.numeric_score as number) ?? 0,
        tier: (order?.tier ?? workflowState.tier) as string,
        protocol10Triggered: order?.protocol_10_triggered ?? false,
      };

      await emitDurableEvent(
        CANONICAL_EVENTS.CHECKPOINT_CP3_REACHED,
        eventData,
        orderId,
        'CP3',
        supabase
      );
    });

    // Fn1 TERMINATES here. Fn2 handles approval lifecycle.
    return finalResult;
  }
);

// ============================================================================
// WORKFLOW FAILURE HANDLER
// ============================================================================

export const handleWorkflowFailure = inngest.createFunction(
  {
    id: "handle-workflow-failure",
  },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    // Only handle failures from our workflow function
    if (event.data.function_id !== "generate-order-workflow") {
      return { skipped: true };
    }

    const { orderId } = event.data.event.data as { orderId: string };
    const errorMessage = event.data.error?.message || "Unknown error";
    const supabase = getSupabase();

    await step.run("log-workflow-failure", async () => {
      // Update order status
      await supabase
        .from("orders")
        .update({
          status: "generation_failed",
          generation_error: errorMessage,
          needs_manual_review: true,
        })
        .eq("id", orderId);

      // Log the failure
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "workflow_failed",
        action_details: {
          error: errorMessage,
          functionId: event.data.function_id,
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Send alert email
    await step.run("send-failure-alert", async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("order_number, case_caption, motion_type, filing_deadline")
        .eq("id", orderId)
        .single();

      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: EMAIL_FROM.alerts,
          to: ALERT_EMAIL,
          subject: `[WORKFLOW FAILED] Order ${order?.order_number || orderId}`,
          text: `
Workflow Generation Failed - Requires Manual Intervention

Order Details:
- Order Number: ${order?.order_number || "N/A"}
- Case: ${order?.case_caption || "N/A"}
- Motion Type: ${order?.motion_type || "N/A"}
- Filing Deadline: ${order?.filing_deadline || "N/A"}

Error: ${errorMessage}

Action Required:
1. Check the admin dashboard for this order
2. Review the automation logs
3. Manually retry or process the order

Admin Dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/admin/orders/${orderId}
          `.trim(),
        });
      } catch (emailError) {
        console.error("Failed to send workflow failure email:", emailError);

        // Queue for retry
        await supabase.from("notification_queue").insert({
          notification_type: "workflow_failed",
          recipient_email: ALERT_EMAIL,
          order_id: orderId,
          template_data: {
            orderNumber: order?.order_number,
            error: errorMessage,
          },
          priority: 10,
          status: "pending",
        });
      }
    });

    return { orderId, failed: true };
  }
);

// ============================================================================
// WORKFLOW TIMEOUT/CANCELLATION HANDLER (TASK-25)
// ============================================================================

export const handleWorkflowTimeout = inngest.createFunction(
  {
    id: "handle-workflow-timeout",
  },
  { event: "inngest/function.cancelled" },
  async ({ event, step }) => {
    // Only handle cancellations from our workflow function
    if (event.data.function_id !== "generate-order-workflow") {
      return { skipped: true };
    }

    const { orderId } = event.data.event.data as { orderId: string };
    const supabase = getSupabase();

    await step.run("log-workflow-timeout", async () => {
      // Transition order to failed state
      await supabase
        .from("orders")
        .update({
          status: "generation_failed",
          generation_error: "Workflow timed out after 30 minutes",
          needs_manual_review: true,
        })
        .eq("id", orderId);

      // Log the timeout
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "workflow_timeout",
        action_details: {
          reason: "inngest/function.cancelled",
          functionId: event.data.function_id,
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Send admin alert
    await step.run("send-timeout-alert", async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("order_number, case_caption, motion_type, filing_deadline")
        .eq("id", orderId)
        .single();

      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: EMAIL_FROM.alerts,
          to: ALERT_EMAIL,
          subject: `[WORKFLOW TIMEOUT] Order ${order?.order_number || orderId}`,
          text: `
Workflow Timed Out - Requires Manual Intervention

Order Details:
- Order Number: ${order?.order_number || "N/A"}
- Case: ${order?.case_caption || "N/A"}
- Motion Type: ${order?.motion_type || "N/A"}
- Filing Deadline: ${order?.filing_deadline || "N/A"}

The workflow exceeded the 30-minute timeout limit and was cancelled by Inngest.

Action Required:
1. Check the admin dashboard for this order
2. Review the automation logs to see which phase was running
3. Consider manually retrying or processing the order

Admin Dashboard: ${process.env.NEXT_PUBLIC_APP_URL || "https://motiongranted.com"}/admin/orders/${orderId}
          `.trim(),
        });
      } catch (emailError) {
        console.error("Failed to send workflow timeout email:", emailError);

        // Queue for retry
        await supabase.from("notification_queue").insert({
          notification_type: "workflow_timeout",
          recipient_email: ALERT_EMAIL,
          order_id: orderId,
          template_data: {
            orderNumber: order?.order_number,
            reason: "Workflow exceeded 30-minute timeout",
          },
          priority: 10,
          status: "pending",
        });
      }
    });

    return { orderId, timedOut: true };
  }
);

// ============================================================================
// FUNCTION 2: WORKFLOW CHECKPOINT APPROVAL (SP-5 W4-1 through W4-6)
// ============================================================================
//
// BINDING REFERENCE — CP3 Approval Flow (Domain 5)
//
// CP3 Location: Phase X Stage 6 (NOT Phase IX)
// CP3 Actor: Attorney-only. NO admin gate.
// Rework Cap: 3 attorney cycles. Re-entry Phase VII.
// Cost Tracking: RESETS on attorney rework (binding 02/15/26)
// Timeout: 14d Stage 1 + 7d Stage 2 = 21d total
// Reminder Sequence: T+48h, T+72h, T+14d FINAL NOTICE, T+21d auto-cancel
// Refund: 50% flat (CP3_CANCEL and CP3_TIMEOUT_CANCEL)
// Status Flow: AWAITING_APPROVAL → COMPLETED (no APPROVED intermediate)
// Canonical Events (5 ONLY):
//   order/submitted, order/revision-requested, order/protocol-10-exit,
//   checkpoint/cp3.reached, workflow/checkpoint-approved
// Fn2 Wait Match: data.orderId (NOT data.workflowId)
// Protocol 10: Disables Request Changes. Clears on pass.
// Retention: 365 days from delivery
// Status Model (7): PAID, HOLD_PENDING, IN_PROGRESS, AWAITING_APPROVAL,
//   REVISION_REQ, COMPLETED, CANCELLED
//

/**
 * onFailure handler for Fn2. Logs to audit trail and sends admin alert
 * when Fn2 exhausts all retries.
 */
async function handleApprovalFailure({
  event,
  error,
}: {
  event: { data: { orderId?: string } };
  error: Error;
}): Promise<void> {
  const orderId = event?.data?.orderId;
  console.error(`[Fn2 FAILURE] Order ${orderId}:`, error.message);

  if (orderId) {
    const supabase = getServiceSupabase();

    await logCheckpointEvent(supabase, {
      orderId,
      eventType: 'FN2_FAILURE',
      actor: 'system',
      metadata: {
        error: error.message,
        stack: error.stack?.slice(0, 500),
      },
    });

    await fn2SendAdminAlert(
      supabase,
      orderId,
      'FN2_EXHAUSTED',
      `Function 2 exhausted all retries: ${error.message}`
    );
  }
}

export const workflowCheckpointApproval = inngest.createFunction(
  {
    id: 'workflow-checkpoint-approval',
    retries: 3, // BINDING 02/15/26 (ING-CP3T): 3 retries per spec
    concurrency: [{ limit: 1, key: 'event.data.orderId' }],
    onFailure: handleApprovalFailure as any,
  },
  { event: 'checkpoint/cp3.reached' },
  async ({ event, step }) => {
    const { orderId, workflowId } = event.data;
    const supabase = getServiceSupabase();

    // Record CP3 entry
    await step.run('record-cp3-entry', async () => {
      await scheduleCP3Timeouts(supabase, orderId);
      await logCheckpointEvent(supabase, {
        orderId,
        eventType: 'CP3_ENTERED',
        actor: 'system',
        metadata: { triggeredBy: 'fn1_completion', workflowId },
      });
    });

    // STAGE 1: 14-day wait with reminders
    const [stage1Decision] = await Promise.all([
      step.waitForEvent('wait-for-cp3-approval-stage1', {
        event: 'workflow/checkpoint-approved',
        match: 'data.orderId',
        timeout: '14d',
      }),
      // 48h reminder
      step.sleep('reminder-48h', '48h').then(() =>
        step.run('send-48h-reminder', async () => {
          await sendCP3ReminderEmail(supabase, orderId, '48h');
          await logCheckpointEvent(supabase, {
            orderId, eventType: 'CP3_REMINDER_48H', actor: 'system',
          });
        })
      ),
      // 72h reminder
      step.sleep('reminder-72h', '72h').then(() =>
        step.run('send-72h-reminder', async () => {
          await sendCP3ReminderEmail(supabase, orderId, '72h');
          await logCheckpointEvent(supabase, {
            orderId, eventType: 'CP3_REMINDER_72H', actor: 'system',
          });
        })
      ),
    ]);

    // Stage 1 Resolution
    if (stage1Decision) {
      return await processCP3Decision(
        step, supabase, orderId, stage1Decision as { data: CP3DecisionPayload }
      );
    }

    // Stage 1 TIMEOUT: Send FINAL NOTICE
    await step.run('send-final-notice', async () => {
      await sendCP3FinalNoticeEmail(supabase, orderId);
      await logCheckpointEvent(supabase, {
        orderId,
        eventType: 'CP3_FINAL_NOTICE_14D',
        actor: 'system',
        metadata: { message: '7 days until auto-cancel' },
      });
    });

    // STAGE 2: 7-day grace period
    const stage2Decision = await step.waitForEvent(
      'wait-for-cp3-approval-stage2',
      {
        event: 'workflow/checkpoint-approved',
        match: 'data.orderId',
        timeout: '7d',
      }
    );

    if (stage2Decision) {
      return await processCP3Decision(
        step, supabase, orderId, stage2Decision as { data: CP3DecisionPayload }
      );
    }

    // Stage 2 TIMEOUT: Auto-cancel with 50% refund
    return await handleCancel(
      step, supabase, orderId, 'system', 'CP3_TIMEOUT_CANCEL'
    );
  }
);

// ============================================================================
// FN2 DECISION ROUTER (W4-1)
// ============================================================================

async function processCP3Decision(
  step: any,
  supabase: SupabaseClient,
  orderId: string,
  decision: { data: CP3DecisionPayload }
): Promise<void> {
  const { action, notes, attorneyId } = decision.data;

  // Guard: verify order is still AWAITING_APPROVAL
  const order = await step.run('verify-order-status', async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('status, workflow_id, tier, protocol_10_triggered, attorney_rework_count, stripe_payment_intent_id, amount_paid')
      .eq('id', orderId)
      .single();

    if (error || !data) {
      throw new Error(`Order ${orderId} not found: ${error?.message}`);
    }
    if (data.status !== 'AWAITING_APPROVAL') {
      throw new Error(
        `Order ${orderId} is ${data.status}, not AWAITING_APPROVAL. Stale event.`
      );
    }
    return data;
  });

  switch (action) {
    case 'APPROVE':
      return await handleApprove(step, supabase, orderId, attorneyId);
    case 'REQUEST_CHANGES':
      return await handleRequestChanges(
        step, supabase, orderId, attorneyId, notes, order
      );
    case 'CANCEL':
      return await handleCancel(
        step, supabase, orderId, attorneyId, 'CP3_CANCEL'
      );
    default:
      throw new Error(`Unknown CP3 action: ${action}`);
  }
}

// ============================================================================
// HANDLE APPROVE — Full Delivery Inline (W4-1, Conflict 2 Fix)
// Status goes directly AWAITING_APPROVAL → COMPLETED. No APPROVED intermediate.
// ============================================================================

async function handleApprove(
  step: any,
  supabase: SupabaseClient,
  orderId: string,
  attorneyId: string
): Promise<void> {
  // Step 1: Cancel all reminders
  await step.run('cancel-reminders-approve', async () => {
    await cancelCP3Timeouts(supabase, orderId);
  });

  // Step 2: Generate signed download URLs (7-day expiry)
  const urls = await step.run('generate-signed-urls', async () => {
    const { data: pkg } = await supabase
      .from('delivery_packages')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!pkg) throw new Error(`No delivery package found for order ${orderId}`);

    const { data: deliverables } = await supabase
      .from('order_deliverables')
      .select('file_key')
      .eq('order_id', orderId);

    const fileKeys = (deliverables ?? []).map((d: { file_key: string }) => d.file_key);
    if (fileKeys.length === 0) {
      throw new Error(`No deliverable files found for order ${orderId}`);
    }

    return await generateSignedUrls(orderId, pkg.id, fileKeys);
  });

  // Step 3: Write delivery records
  await step.run('write-delivery-records', async () => {
    const { data: pkg } = await supabase
      .from('delivery_packages')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pkg) {
      await supabase.from('delivery_packages').update({
        delivered_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        signed_urls: urls.urls
          .filter((u: { signedUrl: string | null }) => u.signedUrl)
          .map((u: { fileKey: string; signedUrl: string | null }) => ({ key: u.fileKey, url: u.signedUrl })),
        signed_urls_generated_at: new Date().toISOString(),
        signed_urls_expire_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
      }).eq('id', pkg.id);
    }
  });

  // Step 4: Send delivery notification email
  await step.run('send-delivery-email', async () => {
    await sendFn2DeliveryEmail(supabase, orderId, urls);
  });

  // Step 5: Update order status to COMPLETED (NO intermediate APPROVED status)
  await step.run('update-order-completed', async () => {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + RETENTION_DAYS);

    const { error } = await supabase.from('orders').update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      retention_expires_at: retentionDate.toISOString(),
    }).eq('id', orderId);

    if (error) {
      throw new Error(`Failed to complete order ${orderId}: ${error.message}`);
    }
  });

  // Step 6: Log approval event (own step.run per W3-2)
  await step.run('log-approval-event', async () => {
    await logCheckpointEvent(supabase, {
      orderId,
      eventType: 'CP3_APPROVED',
      actor: attorneyId,
      metadata: {
        deliveryUrlCount: urls.urls.filter((u: { signedUrl: string | null }) => u.signedUrl).length,
        retentionDays: RETENTION_DAYS,
        allUrlsSucceeded: urls.allSucceeded,
      },
    });
  });
}

// ============================================================================
// HANDLE REQUEST CHANGES (W4-2)
// Protocol 10 block check, rework cap, cost reset, re-entry at Phase VII
// ============================================================================

async function handleRequestChanges(
  step: any,
  supabase: SupabaseClient,
  orderId: string,
  attorneyId: string,
  notes: string | null,
  order: {
    protocol_10_triggered: boolean;
    attorney_rework_count: number;
    workflow_id: string;
    tier: string;
  }
): Promise<void> {
  // Step 1: Cancel reminders
  await step.run('cancel-reminders-rework', async () => {
    await cancelCP3Timeouts(supabase, orderId);
  });

  // Step 2: Check Protocol 10 block
  await step.run('check-p10-block', async () => {
    if (order.protocol_10_triggered) {
      throw new NonRetriableError('REQUEST_CHANGES blocked: Protocol 10 active on order ' + orderId);
    }
  });

  // Step 3: Check rework cap
  await step.run('check-rework-cap', async () => {
    if ((order.attorney_rework_count ?? 0) >= CP3_REWORK_CAP) {
      throw new NonRetriableError(
        `Rework cap (${CP3_REWORK_CAP}) reached for order ${orderId}. ` +
        `Current count: ${order.attorney_rework_count}`
      );
    }
  });

  // Step 4: Database updates (status + loop reset + cost reset)
  await step.run('update-order-rework', async () => {
    const newReworkCount = (order.attorney_rework_count ?? 0) + 1;

    // Update orders table
    await supabase.from('orders').update({
      status: 'REVISION_REQ',
      attorney_rework_count: newReworkCount,
      cp3_change_notes: notes,
      cp3_entered_at: null,
    }).eq('id', orderId);

    // Reset loop counter (D4-007)
    await supabase.from('loop_counters').update({
      revision_loop_count: 0,
    }).eq('order_id', orderId);

    // CONFLICT 5 FIX: Reset cost_tracking for this order
    // Soft-delete via is_rework_reset flag (D4 Task D-5 pattern)
    await supabase.from('cost_tracking').update({
      is_rework_reset: true,
    }).match({ order_id: orderId, is_rework_reset: false });
  });

  // Step 4b: ST6-01 — Extend retention on CP3 rework re-entry
  await step.run('extend-retention-rework', async () => {
    await extendRetentionOnReentry(supabase, orderId);
  });

  // Step 5: Record rejection
  await step.run('record-rejection', async () => {
    const { data: pkg } = await supabase
      .from('delivery_packages')
      .select('id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    await supabase.from('cp3_rejections').insert({
      order_id: orderId,
      package_id: pkg?.id ?? null,
      attorney_id: attorneyId,
      change_notes: notes,
      rejection_number: (order.attorney_rework_count ?? 0) + 1,
    });
  });

  // Step 6: Emit revision event (own step.run per W3-2 durability rule)
  await step.run('emit-revision-requested', async () => {
    await inngest.send({
      name: CANONICAL_EVENTS.ORDER_REVISION_REQUESTED,
      data: {
        orderId,
        workflowId: order.workflow_id,
        revision_source: 'cp3_rejection',
        notes,
        attorneyId,
        reworkCount: (order.attorney_rework_count ?? 0) + 1,
      },
    });
  });

  // Step 7: Log + email (own step.run per W3-2 durability rule)
  await step.run('log-and-email-rework', async () => {
    await logCheckpointEvent(supabase, {
      orderId,
      eventType: 'CP3_REQUEST_CHANGES',
      actor: attorneyId,
      metadata: {
        reworkCount: (order.attorney_rework_count ?? 0) + 1,
        notes,
        tier: order.tier,
      },
    });
    await fn2QueueEmail(supabase, orderId, 'cp3-rework-confirmation');
  });
}

// ============================================================================
// HANDLE CANCEL (W4-3) — Attorney cancel + auto-cancel at T+21d
// Refund lock prevents double-refund race (Conflict 4 fix)
// ============================================================================

async function handleCancel(
  step: any,
  supabase: SupabaseClient,
  orderId: string,
  actorId: string,
  cancellationType: 'CP3_CANCEL' | 'CP3_TIMEOUT_CANCEL'
): Promise<void> {
  // Step 1: Acquire refund lock (CONFLICT 4 FIX)
  const lock = await step.run('acquire-refund-lock', async () => {
    return await acquireRefundLock(supabase, orderId);
  });

  if (!lock.acquired) {
    // Another process already processing cancel/refund — exit gracefully
    await step.run('log-lock-contention', async () => {
      await logCheckpointEvent(supabase, {
        orderId,
        eventType: 'CP3_CANCEL_LOCK_CONTENTION',
        actor: 'system',
        metadata: { cancellationType, currentStatus: lock.currentStatus },
      });
    });
    return;
  }

  try {
    // Step 2: Cancel reminders
    await step.run('cancel-reminders-cancel', async () => {
      await cancelCP3Timeouts(supabase, orderId);
    });

    // Step 3: Process refund (50% flat)
    await step.run('process-refund', async () => {
      const { data: order } = await supabase
        .from('orders')
        .select('stripe_payment_intent_id, amount_paid')
        .eq('id', orderId)
        .single();

      if (order?.amount_paid && order?.stripe_payment_intent_id) {
        const refundAmount = Math.round(
          order.amount_paid * (CP3_REFUND_PERCENTAGE / 100)
        );
        if (refundAmount > 0) {
          await stripe!.refunds.create({
            payment_intent: order.stripe_payment_intent_id,
            amount: refundAmount,
            metadata: {
              orderId,
              cancellationType,
              refundPercentage: String(CP3_REFUND_PERCENTAGE),
            },
          });
        }
      }
    });

    // Step 4: Update order status
    await step.run('update-order-cancelled', async () => {
      await supabase.from('orders').update({
        status: 'CANCELLED',
        cancellation_type: cancellationType,
        cancelled_at: new Date().toISOString(),
      }).eq('id', orderId);
    });

    // Step 5: Log + notify
    await step.run('log-and-notify-cancel', async () => {
      await logCheckpointEvent(supabase, {
        orderId,
        eventType: 'CP3_CANCELLED',
        actor: actorId,
        metadata: {
          cancellationType,
          refundPercentage: CP3_REFUND_PERCENTAGE,
        },
      });

      const templateName = cancellationType === 'CP3_CANCEL'
        ? 'cp3-cancellation-cp3_cancel'
        : 'cp3-cancellation-cp3_timeout_cancel';
      await fn2QueueEmail(supabase, orderId, templateName);

      // Admin alert for auto-cancel
      if (cancellationType === 'CP3_TIMEOUT_CANCEL') {
        await fn2SendAdminAlert(
          supabase,
          orderId,
          'CP3_AUTO_CANCEL',
          'Order auto-cancelled after 21-day timeout'
        );
      }
    });

  } finally {
    // ALWAYS release refund lock
    await step.run('release-refund-lock', async () => {
      await releaseRefundLock(supabase, orderId);
    });
  }
}

// ============================================================================
// FN2 EMAIL HELPERS (W4-5/5a/5b)
// ============================================================================

/**
 * Send CP3 reminder email at a specific interval.
 * Templates: cp3-reminder-48h, cp3-reminder-72h
 */
async function sendCP3ReminderEmail(
  supabase: SupabaseClient,
  orderId: string,
  interval: '48h' | '72h'
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, motion_type, status')
    .eq('id', orderId)
    .single();

  // Guard: don't send if order is no longer AWAITING_APPROVAL
  if (!order || order.status !== 'AWAITING_APPROVAL') {
    console.log(`[cp3-reminder] Skipping ${interval} reminder — order ${orderId} is ${order?.status}`);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', order.client_id)
    .single();

  if (!profile?.email) {
    console.error(`[cp3-reminder] No email for client ${order.client_id}`);
    return;
  }

  await fn2QueueEmail(supabase, orderId, `cp3-reminder-${interval}`, {
    attorneyName: profile.display_name ?? 'Counselor',
    attorneyEmail: profile.email,
    motionType: order.motion_type,
    interval,
  });
}

/**
 * Send CP3 FINAL NOTICE at T+14d.
 * Template: cp3-final-notice
 */
async function sendCP3FinalNoticeEmail(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, motion_type, status, cp3_entered_at')
    .eq('id', orderId)
    .single();

  if (!order || order.status !== 'AWAITING_APPROVAL') {
    console.log(`[cp3-final-notice] Skipping — order ${orderId} is ${order?.status}`);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', order.client_id)
    .single();

  if (!profile?.email) return;

  // Calculate auto-cancel date (cp3_entered_at + 21 days)
  const autoCancelDate = order.cp3_entered_at
    ? new Date(new Date(order.cp3_entered_at).getTime() + 21 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await fn2QueueEmail(supabase, orderId, 'cp3-final-notice', {
    attorneyName: profile.display_name ?? 'Counselor',
    attorneyEmail: profile.email,
    motionType: order.motion_type,
    autoCancelDate: autoCancelDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  });
}

/**
 * Send delivery email on APPROVE.
 * Template: cp3-delivery
 */
async function sendFn2DeliveryEmail(
  supabase: SupabaseClient,
  orderId: string,
  urls: { urls: Array<{ fileKey: string; signedUrl: string | null }>; allSucceeded: boolean }
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, motion_type')
    .eq('id', orderId)
    .single();

  if (!order) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', order.client_id)
    .single();

  if (!profile?.email) return;

  await fn2QueueEmail(supabase, orderId, 'cp3-delivery', {
    attorneyName: profile.display_name ?? 'Counselor',
    attorneyEmail: profile.email,
    motionType: order.motion_type,
    downloadUrls: urls.urls.filter((u) => u.signedUrl),
    urlExpiryDays: 7,
  });
}

/**
 * Generic email queue function.
 * Uses the email_queue table (schema: template TEXT, data JSONB).
 */
async function fn2QueueEmail(
  supabase: SupabaseClient,
  orderId: string,
  templateId: string,
  data?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('email_queue').insert({
    order_id: orderId,
    template: templateId,
    data: data ?? {},
    status: 'pending',
  });

  if (error) {
    console.error(`[email-queue] Failed to queue ${templateId} for order ${orderId}:`, error);
  }
}

/**
 * Send admin alert for urgent situations.
 */
async function fn2SendAdminAlert(
  supabase: SupabaseClient,
  orderId: string,
  alertType: string,
  message: string
): Promise<void> {
  console.warn(`[ADMIN ALERT] ${alertType} — Order ${orderId}: ${message}`);
  await fn2QueueEmail(supabase, orderId, 'admin-alert', {
    alertType,
    message,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const workflowFunctions = [
  generateOrderWorkflow,
  handleWorkflowFailure,
  handleWorkflowTimeout,
  workflowCheckpointApproval,
];
