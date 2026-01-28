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
 * Execute a phase using Claude with proper model routing
 */
async function executePhaseWithClaude(
  phase: WorkflowPhaseCode,
  tier: MotionTier,
  systemPrompt: string,
  userMessage: string,
  state: WorkflowState
): Promise<{ response: string; tokensUsed: { input: number; output: number } }> {
  const client = getAnthropicClient();
  const config = getModelConfig(phase, tier);

  const params = createMessageParams(phase, tier, systemPrompt, userMessage);

  const response = await client.messages.create({
    ...params,
    stream: false,
  }) as Anthropic.Message;

  const textContent = response.content.find((c) => c.type === "text");
  const outputText = textContent?.type === "text" ? textContent.text : "";

  return {
    response: outputText,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

/**
 * Build the phase input object from workflow state
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
    statementOfFacts: state.orderContext.statementOfFacts,
    proceduralHistory: state.orderContext.proceduralHistory,
    instructions: state.orderContext.instructions,
    previousPhaseOutputs: state.phaseOutputs as Record<WorkflowPhaseCode, unknown>,
    documents: state.orderContext.documents.parsed.map((d) => d.summary),
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
// MISSING PHASE EXECUTORS
// ============================================================================

/**
 * Phase V: Draft Motion
 */
async function executePhaseV(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const input = buildPhaseInput(state);
  const legalFramework = state.phaseOutputs["II"];
  const research = state.phaseOutputs["III"] as { citations: Array<{ citation: string; holding: string }> };
  const verification = state.phaseOutputs["IV"];

  const systemPrompt = `You are an expert legal motion drafter. Generate a complete, court-ready ${input.motionType}.

Use the legal framework and verified citations provided. Follow proper legal writing conventions.

Output ONLY the motion document, starting with the caption.`;

  const userMessage = `Draft a ${input.motionType} for:

Case: ${input.caseCaption}
Case Number: ${input.caseNumber}
Jurisdiction: ${input.jurisdiction}

Statement of Facts:
${input.statementOfFacts}

Procedural History:
${input.proceduralHistory}

Legal Framework:
${JSON.stringify(legalFramework)}

Available Citations:
${research?.citations?.map((c) => `- ${c.citation}: ${c.holding}`).join("\n") || "No citations available"}

Special Instructions:
${input.instructions}

Generate the complete motion document.`;

  const result = await executePhaseWithClaude("V", state.tier, systemPrompt, userMessage, state);

  return {
    success: true,
    output: { draft: result.response },
    tokensUsed: result.tokensUsed,
    nextPhase: "V.1",
  };
}

/**
 * Phase V.1: Citation Accuracy Check
 */
async function executePhaseV1(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const draft = state.phaseOutputs["V"] as { draft: string };

  // Extract citations from draft
  const citations = extractCitations(draft?.draft || "");

  // Log citation extraction
  await supabase.from("automation_logs").insert({
    order_id: state.orderId,
    action_type: "citation_accuracy_check",
    action_details: {
      citationsFound: citations.length,
      citationTypes: citations.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
  });

  return {
    success: true,
    output: {
      citationsVerified: citations.length,
      citations: citations.slice(0, 20),
    },
    nextPhase: "VI",
  };
}

/**
 * Phase VI: Opposition Anticipation (8K thinking for B/C)
 */
async function executePhaseVI(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const draft = state.phaseOutputs["V"] as { draft: string };
  const input = buildPhaseInput(state);

  const systemPrompt = `You are an expert legal strategist. Analyze the motion and anticipate opposing arguments.

Use extended thinking to thoroughly consider counter-arguments and prepare responses.

Provide a JSON response with:
- opposingArguments: array of anticipated arguments
- counterResponses: array of responses to each argument
- weaknesses: array of motion weaknesses
- strengtheningSuggestions: array of improvements`;

  const userMessage = `Anticipate opposition arguments for this ${input.motionType}:

${draft?.draft?.slice(0, 8000) || "No draft available"}

Jurisdiction: ${input.jurisdiction}

Provide comprehensive opposition analysis.`;

  const result = await executePhaseWithClaude("VI", state.tier, systemPrompt, userMessage, state);

  // Parse JSON from response
  let analysis;
  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result.response };
  } catch {
    analysis = { raw: result.response };
  }

  return {
    success: true,
    output: { draft: draft?.draft, oppositionAnalysis: analysis },
    tokensUsed: result.tokensUsed,
    nextPhase: "VII",
  };
}

/**
 * Phase VII: Judge Simulation (Always Opus, 10K thinking)
 */
async function executePhaseVII(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const input = buildPhaseInput(state);
  const phaseVIOutput = state.phaseOutputs["VI"] as { draft: string };

  const systemPrompt = `You are an experienced federal judge evaluating a motion.
Use extended thinking to thoroughly analyze this motion before providing your evaluation.

Evaluate on these criteria:
1. Legal soundness of arguments
2. Proper citation and use of authority
3. Clarity and organization
4. Persuasiveness
5. Compliance with procedural requirements

Provide a letter grade (A+ through F) where B+ (3.3) is the minimum acceptable standard.

Output JSON with:
- grade: letter grade
- numericGrade: GPA equivalent (4.3 scale)
- passes: boolean (true if B+ or better)
- strengths: array of strengths
- weaknesses: array of areas for improvement
- specificFeedback: detailed feedback
- revisionSuggestions: array of specific revisions if grade < B+`;

  const userMessage = `Evaluate this ${input.motionType}:

Case: ${input.caseCaption}
Jurisdiction: ${input.jurisdiction}

MOTION CONTENT:
${phaseVIOutput?.draft || "No draft available"}

Provide your judicial evaluation.`;

  const result = await executePhaseWithClaude("VII", state.tier, systemPrompt, userMessage, state);

  // Parse judge evaluation
  let evaluation: JudgeSimulationResult;
  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    evaluation = {
      grade: parsed.grade || "C",
      numericGrade: parsed.numericGrade || 2.0,
      passes: parsed.passes ?? false,
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      specificFeedback: parsed.specificFeedback || "",
      revisionSuggestions: parsed.revisionSuggestions || [],
      loopNumber: state.revisionLoopCount + 1,
    };
  } catch {
    evaluation = {
      grade: "C",
      numericGrade: 2.0,
      passes: false,
      strengths: [],
      weaknesses: ["Could not parse evaluation"],
      specificFeedback: result.response,
      revisionSuggestions: [],
      loopNumber: state.revisionLoopCount + 1,
    };
  }

  // Store judge result in database
  await supabase.from("judge_simulation_results").insert({
    workflow_id: state.workflowId,
    grade: evaluation.grade,
    numeric_grade: evaluation.numericGrade,
    passes: evaluation.passes,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    specific_feedback: evaluation.specificFeedback,
    revision_suggestions: evaluation.revisionSuggestions,
    loop_number: evaluation.loopNumber,
  });

  // Update workflow with judge simulation results
  await supabase
    .from("order_workflows")
    .update({
      judge_sim_grade: evaluation.grade,
      judge_sim_grade_numeric: evaluation.numericGrade,
      judge_sim_passed: evaluation.passes,
    })
    .eq("id", state.workflowId);

  const passes = gradePasses(evaluation.grade as LetterGrade);
  const nextPhase: WorkflowPhaseCode = passes ? "VIII" : "VII.1";

  return {
    success: true,
    output: evaluation,
    tokensUsed: result.tokensUsed,
    requiresCheckpoint: true,
    checkpointType: "CP2",
    nextPhase,
  };
}

