/**
 * Phase Executors - v7.2 Complete Implementation
 *
 * STRICT 14-PHASE ENFORCEMENT:
 * Each phase has a specific task. Claude CANNOT skip phases or generate
 * the final motion directly. Each phase produces structured JSON output
 * that feeds into the next phase.
 *
 * Phase Flow:
 * I → II → III → [HOLD?] → IV → V → V.1 → VI → VII → [VIII loop?] → VIII.5 → IX → [IX.1?] → X
 */

import Anthropic from '@anthropic-ai/sdk';
// BUG-FIX: Background jobs (Inngest) must use admin/service-role client, not user-scoped.
// User-scoped client requires cookies which are unavailable in background job context.
import { getServiceSupabase } from '@/lib/supabase/admin';
import { createMessageWithStreaming } from '@/lib/automation/claude';
import { extractJSON } from '@/lib/utils/json-extractor';
import {
  validateMotionObject,
  generateRevisionInstructions,
  type PlaceholderValidationResult,
} from './validators/placeholder-validator';
import type {
  WorkflowPhaseCode,
  MotionTier,
  PhaseStatus,
  JudgeSimulationResult,
  LetterGrade,
} from '@/types/workflow';
import { PHASE_PROMPTS } from '@/prompts';
import { getModel, getThinkingBudget, getMaxTokens, getExecutionMode, getModelConfig } from '@/lib/config/phase-registry';
import { MODELS } from '@/lib/config/models';
import { saveOrderCitations } from '@/lib/services/citations/citation-service';
import type { SaveCitationInput } from '@/types/citations';
import { extractCaseName } from '@/lib/citations/extract-case-name';

// FIX-D/FIX-E: Prompt guardrails — phase enforcement, output boundary validation, input sanitization
import { buildPhasePrompt, detectOutputViolation, detectPhaseSkipAttempt, sanitizeForAI } from '@/lib/workflow/prompt-guardrails';

// SP-07: CIV pipeline imports for 7-step citation verification
import { verifyBatch, verifyNewCitations, verifyUnauthorizedCitation } from '@/lib/civ';
import type {
  CitationToVerify,
  BatchVerificationResult,
  FinalVerificationOutput,
  ActionRequired,
} from '@/lib/civ/types';

// WIRE-1: Full CIV pipeline executor (replaces shallow existence fallback)
import { executePhaseV1 as executePhaseV1CIV } from '@/lib/workflow/phase-v1-executor';

// SP-14 TASK-16: Louisiana article selection for Phase II
import { getArticlesForMotion } from '@/lib/workflow/article-selection';

// FIX-E FIX 6: Anti-inflation grading lock for Phase VII loop 2+
import { getGradingLockPreamble, validateGradeConsistency } from '@/lib/workflow/judge-grading-lock';
import type { LoopGrade } from '@/lib/workflow/judge-grading-lock';

// FIX-E FIX 7: Hard-coded rules for Phase VII (zero-citation fail, etc.)
import { applyPhaseVIIHardRules } from '@/lib/workflow/phase-vii-hardcoded-rules';
import type { PhaseVIIOutput, PhaseVIISectionGrade } from '@/lib/workflow/phase-vii-hardcoded-rules';


// ============================================================================
// HELPERS
// ============================================================================

/** Derive court short abbreviation from court code or full name */
function deriveCourtShort(court: string): string {
  const shortNames: Record<string, string> = {
    'scotus': 'U.S.', 'ca5': '5th Cir.', 'ca9': '9th Cir.', 'ca1': '1st Cir.',
    'ca2': '2d Cir.', 'ca3': '3d Cir.', 'ca4': '4th Cir.', 'ca6': '6th Cir.',
    'ca7': '7th Cir.', 'ca8': '8th Cir.', 'ca10': '10th Cir.', 'ca11': '11th Cir.',
    'cadc': 'D.C. Cir.', 'la': 'La.', 'lactapp': 'La. Ct. App.',
    'cal': 'Cal.', 'calctapp': 'Cal. Ct. App.', 'tex': 'Tex.', 'fla': 'Fla.',
  };
  const lower = court.toLowerCase();
  if (shortNames[lower]) return shortNames[lower];
  // Try pattern match on full court names
  if (lower.includes('fifth circuit')) return '5th Cir.';
  if (lower.includes('louisiana') && lower.includes('appeal')) return 'La. Ct. App.';
  if (lower.includes('louisiana')) return 'La.';
  if (lower.includes('supreme court of the united states')) return 'U.S.';
  if (lower.includes('district court')) return 'D. Ct.';
  return court;
}

// ============================================================================
// TYPES
// ============================================================================

export interface PhaseInput {
  orderId: string;
  workflowId: string;
  tier: MotionTier;
  jurisdiction: string;
  motionType: string;
  caseCaption: string;
  caseNumber: string;
  courtDivision?: string;
  statementOfFacts: string;
  proceduralHistory: string;
  instructions: string;
  previousPhaseOutputs: Record<WorkflowPhaseCode, unknown>;
  documents?: string[];
  revisionLoop?: number;

  /**
   * Pre-fetched CourtListener existence results from batch lookup (SP-18 Issue 2).
   * Key: normalized citation string. Value: CL existence result.
   * Populated by orchestrator's cit-prefetch steps.
   * MUST be Record (plain object), NOT Map — Maps don't survive Inngest serialization.
   */
  prefetchedCitations?: Record<string, unknown>;

  // Party information
  parties?: Array<{
    name: string;
    role: 'plaintiff' | 'defendant' | 'petitioner' | 'respondent';
    isRepresented?: boolean;
  }>;

  // ATTORNEY INFO - REQUIRED FOR SIGNATURE BLOCKS
  attorneyName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  // Extended case data for complete motion generation
  filingDeadline?: string;
  orderNumber?: string;
  court?: string;
  parish?: string;
  division?: string;
  clientRole?: string;
}

export interface PhaseOutput {
  success: boolean;
  phase: WorkflowPhaseCode;
  status: PhaseStatus;
  output: unknown;
  nextPhase?: WorkflowPhaseCode;
  requiresReview?: boolean;
  gapsDetected?: number;
  tokensUsed?: { input: number; output: number };
  durationMs?: number;
  error?: string;
}

// ============================================================================
// SP-14 TASK-17: Consent/Unopposed Motion Detection
// ============================================================================

type ConsentStatus = 'contested' | 'unopposed' | 'consent' | 'unknown';

const CONSENT_INDICATORS = ['by consent', 'stipulated', 'agreed motion', 'joint motion', 'consent motion'];
const UNOPPOSED_INDICATORS = ['unopposed', 'no opposition', 'without opposition', 'uncontested'];

/**
 * Detect whether a motion is filed by consent or is unopposed.
 * Default is 'contested' — false negatives are safe.
 */
function detectConsentStatus(caseDetails: string, instructions: string): ConsentStatus {
  const combined = `${caseDetails} ${instructions}`.toLowerCase();

  if (CONSENT_INDICATORS.some(i => combined.includes(i))) return 'consent';
  if (UNOPPOSED_INDICATORS.some(i => combined.includes(i))) return 'unopposed';
  return 'contested';
}

// ============================================================================
// CONSTANTS - STRICT PHASE ENFORCEMENT
// ============================================================================

const PHASE_ENFORCEMENT_HEADER = `
################################################################################
#  STRICT PHASE ENFORCEMENT - READ CAREFULLY                                   #
################################################################################

You are executing ONE SPECIFIC PHASE of a 14-phase legal document workflow.

CRITICAL RULES:
1. You MUST ONLY perform the task for THIS phase
2. You MUST NOT generate the final motion document
3. You MUST NOT skip ahead to other phases
4. You MUST output ONLY the JSON structure specified for this phase
5. Your output will be used as INPUT for the next phase

If you try to generate the final motion or skip phases, the system will REJECT
your output and the workflow will FAIL.

################################################################################
`;

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

let anthropicClient: Anthropic | null = null;

/**
 * Validate that an API key has the correct format
 * Anthropic API keys start with 'sk-ant-'
 */
function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey) return false;
  // Anthropic API keys should start with 'sk-ant-' and be at least 40 characters
  if (!apiKey.startsWith('sk-ant-')) return false;
  if (apiKey.length < 40) return false;
  // Check for obvious placeholders
  if (apiKey.includes('xxxxx') || apiKey.includes('YOUR_API_KEY')) return false;
  return true;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[Phase Executor] CRITICAL: ANTHROPIC_API_KEY environment variable is not set!');
      throw new Error('ANTHROPIC_API_KEY not configured - set it in Vercel environment variables');
    }
    if (!validateApiKeyFormat(apiKey)) {
      console.error('[Phase Executor] CRITICAL: ANTHROPIC_API_KEY appears to be invalid or a placeholder!');
      console.error('[Phase Executor] Key starts with:', apiKey.substring(0, 10) + '...');
      throw new Error('ANTHROPIC_API_KEY appears to be invalid. Must start with "sk-ant-" and be at least 40 characters.');
    }
    console.log('[Phase Executor] Creating Anthropic client with valid API key');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ============================================================================
// HELPERS — Shared utilities for phase executors
// ============================================================================

/**
 * Build extended thinking parameters for phases that require deep reasoning.
 * Standardized across all ET phases (VI, VII, VIII) to prevent SDK update breakage.
 *
 * Returns an empty object for non-ET phases or phase/tier combos without a thinking budget,
 * so it is safe to spread into any request params.
 *
 * @param phase - Workflow phase code (e.g., 'VII', 'VIII')
 * @param tier - Motion complexity tier ('A', 'B', 'C')
 * @returns Extended thinking params to spread into MessageCreateParams, or empty object
 */
function buildExtendedThinkingParams(phase: string, tier: string): Record<string, unknown> {
  const budget = getThinkingBudget(phase as Parameters<typeof getThinkingBudget>[0], tier as Parameters<typeof getThinkingBudget>[1]);
  if (!budget || budget <= 0) return {};

  return {
    thinking: {
      type: 'enabled',
      budget_tokens: budget,
    },
  };
}

/**
 * Resolve the AI model for phase execution.
 *
 * For CHAT/ET phases: Returns the registry model directly. Throws if null
 * (indicates a SKIP phase reached the executor, or a misconfiguration).
 *
 * For CODE mode phases (I, VIII.5, X) that still make LLM calls: Returns
 * MODELS.SONNET as a temporary bridge. These phases will be refactored to
 * pure TypeScript in a future task, eliminating the LLM call entirely.
 *
 * For CIV phases (V.1, VII.1, IX.1): Returns the registry's default
 * (Stage 2 / Opus) when no stage is specified.
 */
function resolveModelForExecution(phase: string, tier: string): string {
  const p = phase as Parameters<typeof getModel>[0];
  const t = tier as Parameters<typeof getModel>[1];

  // BINDING 02/15/26 (ING-017): No silent Sonnet fallback.
  // Explicit routing from phase-registry.ts only.
  const modelConfig = getModelConfig(p, t);

  if (!modelConfig) {
    throw new Error(
      `[MODEL_ROUTER] Model routing undefined for phase=${phase} tier=${tier}. ` +
      `Check phase-registry.ts. Do NOT add a fallback.`
    );
  }

  // SKIP phases should not reach executor — caller must check isPhaseSkipped()
  if (modelConfig.model === 'SKIP') {
    throw new Error(
      `[MODEL_ROUTER] Phase ${phase} is SKIP for tier ${tier}. ` +
      `isPhaseSkipped() should have prevented executor call.`
    );
  }

  // CODE mode phases: CIV pipeline handles its own internal model routing.
  // Some CODE phases (I, VIII.5, X) still make LLM calls during migration.
  // Use registry model if available; otherwise explicit Sonnet with warning.
  if (modelConfig.model === 'CODE') {
    const registryModel = getModel(p, t);
    if (registryModel !== null) return registryModel;
    console.warn(
      `[MODEL_ROUTER] MIGRATION BRIDGE: Phase ${phase} tier ${tier} is CODE mode ` +
      `with null registry model but executor still makes LLM calls. ` +
      `Using Sonnet explicitly. Migrate to pure TypeScript to remove this bridge.`
    );
    return MODELS.SONNET;
  }

  // CHAT mode — return the model from registry directly
  return modelConfig.model;
}

/**
 * Validate phase output against prompt guardrails.
 * Checks for output boundary violations and phase skip attempts.
 * Logs warnings but does not throw — violations are informational at this stage
 * to avoid breaking the pipeline while guardrails are being tuned.
 *
 * @param phase - Phase code (e.g., 'I', 'V', 'VII')
 * @param outputText - Raw text output from Claude
 * @param orderId - Order ID for structured logging
 */
function validatePhaseOutput(phase: string, outputText: string, orderId: string): void {
  try {
    const violation = detectOutputViolation(phase, outputText);
    if (violation.violated) {
      console.warn(
        `[Phase ${phase}] GUARDRAIL VIOLATION for order ${orderId}: ${violation.reason}`
      );
    }

    const skipAttempt = detectPhaseSkipAttempt(phase, outputText);
    if (skipAttempt.attempted) {
      console.warn(
        `[Phase ${phase}] PHASE SKIP ATTEMPT for order ${orderId}: ${skipAttempt.reason}` +
        (skipAttempt.targetPhase ? ` (attempted skip to: ${skipAttempt.targetPhase})` : '')
      );
    }
  } catch (guardErr) {
    // Guardrail validation must never crash the pipeline
    console.error(`[Phase ${phase}] Guardrail validation error (non-fatal):`, guardErr);
  }
}

/**
 * Convert GPA (0.0-4.0) or letter grade to 0-100 percentage score.
 * Uses piecewise linear interpolation between standard grade boundaries.
 *
 * BINDING 02/15/26 (ING-015R): All grade comparisons use 0-100 percentage scale.
 * Thresholds: Tier A >= 83 (B), Tier B/C/D >= 87 (B+).
 *
 * Key mappings: GPA 3.0 → 83%, GPA 3.3 → 87%, GPA 3.7 → 90%, GPA 4.0 → 97%
 */
function gpaToPercentage(gpa: number, letterGrade?: string): number {
  // Prefer letter grade lookup when available
  const GRADE_MAP: Record<string, number> = {
    'A+': 97, 'A': 93, 'A-': 90,
    'B+': 87, 'B': 83, 'B-': 80,
    'C+': 77, 'C': 73,
    'D': 65, 'F': 0,
  };
  if (letterGrade && GRADE_MAP[letterGrade] !== undefined) {
    return GRADE_MAP[letterGrade];
  }

  // Piecewise linear interpolation from GPA
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
 * Resolve max_tokens for phase execution.
 *
 * For phases with registry-defined tokens (> 0): Returns the registry value.
 * For CODE mode phases returning 0: Returns 16384 as a temporary bridge.
 */
function resolveMaxTokensForExecution(phase: string, tier: string): number {
  const p = phase as Parameters<typeof getMaxTokens>[0];
  const t = tier as Parameters<typeof getMaxTokens>[1];
  const maxTokens = getMaxTokens(p, t);
  if (maxTokens > 0) return maxTokens;

  // CODE mode phases return 0 but still need tokens during migration.
  if (getExecutionMode(p) === 'CODE') {
    return 16384;
  }

  throw new Error(
    `[MODEL_ROUTER] Phase ${phase} tier ${tier} has maxTokens=0 for CHAT mode. ` +
    `Check phase-registry.ts configuration.`
  );
}

/**
 * Get tier-specific max revision loops for Phase VII prompt context.
 * A=2, B=3, C=3, D=4 — matches TIERED_MAX_LOOPS in workflow-orchestration.ts.
 */
function getMaxLoopsForPhaseVII(tier: string): number {
  const limits: Record<string, number> = { A: 2, B: 3, C: 3, D: 4 };
  return limits[tier] ?? 3;
}

/**
 * Sanitize blank/empty signature block fields before passing to the LLM prompt.
 * Replaces empty strings and minimal patterns (e.g., ", LA") with explicit
 * placeholder tokens that Claude will preserve literally, rather than
 * interpreting them as template instructions and outputting '[blank]'.
 *
 * This prevents Phase VIII JSON parse failures when attorney info fields
 * are empty (BUG #3).
 */
function sanitizeSignatureFields(input: PhaseInput): {
  barNumber: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  attorneyName: string;
  firmName: string;
} {
  const isEmpty = (val: string | undefined): boolean =>
    !val || val.trim() === '' || val.trim() === ',';

  return {
    attorneyName: isEmpty(input.attorneyName) ? '[ATTORNEY_NAME]' : input.attorneyName,
    barNumber: isEmpty(input.barNumber) ? '[ATTORNEY_BAR_NUMBER]' : input.barNumber,
    firmName: isEmpty(input.firmName) ? '[FIRM_NAME]' : input.firmName,
    firmAddress: isEmpty(input.firmAddress) ? '[ATTORNEY_ADDRESS]' : input.firmAddress,
    firmPhone: isEmpty(input.firmPhone) ? '[ATTORNEY_PHONE]' : input.firmPhone,
    firmEmail: isEmpty(input.firmEmail) ? '[ATTORNEY_EMAIL]' : input.firmEmail,
  };
}

/**
 * Check whether a flagged generic name (e.g., "John Doe") is actually a real
 * party name from the intake data. If so, it should NOT block delivery.
 */
function isRealPartyName(
  name: string,
  parties: PhaseInput['parties'],
  attorneyName?: string
): boolean {
  const normalizedName = name.toLowerCase().trim();

  // Check against party names from intake
  if (parties && parties.length > 0) {
    if (parties.some(p => p.name.toLowerCase().trim() === normalizedName)) {
      return true;
    }
  }

  // Check against attorney name
  if (attorneyName && attorneyName.toLowerCase().trim() === normalizedName) {
    return true;
  }

  return false;
}

// ============================================================================
// TASK-09: AIS COMPLIANCE VALIDATION
// ============================================================================

interface AISRequirement {
  type: 'statute' | 'document' | 'argument';
  text: string;
  matched: boolean;
  location?: string;
}

interface AISComplianceReport {
  requirements: AISRequirement[];
  met: AISRequirement[];
  unmet: AISRequirement[];
  complianceRate: number;
}

/**
 * Validate that AIS (Attorney Instruction Sheet) requirements are met in deliverables.
 * Parses the customer's instructions for specific statute references and document
 * requests, then cross-checks against the draft and Phase IX documents.
 */
function validateAISCompliance(
  aisText: string,
  draftText: string,
  phaseIXDocumentTypes: string[],
): AISComplianceReport {
  if (!aisText || aisText.trim().length === 0) {
    return { requirements: [], met: [], unmet: [], complianceRate: 1.0 };
  }

  const requirements: AISRequirement[] = [];

  // 1. Extract statute references from AIS
  const statutePattern = /(?:Art(?:icle)?\.?\s*\d+|(?:La\.\s*)?C\.C\.P\.?\s*Art\.?\s*\d+|(?:La\.\s*)?R\.S\.?\s*\d+[.:]\d+|Section\s+\d+)/gi;
  const statutes = aisText.match(statutePattern) || [];
  const draftLower = draftText.toLowerCase();

  for (const statute of statutes) {
    const trimmed = statute.trim();
    const found = draftLower.includes(trimmed.toLowerCase());
    requirements.push({
      type: 'statute',
      text: trimmed,
      matched: found,
      location: found ? 'motion body' : undefined,
    });
  }

  // 2. Extract document requests from AIS
  const docPatterns: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /proposed\s+order/gi, name: 'proposed order' },
    { pattern: /declaration/gi, name: 'declaration' },
    { pattern: /memorandum/gi, name: 'memorandum' },
    { pattern: /certificate\s+of\s+service/gi, name: 'certificate of service' },
    { pattern: /affidavit/gi, name: 'affidavit' },
    { pattern: /exhibit/gi, name: 'exhibit' },
  ];

  for (const { pattern, name } of docPatterns) {
    if (pattern.test(aisText)) {
      const inDocs = phaseIXDocumentTypes.some(doc =>
        doc.toLowerCase().includes(name)
      );
      const inDraft = draftLower.includes(name);
      const found = inDocs || inDraft;
      requirements.push({
        type: 'document',
        text: name,
        matched: found,
        location: found ? (inDocs ? 'Phase IX documents' : 'motion body') : undefined,
      });
    }
  }

  const met = requirements.filter(r => r.matched);
  const unmet = requirements.filter(r => !r.matched);

  return {
    requirements,
    met,
    unmet,
    complianceRate: requirements.length > 0 ? met.length / requirements.length : 1.0,
  };
}

// ============================================================================
// TASK-10: CITATION PLACEHOLDER ESCALATION
// ============================================================================

interface CitationPlaceholderScanResult {
  count: number;
  locations: Array<{
    placeholder: string;
    section: string;
    context: string;
  }>;
  action: 'proceed' | 'research' | 'hold';
}

/**
 * Scan filing document text for citation placeholders.
 * Returns count, locations, and recommended escalation action.
 *
 * Escalation:
 *   0 placeholders → proceed
 *   1-2 → research (flag for targeted Phase IV research)
 *   3+  → hold (block delivery, structured admin message)
 */
function scanForCitationPlaceholders(draftText: string): CitationPlaceholderScanResult {
  if (!draftText || draftText.trim().length === 0) {
    return { count: 0, locations: [], action: 'proceed' };
  }

  const patterns = [
    /\[CITATION NEEDED\]/gi,
    /\[CITE\]/gi,
    /\[CITATION TO BE ADDED\]/gi,
    /\[CITATION REQUIRED\]/gi,
    /\[AUTHORITY NEEDED\]/gi,
  ];

  const locations: CitationPlaceholderScanResult['locations'] = [];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(draftText)) !== null) {
      const start = Math.max(0, match.index - 50);
      const end = Math.min(draftText.length, match.index + match[0].length + 50);

      locations.push({
        placeholder: match[0],
        section: inferSectionFromPosition(draftText, match.index),
        context: `...${draftText.slice(start, end)}...`,
      });
    }
  }

  let action: CitationPlaceholderScanResult['action'];
  if (locations.length === 0) {
    action = 'proceed';
  } else if (locations.length <= 2) {
    action = 'research';
  } else {
    action = 'hold';
  }

  return { count: locations.length, locations, action };
}

/**
 * Infer the section of a motion from a character position by looking backward
 * for common section headings.
 */
function inferSectionFromPosition(text: string, position: number): string {
  const before = text.slice(0, position);
  const sectionMatch = before.match(
    /(?:ARGUMENT|DISCUSSION|STATEMENT OF FACTS|PRAYER|CONCLUSION|MEMORANDUM|LEGAL STANDARD|INTRODUCTION|LAW AND ARGUMENT)[^\n]*/gi
  );
  return sectionMatch ? sectionMatch[sectionMatch.length - 1].trim() : 'Unknown Section';
}

// ============================================================================
// CITATION ENFORCEMENT — ZERO TOLERANCE FOR HALLUCINATED CITATIONS
// ============================================================================

/**
 * Citation from the verified bank
 */
interface VerifiedCitationEntry {
  caseName?: string;
  citation?: string;
  court?: string;
  date_filed?: string;
  courtlistener_id?: number | string;
}

/**
 * Statutory citation entry
 */
interface StatutoryCitationEntry {
  citation?: string;
  name?: string;
}

/**
 * Build the citation enforcement prompt block
 * This MUST be injected at the TOP of Phase V and VIII prompts
 *
 * CHEN MEGAPROMPT PHASE V FIX (2026-01-30):
 * Strengthened enforcement with explicit [CITATION NEEDED] fallback and
 * verification checklist to prevent hallucination of citations.
 */
