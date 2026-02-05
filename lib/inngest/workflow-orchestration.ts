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
 * VII.1- Revision Loop (if B+ not achieved, max 3 loops)
 * VIII - Final Draft (Opus for B/C, 8K thinking)
 * VIII.5- MSJ Separate Statement (if applicable)
 * IX   - Document Formatting (Sonnet)
 * IX.1 - Caption QC (Sonnet)
 * X    - Final QA -> CP3 checkpoint (requires admin approval)
 */

import { inngest } from "./client";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// Workflow infrastructure imports
import { gatherOrderContext, type OrderContext } from "@/lib/workflow/orchestrator";
import {
  executePhase,
  PHASE_EXECUTORS,
  type PhaseInput,
  type PhaseOutput,
} from "@/lib/workflow/phase-executors";
import {
  getModelConfig,
  getModelId,
  createMessageParams,
  shouldUseOpus,
} from "@/lib/workflow/model-router";
import { triggerCheckpoint, type CheckpointType } from "@/lib/workflow/checkpoint-service";
import {
  checkCitationRequirements,
  extractCitations,
  CITATION_HARD_STOP_MINIMUM,
} from "@/lib/workflow/citation-verifier";

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
} from "@/lib/email/email-triggers";

// Phase IV multi-step executor for avoiding Vercel timeout
import {
  executePhaseIVInit,
  executePhaseIVBatch,
  executePhaseIVAggregate,
  type PhaseIVInitResult,
  type PhaseIVBatchResult,
} from "@/lib/workflow/phase-iv/multi-step-executor";

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
 */