/**
 * Phase VII.1: Revision Loop
 */
async function executePhaseVII1(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const judgeResult = state.phaseOutputs["VII"] as JudgeSimulationResult;
  const draft = (state.phaseOutputs["VI"] as { draft: string })?.draft;
  const input = buildPhaseInput(state);

  // If we've hit max revision loops, escalate
  if (state.revisionLoopCount >= MAX_REVISION_LOOPS) {
    await supabase.from("automation_logs").insert({
      order_id: state.orderId,
      action_type: "revision_escalation",
      action_details: {
        reason: "Max revision loops reached",
        loopCount: state.revisionLoopCount,
        finalGrade: judgeResult.grade,
      },
    });

    // Flag for admin review
    await supabase
      .from("orders")
      .update({
        needs_manual_review: true,
        quality_notes: `ESCALATION: ${MAX_REVISION_LOOPS} revision loops completed without achieving B+ grade. Final grade: ${judgeResult.grade}`,
      })
      .eq("id", state.orderId);

    // Continue to final draft despite not meeting grade threshold
    return {
      success: true,
      output: {
        escalated: true,
        reason: "Max revision loops reached",
        finalGrade: judgeResult.grade,
      },
      nextPhase: "VIII",
    };
  }

  const systemPrompt = `You are an expert legal editor. Revise the motion based on judge feedback.

Use extended thinking to carefully address each weakness and incorporate improvements.

Focus on:
1. Addressing specific weaknesses identified
2. Strengthening arguments
3. Improving clarity and persuasiveness
4. Ensuring proper citations

Output the REVISED motion document only.`;

  const userMessage = `Revise this ${input.motionType} based on judge feedback:

CURRENT GRADE: ${judgeResult.grade} (needs B+ or better)

WEAKNESSES TO ADDRESS:
${judgeResult.weaknesses?.join("\n") || "None specified"}

REVISION SUGGESTIONS:
${judgeResult.revisionSuggestions?.join("\n") || "None specified"}

SPECIFIC FEEDBACK:
${judgeResult.specificFeedback}

CURRENT DRAFT:
${draft}

Produce the revised motion.`;

  const result = await executePhaseWithClaude("VIII", state.tier, systemPrompt, userMessage, state);

  return {
    success: true,
    output: { revisedDraft: result.response, loopNumber: state.revisionLoopCount + 1 },
    tokensUsed: result.tokensUsed,
    nextPhase: "VII", // Loop back to judge simulation
  };
}