function buildCitationEnforcementPrompt(
  caseCitationBank: VerifiedCitationEntry[],
  statutoryCitationBank: StatutoryCitationEntry[] = []
): string {
  // Format citations with full detail for Claude to reference
  // CHEN RELEVANCE FIX (2026-02-05): Include proposition linkage and relevance score
  const typedBank = caseCitationBank as Array<VerifiedCitationEntry & {
    proposition_id?: string;
    proposition_text?: string;
    topical_relevance_score?: number;
    forElement?: string;
    proposition?: string;
  }>;

  const caseList = (typedBank || []).map((c, i) => {
    const courtAbbrev = extractCourtAbbrev(c.court || '');
    const year = extractYear(c.date_filed || '');
    const propId = c.proposition_id || c.forElement || '';
    const propText = c.proposition_text || c.proposition || '';
    const relevance = c.topical_relevance_score ? ` (relevance: ${c.topical_relevance_score.toFixed(2)})` : '';

    return `  [${propId || `C${i + 1}`}] ${c.caseName || 'Unknown'}
     Citation: ${c.citation || 'No citation'}
     Court: ${courtAbbrev || 'Unknown'}
     Year: ${year || 'Unknown'}
     CourtListener ID: ${c.courtlistener_id || 'N/A'}${propText ? `\n     SUPPORTS: "${propText}"` : ''}${relevance}`;
  }).join('\n\n');

  const statuteList = (statutoryCitationBank || []).map((s, i) =>
    `  ${i + 1}. ${s.citation || ''} — ${s.name || ''}`
  ).join('\n');

  return `
═══════════════════════════════════════════════════════════════════════════════
CRITICAL: CITATION REQUIREMENTS — VIOLATION WILL CAUSE LEGAL MALPRACTICE
═══════════════════════════════════════════════════════════════════════════════

You have ${caseCitationBank?.length || 0} verified case citations available.
You have ${statutoryCitationBank?.length || 0} verified statutory citations available.

████████████████████████████████████████████████████████████████████████████████
█                                                                              █
█   YOU MUST USE ONLY THE CITATIONS FROM THE VERIFIED CITATION BANK BELOW.     █
█                                                                              █
█   DO NOT INVENT, HALLUCINATE, OR RECALL ANY CITATIONS FROM YOUR MEMORY.      █
█                                                                              █
█   DO NOT USE ANY CITATION THAT IS NOT EXPLICITLY LISTED BELOW.               █
█                                                                              █
█   IF NO CITATION IN THE BANK FITS, WRITE "[CITATION NEEDED]" INSTEAD.        █
█                                                                              █
█   FAKE CITATIONS = ATTORNEY SANCTIONS + MALPRACTICE LIABILITY + CLIENT HARM  █
█                                                                              █
████████████████████████████████████████████████████████████████████████████████

╔════════════════════════════════════════════════════════════════════════════╗
║                    VERIFIED CITATION BANK (CourtListener Verified)         ║
╚════════════════════════════════════════════════════════════════════════════╝

CASE CITATIONS (you may ONLY cite these cases):
Each citation below is linked to a specific legal proposition. When drafting,
cite each case ONLY for the proposition it was verified to support.
DO NOT cite a case for a different proposition than what it was verified for.

${caseList || '  [No case citations available — use statutes only or write [CITATION NEEDED]]'}

STATUTORY CITATIONS (you may ALSO cite these statutes):
${statuteList || '  [No statutory citations in bank]'}

You may also cite Louisiana statutes directly:
  - La. C.C.P. art. [number] — Louisiana Code of Civil Procedure
  - La. C.C. art. [number] — Louisiana Civil Code
  - La. C.E. art. [number] — Louisiana Code of Evidence
  - La. R.S. [number]:[number] — Louisiana Revised Statutes

═══════════════════════════════════════════════════════════════════════════════
ABSOLUTE RULES — READ CAREFULLY
═══════════════════════════════════════════════════════════════════════════════

1. Every case citation in your motion MUST come from the VERIFIED CITATION BANK above.

2. Do NOT invent, hallucinate, or recall ANY citation from your training data.

3. Do NOT use any citation that is not EXPLICITLY listed in the bank above.

4. If you need a citation for a legal proposition and NO citation in the bank fits:
   → Write "[CITATION NEEDED]" after the proposition
   → Example: "Discovery abuse warrants sanctions. [CITATION NEEDED]"
   → DO NOT invent a citation to fill the gap

5. When citing a case, use the EXACT format from the bank:
   → Use exact caseName and citation string
   → Example: "State of Louisiana v. i3 Verticals, 81 F.4th 483"
   → NOT: "i3 Verticals, 81 F. 4th 483" (spacing matters)

6. It is ALWAYS BETTER to write [CITATION NEEDED] than to hallucinate a fake citation.

═══════════════════════════════════════════════════════════════════════════════
WHY THIS MATTERS — LEGAL CONSEQUENCES
═══════════════════════════════════════════════════════════════════════════════

- Every citation in the bank has been VERIFIED against CourtListener's database
- Citations from your training data are UNVERIFIED and may not exist
- Fake citations in court filings result in:
  → Rule 11 sanctions against the filing attorney
  → Potential malpractice liability
  → Damage to client's case
  → Harm to real people
- This is a legal document filed in a real court. Accuracy is non-negotiable.

████████████████████████████████████████████████████████████████████████████████
█  BEFORE FINALIZING YOUR DRAFT:                                               █
█  ✓ Check EVERY case citation against the VERIFIED CITATION BANK above        █
█  ✓ If a citation is NOT in the bank, REMOVE IT or replace with [CITATION NEEDED]█
█  ✓ Post-processing will STRIP any unauthorized citations from the motion     █
████████████████████████████████████████████████████████████████████████████████
`;
}

/**
 * Extract court abbreviation from full court name
 */
function extractCourtAbbrev(court: string): string {
  if (!court) return '';
  const c = court.toLowerCase();
  if (c.includes('fifth circuit') || c === 'ca5') return '5th Cir.';
  if (c.includes('supreme court of louisiana') || c === 'la') return 'La.';
  if (c.includes('court of appeal') && c.includes('first')) return 'La. App. 1 Cir.';
  if (c.includes('court of appeal') && c.includes('second')) return 'La. App. 2 Cir.';
  if (c.includes('court of appeal') && c.includes('third')) return 'La. App. 3 Cir.';
  if (c.includes('court of appeal') && c.includes('fourth')) return 'La. App. 4 Cir.';
  if (c.includes('court of appeal') && c.includes('fifth')) return 'La. App. 5 Cir.';
  if (c.includes('louisiana') && c.includes('appeal')) return 'La. App.';
  if (c.includes('district court')) return 'D. La.';
  if (c.includes('eastern district')) return 'E.D. La.';
  if (c.includes('western district')) return 'W.D. La.';
  if (c.includes('middle district')) return 'M.D. La.';
  return court.substring(0, 20);
}

/**
 * Extract year from date_filed string
 */
function extractYear(dateFiled: string): string {
  if (!dateFiled) return '';
  return dateFiled.substring(0, 4);
}

/**
 * Result of citation validation
 */
interface CitationValidationResult {
  isValid: boolean;
  authorizedCitations: string[];
  unauthorizedCitations: string[];
  warnings: string[];
}

/**
 * Validate that all citations in a draft motion are from the authorized bank
 * This is a POST-GENERATION check to catch hallucinated citations
 */
function validateDraftCitations(
  draftMotion: string,
  caseCitationBank: VerifiedCitationEntry[],
  statutoryCitationBank: StatutoryCitationEntry[] = []
): CitationValidationResult {
  console.log('[CitationValidator] Starting validation...');

  // Build list of authorized citation patterns
  const authorizedPatterns: RegExp[] = [];
  const authorizedNames: Set<string> = new Set();

  // Add case citations - build patterns from case names and citations
  for (const c of caseCitationBank || []) {
    // Extract first significant name word (e.g., "Brumfield" from "Brumfield v. Louisiana State Board")
    if (c.caseName) {
      const nameWords = c.caseName.split(/\s+v\.?\s+/i);
      if (nameWords[0]) {
        const firstName = nameWords[0].split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
        if (firstName.length > 2) {
          authorizedPatterns.push(new RegExp(firstName, 'i'));
          authorizedNames.add(firstName.toLowerCase());
        }
      }
    }
    // Match citation volume/reporter (e.g., "806 F.3d")
    if (c.citation) {
      const citeParts = c.citation.match(/(\d+)\s+([A-Za-z.\d]+)\s+(\d+)/);
      if (citeParts) {
        const escapedReporter = citeParts[2].replace(/\./g, '\\.?');
        authorizedPatterns.push(new RegExp(`${citeParts[1]}\\s*${escapedReporter}\\s*${citeParts[3]}`, 'i'));
      }
    }
  }

  // Add statutory citations (these are always allowed)
  for (const s of statutoryCitationBank || []) {
    if (s.citation) {
      authorizedPatterns.push(new RegExp(s.citation.replace(/\./g, '\\.').replace(/\s+/g, '\\s*'), 'i'));
    }
  }

  // Also allow generic La. C.C.P. articles (statutory - not cases)
  authorizedPatterns.push(/La\.?\s*C\.?C\.?P\.?\s*[Aa]rt\.?\s*\d+/i);
  authorizedPatterns.push(/Louisiana\s+Code\s+of\s+Civil\s+Procedure/i);
  authorizedPatterns.push(/La\.?\s*R\.?S\.?\s*\d+:\d+/i);  // Louisiana Revised Statutes
  // Civil Code
  authorizedPatterns.push(/La\.?\s*C\.?\s*C\.?\s*[Aa]rt\.?\s*\d+/i);
  authorizedPatterns.push(/Louisiana\s+Civil\s+Code/i);
  // Code of Evidence
  authorizedPatterns.push(/La\.?\s*C\.?\s*(?:E|Ev)\.?\s*[Aa]rt\.?\s*\d+/i);
  authorizedPatterns.push(/Louisiana\s+Code\s+of\s+Evidence/i);

  // Find all case citations in the draft
  // Pattern matches: "Case Name, 123 F.3d 456 (Court Year)" or similar
  const citationRegex = /([A-Z][a-zA-Z'\-]+(?:\s+(?:v\.?|vs\.?)\s+[A-Z][a-zA-Z'\-\s&,\.]+)?),?\s*(\d+\s+(?:F\.\d+[a-z]?|So\.\s*\d*d?|S\.?\s*Ct\.?|U\.S\.|La\.?\s*App\.?|La\.)\s*\d+)(?:\s*\([^)]+\d{4}\))?/gi;

  const foundCitations: string[] = [];
  let match;
  while ((match = citationRegex.exec(draftMotion)) !== null) {
    foundCitations.push(match[0]);
  }

  console.log('[CitationValidator] Found citations in draft:', foundCitations.length);

  // Check each citation against authorized list
  const authorizedCitations: string[] = [];
  const unauthorizedCitations: string[] = [];
  const warnings: string[] = [];

  for (const citation of foundCitations) {
    let isAuthorized = false;

    // Check against all authorized patterns
    for (const pattern of authorizedPatterns) {
      if (pattern.test(citation)) {
        isAuthorized = true;
        break;
      }
    }

    // Double-check by looking for known case names
    if (!isAuthorized) {
      const citationLower = citation.toLowerCase();
      for (const name of authorizedNames) {
        if (citationLower.includes(name)) {
          isAuthorized = true;
          break;
        }
      }
    }

    if (isAuthorized) {
      authorizedCitations.push(citation);
      console.log('[CitationValidator] ✅ Authorized:', citation.substring(0, 60));
    } else {
      unauthorizedCitations.push(citation);
      console.log('[CitationValidator] ❌ UNAUTHORIZED:', citation.substring(0, 60));
      warnings.push(`Unauthorized citation found: "${citation.substring(0, 80)}..."`);
    }
  }

  const isValid = unauthorizedCitations.length === 0;

  console.log('[CitationValidator] Results:');
  console.log(`  Authorized: ${authorizedCitations.length}`);
  console.log(`  Unauthorized: ${unauthorizedCitations.length}`);
  console.log(`  Valid: ${isValid}`);

  return {
    isValid,
    authorizedCitations,
    unauthorizedCitations,
    warnings,
  };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip unauthorized citations from draft
 * This is a safety measure - removes citations that slipped through
 */
function stripUnauthorizedCitations(
  draftMotion: string,
  unauthorizedCitations: string[]
): string {
  if (unauthorizedCitations.length === 0) return draftMotion;

  console.log(`[CitationValidator] Stripping ${unauthorizedCitations.length} unauthorized citations...`);

  let cleanedDraft = draftMotion;

  for (const badCitation of unauthorizedCitations) {
    // Remove the citation and surrounding "See" or "citing" language
    const patterns = [
      // "See BadCase, 123 F.3d 456 (5th Cir. 2020)."
      new RegExp(`See\\s+${escapeRegex(badCitation)}[^.]*\\.?\\s*`, 'gi'),
      // Just the citation itself
      new RegExp(`${escapeRegex(badCitation)}[^.]*\\.?\\s*`, 'gi'),
      // "(citing BadCase, 123 F.3d 456)"
      new RegExp(`\\s*\\([Cc]iting\\s+${escapeRegex(badCitation)}[^)]*\\)`, 'gi'),
    ];

    for (const pattern of patterns) {
      cleanedDraft = cleanedDraft.replace(pattern, ' ');
    }
  }

  // Clean up double spaces and punctuation issues
  cleanedDraft = cleanedDraft.replace(/\s{2,}/g, ' ');
  cleanedDraft = cleanedDraft.replace(/\.\s+\./g, '.');
  cleanedDraft = cleanedDraft.replace(/\s+,/g, ',');
  cleanedDraft = cleanedDraft.replace(/\s+\./g, '.');

  console.log(`[CitationValidator] Stripped citations, draft reduced from ${draftMotion.length} to ${cleanedDraft.length} chars`);

  return cleanedDraft;
}

// ============================================================================
// PHASE I: Intake & Classification
// ============================================================================

async function executePhaseI(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase I] ========== STARTING PHASE I ==========`);
  console.log(`[Phase I] Order: ${input.orderId}, Workflow: ${input.workflowId}, Tier: ${input.tier}`);

  try {
    console.log(`[Phase I] Getting Anthropic client...`);
    const client = getAnthropicClient();
    console.log(`[Phase I] Anthropic client ready`);

    const systemPrompt = buildPhasePrompt('I', PHASE_PROMPTS.PHASE_I);

    // FIX-E FIX 20: Sanitize user inputs before LLM interpolation
    const userMessage = `Analyze this submission for Phase I intake:

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}
CASE NUMBER: ${input.caseNumber}
CASE CAPTION: ${sanitizeForAI(input.caseCaption)}

STATEMENT OF FACTS:
${sanitizeForAI(input.statementOfFacts)}

PROCEDURAL HISTORY:
${sanitizeForAI(input.proceduralHistory)}

CLIENT INSTRUCTIONS:
${sanitizeForAI(input.instructions)}

UPLOADED DOCUMENTS:
${input.documents?.join('\n') || 'None provided'}

Provide your Phase I analysis as JSON.`;

    const model = resolveModelForExecution('I', input.tier);
    console.log(`[Phase I] Calling Claude with model: ${model}, max_tokens: ${resolveMaxTokensForExecution('I', input.tier)}`);
    console.log(`[Phase I] Input context length: ${userMessage.length} chars`);

    const callStart = Date.now();
    const response = await createMessageWithStreaming(client, {
      model,
      max_tokens: resolveMaxTokensForExecution('I', input.tier), // Phase I: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const callDuration = Date.now() - callStart;

    console.log(`[Phase I] Claude responded in ${callDuration}ms`);
    console.log(`[Phase I] Tokens used - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);
    console.log(`[Phase I] Stop reason: ${response.stop_reason}`);

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('I', outputText, input.orderId);

    console.log(`[Phase I] Response text length: ${outputText.length} chars`);

    // CRITICAL: Validate that we got meaningful output
    if (!outputText || outputText.length < 100) {
      console.error(`[Phase I] CRITICAL: Claude returned empty or very short response!`);
      console.error(`[Phase I] Response content: ${JSON.stringify(response.content).substring(0, 500)}`);
      return {
        success: false,
        phase: 'I',
        status: 'failed',
        output: null,
        error: `Claude returned empty or very short response (${outputText.length} chars). This usually indicates an API issue.`,
        durationMs: Date.now() - start,
      };
    }

    // Parse JSON output
    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[Phase I] No JSON found in Claude response`);
        console.error(`[Phase I] Response preview: ${outputText.substring(0, 500)}...`);
        return {
          success: false,
          phase: 'I',
          status: 'failed',
          output: { raw: outputText },
          error: 'Claude did not return valid JSON. Response may need manual review.',
          durationMs: Date.now() - start,
        };
      }
      phaseOutput = JSON.parse(jsonMatch[0]);
      console.log(`[Phase I] Successfully parsed JSON output`);
    } catch (parseError) {
      console.error(`[Phase I] JSON parse failed:`, parseError);
      console.error(`[Phase I] Response preview: ${outputText.substring(0, 500)}...`);
      return {
        success: false,
        phase: 'I',
        status: 'failed',
        output: { raw: outputText },
        error: `Failed to parse Claude response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        durationMs: Date.now() - start,
      };
    }

    // Validate phase output has expected structure
    if (!phaseOutput.classification && !phaseOutput.parties) {
      console.error(`[Phase I] Output missing expected fields (classification, parties)`);
      console.error(`[Phase I] Output keys: ${Object.keys(phaseOutput).join(', ')}`);
      // Still allow it to proceed but log the warning
    }

    // Ensure phase marker is set
    if (phaseOutput.phaseComplete !== 'I') {
      phaseOutput.phaseComplete = 'I';
    }

    // ========================================================================
    // CRITICAL: PRESERVE KNOWN DATA FROM INPUT
    // ========================================================================
    // AI extraction should NOT overwrite data we already have from the order.
    // If filingDeadline exists in input, preserve it - don't let AI null it out.

    if (input.filingDeadline) {
      // Ensure caseIdentifiers object exists
      if (!phaseOutput.caseIdentifiers) {
        phaseOutput.caseIdentifiers = {};
      }
      // Preserve the filing deadline from input (order data takes precedence)
      const existingDeadline = phaseOutput.caseIdentifiers?.filingDeadline;
      if (!existingDeadline) {
        phaseOutput.caseIdentifiers.filingDeadline = input.filingDeadline;
        console.log(`[Phase I] Preserved filingDeadline from input: ${input.filingDeadline}`);
      }
    }

    // Also preserve other known input data that AI might miss
    if (!phaseOutput.caseIdentifiers) {
      phaseOutput.caseIdentifiers = {};
    }
    if (input.caseNumber && !phaseOutput.caseIdentifiers.caseNumber) {
      phaseOutput.caseIdentifiers.caseNumber = input.caseNumber;
    }
    if (input.caseCaption && !phaseOutput.caseIdentifiers.caseCaption) {
      phaseOutput.caseIdentifiers.caseCaption = input.caseCaption;
    }

    // SP-14 TASK-17: Detect consent/unopposed motion status from case details
    if (!phaseOutput.consent_status) {
      phaseOutput.consent_status = detectConsentStatus(
        input.statementOfFacts || '',
        input.instructions || ''
      );
      console.log(`[Phase I] Consent status detected: ${phaseOutput.consent_status}`);
    }

    console.log(`[Phase I] ========== PHASE I COMPLETE ==========`);
    console.log(`[Phase I] Total duration: ${Date.now() - start}ms`);

    return {
      success: true,
      phase: 'I',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'II',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    console.error(`[Phase I] ========== PHASE I FAILED ==========`);
    console.error(`[Phase I] Error:`, error);
    return {
      success: false,
      phase: 'I',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase I failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE II: Legal Standards / Motion Deconstruction
// ============================================================================

async function executePhaseII(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();
    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;

    const systemPrompt = buildPhasePrompt('II', PHASE_PROMPTS.PHASE_II);

    const userMessage = `Based on the Phase I intake, identify the legal framework:

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

STATEMENT OF FACTS (from client):
${input.statementOfFacts || '[No statement of facts provided]'}

PHASE I OUTPUT:
${JSON.stringify(phaseIOutput, null, 2)}

Provide your Phase II legal framework analysis as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: resolveModelForExecution('II', input.tier),
      max_tokens: resolveMaxTokensForExecution('II', input.tier), // Phase II: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('II', outputText, input.orderId);

    const parsed = extractJSON(outputText, { phase: 'II', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase II] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'II',
        status: 'failed',
        output: null,
        error: `Phase II produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput: Record<string, unknown> = { ...parsed.data, phaseComplete: 'II' };

    // SP-14 TASK-16: Append relevant Louisiana articles for Phase III research guidance
    const articles = getArticlesForMotion(input.motionType, input.jurisdiction);
    if (articles.primary.length > 0 || articles.secondary.length > 0) {
      phaseOutput.relevant_articles = articles;
      console.log(`[Phase II] Appended ${articles.primary.length} primary + ${articles.secondary.length} secondary articles for ${input.motionType}`);
    } else {
      console.log(`[Phase II] No article mapping for motionType="${input.motionType}" jurisdiction="${input.jurisdiction}"`);
    }

    return {
      success: true,
      phase: 'II',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'III',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'II',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase II failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE III: Evidence Strategy / Issue Identification
// ============================================================================

/**
 * CHEN RELEVANCE FIX (2026-02-05): Construct research queries from argument structure
 *
 * If the AI doesn't generate research_queries in Phase III output, this function
 * programmatically builds them from the argument_structure elements + motion type.
 */
interface ResearchQuery {
  proposition_id: string;
  proposition: string;
  primary_query: string;
  fallback_queries: string[];
  required_topic: string;
  statutory_basis: string[];
}

function constructResearchQueriesFromStructure(
  argumentStructure: Array<{
    element_name?: string;
    propositions?: Array<{
      proposition_id?: string;
      proposition_text?: string;
      proposition_type?: string;
    }>;
  }>,
  motionType: string
): ResearchQuery[] {
  const queries: ResearchQuery[] = [];

  // Map motion type to statutory articles for query building
  const motionStatutes: Record<string, string[]> = {
    'motion_to_compel': ['La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1461'],
    'Motion to Compel Discovery': ['La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1461'],
    'motion_to_compel_discovery': ['La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1461'],
    'Motion for Summary Judgment': ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    'motion_for_summary_judgment': ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    'Motion to Dismiss': ['La. C.C.P. Art. 927', 'La. C.C.P. Art. 931'],
    'motion_to_dismiss': ['La. C.C.P. Art. 927', 'La. C.C.P. Art. 931'],
  };

  const defaultStatutes = motionStatutes[motionType] || [];
  const motionLabel = motionType.replace(/_/g, ' ').toLowerCase();

  for (const element of argumentStructure) {
    if (!element.propositions) continue;

    for (const prop of element.propositions) {
      const propText = prop.proposition_text || element.element_name || 'legal element';
      const propId = prop.proposition_id || `P${queries.length + 1}`;

      // Extract statutory references from proposition text
      const statutoryRefs = extractStatutoryFromText(propText);
      const allStatutes = statutoryRefs.length > 0 ? statutoryRefs : defaultStatutes;

      // Build primary query: statutory ref + key terms + jurisdiction
      const shortRef = allStatutes[0] ? shortenRef(allStatutes[0]) : '';
      const keyTerms = extractKeyTerms(propText, 4);
      const primaryQuery = `${shortRef} ${keyTerms} Louisiana`.trim();

      queries.push({
        proposition_id: propId,
        proposition: propText,
        primary_query: primaryQuery.split(/\s+/).slice(0, 15).join(' '),
        fallback_queries: [
          `${keyTerms} Louisiana appellate`.split(/\s+/).slice(0, 15).join(' '),
          `${motionLabel} Louisiana civil procedure`.split(/\s+/).slice(0, 15).join(' '),
        ],
        required_topic: motionLabel.replace(/\s+/g, '_'),
        statutory_basis: allStatutes,
      });
    }
  }

  return queries;
}

function extractStatutoryFromText(text: string): string[] {
  const patterns = [
    /La\.?\s*C\.?C\.?P\.?\s*(?:Art\.?|art\.?)\s*\d+/gi,
    /La\.?\s*R\.?S\.?\s*\d+:\d+/gi,
    /Art\.?\s*\d+/gi,
  ];
  const refs: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) refs.push(...matches);
  }
  return [...new Set(refs)];
}

function shortenRef(ref: string): string {
  const match = ref.match(/(Art\.?\s*\d+)/i);
  return match ? match[1] : ref;
}

function extractKeyTerms(text: string, maxTerms: number): string {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'must', 'that', 'which', 'who', 'this', 'it',
    'of', 'in', 'for', 'on', 'at', 'to', 'from', 'by', 'with', 'as', 'or', 'and',
    'but', 'not', 'no', 'if', 'so', 'under', 'per', 'required']);
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  return words.slice(0, maxTerms).join(' ');
}