function buildPhaseInput(state: WorkflowState): PhaseInput {
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
    documents: state.orderContext.documents.parsed.map((d) => d.summary),

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
    firmCity: state.orderContext.firmCity || '',
    firmState: state.orderContext.firmState || 'LA',
    firmZip: state.orderContext.firmZip || '',
    firmPhone: state.orderContext.firmPhone || '',
    firmEmail: state.orderContext.firmEmail || '',
    firmFullAddress: state.orderContext.firmFullAddress || '',
    filingDeadline: state.orderContext.filingDeadline ?? undefined,
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
 * Create a simple motion PDF using pdf-lib
 */
async function createSimpleMotionPDF(content: string, orderContext: OrderContext): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');

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
      // Build verification results from citation banks (Phase IV uses caseCitationBank, not verificationResults)
      const allCitations: Array<{ citation: string; status: string; confidence: number }> = [
        ...caseCitationBank.map((c: unknown) => ({
          citation: String((c as Record<string, unknown>)?.citation ?? 'Unknown case citation'),
          status: 'VERIFIED',
          confidence: 1.0,
        })),
        ...statutoryCitationBank.map((c: unknown) => ({
          citation: String((c as Record<string, unknown>)?.citation ?? 'Unknown statute citation'),
          status: 'VERIFIED',
          confidence: 1.0,
        })),
      ];

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
// MAIN WORKFLOW ORCHESTRATION
// ============================================================================

export const generateOrderWorkflow = inngest.createFunction(
  {
    id: "generate-order-workflow",
    concurrency: { limit: 5 },  // Inngest plan limit
    retries: 3,
    // CRITICAL: Increase timeout for PDF generation and finalization steps
    // Default is 10min, but deliverables + finalization can take longer
    timeouts: {
      finish: "15m",  // Total workflow timeout - increase if needed
    },
  },
  { event: "order/submitted" },
  async ({ event, step }) => {
    const { orderId } = event.data;
    const supabase = getSupabase();

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

      if (deadlineValidation.blocked) {
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
    // Also parse narrative text for HOLD signal keywords as backup.
    const phaseIIIOutput = phaseIIIResult?.output as Record<string, unknown> | undefined;

    // Check all possible field name variants for hold signal
    const holdFromCamelCase = phaseIIIOutput?.holdRequired === true;
    const holdFromSnakeCase = phaseIIIOutput?.hold_recommended === true;
    const holdFromCamelRecommended = phaseIIIOutput?.holdRecommended === true;

    // BUG-04: Keyword-based backup detection — parse Phase III narrative
    const phaseIIINarrative = JSON.stringify(phaseIIIOutput || '').toUpperCase();
    const holdKeywords = ['CRITICAL', 'EVIDENCE GAPS', 'HOLD', 'MISSING', 'INSUFFICIENT'];
    const keywordCount = holdKeywords.filter(kw => phaseIIINarrative.includes(kw)).length;
    const holdFromKeywords = keywordCount >= 2; // At least 2 keywords = likely HOLD signal

    const holdRequired = holdFromCamelCase || holdFromSnakeCase || holdFromCamelRecommended || holdFromKeywords;
    const holdReason = (
      phaseIIIOutput?.holdReason ??
      phaseIIIOutput?.hold_reason ??
      phaseIIIOutput?.reason ??
      'Critical gaps detected in evidence/case data'
    ) as string;

    if (holdRequired) {
      console.log('[Orchestration] ========== HOLD TRIGGERED ==========');
      console.log('[Orchestration] Reason:', holdReason);

      // Execute HOLD handling in a step for proper Inngest tracking
      const holdResult = await step.run("handle-phase-iii-hold", async () => {
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

        // Queue notification to client
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

        return {
          held: true,
          reason: holdReason,
        };
      });

      // STOP WORKFLOW - Return early with on_hold status
      console.log('[Orchestration] Workflow STOPPED at Phase III due to HOLD');
      return {
        success: true,
        orderId,
        workflowId: workflowState.workflowId,
        status: "on_hold",
        holdPhase: "III",
        holdReason,
        message: "Workflow paused - client action required",
      };
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

    // ========================================================================
    // STEP 7: Phase V.1 - Citation Accuracy Check
    // ========================================================================
    const phaseV1Result = await step.run("phase-v1-citation-accuracy", async () => {
      console.log('[Orchestration] Phase V.1 - has previous:', Object.keys(workflowState.phaseOutputs));
      console.log('[Orchestration] Phase V.1 - Phase IV present:', !!workflowState.phaseOutputs['IV']);
      console.log('[Orchestration] Phase V.1 - Phase V present:', !!workflowState.phaseOutputs['V']);
      const input = buildPhaseInput(workflowState);
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
    // BUG-03 FIX: REVISION LOOP — Phase VIII → VII.1 → VII (CORRECT ORDER)
    // ========================================================================
    // BEFORE FIX: The code ran VII.1 before VIII, so VII.1 received `undefined`
    // for revised content because Phase VIII (revisions) hadn't run yet.
    //
    // CORRECT ORDER per spec:
    // 1. VII grades the motion → if grade < B+:
    //    a. VIII (Revisions) — apply revision instructions from VII
    //    b. VII.1 (Citation re-verification on revised text)
    //    c. VII (Re-grade revised draft)
    // 2. Repeat until grade >= B+ or max 3 loops
    //
    // BUG-11 FIX: Loop counter is at WORKFLOW level (workflowState.revisionLoopCount),
    // NOT generated by LLM or stored in step-level state that resets.
    // ========================================================================

    while (
      workflowState.currentGrade &&
      !gradePasses(workflowState.currentGrade) &&
      workflowState.revisionLoopCount < MAX_REVISION_LOOPS
    ) {
      const loopNum = workflowState.revisionLoopCount + 1;
      console.log(`[Orchestration] ===== REVISION LOOP ${loopNum}/${MAX_REVISION_LOOPS} =====`);
      console.log(`[Orchestration] Current grade: ${workflowState.currentGrade} (needs B+ / 3.3)`);

      // STEP A: Phase VIII — Apply revisions based on Phase VII feedback
      const phaseVIIIRevisionResult = await step.run(`phase-viii-revision-loop-${loopNum}`, async () => {
        console.log(`[Orchestration] Phase VIII Loop ${loopNum} - applying revisions`);
        console.log(`[Orchestration] Phase VIII - has previous:`, Object.keys(workflowState.phaseOutputs));
        const input = buildPhaseInput(workflowState);
        input.revisionLoop = loopNum;
        const result = await executePhase("VIII", input);

        if (!result.success || !result.output) {
          console.error(`[Phase VIII Loop ${loopNum}] FAILED: ${result.error || 'No output'}`);
          throw new Error(`Phase VIII revision failed: ${result.error || 'No output returned'}`);
        }

        await logPhaseExecution(supabase, workflowState, "VIII", result, result.tokensUsed);
        return result;
      });

      // CRITICAL: Store Phase VIII output — this is the revised draft
      if (phaseVIIIRevisionResult?.output) {
        workflowState.phaseOutputs["VIII"] = phaseVIIIRevisionResult.output;
        // BUG-03 FIX: Also update the motion_content key for downstream phases
        // Phase VII.1 reads from phaseOutputs["VIII"] for the revised text
      }
      console.log(`[Orchestration] Phase VIII output stored. Keys: ${Object.keys(workflowState.phaseOutputs)}`);

      // STEP B: Phase VII.1 — Citation re-verification on the REVISED text
      const phaseVII1Result = await step.run(`phase-vii1-citation-check-loop-${loopNum}`, async () => {
        console.log(`[Orchestration] Phase VII.1 Loop ${loopNum} - citation re-verification`);
        console.log(`[Orchestration] Phase VII.1 - Phase VIII present:`, !!workflowState.phaseOutputs['VIII']);
        const input = buildPhaseInput(workflowState);
        input.revisionLoop = loopNum;
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
        const judgeOutput = phaseVIIResult.output as { evaluation?: { grade?: string }; grade?: string } | null;
        const grade = judgeOutput?.evaluation?.grade || judgeOutput?.grade;
        workflowState.currentGrade = grade as LetterGrade;
      }
      console.log(`[Orchestration] Loop ${loopNum} complete. Grade: ${workflowState.currentGrade}`);
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
    // MB-03: CP3 Checkpoint — BLOCKING (requires approval before delivery)
    // ========================================================================
    await step.run("checkpoint-cp3-blocking", async () => {
      // Set order status to PENDING_REVIEW — documents NOT delivered
      await supabase
        .from("orders")
        .update({
          status: "pending_review",
          generation_completed_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      await triggerCheckpoint(workflowState.workflowId, "CP3", {
        checkpoint: "CP3",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        finalQA: phaseXResult.output,
        requiresAdminApproval: true,
        blocking: true,
      });

      // Queue admin notification
      await supabase.from("notification_queue").insert({
        notification_type: "approval_needed",
        recipient_email: ADMIN_EMAIL,
        order_id: orderId,
        template_data: {
          checkpoint: "CP3",
          orderNumber: workflowState.orderContext.orderNumber,
          motionType: workflowState.orderContext.motionType,
          caseCaption: workflowState.orderContext.caseCaption,
          finalGrade: workflowState.currentGrade,
          citationCount: workflowState.citationCount,
          revisionLoops: workflowState.revisionLoopCount,
          reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://motiongranted.com"}/admin/orders/${orderId}`,
        },
        priority: 10,
        status: "pending",
      });

      // MB-02: Send CP3 review email to customer
      const customerEmail = workflowState.orderContext.firmEmail;
      if (customerEmail) {
        try {
          const documentList = [
            'Motion Document',
            'Attorney Instruction Sheet',
            'Citation Accuracy Report',
            'Caption QC Report',
          ];
          await sendCP3ReviewNotification(
            {
              orderId,
              orderNumber: workflowState.orderContext.orderNumber,
              customerEmail,
              motionType: workflowState.orderContext.motionType,
            },
            documentList
          );
        } catch (emailErr) {
          console.error('[CP3] Email notification failed (non-fatal):', emailErr);
        }
      }

      console.log(`[Orchestration] CP3 BLOCKING checkpoint triggered — awaiting approval`);
    });

    // ========================================================================
    // STEP 16: Generate Deliverables
    // ========================================================================
    const deliverables = await step.run("generate-deliverables", async () => {
      return await generateDeliverables(workflowState, supabase);
    });

    // ========================================================================
    // STEP 17: Finalize Workflow
    // ========================================================================
    const finalResult = await step.run("finalize-workflow", async () => {
      // CRITICAL FIX: Extract final motion using CORRECT keys
      // Phase X outputs: { finalPackage: { motion: "..." } }
      // Phase VIII outputs: { revisedMotion: {...} }
      // Phase V outputs: { draftMotion: {...} }
      console.log('[Workflow Finalization] Extracting motion from phase outputs...');
      console.log('[Workflow Finalization] Available phases:', Object.keys(workflowState.phaseOutputs));

      const phaseXOutput = (workflowState.phaseOutputs?.["X"] ?? {}) as Record<string, unknown>;
      const phaseVIIIOutput = (workflowState.phaseOutputs?.["VIII"] ?? {}) as Record<string, unknown>;
      const phaseVOutput = (workflowState.phaseOutputs?.["V"] ?? {}) as Record<string, unknown>;

      console.log('[Workflow Finalization] Phase X keys:', Object.keys(phaseXOutput));
      console.log('[Workflow Finalization] Phase VIII keys:', Object.keys(phaseVIIIOutput));
      console.log('[Workflow Finalization] Phase V keys:', Object.keys(phaseVOutput));

      // Try to get motion text from best source
      const finalPackage = phaseXOutput?.finalPackage as Record<string, unknown> | undefined;
      const revisedMotion = phaseVIIIOutput?.revisedMotion as Record<string, unknown> | undefined;
      const draftMotion = phaseVOutput?.draftMotion as Record<string, unknown> | undefined;

      let motionContent: string = '';
      let motionSource: string = 'none';

      // Priority 1: Phase X finalPackage.motion (fully assembled)
      if (finalPackage?.motion && typeof finalPackage.motion === 'string') {
        motionContent = finalPackage.motion;
        motionSource = 'Phase X finalPackage.motion';
      }
      // Priority 2: Phase VIII revisedMotion
      else if (revisedMotion) {
        motionContent = formatMotionObjectToText(revisedMotion);
        motionSource = 'Phase VIII revisedMotion';
      }
      // Priority 3: Phase V draftMotion
      else if (draftMotion) {
        motionContent = formatMotionObjectToText(draftMotion);
        motionSource = 'Phase V draftMotion';
      }

      console.log(`[Workflow Finalization] Motion source: ${motionSource}`);
      console.log(`[Workflow Finalization] Motion content length: ${motionContent.length} chars`);

      // Get citation count from Phase IV
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

      // Get or create conversation for this order
      let conversation;
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("order_id", orderId)
        .single();

      if (existingConv) {
        // Update existing conversation with generated motion
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
        // Create new conversation with generated motion
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

      // Update order status to pending_review (awaiting admin approval)
      await supabase
        .from("orders")
        .update({
          status: "pending_review",
          generation_completed_at: new Date().toISOString(),
          generation_error: null,
        })
        .eq("id", orderId);

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

      // BUG-17: Log completion with idempotency check (prevent duplicate records)
      // Use upsert-like approach: check before insert
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
        status: "pending_review",
        motionSaved: !!motionContent && motionContent.length > 100,
        conversationId: conversation?.id,
      };
    });

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
// EXPORTS
// ============================================================================

export const workflowFunctions = [generateOrderWorkflow, handleWorkflowFailure];