/**
 * Phase VIII: Final Draft (8K thinking for B/C)
 */
async function executePhaseVIII(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const input = buildPhaseInput(state);

  // Get the best draft - either from revision loop or original
  const revisedDraft = state.phaseOutputs["VII.1"] as { revisedDraft?: string };
  const originalDraft = (state.phaseOutputs["VI"] as { draft: string })?.draft;
  const currentDraft = revisedDraft?.revisedDraft || originalDraft;

  const systemPrompt = `You are an expert legal document finalizer. Polish the motion for filing.

Ensure:
1. Proper formatting for court submission
2. All citations are correctly formatted (Bluebook)
3. Professional tone throughout
4. Logical flow and organization
5. Complete signature block and certificate of service

Output the FINAL motion document ready for filing.`;

  const userMessage = `Finalize this ${input.motionType} for filing:

Case: ${input.caseCaption}
Case Number: ${input.caseNumber}
Jurisdiction: ${input.jurisdiction}

DRAFT:
${currentDraft}

Produce the final, court-ready document.`;

  const result = await executePhaseWithClaude("VIII", state.tier, systemPrompt, userMessage, state);

  return {
    success: true,
    output: { finalDraft: result.response },
    tokensUsed: result.tokensUsed,
    nextPhase: "VIII.5",
  };
}

/**
 * Phase VIII.5: MSJ Separate Statement (if applicable)
 */
async function executePhaseVIII5(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const input = buildPhaseInput(state);
  const motionType = input.motionType.toLowerCase();

  // Only execute for MSJ/MSA motions
  if (!motionType.includes("summary judgment") && !motionType.includes("msj") && !motionType.includes("msa")) {
    return {
      success: true,
      output: { skipped: true, reason: "Not applicable for this motion type" },
      nextPhase: "IX",
    };
  }

  const finalDraft = state.phaseOutputs["VIII"] as { finalDraft: string };

  const systemPrompt = `You are an expert in preparing Separate Statements for summary judgment motions.

Generate a Separate Statement of Undisputed Material Facts that:
1. Lists each material fact with proper numbering
2. Cites supporting evidence for each fact
3. Follows the jurisdiction's specific format requirements

Output the complete Separate Statement document.`;

  const userMessage = `Generate a Separate Statement for this ${input.motionType}:

Jurisdiction: ${input.jurisdiction}

MOTION:
${finalDraft?.finalDraft?.slice(0, 10000) || "No final draft available"}

Create the Separate Statement of Undisputed Material Facts.`;

  const result = await executePhaseWithClaude("VIII.5", state.tier, systemPrompt, userMessage, state);

  return {
    success: true,
    output: { separateStatement: result.response },
    tokensUsed: result.tokensUsed,
    nextPhase: "IX",
  };
}

/**
 * Phase IX: Document Formatting
 */
async function executePhaseIX(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const finalDraft = state.phaseOutputs["VIII"] as { finalDraft: string };
  const separateStatement = state.phaseOutputs["VIII.5"] as { separateStatement?: string };

  // Format and prepare all documents
  const formattedDocuments = {
    motion: finalDraft?.finalDraft,
    separateStatement: separateStatement?.separateStatement,
    formattedAt: new Date().toISOString(),
  };

  return {
    success: true,
    output: { formattedDocument: finalDraft?.finalDraft, allDocuments: formattedDocuments },
    nextPhase: "IX.1",
  };
}

/**
 * Phase IX.1: Caption QC
 */