async function executePhaseIII(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();
    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt
    // ========================================================================
    const systemPrompt = buildPhasePrompt('III', PHASE_PROMPTS.PHASE_III);

    const userMessage = `Analyze evidence and issues for Phase III:

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}
CASE NUMBER: ${input.caseNumber || '[Not provided]'}
CASE CAPTION: ${input.caseCaption || '[Not provided]'}

STATEMENT OF FACTS (from client):
${input.statementOfFacts || '[No statement of facts provided]'}

PROCEDURAL HISTORY:
${input.proceduralHistory || '[No procedural history provided]'}

CLIENT INSTRUCTIONS:
${input.instructions || '[No special instructions]'}

UPLOADED DOCUMENTS:
${input.documents && input.documents.length > 0 ? input.documents.join('\n\n---\n\n') : '[No documents uploaded]'}

PHASE I OUTPUT (intake analysis):
${JSON.stringify(phaseIOutput, null, 2)}

PHASE II OUTPUT (legal framework):
${JSON.stringify(phaseIIOutput, null, 2)}

IMPORTANT: The statement of facts and uploaded documents above ARE the client's evidence for this motion. Evaluate evidence sufficiency based on what is actually provided, not what a perfect case file would contain. For procedural motions (extensions of time, continuances, substitutions of counsel), the statement of facts alone is typically sufficient evidence — do NOT recommend HOLD for these motion types unless genuinely critical information is missing.

Provide your Phase III evidence strategy as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: resolveModelForExecution('III', input.tier),
      max_tokens: resolveMaxTokensForExecution('III', input.tier), // Phase III: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('III', outputText, input.orderId);

    const parsed = extractJSON<Record<string, unknown>>(outputText, { phase: 'III', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase III] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'III',
        status: 'failed',
        output: null,
        error: `Phase III produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput: Record<string, unknown> = { ...parsed.data, phaseComplete: 'III' };

    // CHEN RELEVANCE FIX (2026-02-05): Validate research_queries presence
    // If the AI didn't generate research_queries, construct them from argument_structure
    if (!phaseOutput.research_queries || !Array.isArray(phaseOutput.research_queries) || (phaseOutput.research_queries as unknown[]).length === 0) {
      console.warn(`[Phase III] No research_queries in output — constructing from argument_structure`);
      phaseOutput.research_queries = constructResearchQueriesFromStructure(
        (phaseOutput.argument_structure as Array<Record<string, unknown>>) || [],
        input.motionType
      );
      console.log(`[Phase III] Constructed ${(phaseOutput.research_queries as unknown[]).length} research queries from argument structure`);
    } else {
      console.log(`[Phase III] AI generated ${(phaseOutput.research_queries as unknown[]).length} research queries`);
    }

    // Check for HOLD condition
    const requiresHold = phaseOutput.holdRequired === true;

    return {
      success: true,
      phase: 'III',
      status: requiresHold ? 'blocked' : 'completed',
      output: phaseOutput,
      nextPhase: requiresHold ? undefined : 'IV',
      requiresReview: requiresHold,
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'III',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase III failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE IV: Authority Research (CP1) - SEARCH-FIRST COURTLISTENER VERIFICATION
// ============================================================================

import {
  searchOpinions,
  buildVerifiedCitationBank,
  verifyCitationExists,
  validateCourtListenerConfig,
  type VerifiedCitation,
} from '@/lib/courtlistener/client';

// Legal-Grade Citation Research System (Phase IV-A/B/C)
import {
  executeLegalGradeResearch,
  mapMotionType,
} from '@/lib/workflow/phase-iv';

/**
 * Log citation verification to database for audit trail
 */
async function logCitationVerification(
  orderId: string,
  phase: string,
  citationText: string,
  courtlistenerId: number | null,
  verificationResult: 'verified' | 'not_found' | 'api_error' | 'plurality_flagged' | 'dissent_blocked' | 'concurrence_flagged' | 'flagged' | 'rejected',
  apiResponse: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from('citation_verifications').insert({
      order_id: orderId,
      citation_text: citationText,
      courtlistener_id: courtlistenerId,
      verification_status: verificationResult === 'verified' ? 'VERIFIED' : 'NOT_FOUND',
      stage_1_result: verificationResult,
      stage_1_at: new Date().toISOString(),
      notes: `Phase ${phase} verification`,
    });
  } catch (error) {
    console.error('[Phase IV] Failed to log citation verification:', error);
    // Don't throw - logging failure shouldn't block workflow
  }
}

async function executePhaseIV(input: PhaseInput): Promise<PhaseOutput> {
  // ════════════════════════════════════════════════════════════════════════════
  // PHASE IV VERSION: 2026-01-30-LEGAL-GRADE
  // Legal-Grade Citation Research System (Chen Megaprompt Specification)
  // Three sub-phases: IV-A (Element Extraction), IV-B (Parallel Search), IV-C (Holding Verification)
  // ════════════════════════════════════════════════════════════════════════════
  const start = Date.now();

  console.log('╔' + '═'.repeat(72) + '╗');
  console.log('║  PHASE IV: LEGAL-GRADE CITATION RESEARCH                              ║');
  console.log('║  VERSION: 2026-01-30-LEGAL-GRADE (Chen Megaprompt Spec)              ║');
  console.log('╚' + '═'.repeat(72) + '╝');
  console.log(`[Phase IV] Order ID: ${input.orderId}`);
  console.log(`[Phase IV] Jurisdiction: ${input.jurisdiction}`);
  console.log(`[Phase IV] Motion Type: ${input.motionType}`);
  console.log(`[Phase IV] Tier: ${input.tier}`);

  try {
    const client = getAnthropicClient();
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;
    const phaseIIIOutput = input.previousPhaseOutputs['III'] as Record<string, unknown>;

    // CHEN RELEVANCE FIX (2026-02-05): Extract research_queries from Phase III
    const researchQueries = (phaseIIIOutput?.research_queries || []) as ResearchQuery[];
    if (researchQueries.length > 0) {
      console.log(`[Phase IV] ✅ Received ${researchQueries.length} research queries from Phase III`);
      researchQueries.forEach((q, i) => {
        console.log(`[Phase IV]   Q${i + 1}: "${q.primary_query}" (${q.proposition_id})`);
      });
    } else {
      console.warn(`[Phase IV] ⚠️ No research_queries from Phase III — Phase IV-A will extract elements independently`);
    }

    // =========================================================================
    // EXECUTE LEGAL-GRADE CITATION RESEARCH (3 sub-phases)
    // =========================================================================
    const result = await executeLegalGradeResearch({
      orderId: input.orderId,
      motionType: mapMotionType(input.motionType),
      jurisdiction: input.jurisdiction,
      tier: input.tier,
      statementOfFacts: input.statementOfFacts,
      phaseIIOutput,
      phaseIIIOutput: {
        ...phaseIIIOutput,
        research_queries: researchQueries,
      },
    }, client);

    if (!result.success) {
      console.error(`[Phase IV] Legal-Grade Research failed: ${result.error}`);
      return {
        success: false,
        phase: 'IV',
        status: 'failed',
        output: null,
        error: result.error || 'Legal-Grade Citation Research failed',
        durationMs: Date.now() - start,
      };
    }

    // =========================================================================
    // NUCLEAR VALIDATION: Every citation MUST have courtlistener_id
    // =========================================================================
    for (const citation of result.caseCitationBank) {
      if (!citation.courtlistener_id) {
        throw new Error(`FATAL: Citation "${citation.caseName}" missing courtlistener_id`);
      }
    }

    // MINIMUM CITATION CHECK
    const minRequired = input.tier === 'A' ? 2 : input.tier === 'B' ? 5 : 8;
    if (result.caseCitationBank.length < minRequired) {
      console.error(`[Phase IV] FATAL: Insufficient citations: ${result.caseCitationBank.length} < ${minRequired} required for Tier ${input.tier}`);
      throw new Error(`Only ${result.caseCitationBank.length} verified citations found, but Tier ${input.tier} requires at least ${minRequired}.`);
    }

    // Log each verified citation for audit trail
    for (const citation of result.caseCitationBank) {
      await logCitationVerification(
        input.orderId,
        'IV',
        citation.citation,
        citation.courtlistener_id,
        'verified',
        { method: citation.verification_method, timestamp: citation.verification_timestamp }
      );
    }

    // Build phase output (compatible with existing Phase V expectations)
    const phaseOutput = {
      phaseComplete: 'IV',
      caseCitationBank: result.caseCitationBank,
      statutoryCitationBank: result.statutoryCitationBank,
      totalCitations: result.totalCitations,
      bindingCount: result.bindingCount,
      persuasiveCount: result.persuasiveCount,
      citationVerificationEnforced: true,
      allCitationsVerified: result.verificationProof?.allCitationsVerified ?? false,
      verificationProof: result.verificationProof,
      _phaseIV_meta: result._phaseIV_meta,
    };

    console.log(`[Phase IV] ✓ VERIFIED: All ${result.caseCitationBank.length} citations have courtlistener_id`);
    console.log(`[Phase IV] Louisiana: ${result.louisianaCitations}, Federal: ${result.federalCitations}`);
    console.log(`[Phase IV] Duration: ${Date.now() - start}ms`);

    return {
      success: true,
      phase: 'IV',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'V',
      requiresReview: true, // CP1: Notify admin research is complete
      durationMs: Date.now() - start,
    };
  } catch (error) {
    console.error(`[Phase IV] ========== PHASE IV FAILED ==========`);
    console.error(`[Phase IV] Error:`, error);
    return {
      success: false,
      phase: 'IV',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase IV failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE V: Draft Motion - WITH CITATION VERIFICATION GATE
// ============================================================================

async function executePhaseV(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase V] ========== STARTING PHASE V (DRAFT MOTION) ==========`);
  console.log(`[Phase V] Order: ${input.orderId}, Tier: ${input.tier}`);

  try {
    // =========================================================================
    // CITATION VERIFICATION GATE - REJECT UNVERIFIED CITATION BANKS
    // =========================================================================
    const phaseIVOutput = input.previousPhaseOutputs['IV'] as Record<string, unknown>;

    console.log(`[Phase V] VERIFICATION GATE: Checking citation bank for verification proof...`);

    const caseCitationBank = (phaseIVOutput?.caseCitationBank || []) as Array<{
      courtlistener_id?: unknown;
      citation?: string;
      verification_timestamp?: string;
    }>;

    if (caseCitationBank.length === 0) {
      console.error(`[Phase V] VERIFICATION GATE FAILED: No citations in citation bank`);
      return {
        success: false,
        phase: 'V',
        status: 'blocked',
        output: null,
        error: 'VERIFICATION GATE: Citation bank is empty. Phase IV must provide verified citations.',
        durationMs: Date.now() - start,
      };
    }

    // Check every citation has courtlistener_id
    const unverifiedCitations = caseCitationBank.filter(c => !c.courtlistener_id);

    if (unverifiedCitations.length > 0) {
      console.error(`[Phase V] VERIFICATION GATE FAILED: ${unverifiedCitations.length} citations missing courtlistener_id`);
      console.error(`[Phase V] Unverified citations:`, unverifiedCitations.map(c => c.citation).join(', '));

      // Log each failed citation
      for (const citation of unverifiedCitations) {
        await logCitationVerification(
          input.orderId,
          'V',
          citation.citation || 'Unknown',
          null,
          'not_found',
          { reason: 'Missing courtlistener_id verification proof' }
        );
      }

      return {
        success: false,
        phase: 'V',
        status: 'blocked',
        output: {
          error: 'VERIFICATION GATE FAILED',
          unverifiedCitations: unverifiedCitations.map(c => c.citation),
          message: 'All citations must have courtlistener_id verification proof',
        },
        error: `VERIFICATION GATE: ${unverifiedCitations.length} citations missing courtlistener_id. Cannot proceed with unverified citations.`,
        durationMs: Date.now() - start,
      };
    }

    // Check every citation has verification_timestamp
    const missingTimestamp = caseCitationBank.filter(c => !c.verification_timestamp);

    if (missingTimestamp.length > 0) {
      console.warn(`[Phase V] WARNING: ${missingTimestamp.length} citations missing verification_timestamp`);
      // This is a warning, not a blocking error - courtlistener_id is the critical field
    }

    console.log(`[Phase V] VERIFICATION GATE PASSED: All ${caseCitationBank.length} citations have courtlistener_id`);

    // =========================================================================
    // LOG CITATION BANK FOR DEBUGGING — CITATION ENFORCEMENT ACTIVE
    // =========================================================================
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  PHASE V: DRAFT MOTION — CITATION ENFORCEMENT ACTIVE         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`[Phase V] Citation bank size: ${caseCitationBank.length}`);

    // Cast to proper type for enforcement functions
    const typedCitationBank = caseCitationBank as VerifiedCitationEntry[];
    const statutoryCitationBank = (phaseIVOutput?.statutoryCitationBank || []) as StatutoryCitationEntry[];

    console.log(`[Phase V] Statutory bank size: ${statutoryCitationBank.length}`);

    if (typedCitationBank.length > 0) {
      console.log('[Phase V] Available citations for this motion:');
      typedCitationBank.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.caseName || 'Unknown'}, ${c.citation || 'No citation'} (ID: ${c.courtlistener_id})`);
      });
    }

    // BUILD CITATION ENFORCEMENT PROMPT
    const citationEnforcementBlock = buildCitationEnforcementPrompt(typedCitationBank, statutoryCitationBank);

    // Log confirmation that citation enforcement is being injected
    console.log('[Phase V] ✅ Citation enforcement block built and will be injected into system prompt');
    console.log(`[Phase V] Citation enforcement block length: ${citationEnforcementBlock.length} chars`);
    console.log('[Phase V] Citation enforcement block preview (first 500 chars):');
    console.log(citationEnforcementBlock.substring(0, 500));
    console.log('[Phase V] ... (enforcement block continues with full citation bank)');

    const todayDate = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });

    // =========================================================================
    // Continue with normal Phase V execution
    // =========================================================================
    console.log(`[Phase V] Getting Anthropic client...`);
    const client = getAnthropicClient();
    console.log(`[Phase V] Anthropic client ready`);

    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;
    const phaseIIIOutput = input.previousPhaseOutputs['III'] as Record<string, unknown>;

    // Validate we have outputs from previous phases
    console.log(`[Phase V] Phase I output exists: ${!!phaseIOutput}`);
    console.log(`[Phase V] Phase II output exists: ${!!phaseIIOutput}`);
    console.log(`[Phase V] Phase III output exists: ${!!phaseIIIOutput}`);
    console.log(`[Phase V] Phase IV output exists: ${!!phaseIVOutput}`);

    // Build the attorney signature block - CRITICAL: NO PLACEHOLDERS
    const getRepresentedPartyName = () => {
      const represented = input.parties?.find(p => p.isRepresented);
      return represented?.name || input.parties?.[0]?.name || 'Movant';
    };

    const signatureBlock = `
_________________________
${input.attorneyName}
Bar Roll No. ${input.barNumber}
${input.firmName}
${input.firmAddress}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}`.trim();
    // Extract case data from Phase I output or use input fallbacks
    const phaseIClassification = (phaseIOutput?.classification ?? {}) as Record<string, unknown>;
    const phaseICaseIdentifiers = (phaseIOutput?.caseIdentifiers ?? {}) as Record<string, unknown>;
    const phaseIParties = (phaseIOutput?.parties ?? {}) as Record<string, unknown>;

    // Build parties string from input
    const partiesText = input.parties && input.parties.length > 0
      ? input.parties.map(p => `  - ${p.name} (${p.role})`).join('\n')
      : '  [Parties not specified in order]';

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt + case data injection
    // CITATION ENFORCEMENT BLOCK INJECTED AT TOP
    // ========================================================================
    const systemPrompt = buildPhasePrompt('V', `${citationEnforcementBlock}

${PHASE_PROMPTS.PHASE_V}`) + `

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: FILING ATTORNEY INFORMATION (USE EXACTLY - NO PLACEHOLDERS)
═══════════════════════════════════════════════════════════════════════════════

Attorney Name: ${input.attorneyName}
Bar Roll Number: ${input.barNumber}
Firm Name: ${input.firmName}
Address: ${input.firmAddress}
Phone: ${input.firmPhone}
Email: ${input.firmEmail}
Representing: ${getRepresentedPartyName()}

Today's Date for Certificate of Service: ${todayDate}

THE SIGNATURE BLOCK IN THE MOTION MUST APPEAR EXACTLY AS:
${signatureBlock}

═══════════════════════════════════════════════════════════════════════════════

REQUIREMENTS:
1. Start with proper court caption using EXACT case number and party names
2. Include Introduction
3. Address each element with supporting authority from Phase IV
4. Use citations EXACTLY as provided in Phase IV
5. Include Statement of Facts referencing Phase I facts
6. Build arguments following Phase III strategy
7. Include Conclusion and Prayer for Relief
8. Include signature block with the EXACT attorney information above
9. Include Certificate of Service with the EXACT attorney information

CRITICAL - DO NOT:
- Use [ATTORNEY NAME] or similar placeholders
- Use [BAR ROLL NUMBER] or [BAR NUMBER] placeholders
- Use [FIRM NAME] or [ADDRESS] placeholders
- Leave any bracketed placeholders in the signature block
- Make up attorney information - use EXACTLY what is provided above
################################################################################
#  CRITICAL: CASE DATA INJECTION - USE THESE EXACT VALUES                      #
################################################################################

CASE INFORMATION (USE THESE EXACT DETAILS - NO PLACEHOLDERS):
- Case Caption: ${input.caseCaption}
- Case Number: ${input.caseNumber}
- Jurisdiction: ${input.jurisdiction}
- Court Division: ${input.courtDivision || '[Not specified]'}
- Motion Type: ${input.motionType}
- Filing Deadline: ${input.filingDeadline || '[Not specified]'}

PARTIES (USE THESE EXACT NAMES):
${partiesText}

STATEMENT OF FACTS FROM CLIENT:
${input.statementOfFacts || '[Client statement of facts not provided]'}

PROCEDURAL HISTORY FROM CLIENT:
${input.proceduralHistory || '[Procedural history not provided]'}

CLIENT INSTRUCTIONS:
${input.instructions || '[No special instructions]'}

################################################################################
#  CRITICAL PLACEHOLDER PROHIBITION                                             #
################################################################################

- Do NOT use [PARISH NAME], [JUDICIAL DISTRICT], or any bracketed placeholders
- Do NOT use generic names like "John Doe", "Jane Smith", "ABC Corp"
- Do NOT use placeholder text like "YOUR CLIENT", "OPPOSING PARTY"
- Use ONLY the actual case data provided above
- If any required information is missing, flag it in the output but still use best available data

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "V",
  "draftMotion": {
    "caption": "full court caption with REAL case number and parties",
    "title": "MOTION FOR [TYPE]",
    "introduction": "string",
    "statementOfFacts": "string using CLIENT-PROVIDED facts",
    "legalArguments": [
      {
        "heading": "I. [ARGUMENT HEADING]",
        "content": "full argument text with citations",
        "citationsUsed": ["citation1", "citation2"]
      }
    ],
    "conclusion": "string",
    "prayerForRelief": "string",
    "signature": "EXACT signature block with real attorney name, bar number, and firm info",
    "certificateOfService": "full certificate with attorney signature block"
  },
  "wordCount": 0,
  "citationsIncluded": 0,
  "sectionsComplete": ["caption", "intro", "facts", "arguments", "conclusion", "prayer", "signature", "cos"],
  "missingDataFlags": ["list any critical data that was missing"]
}

CRITICAL: The "draftMotion" field MUST be an object containing the motion sections. Do NOT use any other field name.`;

    const userMessage = `Draft the motion using all previous phase outputs AND the case data provided in the system prompt:

═══════════════════════════════════════════════════════════════
CASE INFORMATION (USE EXACT VALUES)
═══════════════════════════════════════════════════════════════
Case Number: ${input.caseNumber}
Case Caption: ${input.caseCaption}
Court/Division: ${input.courtDivision || input.jurisdiction}
Motion Type: ${input.motionType}
Jurisdiction: ${input.jurisdiction}

═══════════════════════════════════════════════════════════════
FILING ATTORNEY (USE IN SIGNATURE BLOCK)
═══════════════════════════════════════════════════════════════
${input.attorneyName}
Bar Roll No. ${input.barNumber}
${input.firmName}
${input.firmAddress}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}

═══════════════════════════════════════════════════════════════
PHASE I (Case Info):
${JSON.stringify(phaseIOutput, null, 2)}

PHASE II (Legal Framework):
${JSON.stringify(phaseIIOutput, null, 2)}

PHASE III (Evidence Strategy):
${JSON.stringify(phaseIIIOutput, null, 2)}

PHASE IV (Citation Bank):
${JSON.stringify(phaseIVOutput, null, 2)}

REMINDER - USE THESE EXACT VALUES IN THE MOTION:
- Case Caption: ${input.caseCaption}
- Case Number: ${input.caseNumber}
- Jurisdiction: ${input.jurisdiction}
- Motion Type: ${input.motionType}

Draft the complete motion with REAL case data - NO PLACEHOLDERS. Provide as JSON.`;

    const model = resolveModelForExecution('V', input.tier);
    console.log(`[Phase V] Calling Claude with model: ${model}, max_tokens: ${resolveMaxTokensForExecution('V', input.tier)}`);
    console.log(`[Phase V] User message length: ${userMessage.length} chars`);

    const callStart = Date.now();
    const response = await createMessageWithStreaming(client, {
      model,
      max_tokens: resolveMaxTokensForExecution('V', input.tier), // Phase V: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const callDuration = Date.now() - callStart;

    console.log(`[Phase V] Claude responded in ${callDuration}ms`);
    console.log(`[Phase V] Tokens used - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);
    console.log(`[Phase V] Stop reason: ${response.stop_reason}`);

    // CRITICAL: Phase V should take at least 30 seconds for a real motion draft
    if (callDuration < 10000) {
      console.warn(`[Phase V] WARNING: Claude responded very quickly (${callDuration}ms). This may indicate an issue.`);
    }

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('V', outputText, input.orderId);

    console.log(`[Phase V] Response text length: ${outputText.length} chars`);

    // CRITICAL: Phase V output should be substantial (a motion is typically 5000+ characters)
    if (!outputText || outputText.length < 1000) {
      console.error(`[Phase V] CRITICAL: Claude returned empty or very short response!`);
      console.error(`[Phase V] Response content: ${JSON.stringify(response.content).substring(0, 500)}`);
      return {
        success: false,
        phase: 'V',
        status: 'failed',
        output: null,
        error: `Claude returned insufficient response for motion draft (${outputText.length} chars). Expected at least 1000 chars.`,
        durationMs: Date.now() - start,
      };
    }

    // Parse JSON output using robust extractor
    let phaseOutput: Record<string, unknown> | null = null;

    const parsed = extractJSON<Record<string, unknown>>(outputText, { phase: 'V', orderId: input.orderId });
    if (parsed.success) {
      phaseOutput = parsed.data;
      console.log(`[Phase V] Parsed output keys: ${Object.keys(phaseOutput).join(', ')}`);
    } else {
      console.error(`[Phase V] JSON extraction failed: ${parsed.error}`);
    }

    // ================================================================
    // ROBUST draftMotion EXTRACTION
    // Handle multiple possible field names Claude might use
    // ================================================================
    let draftMotion: Record<string, unknown> | null = null;

    if (phaseOutput) {
      // Check multiple possible field names
      draftMotion = (
        phaseOutput.draftMotion ||
        phaseOutput.draft_motion ||
        phaseOutput.motionDraft ||
        phaseOutput.motion_draft ||
        phaseOutput.draft ||
        phaseOutput.motion
      ) as Record<string, unknown> | null;

      const foundField =
        phaseOutput.draftMotion ? 'draftMotion' :
        phaseOutput.draft_motion ? 'draft_motion' :
        phaseOutput.motionDraft ? 'motionDraft' :
        phaseOutput.motion_draft ? 'motion_draft' :
        phaseOutput.draft ? 'draft' :
        phaseOutput.motion ? 'motion' : 'NONE';

      console.log(`[Phase V] Draft motion found in field: ${foundField}`);

      // If no explicit draft field, check if the entire response IS the draft
      if (!draftMotion && (phaseOutput.caption || phaseOutput.introduction || phaseOutput.legalArguments)) {
        console.log(`[Phase V] Response appears to BE the draft motion (no wrapper)`);
        draftMotion = phaseOutput;
      }
    }

    // ================================================================
    // LAST RESORT: Use raw text if it looks like a motion
    // ================================================================
    if (!draftMotion && outputText.length > 1000) {
      const looksLikeMotion =
        outputText.includes('MOTION') ||
        outputText.includes('COURT') ||
        outputText.includes('Respectfully submitted') ||
        outputText.includes('WHEREFORE') ||
        outputText.includes('PRAYER FOR RELIEF');

      if (looksLikeMotion) {
        console.log(`[Phase V] Using raw response as draft (looks like a motion)`);
        draftMotion = {
          rawText: outputText,
          _note: 'Extracted from raw response - not JSON structured'
        };
      }
    }

    // Final validation
    if (!draftMotion) {
      console.error(`[Phase V] ❌ FATAL: Could not extract draftMotion from response`);
      console.error(`[Phase V] Parsed output keys: ${phaseOutput ? Object.keys(phaseOutput).join(', ') : 'NO PARSED OUTPUT'}`);
      console.error(`[Phase V] Raw response preview: ${outputText.substring(0, 800)}...`);
      return {
        success: false,
        phase: 'V',
        status: 'failed',
        output: phaseOutput || { raw: outputText },
        error: 'Claude response missing draftMotion field. Motion draft incomplete.',
        durationMs: Date.now() - start,
      };
    }

    // Ensure draftMotion is on the output
    if (phaseOutput && !phaseOutput.draftMotion) {
      phaseOutput.draftMotion = draftMotion;
    } else if (!phaseOutput) {
      phaseOutput = { draftMotion };
    }

    console.log(`[Phase V] ✅ Draft motion extracted successfully`);
    console.log(`[Phase V] Draft motion keys: ${Object.keys(draftMotion).join(', ')}`)

    // =========================================================================
    // POST-GENERATION CITATION VALIDATION — ZERO TOLERANCE FOR HALLUCINATIONS
    // =========================================================================
    console.log('[Phase V] Running post-generation citation validation...');

    // Convert draftMotion to string for validation
    const draftMotionText = typeof draftMotion === 'string'
      ? draftMotion
      : JSON.stringify(draftMotion);

    const validationResult = validateDraftCitations(
      draftMotionText,
      typedCitationBank,
      statutoryCitationBank
    );

    // Build validation metadata object
    const citationValidationData: Record<string, unknown> = {
      authorized: validationResult.authorizedCitations.length,
      unauthorized: validationResult.unauthorizedCitations.length,
      isValid: validationResult.isValid,
      warnings: validationResult.warnings,
    };

    if (!validationResult.isValid) {
      console.log('[Phase V] ⚠️ UNAUTHORIZED CITATIONS DETECTED');
      console.log('[Phase V] Unauthorized citations:', validationResult.unauthorizedCitations);

      // Log each unauthorized citation (use 'not_found' status for hallucinated citations)
      for (const badCite of validationResult.unauthorizedCitations) {
        await logCitationVerification(
          input.orderId,
          'V',
          badCite.substring(0, 100),
          null,
          'not_found',  // Hallucinated citation not in verified bank
          { reason: 'HALLUCINATED - Citation not in verified bank - removed from draft' }
        );
      }

      // Strip unauthorized citations from the draft
      console.log('[Phase V] Stripping unauthorized citations from draft...');
      const cleanedDraftText = stripUnauthorizedCitations(draftMotionText, validationResult.unauthorizedCitations);

      // Update draftMotion with cleaned version
      if (typeof draftMotion === 'string') {
        phaseOutput.draftMotion = cleanedDraftText;
      } else {
        // Try to update string fields in the object
        for (const key of Object.keys(draftMotion)) {
          const value = (draftMotion as Record<string, unknown>)[key];
          if (typeof value === 'string' && value.length > 100) {
            (draftMotion as Record<string, unknown>)[key] = stripUnauthorizedCitations(
              value,
              validationResult.unauthorizedCitations
            );
          }
        }
        phaseOutput.draftMotion = draftMotion;
      }

      citationValidationData.strippedCitations = validationResult.unauthorizedCitations;
      console.log('[Phase V] ✅ Unauthorized citations stripped');
    } else {
      console.log('[Phase V] ✅ Citation validation PASSED — all citations from verified bank');
    }

    // Add validation to phaseOutput
    phaseOutput.citationValidation = citationValidationData;

    phaseOutput.phaseComplete = 'V';

    console.log(`[Phase V] ========== PHASE V COMPLETE ==========`);
    console.log(`[Phase V] Total duration: ${Date.now() - start}ms`);
    console.log(`[Phase V] Motion word count: ${phaseOutput.wordCount || 'N/A'}`);
    console.log(`[Phase V] Citation validation: ${validationResult.isValid ? 'PASSED' : 'FAILED (stripped unauthorized)'}`);

    // =========================================================================
    // SAVE CITATIONS TO DATABASE - Citation Viewer Feature
    // =========================================================================
    console.log(`[Phase V] Saving citations to order_citations table...`);

    try {
      // Get the full citation banks from Phase IV
      const fullCaseCitationBank = (phaseIVOutput?.caseCitationBank || []) as Array<{
        caseName?: string;
        citation?: string;
        courtlistener_id?: number;
        courtlistener_cluster_id?: number;
        court?: string;
        date_filed?: string;
        proposition?: string;
        authorityLevel?: string;
        verification_timestamp?: string;
        verification_method?: string;
      }>;

      const statutoryCitationBank = (phaseIVOutput?.statutoryCitationBank || []) as Array<{
        citation?: string;
        name?: string;
        relevantText?: string;
        purpose?: string;
      }>;

      // Transform case citations to SaveCitationInput format
      const caseCitationInputs: SaveCitationInput[] = fullCaseCitationBank.map((c, index) => {
        const resolvedName = c.caseName || extractCaseName(c.citation);
        // Extract short name (first party before "v.")
        const vMatch = resolvedName.match(/^([^v]+?)(?:\s+v\.?\s+|\s+vs\.?\s+)/i);
        const shortName = vMatch ? vMatch[1].trim().split(/[,\s]/)[0] : resolvedName.split(/[,\s]/)[0] || resolvedName;
        // Extract year from date_filed
        const yearDisplay = c.date_filed ? c.date_filed.split('-')[0] : undefined;

        return {
          citationString: c.citation || '',
          caseName: resolvedName,
          caseNameShort: shortName,
          courtlistenerOpinionId: c.courtlistener_id?.toString(),
          courtlistenerClusterId: c.courtlistener_cluster_id?.toString(),
          courtlistenerUrl: c.courtlistener_id
            ? `https://www.courtlistener.com/opinion/${c.courtlistener_id}/`
            : undefined,
          court: c.court,
          courtShort: c.court ? deriveCourtShort(c.court) : undefined,
          dateFiled: c.date_filed,
          dateFiledDisplay: yearDisplay,
          citationType: 'case' as const,
          proposition: c.proposition,
          authorityLevel: c.authorityLevel === 'binding' ? 'binding' : 'persuasive',
          verificationStatus: 'pending_civ' as const,
          verificationMethod: c.verification_method || 'courtlistener_api',
          displayOrder: index + 1,
        };
      });

      // Transform statutory citations to SaveCitationInput format
      const statutoryCitationInputs: SaveCitationInput[] = statutoryCitationBank.map((s, index) => ({
        citationString: s.citation || s.name || '',
        caseName: s.name || s.citation || 'Statutory Reference',
        citationType: 'statute' as const,
        proposition: s.purpose || s.relevantText,
        verificationStatus: 'verified' as const, // Statutes are presumed valid
        displayOrder: caseCitationInputs.length + index + 1,
      }));

      // Combine and save all citations
      const allCitations = [...caseCitationInputs, ...statutoryCitationInputs];

      if (allCitations.length > 0) {
        const saveResult = await saveOrderCitations(input.orderId, allCitations);

        if (saveResult.success) {
          console.log(`[Phase V] ✅ Citations saved: ${saveResult.data?.savedCitations} total`);
          console.log(`[Phase V]    - Case citations: ${saveResult.data?.caseCitations}`);
          console.log(`[Phase V]    - Statutory citations: ${saveResult.data?.statutoryCitations}`);

          // Add citation save info to phase output
          phaseOutput.citationsSaved = {
            total: saveResult.data?.savedCitations || 0,
            caseCitations: saveResult.data?.caseCitations || 0,
            statutoryCitations: saveResult.data?.statutoryCitations || 0,
          };
        } else {
          console.error(`[Phase V] ⚠️ Failed to save citations: ${saveResult.error}`);
          // Don't fail the phase - citations are nice-to-have for viewer
          phaseOutput.citationsSaved = { total: 0, error: saveResult.error };
        }
      } else {
        console.log(`[Phase V] No citations to save`);
        phaseOutput.citationsSaved = { total: 0 };
      }
    } catch (citationError) {
      console.error(`[Phase V] ⚠️ Citation save error (non-fatal):`, citationError);
      phaseOutput.citationsSaved = {
        total: 0,
        error: citationError instanceof Error ? citationError.message : 'Unknown error',
      };
    }

    return {
      success: true,
      phase: 'V',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'V.1',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    console.error(`[Phase V] ========== PHASE V FAILED ==========`);
    console.error(`[Phase V] Error:`, error);
    return {
      success: false,
      phase: 'V',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase V failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE V.1: Citation Accuracy Check - ZERO TOLERANCE ENFORCEMENT
// ============================================================================
// CHEN CIV FIX (2026-02-02): Enhanced citation extraction for Phase V.1
// ============================================================================

/**
 * Extract all case citations from text using regex patterns
 *
 * CITATION FORMATS SUPPORTED:
 * - Federal: "884 F.3d 546", "132 F.4th 918", "54 F.Supp.3d 789"
 * - SCOTUS: "410 U.S. 113", "541 U.S. 600"
 * - Louisiana: "345 So. 3d 789", "270 So.3d 621", "123 La. 456"
 * - Other state: Cal.App.4th, N.E.2d, etc.
 * - Louisiana docket: "2021-01234 (La. App. 1 Cir. 12/15/21)"
 *
 * CHEN JURISDICTION FIX (2026-02-03): Enhanced Louisiana citation matching
 * Added more permissive patterns for So.2d/So.3d variations
 *
 * KNOWN ISSUE: Some citation banks contain bare opinion IDs like "9402549"
 * These are NOT valid citations and will not be extracted (by design).
 */
function extractCitationsFromText(text: string): string[] {
  const citations: string[] = [];
  const seen = new Set<string>();

  // ==========================================================================
  // PATTERN 1: Federal Reporter citations
  // Matches: 884 F.3d 546, 132 F.4th 918, 45 F.Supp.3d 789, 54 F.App'x 123
  // ==========================================================================
  const federalPattern = /\d{1,4}\s+F\.\s*(?:2d|3d|4th|Supp\.?\s*(?:2d|3d)?|App['']?x)?\s+\d{1,5}/gi;

  // ==========================================================================
  // PATTERN 2: Supreme Court citations
  // Matches: 410 U.S. 113, 541 S.Ct. 1234, 200 L.Ed.2d 456
  // ==========================================================================
  const scotusPattern = /\d{1,4}\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.\s*(?:2d)?)\s+\d{1,5}/gi;

  // ==========================================================================
  // PATTERN 3: State Reporter citations (Louisiana, California, etc.)
  // CHEN FIX: More permissive patterns for Louisiana So.2d/So.3d variations
  // Matches: 345 So.3d 789, 270 So. 3d 621, 123 So. 2d 456, 345 So.3d 789
  // Also matches: 123 Cal.App.4th 456, etc.
  // ==========================================================================
  const statePattern = /\d{1,4}\s+(?:So\.\s*(?:2d|3d)|Cal\.\s*(?:App\.\s*)?(?:2d|3d|4th|5th)?|N\.E\.\s*(?:2d|3d)?|N\.W\.\s*(?:2d)?|S\.E\.\s*(?:2d)?|S\.W\.\s*(?:2d|3d)?|A\.\s*(?:2d|3d)?|P\.\s*(?:2d|3d)?)\s*\d{1,5}/gi;

  // ==========================================================================
  // PATTERN 4: Louisiana docket format
  // Matches: 2021-01234 (La. App. 1 Cir. 12/15/21)
  // ==========================================================================
  const laDocketPattern = /\d{4}-\d{4,6}\s*\([^)]*La\.?\s*(?:App\.)?\s*[^)]*\)/gi;

  // ==========================================================================
  // PATTERN 5: Louisiana Reports citation (older format)
  // Matches: 123 La. 456, 456 La.App. 789
  // CHEN FIX (2026-02-03): Added for historical Louisiana citations
  // ==========================================================================
  const laReportsPattern = /\d{1,4}\s+La\.(?:\s*App\.)?\s*\d{1,5}/gi;

  // ==========================================================================
  // PATTERN 6: Full case citation with name (catches citations regex might miss)
  // Matches: "Smith v. Jones, 123 So.3d 456" extracts "123 So.3d 456"
  // ==========================================================================
  const fullCitationPattern = /(\d{1,4}\s+(?:So\.|F\.|U\.S\.|Cal\.|La\.)[^\d,]*\d{1,5})/gi;

  const patterns = [
    { name: 'Federal', regex: federalPattern },
    { name: 'SCOTUS', regex: scotusPattern },
    { name: 'State', regex: statePattern },
    { name: 'LA Docket', regex: laDocketPattern },
    { name: 'LA Reports', regex: laReportsPattern },
    { name: 'Full Citation', regex: fullCitationPattern },
  ];

  console.log(`[extractCitationsFromText] Text length: ${text.length} chars`);

  for (const { name, regex } of patterns) {
    // Reset lastIndex for global regex
    regex.lastIndex = 0;
    let match;
    let patternMatches = 0;

    while ((match = regex.exec(text)) !== null) {
      const citationText = match[0].trim();
      const normalized = citationText.toLowerCase().replace(/\s+/g, ' ');

      if (!seen.has(normalized)) {
        seen.add(normalized);
        citations.push(citationText);
        patternMatches++;
      }
    }

    if (patternMatches > 0) {
      console.log(`[extractCitationsFromText] ${name} pattern found ${patternMatches} citations`);
    }
  }

  console.log(`[extractCitationsFromText] Total unique citations extracted: ${citations.length}`);
  if (citations.length > 0 && citations.length <= 15) {
    console.log(`[extractCitationsFromText] Citations: ${citations.join(', ')}`);
  }

  return citations;
}