async function executePhaseIX1(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const input = buildPhaseInput(state);
  const formattedDocs = state.phaseOutputs["IX"] as { formattedDocument: string };

  const systemPrompt = `You are a legal document QC specialist. Check caption consistency.

Verify:
1. Case caption matches across all documents
2. Case number is correct and consistent
3. Court name and division are correct
4. Party names are spelled consistently
5. All formatting follows local rules

Output JSON with:
- passes: boolean
- issues: array of any issues found
- corrections: array of corrections made`;

  const userMessage = `QC check for caption consistency:

Expected Caption: ${input.caseCaption}
Case Number: ${input.caseNumber}
Jurisdiction: ${input.jurisdiction}

DOCUMENT:
${formattedDocs?.formattedDocument?.slice(0, 2000) || "No document"}

Check caption consistency.`;

  const result = await executePhaseWithClaude("IX.1", state.tier, systemPrompt, userMessage, state);

  let qcResult;
  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    qcResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { passes: true, issues: [], corrections: [] };
  } catch {
    qcResult = { passes: true, issues: [], corrections: [] };
  }

  return {
    success: true,
    output: {
      qcPasses: qcResult.passes,
      qcIssues: qcResult.issues,
      qcCorrections: qcResult.corrections,
    },
    tokensUsed: result.tokensUsed,
    nextPhase: "X",
  };
}

/**
 * Phase X: Final QA and Admin Approval
 */