/**
 * Validate that a string looks like a legal citation, not an opinion ID
 * Used to filter out malformed entries in the citation bank
 *
 * @returns true if the string is a valid citation format
 */
function isValidCitationFormat(str: string): boolean {
  if (!str || typeof str !== 'string') return false;

  // A valid citation must contain a reporter abbreviation
  // e.g., "F.3d", "So. 3d", "U.S.", "Cal.App.4th"
  const reporterPattern = /\b(U\.S\.|S\.\s*Ct\.|L\.\s*Ed|F\.\s*\d*(?:th|d)?|F\.\s*Supp|So\.\s*\d*(?:th|d)?|Cal\.|N\.E\.|N\.W\.|S\.E\.|S\.W\.|A\.\s*\d*(?:th|d)?|P\.\s*\d*(?:th|d)?|La\.)/i;

  if (reporterPattern.test(str)) return true;

  // Louisiana docket format: 2021-01234
  if (/\d{4}-\d{4,6}/.test(str)) return true;

  // Bare numbers are NOT valid citations (opinion IDs)
  if (/^\d+$/.test(str.trim())) {
    console.warn(`[isValidCitationFormat] Rejecting bare number as invalid citation: "${str}"`);
    return false;
  }

  return false;
}

// ============================================================================
// PROTOCOL 20: PLURALITY OPINION DETECTION
// ============================================================================

interface Protocol20Result {
  isPlurality: boolean;
  opinionType: 'majority' | 'plurality' | 'per_curiam' | 'unknown';
  pluralityFlag: 'PLURALITY_FOR_STANDARD' | 'PLURALITY_FACTUAL' | null;
  confidence: number;
  notes: string;
}

/**
 * Check if a citation references a high court (Supreme Court)
 * Plurality opinions are primarily a concern for Supreme Court cases
 */
function isHighCourtCitation(citation: string): boolean {
  const normalized = citation.toLowerCase();
  return (
    normalized.includes('u.s.') ||
    normalized.includes('s. ct.') ||
    normalized.includes('s.ct.') ||
    normalized.includes('l. ed.') ||
    normalized.includes('l.ed.')
  );
}

/**
 * Protocol 20: Check if a Supreme Court citation is a plurality opinion
 *
 * Plurality opinions (where no single rationale commands a majority) have
 * different precedential value. This protocol detects them for attorney review.
 */
async function checkProtocol20Plurality(
  citation: string,
  courtlistenerId: number | null
): Promise<Protocol20Result> {
  // If not a high court citation, skip plurality check
  if (!isHighCourtCitation(citation)) {
    return {
      isPlurality: false,
      opinionType: 'unknown',
      pluralityFlag: null,
      confidence: 1.0,
      notes: 'Not a high court citation - plurality check not applicable',
    };
  }

  // If no CourtListener ID, we cannot verify
  if (!courtlistenerId) {
    return {
      isPlurality: false,
      opinionType: 'unknown',
      pluralityFlag: null,
      confidence: 0.3,
      notes: 'No CourtListener ID available - cannot verify plurality status',
    };
  }

  try {
    // Fetch opinion from CourtListener v3 API
    const response = await fetch(
      `https://www.courtlistener.com/api/rest/v3/opinions/${courtlistenerId}/`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      console.log(`[Protocol 20] CourtListener API returned ${response.status} for opinion ${courtlistenerId}`);
      return {
        isPlurality: false,
        opinionType: 'unknown',
        pluralityFlag: null,
        confidence: 0.5,
        notes: `CourtListener API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const opinionType = data.type || '';

    // Check opinion type codes from CourtListener
    // 020lead = lead opinion (plurality), 025plurality = plurality
    // unanimous and combined = majority
    if (opinionType === '020lead' || opinionType === '025plurality' || opinionType.toLowerCase().includes('plural')) {
      console.log(`[Protocol 20] PLURALITY DETECTED: ${citation} (type: ${opinionType})`);
      return {
        isPlurality: true,
        opinionType: 'plurality',
        pluralityFlag: 'PLURALITY_FOR_STANDARD',
        confidence: 0.9,
        notes: `Plurality opinion detected (CourtListener type: ${opinionType}). Attorney review recommended.`,
      };
    }

    if (opinionType === 'unanimous' || opinionType === 'combined' || opinionType.toLowerCase().includes('majority')) {
      return {
        isPlurality: false,
        opinionType: 'majority',
        pluralityFlag: null,
        confidence: 0.95,
        notes: `Majority opinion confirmed (CourtListener type: ${opinionType})`,
      };
    }

    if (opinionType.toLowerCase().includes('per curiam')) {
      return {
        isPlurality: false,
        opinionType: 'per_curiam',
        pluralityFlag: null,
        confidence: 0.9,
        notes: 'Per curiam opinion',
      };
    }

    // Unknown type - flag for review
    return {
      isPlurality: false,
      opinionType: 'unknown',
      pluralityFlag: null,
      confidence: 0.6,
      notes: `Opinion type unclear (CourtListener type: ${opinionType || 'not specified'})`,
    };
  } catch (error) {
    console.error(`[Protocol 20] Error checking plurality for ${citation}:`, error);
    return {
      isPlurality: false,
      opinionType: 'unknown',
      pluralityFlag: null,
      confidence: 0.3,
      notes: `Error checking plurality: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// PROTOCOL 21: CONCURRENCE/DISSENT DETECTION
// ============================================================================

interface Protocol21Result {
  opinionSection: 'majority' | 'concurrence' | 'dissent' | 'unknown';
  action: 'VERIFIED' | 'FLAG_CONCURRENCE' | 'BLOCK_DISSENT' | 'NEEDS_REVIEW';
  confidence: number;
  authorJustice?: string;
  notes: string;
}

/**
 * Extract pinpoint page from a citation
 * Patterns:
 * - Comma: "123 F.3d 456, 462" → "462"
 * - At: "123 F.3d 456 at 462" → "462"
 */
function extractPinpointPage(citation: string): string | null {
  // Pattern 1: Comma followed by page number
  const commaPattern = /,\s*(\d+)\s*(?:\(|$|\.)/;
  const commaMatch = citation.match(commaPattern);
  if (commaMatch) {
    return commaMatch[1];
  }

  // Pattern 2: "at" followed by page number
  const atPattern = /\bat\s+(\d+)/i;
  const atMatch = citation.match(atPattern);
  if (atMatch) {
    return atMatch[1];
  }

  return null;
}

/**
 * Protocol 21: Check if a pinpoint citation lands in a concurrence or dissent
 *
 * Citing a dissenting opinion as if it were the holding is a fatal error.
 * This protocol detects when a pinpoint citation lands in a concurrence or
 * dissent and either blocks or flags it.
 */
async function checkProtocol21ConcurrenceDissent(
  citation: string,
  courtlistenerId: number | null,
  clusterId?: number | null
): Promise<Protocol21Result> {
  const pinpointPage = extractPinpointPage(citation);

  // If no pinpoint, we can't determine which part of the opinion is cited
  if (!pinpointPage) {
    return {
      opinionSection: 'unknown',
      action: 'NEEDS_REVIEW',
      confidence: 0.5,
      notes: 'No pinpoint page found - cannot determine if citing majority, concurrence, or dissent',
    };
  }

  // Need cluster ID to check sub-opinions
  const clusterIdToUse = clusterId || courtlistenerId;
  if (!clusterIdToUse) {
    return {
      opinionSection: 'unknown',
      action: 'NEEDS_REVIEW',
      confidence: 0.3,
      notes: 'No CourtListener cluster ID - cannot verify opinion section',
    };
  }

  try {
    // Fetch cluster from CourtListener v3 API to get sub-opinions
    const response = await fetch(
      `https://www.courtlistener.com/api/rest/v3/clusters/${clusterIdToUse}/`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      console.log(`[Protocol 21] CourtListener API returned ${response.status} for cluster ${clusterIdToUse}`);
      return {
        opinionSection: 'unknown',
        action: 'NEEDS_REVIEW',
        confidence: 0.4,
        notes: `CourtListener API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const subOpinions = data.sub_opinions || [];

    // Check each sub-opinion for dissents and concurrences
    let hasDissent = false;
    let hasConcurrence = false;
    let dissentAuthor: string | undefined;
    let concurrenceAuthor: string | undefined;

    for (const subOp of subOpinions) {
      const opType = (subOp.type || '').toLowerCase();

      if (opType.includes('dissent')) {
        hasDissent = true;
        dissentAuthor = subOp.author || subOp.author_str;
        console.log(`[Protocol 21] DISSENT DETECTED in cluster ${clusterIdToUse}: author=${dissentAuthor}`);
      }

      if (opType.includes('concur')) {
        hasConcurrence = true;
        concurrenceAuthor = subOp.author || subOp.author_str;
        console.log(`[Protocol 21] CONCURRENCE DETECTED in cluster ${clusterIdToUse}: author=${concurrenceAuthor}`);
      }
    }

    // If dissent exists, block the citation (conservative approach)
    // In a production system, you'd check if the pinpoint page is actually in the dissent
    if (hasDissent) {
      return {
        opinionSection: 'dissent',
        action: 'BLOCK_DISSENT',
        confidence: 0.85,
        authorJustice: dissentAuthor,
        notes: `Case has dissenting opinion. Pinpoint citation at page ${pinpointPage} may reference dissent. BLOCKED for attorney review.`,
      };
    }

    // If concurrence exists, flag but allow
    if (hasConcurrence) {
      return {
        opinionSection: 'concurrence',
        action: 'FLAG_CONCURRENCE',
        confidence: 0.75,
        authorJustice: concurrenceAuthor,
        notes: `Case has concurring opinion. Pinpoint citation at page ${pinpointPage} may reference concurrence. Flagged for attorney review.`,
      };
    }

    // No dissents or concurrences - verified as majority
    return {
      opinionSection: 'majority',
      action: 'VERIFIED',
      confidence: 0.9,
      notes: 'No dissents or concurrences found - citation verified as majority opinion',
    };
  } catch (error) {
    console.error(`[Protocol 21] Error checking concurrence/dissent for ${citation}:`, error);
    return {
      opinionSection: 'unknown',
      action: 'NEEDS_REVIEW',
      confidence: 0.3,
      notes: `Error checking opinion section: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ═════════════════════════════════════════════════════════
// EMERGENCY FIX 2026-02-17: Full CIV pipeline wired.
// Prior: shallow CourtListener existence check (BUG 1).
// Now: 7-step pipeline with holding verification.
// See: CHEN_MEGAPROMPT_CIV_EMERGENCY_FIX.md
// ═════════════════════════════════════════════════════════

// ============================================================================
// PHASE V.1: Citation Accuracy Check — FULL CIV PIPELINE (WIRE-1)
// ============================================================================

async function executePhaseV1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase V.1] ========== STARTING PHASE V.1 (FULL CIV PIPELINE) ==========`);
  // =========================================================================
  // Extract draft motion text from Phase V output
  // =========================================================================
  const phaseVResult = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
  const phaseVOutputNested = (phaseVResult?.output ?? {}) as Record<string, unknown>;
  const draftMotion = (
    phaseVOutputNested?.draftMotion ??
    phaseVResult?.draftMotion ??
    phaseVResult
  ) as Record<string, unknown>;

  console.log(`[Phase V.1] Phase V result keys: ${Object.keys(phaseVResult).join(', ')}`);
  console.log(`[Phase V.1] Draft motion keys: ${Object.keys(draftMotion).join(', ')}`);

  // Convert draft motion to text for citation extraction
  let motionText = '';
  if (draftMotion.caption) motionText += String(draftMotion.caption) + '\n';
  if (draftMotion.title) motionText += String(draftMotion.title) + '\n';
  if (draftMotion.introduction) motionText += String(draftMotion.introduction) + '\n';
  if (draftMotion.statementOfFacts) motionText += String(draftMotion.statementOfFacts) + '\n';
  if (draftMotion.legalArguments) {
    const args = draftMotion.legalArguments as Array<{ heading?: string; content?: string }>;
    for (const arg of args) {
      if (arg.heading) motionText += arg.heading + '\n';
      if (arg.content) motionText += arg.content + '\n';
    }
  }
  if (draftMotion.conclusion) motionText += String(draftMotion.conclusion) + '\n';
  if (draftMotion.prayerForRelief) motionText += String(draftMotion.prayerForRelief) + '\n';

  // Fallback: if specific fields didn't work, stringify the whole object
  if (motionText.length < 100) {
    console.warn(`[Phase V.1] Structured extraction yielded only ${motionText.length} chars, falling back to JSON stringify`);
    motionText = JSON.stringify(draftMotion);
  }

  // Extract raw citations from the motion text
  const rawCitations = extractCitationsFromText(motionText);
  console.log(`[Phase V.1] Extracted ${rawCitations.length} citations from ${motionText.length}-char draft`);

  // =========================================================================
  // WIRE-1: Call full CIV pipeline executor (NO shallow fallback)
  // If executePhaseV1CIV throws, the workflow HALTS — do NOT catch and continue.
  // =========================================================================
  const civResult = await executePhaseV1CIV({
    orderId: input.orderId,
    phase: 'V.1',
    tier: (input.tier || 'A') as 'A' | 'B' | 'C' | 'D',
    draftText: motionText,
    rawCitations,
  });

  // Map PhaseV1Output → PhaseOutput
  // If hard gate FAILS → return failure, workflow does NOT proceed to Phase VI
  if (!civResult.output.passesHardGate) {
    console.error(
      `[Phase V.1] HARD GATE FAILED: passesHardGate=false, ` +
      `holdingMismatches=${civResult.output.holdingMismatches}, ` +
      `verificationRate=${civResult.output.verificationRate}`
    );
    return {
      success: false,
      phase: 'V.1',
      status: 'failed',
      output: {
        ...civResult.output,
        phaseComplete: 'V.1',
      },
      error: `CIV hard gate failed: ${civResult.output.holdingMismatches} holding mismatches, verification rate: ${civResult.output.verificationRate}`,
      durationMs: civResult.durationMs,
    };
  }

  // Hard gate PASSED
  console.log(
    `[Phase V.1] ========== PHASE V.1 COMPLETE (CIV PIPELINE) ==========\n` +
    `[Phase V.1] Verified: ${civResult.output.citationsVerified}/${civResult.output.citationsTotal}, ` +
    `Rate: ${civResult.output.verificationRate}, usedCIVPipeline: true`
  );

  return {
    success: true,
    phase: 'V.1',
    status: 'completed',
    output: {
      ...civResult.output,
      phaseComplete: 'V.1',
    },
    nextPhase: 'VI',
    durationMs: civResult.durationMs,
  };
}

// ============================================================================
// PHASE VI: Opposition Anticipation
// ============================================================================

async function executePhaseVI(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  // =========================================================================
  // TIER A SKIP: Procedural motions rarely face substantive opposition
  // =========================================================================
  if (input.tier === 'A') {
    console.log('[Phase VI] SKIPPED - Tier A procedural motion');
    console.log('[Phase VI] Tier A motions (extensions, continuances, pro hac vice) rarely face substantive opposition');
    return {
      success: true,
      phase: 'VI',
      status: 'skipped' as PhaseStatus,
      output: {
        phaseComplete: 'VI',
        skipped: true,
        skipReason: 'TIER_A_PROCEDURAL',
        oppositionAnalysis: null,
        notes: 'Phase VI skipped for Tier A procedural motion. These motions rarely face substantive opposition.',
      },
      nextPhase: 'VII',
      durationMs: 0,
    };
  }

  // =========================================================================
  // SP-14 TASK-17: Consent/Unopposed Skip — no adversarial analysis needed
  // =========================================================================
  const phaseIOutput = (input.previousPhaseOutputs?.['I'] ?? {}) as Record<string, unknown>;
  const consentStatus = phaseIOutput.consent_status as string | undefined;
  if (consentStatus === 'consent' || consentStatus === 'unopposed') {
    console.log(`[Phase VI] SKIPPED - Motion is ${consentStatus}. Adversarial analysis not applicable.`);
    return {
      success: true,
      phase: 'VI',
      status: 'skipped' as PhaseStatus,
      output: {
        phaseComplete: 'VI',
        skipped: true,
        skipReason: consentStatus === 'consent' ? 'CONSENT_MOTION' : 'UNOPPOSED_MOTION',
        consent_status: consentStatus,
        oppositionAnalysis: null,
        notes: `Phase VI skipped: motion is ${consentStatus}. No adversarial analysis needed.`,
      },
      nextPhase: 'VII',
      durationMs: 0,
    };
  }

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase VI] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction of Phase V output
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    console.log(`[Phase VI] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);

    // Extract draftMotion from Phase V
    const draftMotion = phaseVOutput?.draftMotion ?? phaseVOutput;
    console.log(`[Phase VI] Draft motion exists: ${!!draftMotion}, keys: ${Object.keys(draftMotion as Record<string, unknown>).join(', ') || 'EMPTY'}`);

    const thinkingBudget = getThinkingBudget('VI', input.tier);

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt
    // ========================================================================
    const systemPrompt = buildPhasePrompt('VI', PHASE_PROMPTS.PHASE_VI) +
      (thinkingBudget ? '\n\nUse extended thinking to deeply analyze potential opposition strategies and vulnerabilities.' : '');

    const userMessage = `Anticipate opposition for Phase VI:

DRAFT MOTION (Phase V):
${JSON.stringify(draftMotion, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Analyze potential opposition. Provide as JSON.`;

    const requestParams: Anthropic.MessageCreateParams = {
      model: resolveModelForExecution('VI', input.tier),
      max_tokens: resolveMaxTokensForExecution('VI', input.tier), // Phase VI: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      // CGA6-060 FIX: Standardized extended thinking via buildExtendedThinkingParams
      ...buildExtendedThinkingParams('VI', input.tier),
    } as Anthropic.MessageCreateParams;

    const response = await createMessageWithStreaming(client, requestParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('VI', outputText, input.orderId);

    const parsed = extractJSON(outputText, { phase: 'VI', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase VI] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'VI',
        status: 'failed',
        output: null,
        error: `Phase VI produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput = { ...parsed.data, phaseComplete: 'VI' };

    return {
      success: true,
      phase: 'VI',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'VII',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'VI',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VI failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE VII: Judge Simulation (CP2 - Quality Gate)
// ============================================================================

async function executePhaseVII(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase VII] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const phaseVIOutput = (input.previousPhaseOutputs?.['VI'] ?? {}) as Record<string, unknown>;
    const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? null) as Record<string, unknown> | null;
    const loopNumber = input.revisionLoop || 1;

    // Check if Phase VI was skipped (Tier A procedural motion or consent/unopposed)
    const phaseVISkipped = phaseVIOutput?.skipped === true;
    const phaseVISkipReason = phaseVIOutput?.skipReason as string | undefined;
    // SP-14 TASK-17: Check for consent/unopposed status from Phase I
    const phaseIOutputForVII = (input.previousPhaseOutputs?.['I'] ?? {}) as Record<string, unknown>;
    const consentStatusVII = phaseIOutputForVII.consent_status as string | undefined;
    const isConsentOrUnopposed = consentStatusVII === 'consent' || consentStatusVII === 'unopposed';
    if (phaseVISkipped) {
      console.log(`[Phase VII] Phase VI was skipped (reason: ${phaseVISkipReason || 'unknown'})`);
    }
    if (isConsentOrUnopposed) {
      console.log(`[Phase VII] Motion is ${consentStatusVII} — using simplified evaluation (focus on legal sufficiency)`);
    }

    console.log(`[Phase VII] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VII] Phase VI keys: ${Object.keys(phaseVIOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VII] Phase VI skipped: ${phaseVISkipped}`);
    console.log(`[Phase VII] Phase VIII exists: ${!!phaseVIIIOutput}`);
    console.log(`[Phase VII] Loop number: ${loopNumber}`);

    // CRITICAL: Use revised motion if this is a re-evaluation after Phase VIII
    const motionToEvaluate = phaseVIIIOutput?.revisedMotion || phaseVOutput?.draftMotion || phaseVOutput;
    const isReEvaluation = !!phaseVIIIOutput?.revisedMotion;
    console.log(`[Phase VII] Motion source: ${phaseVIIIOutput?.revisedMotion ? 'Phase VIII (revised)' : phaseVOutput?.draftMotion ? 'Phase V (draftMotion)' : 'Phase V (raw)'}`);
    console.log(`[Phase VII] Is re-evaluation: ${isReEvaluation}`);

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt (CRITICAL - Judge Simulation)
    // ========================================================================
    const thinkingBudget = getThinkingBudget('VII', input.tier); // Always 10K for Phase VII

    // FIX-E FIX 6b: Inject grading lock preamble on loop 2+ to prevent grade inflation.
    // getGradingLockPreamble returns '' on loop 1, so this is safe to always call.
    let gradingLockSection = '';
    if (loopNumber >= 2) {
      const prevVIIOutputForLock = (input.previousPhaseOutputs?.['VII'] ?? {}) as Record<string, unknown>;
      const prevArgAssessmentForLock = (prevVIIOutputForLock.argument_assessment ?? []) as Array<Record<string, unknown>>;
      const previousGrades: LoopGrade[] = [{
        loop: loopNumber - 1,
        overallScore: Number(prevVIIOutputForLock.numeric_score ?? 0),
        sectionScores: Object.fromEntries(
          prevArgAssessmentForLock.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Number(a.sub_grade_numeric ?? 0)])
        ),
        deficiencies: (prevVIIOutputForLock.deficiencies ?? []) as string[],
        authorityFlags: Object.fromEntries(
          prevArgAssessmentForLock.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Boolean(a.authority_appropriate)])
        ),
      }];
      gradingLockSection = getGradingLockPreamble(loopNumber, previousGrades);
    }

    const systemPrompt = buildPhasePrompt('VII', PHASE_PROMPTS.PHASE_VII) + `
${gradingLockSection}
---

### CONTEXT FOR THIS EVALUATION

**Jurisdiction:** ${input.jurisdiction}
**Motion Type:** ${input.motionType}
**Revision Loop:** ${loopNumber} of ${getMaxLoopsForPhaseVII(input.tier)}
**Is Re-evaluation:** ${isReEvaluation ? 'YES - evaluating REVISED motion from Phase VIII' : 'NO - initial evaluation'}
**Phase VI Skipped:** ${phaseVISkipped ? 'YES - Tier A procedural motion (DO NOT penalize for missing opposition analysis)' : 'NO'}

Use extended thinking to thoroughly analyze before grading.
${phaseVISkipped ? '\nIMPORTANT: Phase VI (Opposition Anticipation) was skipped because this is a Tier A procedural motion. DO NOT penalize the grade for missing opposition analysis.' : ''}
${isConsentOrUnopposed ? `\nIMPORTANT: This is a ${consentStatusVII} motion. Use SIMPLIFIED evaluation — focus on legal sufficiency and proper formatting rather than adversarial strength. ${consentStatusVII === 'consent' ? 'Consent motions are almost always granted if properly formatted.' : 'Unopposed motions face a lower adversarial bar.'} DO NOT penalize for missing opposition analysis.` : ''}`;

    // Build opposition analysis section based on whether Phase VI was skipped
    const oppositionSection = phaseVISkipped
      ? 'OPPOSITION ANALYSIS: Skipped (Tier A procedural motion - these motions rarely face substantive opposition)'
      : `OPPOSITION ANALYSIS (Phase VI):\n${JSON.stringify(phaseVIOutput, null, 2)}`;

    const userMessage = `Evaluate this motion as a judge:

${isReEvaluation ? 'REVISED MOTION (Phase VIII):' : 'DRAFT MOTION (Phase V):'}
${JSON.stringify(motionToEvaluate, null, 2)}

${oppositionSection}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Provide your judicial evaluation as JSON.`;

    // PHASE VII: ALWAYS Opus, ALWAYS Extended Thinking (10K tokens)
    // CGA6-060 FIX: Standardized extended thinking via buildExtendedThinkingParams
    const response = await createMessageWithStreaming(client, {
      model: resolveModelForExecution('VII', input.tier), // Always Opus
      max_tokens: resolveMaxTokensForExecution('VII', input.tier), // Phase VII: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...buildExtendedThinkingParams('VII', input.tier),
    } as Anthropic.MessageCreateParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('VII', outputText, input.orderId);

    const parsed = extractJSON<Record<string, unknown>>(outputText, { phase: 'VII', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase VII] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'VII',
        status: 'failed',
        output: null,
        error: `Phase VII produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput: Record<string, unknown> = { ...parsed.data, phaseComplete: 'VII' };

    // SP-14 TASK-24: Validate optional output fields (tentative_ruling, argument_assessment, checkpoint_event)
    // These are optional — log warnings if missing, never fail the workflow.
    if (!phaseOutput.tentative_ruling) {
      console.warn(`[Phase VII] tentative_ruling missing from output for order ${input.orderId} — workflow continues`);
    }
    if (!phaseOutput.argument_assessment || !Array.isArray(phaseOutput.argument_assessment)) {
      console.warn(`[Phase VII] argument_assessment missing or not an array for order ${input.orderId} — Phase VIII falls back to aggregate grade feedback`);
    }
    if (!phaseOutput.checkpoint_event) {
      console.warn(`[Phase VII] checkpoint_event missing from output for order ${input.orderId} — CP2 emission will use default values`);
    }

    // Extract pass/fail
    const evaluation = (phaseOutput.evaluation as Record<string, unknown>) || phaseOutput;

    // BINDING 02/15/26 (ING-015R): Pure numeric scoring on 0-100 percentage scale.
    // LLM booleans (evaluation.passes, passes_threshold) are DIAGNOSTIC ONLY.
    // Thresholds: Tier A >= 83 (B), Tier B/C/D >= 87 (B+).
    const rawGrade = Number(evaluation.numericGrade ?? evaluation.numeric_grade ?? 0);
    const letterGrade = evaluation.grade as string | undefined;

    // Convert GPA (0-4.0) to percentage (0-100). If already > 4.0, assume percentage scale.
    let numericScore: number;
    if (Number.isNaN(rawGrade)) {
      console.error('[Phase VII] Grade numeric value is NaN — treating as 0', {
        orderId: input.orderId,
        tier: input.tier,
        rawValue: evaluation.numericGrade ?? evaluation.numeric_grade,
      });
      numericScore = 0;
    } else if (rawGrade > 4.0) {
      // Already on percentage scale
      numericScore = rawGrade;
    } else {
      numericScore = gpaToPercentage(rawGrade, letterGrade);
    }

    const threshold = input.tier === 'A' ? 83 : 87;
    const passes: boolean = numericScore >= threshold;

    // diagnostic logging — LLM booleans NOT used for control flow
    const llmEvalPasses = evaluation.passes; // diagnostic only — never used for control flow
    console.log(
      `[Phase VII] [diagnostic] llmEvalPasses=${llmEvalPasses}, ` +
      `rawGrade=${rawGrade}, numericScore=${numericScore}, threshold=${threshold}, ` +
      `tier=${input.tier}, passes=${passes}, letterGrade=${letterGrade}`
    );
    if (evaluation.passes === true && !passes) { // diagnostic — backdoor detection, not control flow
      console.warn( // diagnostic log only — evaluation.passes is never used for control flow
        `[Phase VII] BACKDOOR BLOCKED: LLM passes=true but score ${numericScore} < threshold ${threshold}. ` +
        `Numeric check controls.`
      );
    }

    // FIX-E FIX 6: Grade consistency validation on loop 2+
    let adjustedScore = numericScore;
    if (loopNumber >= 2) {
      const prevVIIOutputForConsistency = (input.previousPhaseOutputs?.['VII'] ?? {}) as Record<string, unknown>;
      const prevArgAssessment = (prevVIIOutputForConsistency.argument_assessment ?? []) as Array<Record<string, unknown>>;
      const currentArgAssessment = (phaseOutput.argument_assessment ?? []) as Array<Record<string, unknown>>;

      const previousGrade: LoopGrade = {
        loop: loopNumber - 1,
        overallScore: Number(prevVIIOutputForConsistency.numeric_score ?? 0),
        sectionScores: Object.fromEntries(
          prevArgAssessment.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Number(a.sub_grade_numeric ?? 0)])
        ),
        deficiencies: (prevVIIOutputForConsistency.deficiencies ?? []) as string[],
        authorityFlags: Object.fromEntries(
          prevArgAssessment.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Boolean(a.authority_appropriate)])
        ),
      };
      const currentGrade: LoopGrade = {
        loop: loopNumber,
        overallScore: numericScore,
        sectionScores: Object.fromEntries(
          currentArgAssessment.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Number(a.sub_grade_numeric ?? 0)])
        ),
        deficiencies: (phaseOutput.deficiencies ?? []) as string[],
        authorityFlags: Object.fromEntries(
          currentArgAssessment.map((a: Record<string, unknown>) => [String(a.argument_title ?? ''), Boolean(a.authority_appropriate)])
        ),
      };

      const consistencyResult = validateGradeConsistency(previousGrade, currentGrade);
      if (!consistencyResult.valid && consistencyResult.adjustedScore !== null) {
        console.warn(`[Phase VII] Grade inflation detected — adjusting score from ${numericScore} to ${consistencyResult.adjustedScore}`, {
          hardFails: consistencyResult.hardFails,
          warnings: consistencyResult.warnings,
        });
        adjustedScore = consistencyResult.adjustedScore;
      }
      if (consistencyResult.warnings.length > 0) {
        console.warn(`[Phase VII] Grade consistency warnings:`, consistencyResult.warnings);
      }
    }

    // FIX-E FIX 7: Apply hard-coded rules (zero-citation fail, etc.)
    const argAssessmentForRules = (phaseOutput.argument_assessment ?? []) as Array<Record<string, unknown>>;
    const hardRuleInput: PhaseVIIOutput = {
      overallGrade: letterGrade || '',
      overallScore: adjustedScore,
      sections: argAssessmentForRules.map((a: Record<string, unknown>): PhaseVIISectionGrade => ({
        sectionName: String(a.argument_title ?? ''),
        grade: String(a.sub_grade ?? ''),
        numericScore: Number(a.sub_grade_numeric ?? 0),
        authorityAppropriate: Boolean(a.authority_appropriate),
        citationCount: Number(a.citation_count ?? 0),
        deficiencies: (a.notes ? [String(a.notes)] : []),
      })),
      deficiencies: (phaseOutput.deficiencies ?? []) as string[],
      passesThreshold: adjustedScore >= threshold,
      loopComparison: phaseOutput.loop_comparison as PhaseVIIOutput['loopComparison'],
    };

    const hardRuleResult = applyPhaseVIIHardRules(
      hardRuleInput,
      input.tier as 'A' | 'B' | 'C' | 'D',
      loopNumber
    );

    if (hardRuleResult.overriddenToFail) {
      console.warn(`[Phase VII] Hard rules triggered — motion FAILS regardless of score`, {
        violations: hardRuleResult.ruleViolations,
        originalScore: hardRuleResult.originalScore,
        adjustedScore: hardRuleResult.adjustedScore,
      });
      adjustedScore = hardRuleResult.adjustedScore ?? adjustedScore;
    }
    if (hardRuleResult.warnings.length > 0) {
      console.warn(`[Phase VII] Hard rule warnings:`, hardRuleResult.warnings);
    }

    const finalPasses = hardRuleResult.overriddenToFail ? false : (adjustedScore >= threshold);

    return {
      success: true,
      phase: 'VII',
      status: 'completed',
      output: {
        ...phaseOutput,
        numeric_score: adjustedScore,           // 0-100 percentage scale (BINDING), possibly adjusted
        grade: letterGrade,
        numericGrade: rawGrade,                // Original GPA for reference
        loopNumber,
        hardRuleResult: hardRuleResult.overriddenToFail ? hardRuleResult : undefined,
      },
      nextPhase: finalPasses ? 'VIII.5' : 'VIII',
      requiresReview: true, // CP2: Notify admin of grade
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'VII',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VII failed',
      durationMs: Date.now() - start,
    };
  }
}

// ═════════════════════════════════════════════════════════
// EMERGENCY FIX 2026-02-17: Full CIV pipeline wired for VII.1.
// Prior: shallow fallback to Claude check (BUG 1 variant).
// Now: 7-step pipeline with holding verification.
// See: CHEN_MEGAPROMPT_CIV_EMERGENCY_FIX.md
// ═════════════════════════════════════════════════════════

// ============================================================================
// PHASE VII.1: Post-Revision Citation Check — FULL CIV PIPELINE (WIRE-1)
// ============================================================================

async function executePhaseVII1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase VII.1] ========== STARTING PHASE VII.1 (FULL CIV PIPELINE) ==========`);
  console.log(`[Phase VII.1] ZERO TOLERANCE — no fallback to Claude check`);

  // =========================================================================
  // Extract revised motion text from Phase VIII output
  // =========================================================================
  const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? {}) as Record<string, unknown>;
  const revisedMotion = phaseVIIIOutput?.revisedMotion as Record<string, unknown> | undefined;

  let revisedText: string;
  if (revisedMotion) {
    const textParts: string[] = [];
    for (const value of Object.values(revisedMotion)) {
      if (typeof value === 'string') {
        textParts.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            for (const subValue of Object.values(item)) {
              if (typeof subValue === 'string') {
                textParts.push(subValue);
              }
            }
          }
        }
      }
    }
    revisedText = textParts.join('\n');
  } else {
    revisedText = JSON.stringify(phaseVIIIOutput);
  }

  // Extract raw citations from the revised text
  const rawCitations = extractCitationsFromText(revisedText);
  console.log(`[Phase VII.1] Extracted ${rawCitations.length} citations from ${revisedText.length}-char revised draft`);

  // =========================================================================
  // WIRE-1: Call full CIV pipeline executor (NO shallow fallback)
  // If executePhaseV1CIV throws, the workflow HALTS — do NOT catch and continue.
  // =========================================================================
  const civResult = await executePhaseV1CIV({
    orderId: input.orderId,
    phase: 'VII.1',
    tier: (input.tier || 'A') as 'A' | 'B' | 'C' | 'D',
    draftText: revisedText,
    rawCitations,
  });

  // Map PhaseV1Output → PhaseOutput
  // If hard gate FAILS → return failure, workflow does NOT proceed
  if (!civResult.output.passesHardGate) {
    console.error(
      `[Phase VII.1] HARD GATE FAILED: passesHardGate=false, ` +
      `holdingMismatches=${civResult.output.holdingMismatches}, ` +
      `verificationRate=${civResult.output.verificationRate}`
    );
    return {
      success: false,
      phase: 'VII.1',
      status: 'failed',
      output: {
        ...civResult.output,
        phaseComplete: 'VII.1',
      },
      error: `CIV hard gate failed at VII.1: ${civResult.output.holdingMismatches} holding mismatches, verification rate: ${civResult.output.verificationRate}`,
      durationMs: civResult.durationMs,
    };
  }

  // Hard gate PASSED
  console.log(
    `[Phase VII.1] ========== PHASE VII.1 COMPLETE (CIV PIPELINE) ==========\n` +
    `[Phase VII.1] Verified: ${civResult.output.citationsVerified}/${civResult.output.citationsTotal}, ` +
    `Rate: ${civResult.output.verificationRate}, usedCIVPipeline: true`
  );

  return {
    success: true,
    phase: 'VII.1',
    status: 'completed',
    output: {
      ...civResult.output,
      phaseComplete: 'VII.1',
    },
    nextPhase: 'VII', // Return to judge for regrade
    durationMs: civResult.durationMs,
  };
}

// ============================================================================
// DRAFT TEXT EXTRACTION HELPER
// ============================================================================

/**
 * Reliably extract draft text from various phase output shapes.
 * Handles string outputs, objects with revisedMotion/draftMotion/draft/content/text fields.
 * Returns empty string if no text field found (caller should provide fallback).
 */
function extractDraftText(phaseOutput: unknown): string {
  if (typeof phaseOutput === 'string') return phaseOutput;
  if (typeof phaseOutput === 'object' && phaseOutput !== null) {
    const obj = phaseOutput as Record<string, unknown>;
    if (typeof obj.revisedMotion === 'string') return obj.revisedMotion;
    if (typeof obj.draftMotion === 'string') return obj.draftMotion;
    if (typeof obj.draft === 'string') return obj.draft;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.text === 'string') return obj.text;
  }
  return '';
}

// ============================================================================
// SP-07 TASK-05: FACT FABRICATION DETECTION
// ============================================================================

/**
 * Result of post-revision fact audit.
 * Compares named entities in revised draft against order context sources.
 */
interface FactAuditResult {
  totalEntities: number;
  knownEntities: number;
  suspiciousEntities: string[];
  hasFabrication: boolean;
  fabricationSeverity: 'NONE' | 'LOW' | 'HIGH';
}

/**
 * Check if a string is a known legal term (not a fabricated entity).
 * These are standard institutional/legal names that should not trigger false positives.
 */
function isLegalTerm(entity: string): boolean {
  const legalTerms = [
    // Courts
    'Supreme Court', 'Court of Appeal', 'Court of Appeals', 'District Court',
    'Circuit Court', 'Appellate Court', 'Family Court', 'Juvenile Court',
    'Municipal Court', 'City Court', 'Justice of the Peace', 'Bankruptcy Court',
    'Tax Court', 'Claims Court', 'Magistrate Judge',
    // Federal districts
    'Eastern District', 'Western District', 'Middle District', 'Northern District',
    'Southern District', 'First Circuit', 'Second Circuit', 'Third Circuit',
    'Fourth Circuit', 'Fifth Circuit', 'Sixth Circuit', 'Seventh Circuit',
    'Eighth Circuit', 'Ninth Circuit', 'Tenth Circuit', 'Eleventh Circuit',
    'Federal Circuit', 'District of Columbia',
    // Government and institutions
    'United States', 'State of Louisiana', 'Parish of', 'State of',
    'Department of', 'Office of', 'Bureau of', 'Agency of',
    'Internal Revenue Service', 'Social Security', 'Workers Compensation',
    'Department of Justice', 'Department of Children', 'Department of Health',
    // Louisiana-specific
    'Supreme Court of Louisiana', 'Supreme Court of the United States',
    'Louisiana Constitution', 'Louisiana Revised Statutes', 'Civil Code',
    'Louisiana Civil Code', 'Louisiana Code of Evidence',
    'Code of Civil Procedure', 'Code of Criminal Procedure',
    'Code of Evidence', 'Children\'s Code', 'Uniform Commercial Code',
    // Legal concepts and rules
    'Federal Rules', 'Civil Procedure', 'Criminal Procedure',
    'Rules of Court', 'Rules of Evidence', 'United States Constitution',
    'Summary Judgment', 'Due Process', 'Equal Protection',
    'Res Judicata', 'Stare Decisis', 'Burden of Proof',
    'Trade Secrets Act', 'Unfair Trade Practices',
    // Amendments
    'First Amendment', 'Second Amendment', 'Third Amendment',
    'Fourth Amendment', 'Fifth Amendment', 'Sixth Amendment',
    'Seventh Amendment', 'Eighth Amendment', 'Ninth Amendment',
    'Tenth Amendment', 'Eleventh Amendment', 'Twelfth Amendment',
    'Thirteenth Amendment', 'Fourteenth Amendment',
  ];
  return legalTerms.some(term => entity.includes(term));
}

/**
 * Post-revision fact audit.
 * Extracts named entities from the revised draft and checks whether each
 * can be traced to one of the allowed fact sources in the order context.
 * Entities not traceable to orderContext = potential fabrication.
 */
function auditFactsAgainstSources(
  revisedDraftText: string,
  input: PhaseInput
): FactAuditResult {
  // Build source text from allowed fact sources
  const sources = [
    input.statementOfFacts || '',
    input.proceduralHistory || '',
    input.instructions || '',
    // Include party names, attorney info, case data
    ...(input.parties || []).map(p => p.name),
    input.attorneyName || '',
    input.firmName || '',
    input.caseCaption || '',
    input.caseNumber || '',
    input.jurisdiction || '',
    input.motionType || '',
  ];

  // Task 9: Include string values from Phase IV-VII outputs as valid sources
  for (const phaseKey of ['IV', 'V', 'VI', 'VII'] as const) {
    const phaseData = input.previousPhaseOutputs?.[phaseKey];
    if (phaseData && typeof phaseData === 'object') {
      const extractStrings = (obj: unknown, depth: number): string[] => {
        if (depth > 3) return [];
        if (typeof obj === 'string') return [obj];
        if (Array.isArray(obj)) return obj.flatMap(item => extractStrings(item, depth + 1));
        if (obj && typeof obj === 'object') {
          return Object.values(obj).flatMap(val => extractStrings(val, depth + 1));
        }
        return [];
      };
      sources.push(...extractStrings(phaseData, 0));
    }
  }

  const sourceText = sources.join(' ');
  const sourceTextLower = sourceText.toLowerCase();

  // Task 8: Cross-reference citation bank from Phase IV
  const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
  const citationBankEntries = (phaseIVOutput?.caseCitationBank ?? []) as Array<{ caseName?: string; citation?: string }>;
  const citationBankText = citationBankEntries
    .map(c => `${c.caseName || ''} ${c.citation || ''}`)
    .join(' ')
    .toLowerCase();

  // Task 5: Strip legal role prefixes before entity extraction
  const legalRolePrefixes = [
    'Defendant', 'Plaintiff', 'Petitioner', 'Respondent',
    'Appellant', 'Appellee', 'Intervenor', 'Movant', 'Exceptor',
    'Cross-Defendant', 'Cross-Plaintiff', 'Third-Party',
    'Counter-Defendant', 'Counter-Plaintiff',
  ];
  let cleanedText = revisedDraftText;
  for (const prefix of legalRolePrefixes) {
    cleanedText = cleanedText.replace(
      new RegExp('\\b' + prefix + '\\s+', 'g'), ''
    );
  }

  // Extract named entities from cleaned draft
  // Look for: titled names, organizational names, full dates
  const entityPatterns = [
    /(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Hon\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g,
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}(?:\s+(?:LLC|Inc|Corp|Ltd|Hospital|Medical|Center|University|College|Foundation))/g,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/g,
  ];

  const draftEntities: string[] = [];
  for (const pattern of entityPatterns) {
    const matches = cleanedText.match(pattern) || [];
    draftEntities.push(...matches);
  }

  // Deduplicate
  const uniqueEntities = [...new Set(draftEntities)];

  // Filter out known entities, legal terms, bracketed prompts
  const suspiciousEntities = uniqueEntities.filter(entity => {
    if (entity.startsWith('[ATTORNEY:')) return false;
    // Task 6: Case-insensitive source comparison
    if (sourceTextLower.includes(entity.toLowerCase())) return false;
    if (isLegalTerm(entity)) return false;
    if (entity.length < 5) return false;
    // Task 8: Cross-reference citation bank
    if (citationBankText.includes(entity.toLowerCase())) return false;
    return true;
  });

  // Task 7: Severity-based fabrication assessment
  const fabricationRatio = suspiciousEntities.length / Math.max(uniqueEntities.length, 1);
  const severity: 'NONE' | 'LOW' | 'HIGH' =
    fabricationRatio > 0.25 || suspiciousEntities.length > 3
      ? 'HIGH'
      : suspiciousEntities.length > 0
        ? 'LOW'
        : 'NONE';

  return {
    totalEntities: uniqueEntities.length,
    knownEntities: uniqueEntities.length - suspiciousEntities.length,
    suspiciousEntities,
    hasFabrication: severity === 'HIGH',
    fabricationSeverity: severity,
  };
}

// ============================================================================
// PHASE VIII: Revisions
// ============================================================================

/**
 * Strip specific citations from a structured revisedMotion object.
 * Handles both top-level string fields (introduction, conclusion, etc.)
 * and nested array fields (legalArguments: [{ heading, content }]).
 */
function stripCitationsFromMotion(
  revisedMotion: unknown,
  citationsToStrip: string[]
): void {
  if (!revisedMotion || typeof revisedMotion !== 'object' || citationsToStrip.length === 0) return;

  const motion = revisedMotion as Record<string, unknown>;

  for (const key of Object.keys(motion)) {
    const value = motion[key];

    // Top-level string fields (introduction, conclusion, statementOfFacts, etc.)
    if (typeof value === 'string' && value.length > 100) {
      motion[key] = stripUnauthorizedCitations(value, citationsToStrip);
    }

    // Array fields (legalArguments)
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          for (const subKey of Object.keys(item)) {
            if (typeof item[subKey] === 'string' && item[subKey].length > 100) {
              item[subKey] = stripUnauthorizedCitations(item[subKey], citationsToStrip);
            }
          }
        }
      }
    }
  }
}

async function executePhaseVIII(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase VIII] ========== STARTING PHASE VIII (REVISIONS) ==========`);

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase VIII] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const phaseVIIOutput = (input.previousPhaseOutputs?.['VII'] ?? {}) as Record<string, unknown>;
    const thinkingBudget = getThinkingBudget('VIII', input.tier);

    // BUG-02 FIX: Use latest Phase VIII revision if available (loop 2+ gets the revised draft).
    // CRITICAL: On loop 2+, NEVER revert to Phase V. If previousRevision exists but has no
    // revisedMotion, use the full Phase VIII output (not Phase V original).
    const previousRevision = (input.previousPhaseOutputs?.['VIII'] ?? null) as Record<string, unknown> | null;
    const isSubsequentLoop = previousRevision !== null;
    const currentDraft = isSubsequentLoop
      ? previousRevision  // Loop 2+: always use previous Phase VIII output
      : phaseVOutput;     // First loop: use Phase V original

    if (isSubsequentLoop && !previousRevision?.revisedMotion) {
      console.warn('[Phase VIII] Previous revision exists but has no revisedMotion field — using full Phase VIII output as draft');
    }

    console.log(`[Phase VIII] Draft source: ${isSubsequentLoop ? 'Phase VIII (previous revision)' : 'Phase V (original)'}`);
    console.log(`[Phase VIII] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VIII] Phase VII keys: ${Object.keys(phaseVIIOutput).join(', ') || 'EMPTY'}`);

    // =========================================================================
    // CAPTION LOCK: Extract original caption from Phase V (never mutated).
    // Court captions have specific formatting (line breaks, ALL CAPS, spacing)
    // that degrades through JSON serialization across revision loops.
    // We extract once and inject verbatim into every revision.
    // =========================================================================
    const phaseVDraftMotion = (phaseVOutput?.draftMotion ?? phaseVOutput) as Record<string, unknown>;
    const originalCaption = (phaseVDraftMotion?.caption ?? input.caseCaption ?? '') as string;
    if (originalCaption) {
      console.log(`[Phase VIII] Caption locked from Phase V (${originalCaption.length} chars)`);
    } else {
      console.warn('[Phase VIII] No caption found in Phase V output — will use input.caseCaption');
    }

    // Safe extraction of evaluation with multiple fallback paths
    const evaluation = (phaseVIIOutput?.evaluation ?? phaseVIIOutput?.judgeSimulation ?? phaseVIIOutput ?? {}) as Record<string, unknown>;

    // Safe property access with defaults — uses Phase VII's actual field names
    const weaknesses = (evaluation?.deficiencies ?? evaluation?.weaknesses ?? evaluation?.concerns ?? []) as unknown[];
    const specificFeedback = (evaluation?.argument_assessment
      ? JSON.stringify(evaluation.argument_assessment)
      : (evaluation?.specificFeedback ?? evaluation?.feedback ?? evaluation?.notes ?? 'No specific feedback provided')) as string;
    const revisionSuggestions = (evaluation?.revision_instructions ?? evaluation?.revisionSuggestions ?? evaluation?.recommendations ?? evaluation?.suggestions ?? []) as unknown[];

    console.log(`[Phase VIII] Weaknesses found: ${weaknesses.length}`);
    console.log(`[Phase VIII] Revision suggestions found: ${revisionSuggestions.length}`);

    // =========================================================================
    // CITATION ENFORCEMENT — GET CITATION BANK FROM PHASE IV
    // =========================================================================
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    const caseCitationBankVIII = (phaseIVOutput?.caseCitationBank || []) as VerifiedCitationEntry[];
    const statutoryCitationBankVIII = (phaseIVOutput?.statutoryCitationBank || []) as StatutoryCitationEntry[];

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  PHASE VIII: REVISIONS — CITATION ENFORCEMENT ACTIVE         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`[Phase VIII] Citation bank available: ${caseCitationBankVIII.length} cases`);
    console.log(`[Phase VIII] Statutory bank available: ${statutoryCitationBankVIII.length} statutes`);

    // Build citation enforcement block for revisions
    const citationEnforcementVIII = buildCitationEnforcementPrompt(caseCitationBankVIII, statutoryCitationBankVIII);

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt + case data injection
    // ========================================================================
    // BUG #3 FIX: Sanitize blank signature fields before prompt construction.
    // Empty fields like '', ', LA' cause Claude to output '[blank]' instead of JSON.
    const sig = sanitizeSignatureFields(input);

    // Build attorney signature block for revisions
    const getRepresentedPartyName = () => {
      const represented = input.parties?.find(p => p.isRepresented);
      return represented?.name || input.parties?.[0]?.name || 'Movant';
    };

    const signatureBlock = `
_________________________
${sig.attorneyName}
Bar Roll No. ${sig.barNumber}
${sig.firmName}
${sig.firmAddress}
${sig.firmPhone}
${sig.firmEmail}
Attorney for ${getRepresentedPartyName()}`.trim();

    const revisionCitationAddendum = `
REVISION-SPECIFIC CITATION GUIDANCE — BINDING CONSTRAINT:
You may ONLY use citations that appear in the verified citation bank provided above,
OR citations that the judge evaluation EXPLICITLY names by case name and reporter.

CARDINAL SIN PROHIBITION:
Fabricating, hallucinating, or inventing a citation is the WORST thing you can do.
An attorney filing a brief with a fabricated citation faces sanctions, bar complaints,
and potential malpractice liability. NEVER introduce a citation you are not certain exists.

When the judge explicitly names a case authority NOT in the bank:
1. Include it exactly as the judge specified (Case Name, Volume Reporter Page (Court Year)).
2. It will be verified against CourtListener after generation.
3. If verification fails, it will be removed automatically.

When the judge recommends adding authority but does NOT name a specific case:
1. Search the citation bank for a case supporting the proposition.
2. If a suitable bank citation exists, use it.
3. If NO bank citation fits, write the argument WITHOUT a citation.
4. Do NOT guess or recall citations from training data.

PLACEHOLDER PROHIBITION:
Do NOT insert [CITATION NEEDED], [TODO], [INSERT X], or any placeholder text.
A clean argument without a citation is ALWAYS better than a placeholder.
Placeholders waste revision cycles and provide no value.
`;

    const systemPrompt = buildPhasePrompt('VIII', `${citationEnforcementVIII}

${revisionCitationAddendum}

${PHASE_PROMPTS.PHASE_VIII}`) + `

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: ATTORNEY INFO (MUST BE IN REVISED SIGNATURE BLOCK)
═══════════════════════════════════════════════════════════════════════════════
${signatureBlock}

DO NOT use placeholders like [ATTORNEY NAME] or [BAR NUMBER].
USE THE EXACT ATTORNEY INFO ABOVE in the revised signature block.
═══════════════════════════════════════════════════════════════════════════════
################################################################################
#  CRITICAL: CASE DATA - USE THESE EXACT VALUES IN REVISIONS                   #
################################################################################

CASE INFORMATION (USE THESE EXACT DETAILS - NO PLACEHOLDERS):
- Case Caption: ${input.caseCaption}
- Case Number: ${input.caseNumber}
- Jurisdiction: ${input.jurisdiction}
- Motion Type: ${input.motionType}

═══════════════════════════════════════════════════════════════════════════════
CAPTION LOCK — DO NOT MODIFY (verbatim from Phase I/V):
"""
${originalCaption || input.caseCaption}
"""
The caption above is LOCKED. Copy it EXACTLY as shown into the "caption" field
of your JSON output. Do not reformat, re-capitalize, reorder parties, or modify
it in any way. Caption formatting is jurisdiction-specific and must not degrade
across revision loops.
═══════════════════════════════════════════════════════════════════════════════

STATEMENT OF FACTS FROM CLIENT:
${input.statementOfFacts || '[Client statement of facts not provided]'}

################################################################################

JUDGE FEEDBACK TO ADDRESS:
- Weaknesses: ${JSON.stringify(weaknesses)}
- Specific Feedback: ${specificFeedback}
- Revision Suggestions: ${JSON.stringify(revisionSuggestions)}

${thinkingBudget ? 'Use extended thinking to carefully address each issue.' : ''}

CRITICAL PLACEHOLDER PROHIBITION:
- Do NOT use [PARISH NAME], [JUDICIAL DISTRICT], or any bracketed placeholders
- Do NOT use generic names like "John Doe", "Jane Smith"
- Use ONLY the actual case data provided above
- The revised motion must be ready to file with ZERO placeholder modifications
${isSubsequentLoop ? `
IMPORTANT: You are revising a PREVIOUSLY REVISED draft, not the original. Build upon the improvements already made. Do NOT revert to simpler language or remove details added in prior revisions.
` : ''}
OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VIII",
  "revisedMotion": {
    "caption": "full court caption with REAL case data",
    "title": "...",
    "introduction": "revised...",
    "statementOfFacts": "revised using CLIENT-PROVIDED facts...",
    "legalArguments": [...],
    "conclusion": "revised...",
    "prayerForRelief": "...",
    "signature": "EXACT signature block with real attorney info - NO PLACEHOLDERS",
    "certificateOfService": "full COS with real attorney signature"
  },
  "changesMade": [
    { "section": "string", "change": "description of revision" }
  ],
  "newCitationsAdded": true|false,
  "newCitations": ["any new citations added"]
}`;

    const userMessage = `Revise the motion based on judge feedback:

═══════════════════════════════════════════════════════════════
FILING ATTORNEY (USE IN REVISED SIGNATURE BLOCK)
═══════════════════════════════════════════════════════════════
${sig.attorneyName}
Bar Roll No. ${sig.barNumber}
${sig.firmName}
${sig.firmAddress}
${sig.firmPhone}
${sig.firmEmail}
Attorney for ${getRepresentedPartyName()}

═══════════════════════════════════════════════════════════════
${isSubsequentLoop ? 'CURRENT DRAFT (from previous revision loop — improve THIS version):' : 'ORIGINAL DRAFT (Phase V):'}
${JSON.stringify(isSubsequentLoop ? (currentDraft.revisedMotion ?? currentDraft) : phaseVOutput, null, 2)}

JUDGE EVALUATION (Phase VII):
${JSON.stringify(phaseVIIOutput, null, 2)}

Address all weaknesses and revision suggestions. KEEP THE EXACT ATTORNEY INFO in the signature block. Provide as JSON.`;

    // CGA6-060 FIX: Standardized extended thinking via buildExtendedThinkingParams
    const requestParams: Anthropic.MessageCreateParams = {
      model: resolveModelForExecution('VIII', input.tier),
      max_tokens: resolveMaxTokensForExecution('VIII', input.tier), // Phase VIII: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...buildExtendedThinkingParams('VIII', input.tier),
    } as Anthropic.MessageCreateParams;

    const response = await createMessageWithStreaming(client, requestParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('VIII', outputText, input.orderId);

    // SP-07 TASK-06: Truncation detection — if response was cut off, retry with 1.5x budget
    let outputTextFinal = outputText;
    if (response.stop_reason === 'max_tokens') {
      console.warn('[Phase VIII] Response truncated at max_tokens — retrying with 1.5x budget');
      const retryParams = {
        ...requestParams,
        max_tokens: Math.ceil((requestParams.max_tokens as number) * 1.5),
      } as Anthropic.MessageCreateParams;
      const retryResponse = await createMessageWithStreaming(client, retryParams) as Anthropic.Message;
      if (retryResponse.stop_reason === 'max_tokens') {
        console.error('[Phase VIII] Response truncated TWICE — output too large for token budget');
        return {
          success: false,
          phase: 'VIII',
          status: 'failed',
          output: null,
          error: 'Phase VIII response truncated twice — output too large for token budget. Non-retriable.',
          durationMs: Date.now() - start,
        };
      }
      const retryTextContent = retryResponse.content.find(c => c.type === 'text');
      outputTextFinal = retryTextContent?.type === 'text' ? retryTextContent.text : '';
    }

    // SP-07 TASK-06: Robust JSON extraction with non-retriable error on parse failure
    const parsed = extractJSON<Record<string, unknown>>(outputTextFinal, { phase: 'VIII', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase VIII] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      // JSON parse failures on identical input should NOT be retried by Inngest
      return {
        success: false,
        phase: 'VIII',
        status: 'failed',
        output: null,
        error: `Phase VIII produced malformed output (non-retriable): ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput: Record<string, unknown> = { ...parsed.data, phaseComplete: 'VIII' };

    // =========================================================================
    // CAPTION ENFORCEMENT: Restore original caption if Phase VIII mutated it.
    // The LLM sometimes reformats captions (changes case, drops line breaks,
    // reorders parties). Always restore the locked Phase V/I caption.
    // =========================================================================
    if (originalCaption && phaseOutput.revisedMotion && typeof phaseOutput.revisedMotion === 'object') {
      const revisedMotionObj = phaseOutput.revisedMotion as Record<string, unknown>;
      const revisedCaption = (revisedMotionObj.caption ?? '') as string;
      if (revisedCaption !== originalCaption) {
        console.warn(`[Phase VIII] Caption drift detected — restoring original caption`);
        console.log(`[Phase VIII]   Original: ${originalCaption.substring(0, 80)}...`);
        console.log(`[Phase VIII]   Revised:  ${revisedCaption.substring(0, 80)}...`);
        revisedMotionObj.caption = originalCaption;
      }
    }

    // =========================================================================
    // SP-07 TASK-05: POST-REVISION FACT FABRICATION AUDIT
    // Compare named entities in revision against orderContext sources.
    // Fabrication → revert to currentDraft (NOT Phase V original)
    // =========================================================================
    const revisedMotionForAudit = phaseOutput.revisedMotion
      ? JSON.stringify(phaseOutput.revisedMotion)
      : outputTextFinal;

    const factAudit = auditFactsAgainstSources(revisedMotionForAudit, input);

    if (factAudit.fabricationSeverity === 'HIGH') {
      console.error(`[Phase VIII] HIGH FABRICATION DETECTED: ${factAudit.suspiciousEntities.join(', ')}`);
      console.warn(`[Phase VIII] Reverting to pre-revision draft (currentDraft). Fabricated entities will be logged.`);

      // Revert to currentDraft (NOT Phase V — preserves prior loop's good revisions)
      phaseOutput.revisedMotion = isSubsequentLoop
        ? (currentDraft.revisedMotion ?? currentDraft)
        : phaseVOutput;
      phaseOutput.fabricationDetected = true;
      phaseOutput.fabricatedEntities = factAudit.suspiciousEntities;
      phaseOutput.factAudit = factAudit;
    } else if (factAudit.fabricationSeverity === 'LOW') {
      // LOW severity: log warnings but do NOT revert — preserves valid revisions
      console.warn(`[Phase VIII] LOW fabrication severity: ${factAudit.suspiciousEntities.join(', ')}`);
      console.warn(`[Phase VIII] Keeping revised draft — entities flagged for admin review`);
      phaseOutput.fabricationDetected = false;
      phaseOutput.fabricationWarnings = factAudit.suspiciousEntities;
      phaseOutput.factAudit = factAudit;
    } else {
      phaseOutput.fabricationDetected = false;
      phaseOutput.factAudit = factAudit;
      console.log(`[Phase VIII] Fact audit passed: ${factAudit.knownEntities}/${factAudit.totalEntities} entities verified`);
    }

    // SP-07 TASK-05: Check for 3+ bracketed attorney prompts → recommend HOLD
    const revisedDraftStr = phaseOutput.revisedMotion ? JSON.stringify(phaseOutput.revisedMotion) : '';
    const bracketedPrompts = revisedDraftStr.match(/\[ATTORNEY:.*?\]/g) || [];
    if (bracketedPrompts.length >= 3) {
      console.warn(`[Phase VIII] ${bracketedPrompts.length} bracketed prompts detected — recommending HOLD for missing specifics`);
      phaseOutput.holdRecommended = true;
      phaseOutput.holdReason = 'MISSING_SPECIFICS';
      phaseOutput.bracketedPrompts = bracketedPrompts;
    }

    // =========================================================================
    // POST-GENERATION PLACEHOLDER STRIPPING — Remove [CITATION NEEDED] etc.
    // Placeholders waste revision cycles. Strip them and log for audit.
    // =========================================================================
    if (phaseOutput.revisedMotion && typeof phaseOutput.revisedMotion === 'object') {
      const placeholderPattern = /\[CITATION (?:NEEDED|REQUIRED|MISSING|GAP)[^\]]*\]/gi;
      let placeholdersStripped = 0;
      const strippedPlaceholders: string[] = [];

      const stripPlaceholdersFromValue = (val: string): string => {
        const matches = val.match(placeholderPattern);
        if (matches) {
          placeholdersStripped += matches.length;
          strippedPlaceholders.push(...matches);
        }
        return val.replace(placeholderPattern, '').replace(/\s{2,}/g, ' ').trim();
      };

      const motionObj = phaseOutput.revisedMotion as Record<string, unknown>;
      for (const key of Object.keys(motionObj)) {
        const value = motionObj[key];
        if (typeof value === 'string') {
          motionObj[key] = stripPlaceholdersFromValue(value);
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object') {
              for (const subKey of Object.keys(item)) {
                if (typeof item[subKey] === 'string') {
                  item[subKey] = stripPlaceholdersFromValue(item[subKey]);
                }
              }
            }
          }
        }
      }

      if (placeholdersStripped > 0) {
        console.warn(`[Phase VIII] Stripped ${placeholdersStripped} citation placeholder(s): ${strippedPlaceholders.join(', ')}`);
        phaseOutput.placeholdersStripped = placeholdersStripped;
        phaseOutput.strippedPlaceholderList = strippedPlaceholders;
      }
    }

    // =========================================================================
    // POST-GENERATION CITATION VALIDATION — ENFORCE BANK-ONLY CITATIONS
    // =========================================================================
    console.log('[Phase VIII] Running post-generation citation validation...');

    // Get the revised motion text for validation
    const revisedMotionText = phaseOutput.revisedMotion
      ? JSON.stringify(phaseOutput.revisedMotion)
      : outputText;

    const validationResultVIII = validateDraftCitations(
      revisedMotionText,
      caseCitationBankVIII,
      statutoryCitationBankVIII
    );

    // Build validation metadata object
    const citationValidationDataVIII: Record<string, unknown> = {
      authorized: validationResultVIII.authorizedCitations.length,
      unauthorized: validationResultVIII.unauthorizedCitations.length,
      isValid: validationResultVIII.isValid,
      warnings: validationResultVIII.warnings,
    };

    if (!validationResultVIII.isValid) {
      console.log('[Phase VIII] UNAUTHORIZED CITATIONS DETECTED IN REVISION');
      console.log('[Phase VIII] Unauthorized citations:', validationResultVIII.unauthorizedCitations);

      // Attempt fast-track verification before stripping
      const verifiedCitations: string[] = [];
      const rejectedCitations: string[] = [];
      const newBankEntries: VerifiedCitationEntry[] = [];

      // Rate limit: max 5 verifications per loop (each makes 1-3 CourtListener + 1-2 LLM calls)
      const MAX_FAST_TRACK_VERIFICATIONS = 5;
      const toVerify = validationResultVIII.unauthorizedCitations.slice(0, MAX_FAST_TRACK_VERIFICATIONS);
      const autoRejected = validationResultVIII.unauthorizedCitations.slice(MAX_FAST_TRACK_VERIFICATIONS);
      rejectedCitations.push(...autoRejected);
      if (autoRejected.length > 0) {
        console.warn(`[Phase VIII] Rate-limited: ${autoRejected.length} citation(s) skipped (max ${MAX_FAST_TRACK_VERIFICATIONS} per loop)`);
      }

      for (const unauthorizedCitation of toVerify) {
        try {
          console.log(`[Phase VIII] Fast-track verifying: ${unauthorizedCitation.substring(0, 80)}`);
          const { approved, result } = await verifyUnauthorizedCitation(
            unauthorizedCitation,
            `Revision-demanded citation for ${input.motionType}`,
            input.orderId
          );

          if (approved) {
            console.log(`[Phase VIII] VERIFIED: ${unauthorizedCitation.substring(0, 60)}`);
            verifiedCitations.push(unauthorizedCitation);

            // Build bank entry from verification result.
            // courtlistenerId lives directly on ExistenceCheckOutput (line 100 of
            // lib/citation/civ/types.ts), typed as courtlistenerId?: string.
            const step1 = result.verificationResults.step1Existence;
            newBankEntries.push({
              caseName: result.citation.caseName,
              citation: result.citation.normalized || result.citation.input,
              court: result.citation.court || '',
              date_filed: result.citation.year ? String(result.citation.year) : '',
              courtlistener_id: step1.courtlistenerId ?? undefined,
            });

            // Audit trail: log verified citation to citation_verifications table.
            // logCitationVerification is module-private (same file).
            // courtlistenerId param is typed number | null; step1.courtlistenerId is string | undefined.
            await logCitationVerification(
              input.orderId,
              'VIII-FT',
              unauthorizedCitation,
              step1.courtlistenerId ? parseInt(step1.courtlistenerId, 10) || null : null,
              'verified',
              { method: 'fast_track_civ', confidence: result.compositeResult.confidenceScore }
            );
          } else {
            console.warn(`[Phase VIII] REJECTED: ${unauthorizedCitation.substring(0, 60)} (confidence: ${result.compositeResult.confidenceScore})`);
            rejectedCitations.push(unauthorizedCitation);

            // Audit trail for rejected citations
            await logCitationVerification(
              input.orderId,
              'VIII-FT',
              unauthorizedCitation,
              null,
              'rejected',
              { method: 'fast_track_civ', confidence: result.compositeResult.confidenceScore,
                status: result.compositeResult.status, flags: result.compositeResult.flags.map(f => f.message) }
            );
          }
        } catch (verifyError) {
          // CIV pipeline can throw on: CourtListener API timeout, rate limit (429),
          // malformed citation parse failure, or Anthropic API error during Step 2.
          // All are non-fatal — treat as rejection, next loop retries if judge re-demands it.
          console.error(`[Phase VIII] Verification error for "${unauthorizedCitation.substring(0, 40)}":`, verifyError);
          rejectedCitations.push(unauthorizedCitation);
        }
      }

      // Strip ONLY citations that failed verification
      if (rejectedCitations.length > 0) {
        console.log(`[Phase VIII] Stripping ${rejectedCitations.length} rejected citation(s)...`);
        stripCitationsFromMotion(phaseOutput.revisedMotion, rejectedCitations);
      }

      // Store results for downstream use (Task 2 reads newBankEntries)
      citationValidationDataVIII.strippedCitations = rejectedCitations;
      citationValidationDataVIII.verifiedNewCitations = verifiedCitations;
      citationValidationDataVIII.newBankEntries = newBankEntries;
      phaseOutput.newBankEntries = newBankEntries;

      console.log(`[Phase VIII] Citation triage: ${verifiedCitations.length} verified, ${rejectedCitations.length} rejected/stripped`);
    } else {
      console.log('[Phase VIII] ✅ Citation validation PASSED — all citations from verified bank');
    }

    // Add validation to phaseOutput
    phaseOutput.citationValidation = citationValidationDataVIII;

    // Check if new citations were added (triggers VII.1)
    // IMPORTANT: If we stripped citations, there are no NEW citations to verify
    const newCitations = validationResultVIII.isValid && phaseOutput.newCitationsAdded === true;

    console.log(`[Phase VIII] ========== PHASE VIII COMPLETE ==========`);
    console.log(`[Phase VIII] Citation validation: ${validationResultVIII.isValid ? 'PASSED' : 'FAILED (stripped unauthorized)'}`);

    // === DOC GEN INTEGRATION ===
    // After Phase VIII content is saved, trigger document generation.
    // Uses dynamic import so integration module issues don't break phase execution.
    // Doc gen is a side effect — the phase succeeds even if doc gen fails.
    try {
      const { generateAndStoreFilingPackage } = await import('../integration/doc-gen-bridge');
      const { createClient: createSbClient } = await import('@supabase/supabase-js');
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (sbUrl && sbKey) {
        const adminClient = createSbClient(sbUrl, sbKey);
        const docGenResult = await generateAndStoreFilingPackage(adminClient, {
          orderId: input.orderId,
          orderNumber: input.orderNumber || '',
        });

        if (!docGenResult.success) {
          console.error('[Phase VIII] Doc gen failed:', {
            orderId: input.orderId,
            errors: docGenResult.errors,
          });
        } else {
          console.log('[Phase VIII] Filing package generated:', {
            orderId: input.orderId,
            documentCount: docGenResult.uploadedDocuments.length,
            warnings: docGenResult.warnings,
          });
        }
      } else {
        console.warn('[Phase VIII] Doc gen skipped — Supabase credentials not configured');
      }
    } catch (docGenError) {
      console.error('[Phase VIII] Doc gen exception:', {
        orderId: input.orderId,
        error: docGenError instanceof Error ? docGenError.message : 'Unknown',
      });
    }
    // === END DOC GEN INTEGRATION ===

    return {
      success: true,
      phase: 'VIII',
      status: 'completed',
      output: {
        ...phaseOutput,
        newCitations,
      },
      nextPhase: newCitations ? 'VII.1' : 'VII', // Go to citation check or straight to regrade
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'VIII',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VIII failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE VIII.5: Caption Validation
// ============================================================================

async function executePhaseVIII5(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase VIII.5] ========== STARTING PHASE VIII.5 (CAPTION VALIDATION) ==========`);

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase VIII.5] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? {}) as Record<string, unknown>;

    // Use revised motion if available, otherwise original, with safe fallback
    const motionToCheck = phaseVIIIOutput?.revisedMotion ?? phaseVOutput?.draftMotion ?? phaseVOutput ?? {};
    console.log(`[Phase VIII.5] Motion source: ${phaseVIIIOutput?.revisedMotion ? 'Phase VIII (revised)' : 'Phase V (original)'}`);


    const systemPrompt = buildPhasePrompt('VIII.5', PHASE_PROMPTS.PHASE_VIII5);

    const userMessage = `Validate caption consistency:

MOTION:
${JSON.stringify(motionToCheck, null, 2)}

CASE NUMBER: ${input.caseNumber}
CASE CAPTION: ${input.caseCaption}
JURISDICTION: ${input.jurisdiction}

Validate captions. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: resolveModelForExecution('VIII.5', input.tier),
      max_tokens: resolveMaxTokensForExecution('VIII.5', input.tier), // Phase VIII.5: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('VIII.5', outputText, input.orderId);

    const parsed = extractJSON(outputText, { phase: 'VIII.5', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase VIII.5] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'VIII.5',
        status: 'failed',
        output: null,
        error: `Phase VIII.5 produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput = { ...parsed.data, phaseComplete: 'VIII.5' };

    return {
      success: true,
      phase: 'VIII.5',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'IX',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'VIII.5',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VIII.5 failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE IX JURISDICTION FILTER
// ============================================================================

/**
 * Remove procedurally inappropriate supporting documents based on jurisdiction
 * and motion type. Louisiana state courts use exceptions (not motions) and do
 * not use California-style declarations or memoranda of points and authorities.
 */
function filterJurisdictionInappropriateDocuments(
  phaseOutput: Record<string, unknown>,
  jurisdiction: string,
  motionType: string
): void {
  const jurisdictionLower = (jurisdiction || '').toLowerCase();
  const motionLower = (motionType || '').toLowerCase();

  // Louisiana state court exception-based motions
  const isLouisianaState = jurisdictionLower.includes('louisiana') && !jurisdictionLower.includes('federal')
    && !jurisdictionLower.includes('district');
  const isException = motionLower.includes('exception') || motionLower.includes('no cause of action')
    || motionLower.includes('peremptory') || motionLower.includes('dilatory')
    || motionLower.includes('declinatory');

  if (!isLouisianaState && !isException) return;

  // Documents inappropriate for Louisiana state court exception practice
  const inappropriatePatterns = [
    /declaration\s+in\s+support/i,
    /memorandum\s+of\s+points\s+and\s+authorities/i,
    /request\s+for\s+judicial\s+notice/i,
    /declaration\s+of\s+/i,  // California-style declarations
    /points\s+and\s+authorities/i,
  ];

  // Filter documents array if present
  for (const key of ['documents', 'supportingDocuments', 'supporting_documents']) {
    const docs = phaseOutput[key];
    if (Array.isArray(docs)) {
      const filtered = docs.filter((doc: unknown) => {
        if (!doc || typeof doc !== 'object') return true;
        const docObj = doc as Record<string, unknown>;
        const title = String(docObj.title || docObj.name || docObj.documentType || '');
        const isInappropriate = inappropriatePatterns.some(p => p.test(title));
        if (isInappropriate) {
          console.warn(`[Phase IX] Removed jurisdiction-inappropriate document: "${title}" (LA state court)`);
        }
        return !isInappropriate;
      });
      phaseOutput[key] = filtered;
    }
  }
}

// ============================================================================
// PHASE IX: Supporting Documents
// ============================================================================

async function executePhaseIX(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase IX] ========== STARTING PHASE IX (SUPPORTING DOCUMENTS) ==========`);

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase IX] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? {}) as Record<string, unknown>;

    console.log(`[Phase IX] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase IX] Phase VIII keys: ${Object.keys(phaseVIIIOutput).join(', ') || 'EMPTY'}`);

    // =========================================================================
    // SP-14 TASK-21: Explicit input source validation
    // Prefer currentDraft (Phase VIII post-revision) over original Phase V draft.
    // =========================================================================
    const hasRevisedDraft = !!phaseVIIIOutput?.revisedMotion;
    const hasOriginalDraft = !!phaseVOutput?.draftMotion || Object.keys(phaseVOutput).length > 0;

    if (!hasRevisedDraft && !hasOriginalDraft) {
      console.error('[Phase IX] CRITICAL: No draft available — neither Phase VIII nor Phase V produced usable output');
      return {
        success: false,
        phase: 'IX',
        status: 'failed',
        output: null,
        error: 'Phase IX: No draft provided. Cannot assemble documents without a draft.',
        durationMs: Date.now() - start,
      };
    }

    if (hasRevisedDraft) {
      console.log('[Phase IX] Using currentDraft from Phase VIII (post-revision)');
    } else {
      console.warn('[Phase IX] WARNING: Using original draft from Phase V — no revision data available');
    }

    // Safe motion extraction with multiple fallback paths
    const finalMotion = phaseVIIIOutput?.revisedMotion ?? phaseVOutput?.draftMotion ?? phaseVOutput ?? {};

    // Validate draft is not suspiciously short (possible data loss)
    const draftStr = typeof finalMotion === 'string' ? finalMotion : JSON.stringify(finalMotion);
    if (draftStr.length < 100) {
      console.error(`[Phase IX] Draft is suspiciously short (${draftStr.length} chars). Possible data loss.`);
      return {
        success: false,
        phase: 'IX',
        status: 'failed',
        output: null,
        error: `Phase IX: Draft is suspiciously short (${draftStr.length} chars). Possible data loss.`,
        durationMs: Date.now() - start,
      };
    }

    console.log(`[Phase IX] Final motion source: ${hasRevisedDraft ? 'Phase VIII (revised)' : 'Phase V (original)'}`);
    console.log(`[Phase IX] Final motion keys: ${Object.keys(finalMotion as Record<string, unknown>).join(', ') || 'EMPTY'}`);


    // Build attorney signature block for supporting documents
    const getRepresentedPartyName = () => {
      const represented = input.parties?.find(p => p.isRepresented);
      return represented?.name || input.parties?.[0]?.name || 'Movant';
    };

    const signatureBlock = `