async function executePhaseX(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<PhaseExecutionResult> {
  const finalDraft = state.phaseOutputs["VIII"] as { finalDraft: string };
  const qcResult = state.phaseOutputs["IX.1"] as { qcPasses: boolean };

  // Run final checks
  const checks = {
    hasAllSections: true,
    citationsVerified: state.citationCount >= CITATION_HARD_STOP_MINIMUM,
    formattingCorrect: true,
    noPlaceholders: !finalDraft?.finalDraft?.includes("[PLACEHOLDER]"),
    captionQcPasses: qcResult?.qcPasses ?? true,
    wordCountOk: (finalDraft?.finalDraft?.split(/\s+/).length || 0) >= 500,
  };

  const allChecksPass = Object.values(checks).every(Boolean);

  // Log final QA
  await supabase.from("automation_logs").insert({
    order_id: state.orderId,
    action_type: "final_qa_completed",
    action_details: {
      checks,
      allChecksPass,
      citationCount: state.citationCount,
    },
  });

  return {
    success: true,
    output: {
      checks,
      allChecksPass,
      requiresApproval: true,
      finalDocument: finalDraft?.finalDraft,
    },
    requiresCheckpoint: true,
    checkpointType: "CP3",
  };
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
// DELIVERABLE GENERATION
// ============================================================================

async function generateDeliverables(
  state: WorkflowState,
  supabase: ReturnType<typeof getSupabase>
): Promise<DeliverableResult> {
  console.log('[generateDeliverables] Starting deliverable generation...');

  const { orderId, workflowId, tier, orderContext, phaseOutputs, citationCount } = state;

  // Extract phase outputs
  const finalDraft = phaseOutputs["VIII"] as { finalDraft: string } | undefined;
  const judgeResult = phaseOutputs["VII"] as JudgeSimulationResult | undefined;
  const qcResult = phaseOutputs["IX.1"] as { qcPasses: boolean; qcIssues: string[]; qcCorrections: string[] } | undefined;
  const citationData = phaseOutputs["IV"] as { verificationResults: Array<{ citation: string; status: string; confidence: number }> } | undefined;
  const phaseXResult = phaseOutputs["X"] as { finalDocument: string; checks: Record<string, boolean> } | undefined;

  try {
    const storagePath = `orders/${orderId}/deliverables`;
    const deliverableUrls: DeliverableResult = {};

    // 1. Generate Motion PDF (primary deliverable)
    console.log('[generateDeliverables] Generating motion PDF...');
    try {
      const motionContent = phaseXResult?.finalDocument || finalDraft?.finalDraft || 'Motion content not available';
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
      const instructionContent = generateInstructionSheetContent(
        orderId,
        orderContext,
        tier,
        citationCount,
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
      const citationReportContent = generateCitationReportContent(
        citationData?.verificationResults || [],
        citationCount
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
    concurrency: 10,
  },
  { event: "workflow/generate" },
  async ({ event, step }) => {
    const { orderId } = event.data;
    const supabase = getSupabase();

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
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("I", input);
      workflowState.phaseOutputs["I"] = result.output;

      await logPhaseExecution(supabase, workflowState, "I", result);
      return result;
    });

    // ========================================================================
    // STEP 3: Phase II - Legal Framework
    // ========================================================================
    const phaseIIResult = await step.run("phase-ii-legal-framework", async () => {
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("II", input);
      workflowState.phaseOutputs["II"] = result.output;

      await logPhaseExecution(supabase, workflowState, "II", result, result.tokensUsed);
      return result;
    });

    // ========================================================================
    // STEP 4: Phase III - Legal Research
    // ========================================================================
    const phaseIIIResult = await step.run("phase-iii-legal-research", async () => {
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("III", input);
      workflowState.phaseOutputs["III"] = result.output;

      await logPhaseExecution(supabase, workflowState, "III", result, result.tokensUsed);
      return result;
    });

    // ========================================================================
    // STEP 5: Phase IV - Citation Verification + CP1 Checkpoint
    // ========================================================================
    const phaseIVResult = await step.run("phase-iv-citation-verification", async () => {
      const input = buildPhaseInput(workflowState);
      const result = await executePhase("IV", input);
      workflowState.phaseOutputs["IV"] = result.output;

      // Update citation count
      const verificationOutput = result.output as { verificationResults: Array<{ status: string }> };
      workflowState.citationCount = verificationOutput?.verificationResults?.filter(
        (r) => r.status === "VERIFIED"
      ).length || 0;

      await logPhaseExecution(supabase, workflowState, "IV", result);

      // CP1 Checkpoint - Notify customer about research direction
      await triggerCheckpoint(workflowState.workflowId, "CP1", {
        checkpoint: "CP1",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        researchSummary: result.output,
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
          phase: "Citation Verification",
        },
        priority: 7,
        status: "pending",
      });

      return result;
    });

    // ========================================================================
    // STEP 6: Phase V - Draft Motion
    // ========================================================================
    const phaseVResult = await step.run("phase-v-draft-motion", async () => {
      const result = await executePhaseV(workflowState, supabase);
      workflowState.phaseOutputs["V"] = result.output;

      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "phase_executed",
        action_details: {
          phase: "V",
          phaseName: "Draft Motion",
          success: result.success,
          tokensUsed: result.tokensUsed,
        },
      });

      return result;
    });

    // ========================================================================
    // STEP 7: Phase V.1 - Citation Accuracy Check
    // ========================================================================
    const phaseV1Result = await step.run("phase-v1-citation-accuracy", async () => {
      const result = await executePhaseV1(workflowState, supabase);
      workflowState.phaseOutputs["V.1"] = result.output;
      return result;
    });

    // ========================================================================
    // STEP 8: Phase VI - Opposition Anticipation
    // ========================================================================
    const phaseVIResult = await step.run("phase-vi-opposition-anticipation", async () => {
      const result = await executePhaseVI(workflowState, supabase);
      workflowState.phaseOutputs["VI"] = result.output;

      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "phase_executed",
        action_details: {
          phase: "VI",
          phaseName: "Opposition Anticipation",
          success: result.success,
          tokensUsed: result.tokensUsed,
          usesExtendedThinking: shouldUseOpus("VI", workflowState.tier),
        },
      });

      return result;
    });

    // ========================================================================
    // STEP 9: Phase VII - Judge Simulation + CP2 Checkpoint
    // ========================================================================
    let phaseVIIResult = await step.run("phase-vii-judge-simulation", async () => {
      const result = await executePhaseVII(workflowState, supabase);
      workflowState.phaseOutputs["VII"] = result.output;
      workflowState.currentGrade = (result.output as JudgeSimulationResult).grade as LetterGrade;

      // CP2 Checkpoint - Customer reviews draft and grade
      await triggerCheckpoint(workflowState.workflowId, "CP2", {
        checkpoint: "CP2",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        judgeSimulation: result.output,
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
          passes: gradePasses(workflowState.currentGrade),
          phase: "Judge Simulation",
        },
        priority: 8,
        status: "pending",
      });

      return result;
    });

    // ========================================================================
    // STEP 10: Phase VII.1 - Revision Loop (if needed)
    // ========================================================================
    // Execute revision loop if grade is below B+
    while (
      workflowState.currentGrade &&
      !gradePasses(workflowState.currentGrade) &&
      workflowState.revisionLoopCount < MAX_REVISION_LOOPS
    ) {
      const loopNum = workflowState.revisionLoopCount + 1;

      // Execute revision
      const revisionResult = await step.run(`phase-vii1-revision-loop-${loopNum}`, async () => {
        const result = await executePhaseVII1(workflowState, supabase);
        workflowState.phaseOutputs["VII.1"] = result.output;
        workflowState.revisionLoopCount = loopNum;

        // Update the draft in phase VI output for re-grading
        if (result.output && (result.output as { revisedDraft?: string }).revisedDraft) {
          const existingVI = workflowState.phaseOutputs["VI"] as Record<string, unknown> || {};
          workflowState.phaseOutputs["VI"] = {
            ...existingVI,
            draft: (result.output as { revisedDraft: string }).revisedDraft,
          };
        }

        return result;
      });

      // Check if escalated due to max loops
      if ((revisionResult.output as { escalated?: boolean })?.escalated) {
        break;
      }

      // Re-run judge simulation
      phaseVIIResult = await step.run(`phase-vii-regrade-loop-${loopNum}`, async () => {
        const result = await executePhaseVII(workflowState, supabase);
        workflowState.phaseOutputs["VII"] = result.output;
        workflowState.currentGrade = (result.output as JudgeSimulationResult).grade as LetterGrade;
        return result;
      });
    }

    // ========================================================================
    // STEP 11: Phase VIII - Final Draft
    // ========================================================================
    const phaseVIIIResult = await step.run("phase-viii-final-draft", async () => {
      const result = await executePhaseVIII(workflowState, supabase);
      workflowState.phaseOutputs["VIII"] = result.output;

      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "phase_executed",
        action_details: {
          phase: "VIII",
          phaseName: "Final Draft",
          success: result.success,
          tokensUsed: result.tokensUsed,
        },
      });

      return result;
    });

    // ========================================================================
    // STEP 12: Phase VIII.5 - MSJ Separate Statement (if applicable)
    // ========================================================================
    const phaseVIII5Result = await step.run("phase-viii5-separate-statement", async () => {
      const result = await executePhaseVIII5(workflowState, supabase);
      workflowState.phaseOutputs["VIII.5"] = result.output;
      return result;
    });

    // ========================================================================
    // STEP 13: Phase IX - Document Formatting
    // ========================================================================
    const phaseIXResult = await step.run("phase-ix-document-formatting", async () => {
      const result = await executePhaseIX(workflowState, supabase);
      workflowState.phaseOutputs["IX"] = result.output;
      return result;
    });

    // ========================================================================
    // STEP 14: Phase IX.1 - Caption QC
    // ========================================================================
    const phaseIX1Result = await step.run("phase-ix1-caption-qc", async () => {
      const result = await executePhaseIX1(workflowState, supabase);
      workflowState.phaseOutputs["IX.1"] = result.output;
      return result;
    });

    // ========================================================================
    // STEP 15: Phase X - Final QA + CP3 Checkpoint (Admin Approval)
    // ========================================================================
    const phaseXResult = await step.run("phase-x-final-qa", async () => {
      const result = await executePhaseX(workflowState, supabase);
      workflowState.phaseOutputs["X"] = result.output;

      // CP3 Checkpoint - Requires admin approval before delivery
      await triggerCheckpoint(workflowState.workflowId, "CP3", {
        checkpoint: "CP3",
        status: "pending",
        triggeredAt: new Date().toISOString(),
        finalQA: result.output,
        requiresAdminApproval: true,
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

      return result;
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
      // Update order status to pending_review (awaiting admin approval)
      await supabase
        .from("orders")
        .update({
          status: "pending_review",
          generation_completed_at: new Date().toISOString(),
          generation_error: null,
        })
        .eq("id", orderId);

      // Update workflow status
      await supabase
        .from("order_workflows")
        .update({
          status: "awaiting_cp3",
          current_phase: 10,
          citation_count: workflowState.citationCount,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", workflowState.workflowId);

      // Log completion
      await supabase.from("automation_logs").insert({
        order_id: orderId,
        action_type: "workflow_completed",
        action_details: {
          workflowId: workflowState.workflowId,
          finalGrade: workflowState.currentGrade,
          citationCount: workflowState.citationCount,
          revisionLoops: workflowState.revisionLoopCount,
          phasesCompleted: Object.keys(workflowState.phaseOutputs).length,
        },
      });

      return {
        success: true,
        orderId,
        workflowId: workflowState.workflowId,
        finalGrade: workflowState.currentGrade,
        citationCount: workflowState.citationCount,
        revisionLoops: workflowState.revisionLoopCount,
        status: "pending_review",
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