_________________________
${input.attorneyName}
Bar Roll No. ${input.barNumber}
${input.firmName}
${input.firmAddress}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}`.trim();

    const todayDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const systemPrompt = buildPhasePrompt('IX', PHASE_PROMPTS.PHASE_IX) + `

CRITICAL: ATTORNEY INFO FOR CERTIFICATE OF SERVICE

${signatureBlock}

The Certificate of Service MUST include this EXACT signature block.
DO NOT use [ATTORNEY NAME] or similar placeholders.

Today's Date: ${todayDate}`;

    const userMessage = `Generate supporting documents for:

═══════════════════════════════════════════════════════════════
CASE INFORMATION
═══════════════════════════════════════════════════════════════
CASE: ${input.caseCaption}
CASE NUMBER: ${input.caseNumber}
MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

═══════════════════════════════════════════════════════════════
FILING ATTORNEY (USE IN CERTIFICATE OF SERVICE)
═══════════════════════════════════════════════════════════════
${input.attorneyName}
Bar Roll No. ${input.barNumber}
${input.firmName}
${input.firmAddress}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}

═══════════════════════════════════════════════════════════════
MOTION:
${JSON.stringify(finalMotion, null, 2)}

Generate supporting documents. The Certificate of Service MUST include the exact attorney signature block shown above. Provide as JSON.`;

    const requestParams: Anthropic.MessageCreateParams = {
      model: resolveModelForExecution('IX', input.tier),
      max_tokens: resolveMaxTokensForExecution('IX', input.tier), // Phase IX: Registry-driven (32768)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    const response = await createMessageWithStreaming(client, requestParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('IX', outputText, input.orderId);

    // Truncation detection — if response was cut off at max_tokens, retry with 1.5x budget
    let outputTextFinal = outputText;
    if (response.stop_reason === 'max_tokens') {
      console.warn(`[Phase IX] Response truncated at max_tokens (${outputText.length} chars) — retrying with 1.5x budget`);
      const retryParams = {
        ...requestParams,
        max_tokens: Math.ceil((requestParams.max_tokens as number) * 1.5),
      } as Anthropic.MessageCreateParams;
      const retryResponse = await createMessageWithStreaming(client, retryParams) as Anthropic.Message;
      if (retryResponse.stop_reason === 'max_tokens') {
        console.warn('[Phase IX] Response truncated TWICE — attempting JSON repair on truncated output');
      }
      const retryTextContent = retryResponse.content.find(c => c.type === 'text');
      outputTextFinal = retryTextContent?.type === 'text' ? retryTextContent.text : outputText;
    }

    const parsed = extractJSON(outputTextFinal, { phase: 'IX', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase IX] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'IX',
        status: 'failed',
        output: null,
        error: `Phase IX produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput = { ...parsed.data, phaseComplete: 'IX' };

    // Task 12: Filter jurisdiction-inappropriate documents from Phase IX output
    filterJurisdictionInappropriateDocuments(phaseOutput, input.jurisdiction, input.motionType);

    // Check if IX.1 needed (MSJ/MSA)
    const needsIX1 = input.motionType.toUpperCase().includes('SUMMARY') ||
                     input.motionType.toUpperCase().includes('MSJ') ||
                     input.motionType.toUpperCase().includes('MSA');

    return {
      success: true,
      phase: 'IX',
      status: 'completed',
      output: phaseOutput,
      nextPhase: needsIX1 ? 'IX.1' : 'X',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'IX',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase IX failed',
      durationMs: Date.now() - start,
    };
  }
}

// ═════════════════════════════════════════════════════════
// EMERGENCY FIX 2026-02-17: Full CIV pipeline wired for IX.1.
// Prior: shallow CIV with fallback to format-check-only (BUG 1 variant).
// Now: 7-step pipeline with holding verification + format check.
// See: CHEN_MEGAPROMPT_CIV_EMERGENCY_FIX.md
// ═════════════════════════════════════════════════════════

// ============================================================================
// PHASE IX.1: Separate Statement Check + Final CIV Audit — FULL CIV PIPELINE (WIRE-1)
// ============================================================================

async function executePhaseIX1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase IX.1] ========== STARTING PHASE IX.1 (FULL CIV PIPELINE + FORMAT CHECK) ==========`);
  console.log(`[Phase IX.1] ZERO TOLERANCE — no fallback to format-check-only`);

  const client = getAnthropicClient();

  // Defensive: Log available phase outputs
  const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
  console.log(`[Phase IX.1] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

  // Safe extraction with defaults
  const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
  const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
  // Use the latest draft (Phase VIII if available, else Phase V)
  const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? null) as Record<string, unknown> | null;
  const currentDraft = phaseVIIIOutput ?? phaseVOutput;

  console.log(`[Phase IX.1] Phase IV keys: ${Object.keys(phaseIVOutput).join(', ') || 'EMPTY'}`);
  console.log(`[Phase IX.1] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
  console.log(`[Phase IX.1] Using draft from: ${phaseVIIIOutput ? 'Phase VIII (revised)' : 'Phase V (original)'}`);

  // =========================================================================
  // WIRE-1: Final Citation Audit via full CIV pipeline (NO shallow fallback)
  // If executePhaseV1CIV throws, the workflow HALTS — do NOT catch and continue.
  // =========================================================================
  const draftText = typeof currentDraft === 'string'
    ? currentDraft
    : Object.values(currentDraft).filter(v => typeof v === 'string').join('\n');

  const rawCitations = extractCitationsFromText(draftText.length > 100 ? draftText : JSON.stringify(currentDraft));
  console.log(`[Phase IX.1] Final audit: ${rawCitations.length} citations found in current draft`);

  const civResult = await executePhaseV1CIV({
    orderId: input.orderId,
    phase: 'IX.1',
    tier: (input.tier || 'A') as 'A' | 'B' | 'C' | 'D',
    draftText: draftText.length > 100 ? draftText : JSON.stringify(currentDraft),
    rawCitations,
  });

  // If hard gate FAILS at final audit → return failure, do NOT proceed to Phase X
  if (!civResult.output.passesHardGate) {
    console.error(
      `[Phase IX.1] HARD GATE FAILED AT FINAL AUDIT: passesHardGate=false, ` +
      `holdingMismatches=${civResult.output.holdingMismatches}, ` +
      `verificationRate=${civResult.output.verificationRate}`
    );
    return {
      success: false,
      phase: 'IX.1',
      status: 'failed',
      output: {
        ...civResult.output,
        phaseComplete: 'IX.1',
      },
      error: `CIV hard gate failed at IX.1 final audit: ${civResult.output.holdingMismatches} holding mismatches, verification rate: ${civResult.output.verificationRate}`,
      durationMs: civResult.durationMs,
    };
  }

  console.log(
    `[Phase IX.1] CIV audit PASSED: verified=${civResult.output.citationsVerified}/${civResult.output.citationsTotal}, ` +
    `rate=${civResult.output.verificationRate}`
  );

  // =========================================================================
  // SEPARATE STATEMENT FORMAT CHECK (existing functionality — kept intact)
  // =========================================================================
  const isLouisiana = input.jurisdiction === 'la_state' || input.jurisdiction?.toLowerCase().includes('louisiana');
  const isCalifornia = input.jurisdiction === 'ca_state' || input.jurisdiction?.toLowerCase().includes('california');
  const formatRules = isCalifornia
    ? 'CRC 3.1350 (California Rules of Court)'
    : isLouisiana
      ? 'Louisiana Code of Civil Procedure'
      : 'applicable local rules';

  const systemPrompt = buildPhasePrompt('IX.1', PHASE_PROMPTS.PHASE_IX1) + `

JURISDICTION: ${input.jurisdiction}
FORMAT RULES: ${formatRules}`;

  const userMessage = `Check Separate Statement for MSJ/MSA:

JURISDICTION: ${input.jurisdiction}
APPLICABLE RULES: ${formatRules}

CITATION BANK (Phase IV):
${JSON.stringify(phaseIVOutput, null, 2)}

MOTION (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

Verify Separate Statement complies with ${formatRules}. Provide as JSON.`;

  const response = await createMessageWithStreaming(client, {
    model: resolveModelForExecution('IX.1', input.tier),
    max_tokens: resolveMaxTokensForExecution('IX.1', input.tier),
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  const outputText = textContent?.type === 'text' ? textContent.text : '';

  const parsed = extractJSON(outputText, { phase: 'IX.1', orderId: input.orderId });
  if (!parsed.success) {
    console.error(`[Phase IX.1] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
    return {
      success: false,
      phase: 'IX.1',
      status: 'failed',
      output: null,
      error: `Phase IX.1 produced malformed output: ${parsed.error}`,
      durationMs: Date.now() - start,
    };
  }

  const phaseOutput = {
    ...parsed.data,
    phaseComplete: 'IX.1',
    // WIRE-1: Full CIV pipeline audit results (replaces shallow finalCivAudit)
    finalCitationAudit: {
      ...civResult.output,
      usedCIVPipeline: true,
    },
  };

  console.log(`[Phase IX.1] ========== PHASE IX.1 COMPLETE (CIV PIPELINE + FORMAT CHECK) ==========`);

  return {
    success: true,
    phase: 'IX.1',
    status: 'completed',
    output: phaseOutput,
    nextPhase: 'X',
    tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// PHASE X: Final Assembly (CP3 - Blocking)
// ============================================================================

async function executePhaseX(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase X] ========== STARTING PHASE X (FINAL ASSEMBLY) ==========`);

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase X] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults for ALL previous phases
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const phaseVIIOutput = (input.previousPhaseOutputs?.['VII'] ?? {}) as Record<string, unknown>;
    const phaseVIIIOutput = (input.previousPhaseOutputs?.['VIII'] ?? {}) as Record<string, unknown>;
    const phaseIXOutput = (input.previousPhaseOutputs?.['IX'] ?? {}) as Record<string, unknown>;

    console.log(`[Phase X] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase X] Phase VII keys: ${Object.keys(phaseVIIOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase X] Phase VIII keys: ${Object.keys(phaseVIIIOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase X] Phase IX keys: ${Object.keys(phaseIXOutput).join(', ') || 'EMPTY'}`);

    // Safe motion extraction with multiple fallback paths
    const finalMotion = phaseVIIIOutput?.revisedMotion ?? phaseVOutput?.draftMotion ?? phaseVOutput ?? {};
    console.log(`[Phase X] Final motion source: ${phaseVIIIOutput?.revisedMotion ? 'Phase VIII (revised)' : 'Phase V (original)'}`);

    // Safe evaluation extraction with multiple fallback paths
    const evaluation = (phaseVIIOutput?.evaluation ?? phaseVIIOutput?.judgeSimulation ?? phaseVIIOutput ?? {}) as Record<string, unknown>;
    console.log(`[Phase X] Evaluation grade: ${evaluation?.grade ?? evaluation?.overallGrade ?? 'Not available'}`);


    const systemPrompt = buildPhasePrompt('X', PHASE_PROMPTS.PHASE_X) + `

MOTION TYPE: ${input.motionType}
CASE CAPTION: ${input.caseCaption}`;

    const userMessage = `Assemble final package:

FINAL MOTION:
${JSON.stringify(finalMotion, null, 2)}

JUDGE EVALUATION:
${JSON.stringify(evaluation, null, 2)}

SUPPORTING DOCUMENTS (Phase IX):
${JSON.stringify(phaseIXOutput, null, 2)}

Assemble and check. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: resolveModelForExecution('X', input.tier),
      max_tokens: resolveMaxTokensForExecution('X', input.tier), // Phase X: Registry-driven
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';
    validatePhaseOutput('X', outputText, input.orderId);

    const parsed = extractJSON<Record<string, unknown>>(outputText, { phase: 'X', orderId: input.orderId });
    if (!parsed.success) {
      console.error(`[Phase X] JSON extraction failed for order ${input.orderId}: ${parsed.error}`);
      return {
        success: false,
        phase: 'X',
        status: 'failed',
        output: null,
        error: `Phase X produced malformed output: ${parsed.error}`,
        durationMs: Date.now() - start,
      };
    }

    const phaseOutput: Record<string, unknown> = { ...parsed.data, phaseComplete: 'X' };

    // ========================================================================
    // CRITICAL: PLACEHOLDER VALIDATION GATE
    // ========================================================================
    // Validate that the final motion does not contain placeholder text.
    // If placeholders are found, the motion CANNOT be delivered.

    console.log(`[Phase X] Running placeholder validation...`);

    // Get the final package motion content for validation
    const finalPackage = phaseOutput?.finalPackage as Record<string, unknown> | undefined;
    const motionContent = finalPackage?.motion || finalMotion;

    // Run placeholder validation
    const placeholderValidation = validateMotionObject(
      typeof motionContent === 'string'
        ? { content: motionContent }
        : (motionContent as Record<string, unknown>)
    );

    console.log(`[Phase X] Placeholder validation result: ${placeholderValidation.valid ? 'PASSED' : 'FAILED'}`);
    if (!placeholderValidation.valid) {
      console.log(`[Phase X] Placeholders found: ${placeholderValidation.placeholders.join(', ')}`);
      console.log(`[Phase X] Generic names found: ${placeholderValidation.genericNames.join(', ')}`);
    }

    // Add validation result to output
    phaseOutput.placeholderValidation = placeholderValidation;

    // BUG #6 FIX: Determine delivery readiness from a SINGLE code path.
    // Cross-reference generic names against actual party names from intake
    // so that a real party named "John Doe" does not block delivery.
    const realPlaceholders = Array.isArray(placeholderValidation.placeholders) ? placeholderValidation.placeholders : [];
    // TASK-11: Cross-reference generic names against ALL intake data (parties + attorney)
    const genericNamesFiltered = (Array.isArray(placeholderValidation.genericNames) ? placeholderValidation.genericNames : []).filter(
      (name: string) => !isRealPartyName(name, input.parties, input.attorneyName)
    );
    const hasBlockingIssues =
      !placeholderValidation.valid &&
      placeholderValidation.severity === 'blocking' &&
      (realPlaceholders.length > 0 || genericNamesFiltered.length > 0);

    // If placeholders detected, block delivery
    if (hasBlockingIssues) {
      console.error(`[Phase X] BLOCKING: Motion contains placeholders - cannot deliver`);

      // Generate revision instructions
      const revisionInstructions = generateRevisionInstructions(placeholderValidation);

      return {
        success: true, // Phase ran successfully, but motion needs revision
        phase: 'X',
        status: 'blocked', // Blocked by placeholder validation
        output: {
          ...phaseOutput,
          ready_for_delivery: false,
          blockingReason: 'PLACEHOLDER_DETECTED',
          placeholderValidation,
          revisionInstructions,
          adminSummary: {
            ...(phaseOutput.adminSummary || {}),
            notesForAdmin: `CRITICAL: Motion contains ${realPlaceholders.length} placeholder(s) and ${genericNamesFiltered.length} generic name(s). Requires revision before delivery. Placeholders: ${realPlaceholders.concat(genericNamesFiltered).join(', ')}`,
          },
        },
        requiresReview: true,
        gapsDetected: realPlaceholders.length + genericNamesFiltered.length,
        tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        durationMs: Date.now() - start,
      };
    }

    // Motion passed placeholder validation - ready for additional quality gates
    console.log(`[Phase X] Motion passed placeholder validation`);

    // ========================================================================
    // TASK-10: CITATION PLACEHOLDER SCAN (filing documents only, not AIS)
    // ========================================================================
    // Scan the motion text for unresolved citation placeholders.
    // AIS text is excluded — [CITATION NEEDED] in AIS is an instruction, not a gap.
    const motionTextForScan = typeof motionContent === 'string'
      ? motionContent
      : JSON.stringify(motionContent);

    const citationPlaceholderScan = scanForCitationPlaceholders(motionTextForScan);

    console.log(`[Phase X] Citation placeholder scan: ${citationPlaceholderScan.count} found, action: ${citationPlaceholderScan.action}`);

    if (citationPlaceholderScan.count > 0) {
      console.warn(`[Phase X] Citation gaps: ${citationPlaceholderScan.locations.map(l => `${l.placeholder} in ${l.section}`).join('; ')}`);
    }

    // ========================================================================
    // TASK-09: AIS COMPLIANCE VALIDATION
    // ========================================================================
    const rawPhaseIXDocs = phaseIXOutput?.documents ?? phaseIXOutput?.supportingDocuments;
    const phaseIXDocTypes = (Array.isArray(rawPhaseIXDocs) ? rawPhaseIXDocs as Array<Record<string, unknown>> : [])
      .map(d => String(d.type || d.name || ''));

    const aisCompliance = validateAISCompliance(
      input.instructions || '',
      motionTextForScan,
      phaseIXDocTypes,
    );

    if (aisCompliance.unmet.length > 0) {
      console.warn(`[Phase X] AIS compliance: ${(aisCompliance.complianceRate * 100).toFixed(0)}% — unmet: ${aisCompliance.unmet.map(r => r.text).join(', ')}`);
    } else {
      console.log(`[Phase X] AIS compliance: 100% (${aisCompliance.requirements.length} requirements checked)`);
    }

    phaseOutput.citationPlaceholderScan = citationPlaceholderScan;
    phaseOutput.aisCompliance = aisCompliance;

    // TASK-10: If 3+ citation placeholders, block delivery
    if (citationPlaceholderScan.action === 'hold') {
      console.error(`[Phase X] BLOCKING: ${citationPlaceholderScan.count} citation placeholders — delivery blocked`);

      return {
        success: true,
        phase: 'X',
        status: 'blocked',
        output: {
          ...phaseOutput,
          ready_for_delivery: false,
          blocking_reason: `${citationPlaceholderScan.count} legal propositions lack supporting authority`,
          citationPlaceholderScan,
          aisCompliance,
          placeholderValidation,
          adminSummary: {
            ...(phaseOutput.adminSummary || {}),
            notesForAdmin: `CITATION GAPS: ${citationPlaceholderScan.count} [CITATION NEEDED] placeholders in filing document. Locations: ${citationPlaceholderScan.locations.map(l => l.section).join(', ')}`,
          },
        },
        requiresReview: true,
        gapsDetected: citationPlaceholderScan.count,
        tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        durationMs: Date.now() - start,
      };
    }

    console.log(`[Phase X] All quality gates passed - ready for CP3 approval`);

    // =========================================================================
    // ADD CITATION METADATA TO FINAL OUTPUT - Citation Viewer Feature
    // =========================================================================
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    const rawCaseCitations = phaseIVOutput?.caseCitationBank;
    const caseCitationBank = (Array.isArray(rawCaseCitations) ? rawCaseCitations : []) as Array<{
      caseName?: string;
      citation?: string;
      courtlistener_id?: number;
      court?: string;
      date_filed?: string;
      authorityLevel?: string;
    }>;
    const rawStatutoryCitations = phaseIVOutput?.statutoryCitationBank;
    const statutoryCitationBank = (Array.isArray(rawStatutoryCitations) ? rawStatutoryCitations : []) as Array<{
      citation?: string;
      name?: string;
    }>;
    const citationsSaved = (phaseVOutput?.citationsSaved || {}) as Record<string, unknown>;

    // BUG-09 FIX: Filter citation list to only include citations that actually
    // appear in the final motion text. The full caseCitationBank includes all
    // researched citations, but only a subset may appear in the final draft.
    const finalMotionText = extractDraftText(phaseVIIIOutput)
      || extractDraftText(phaseVOutput)
      || extractDraftText(finalMotion)
      || JSON.stringify(finalMotion || '');

    const finalMotionTextNormalized = finalMotionText.toLowerCase().replace(/\s+/g, ' ');

    const citationsInFinalMotion = caseCitationBank.filter(c => {
      // Check if citation text appears in the final motion
      if (c.citation) {
        const normalizedCitation = c.citation.toLowerCase().replace(/\s+/g, ' ').trim();
        if (finalMotionTextNormalized.includes(normalizedCitation)) return true;
      }
      // Also check case name
      if (c.caseName) {
        const normalizedName = c.caseName.toLowerCase().replace(/\s+/g, ' ').trim();
        if (finalMotionTextNormalized.includes(normalizedName)) return true;
      }
      return false;
    });

    console.log(`[Phase X] BUG-09: Filtered ${caseCitationBank.length} total citations to ${citationsInFinalMotion.length} actually in final motion`);

    // Build citation metadata for the final package — using FILTERED citations
    const citationMetadata = {
      totalCitations: citationsInFinalMotion.length + statutoryCitationBank.length,
      caseCitations: citationsInFinalMotion.length,
      statutoryCitations: statutoryCitationBank.length,
      bindingAuthority: citationsInFinalMotion.filter(c => c.authorityLevel === 'binding').length,
      persuasiveAuthority: citationsInFinalMotion.filter(c => c.authorityLevel === 'persuasive').length,
      verifiedViaCourtListener: citationsInFinalMotion.filter(c => c.courtlistener_id).length,
      savedToDatabase: citationsSaved?.total || 0,
      // Include citation list for quick reference — only citations in final motion
      citationList: citationsInFinalMotion.slice(0, 20).map(c => ({
        caseName: c.caseName,
        citation: c.citation,
        court: c.court,
        dateFiled: c.date_filed,
        opinionId: c.courtlistener_id?.toString(),
      })),
    };

    console.log(`[Phase X] Citation metadata: ${citationMetadata.totalCitations} total citations`);

    // =========================================================================
    // DOCX GENERATION — Produce court-ready document
    // =========================================================================
    let documentUrl: string | null = null;
    try {
      const { generateMotionDocx } = await import('@/lib/documents/docx-generator');
      const { uploadDocument } = await import('@/lib/documents/storage-service');
      const { MotionData } = await import('@/lib/documents/types') as { MotionData: never };

      // Extract the draft text from Phase V or Phase VIII (revised)
      const draftText = extractDraftText(phaseVIIIOutput)
        || extractDraftText(phaseVOutput)
        || extractDraftText(finalMotion)
        || JSON.stringify(finalMotion);

      const motionData = {
        orderId: input.orderId,
        orderNumber: input.orderNumber || '',
        caseNumber: input.caseNumber || '',
        caseCaption: input.caseCaption || '',
        court: input.court || '',
        jurisdiction: input.jurisdiction || 'la_state',
        parish: input.parish,
        division: input.division,
        plaintiffs: (Array.isArray(input.parties) ? input.parties : []).filter((p: { role: string; name: string }) => p.role === 'plaintiff').map((p: { name: string }) => p.name),
        defendants: (Array.isArray(input.parties) ? input.parties : []).filter((p: { role: string; name: string }) => p.role === 'defendant').map((p: { name: string }) => p.name),
        clientRole: (input.clientRole || 'plaintiff') as 'plaintiff' | 'defendant' | 'petitioner' | 'respondent',
        attorneyName: input.attorneyName || '',
        barNumber: input.barNumber || '',
        firmName: input.firmName || '',
        firmAddress: input.firmAddress || '',
        firmPhone: input.firmPhone || '',
        firmEmail: input.firmEmail || '',
        motionTitle: input.motionType || 'MOTION',
        motionBody: draftText,
        sections: [],
        // BUG-09 FIX: Use filtered citations (only those in final motion text)
        citations: citationsInFinalMotion.map(c => ({
          caseName: c.caseName || '',
          citation: c.citation || '',
          court: c.court || '',
          year: c.date_filed ? parseInt(c.date_filed.split('-')[0]) : 0,
          propositionSupported: '',
          courtlistenerUrl: c.courtlistener_id ? `https://www.courtlistener.com/opinion/${c.courtlistener_id}/` : undefined,
        })),
        tier: input.tier as 'A' | 'B' | 'C' | 'D',
        filingDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      };

      const docxBuffer = await generateMotionDocx(motionData);
      const { publicUrl } = await uploadDocument(
        input.orderId,
        'motion.docx',
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      documentUrl = publicUrl;
      console.log(`[Phase X] DOCX generated and uploaded: ${publicUrl}`);
    } catch (docxError) {
      // Don't fail the phase on document generation error — log and continue
      console.error(`[Phase X] DOCX generation failed (non-blocking):`, docxError);
    }

    // TASK-12: Single source of truth for delivery readiness.
    // Citation placeholder scan already blocked 3+ above. For 1-2, flag for
    // admin review at CP3 but don't auto-block — admin can approve or return.
    const hasCitationGaps = citationPlaceholderScan.count > 0;

    return {
      success: true,
      phase: 'X',
      status: 'requires_review', // Always requires admin approval at CP3
      output: {
        ...phaseOutput,
        ready_for_delivery: true,  // TASK-12: Single snake_case field
        blocking_reason: null,
        placeholderValidation,
        citationPlaceholderScan,   // TASK-10: Citation gap details for admin
        aisCompliance,             // TASK-09: AIS compliance report for admin
        citationMetadata,          // Citation Viewer Feature
        documentUrl,
        ...(hasCitationGaps ? {
          adminSummary: {
            ...(phaseOutput.adminSummary || {}),
            notesForAdmin: `NOTE: ${citationPlaceholderScan.count} citation placeholder(s) remain (below HOLD threshold). Review recommended. Locations: ${citationPlaceholderScan.locations.map(l => l.section).join(', ')}`,
          },
        } : {}),
        ...(aisCompliance.unmet.length > 0 ? {
          aisWarning: `AIS compliance ${(aisCompliance.complianceRate * 100).toFixed(0)}%: unmet requirements — ${aisCompliance.unmet.map(r => r.text).join(', ')}`,
        } : {}),
      },
      requiresReview: true, // CP3: Blocking checkpoint
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'X',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase X failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE EXECUTOR REGISTRY - ALL 14 PHASES
// ============================================================================

export const PHASE_EXECUTORS: Record<WorkflowPhaseCode, (input: PhaseInput) => Promise<PhaseOutput>> = {
  'I': executePhaseI,
  'II': executePhaseII,
  'III': executePhaseIII,
  'IV': executePhaseIV,
  'V': executePhaseV,
  'V.1': executePhaseV1,
  'VI': executePhaseVI,
  'VII': executePhaseVII,
  'VII.1': executePhaseVII1,
  'VIII': executePhaseVIII,
  'VIII.5': executePhaseVIII5,
  'IX': executePhaseIX,
  'IX.1': executePhaseIX1,
  'X': executePhaseX,
};

/**
 * Execute a specific phase with strict enforcement
 */
export async function executePhase(
  phase: WorkflowPhaseCode,
  input: PhaseInput
): Promise<PhaseOutput> {
  const executor = PHASE_EXECUTORS[phase];

  if (!executor) {
    console.error(`[Phase Executor] No executor found for phase ${phase}`);
    return {
      success: false,
      phase,
      status: 'failed',
      output: null,
      error: `No executor found for phase ${phase}. Valid phases: ${Object.keys(PHASE_EXECUTORS).join(', ')}`,
    };
  }

  console.log(`[Phase Executor] Starting phase ${phase} for workflow ${input.workflowId}`);

  const result = await executor(input);

  console.log(`[Phase Executor] Phase ${phase} ${result.success ? 'completed' : 'failed'}`, {
    status: result.status,
    tokensUsed: result.tokensUsed,
    durationMs: result.durationMs,
  });

  // ST4-001: Wire recordCost into phase execution — records every phase's AI cost
  if (result.success && result.tokensUsed && input.orderId) {
    try {
      const { recordCost } = await import('@/lib/workflow/cost-tracker');
      const { MODEL_COSTS } = await import('@/lib/config/models');
      const model = resolveModelForExecution(phase, input.tier);
      const costPerToken = MODEL_COSTS[model] || { input: 3.0, output: 15.0 };
      const totalCost = (result.tokensUsed.input * costPerToken.input / 1_000_000) +
                        (result.tokensUsed.output * costPerToken.output / 1_000_000);

      await recordCost({
        orderId: input.orderId,
        phase,
        model,
        tier: input.tier,
        inputTokens: result.tokensUsed.input,
        outputTokens: result.tokensUsed.output,
        totalCost,
      });
    } catch (costError) {
      // Non-fatal: losing cost data shouldn't fail the phase
      console.error(`[Phase Executor] Cost recording failed for phase ${phase}:`, costError);
    }
  }

  return result;
}
