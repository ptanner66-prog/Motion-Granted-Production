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
import { createClient } from '@/lib/supabase/server';
import { createMessageWithStreaming } from '@/lib/automation/claude';
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
import { saveOrderCitations } from '@/lib/services/citations/citation-service';
import type { SaveCitationInput } from '@/types/citations';

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
  firmCity: string;
  firmState: string;
  firmZip: string;
  firmPhone: string;
  firmEmail: string;
  firmFullAddress: string;  // Pre-formatted: "123 Main St\nBaton Rouge, LA 70801"
  // Extended case data for complete motion generation
  filingDeadline?: string;
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

// Model selection based on phase and tier
function getModelForPhase(phase: WorkflowPhaseCode, tier: MotionTier): string {
  const OPUS = 'claude-opus-4-5-20251101';
  const SONNET = 'claude-sonnet-4-20250514';

  // Phase VII always uses Opus (quality gate)
  if (phase === 'VII') return OPUS;

  // Tier B/C use Opus for research and complex phases
  if (tier !== 'A') {
    if (['IV', 'VI', 'VIII'].includes(phase)) return OPUS;
  }

  return SONNET;
}

// Extended thinking budget
function getThinkingBudget(phase: WorkflowPhaseCode, tier: MotionTier): number | null {
  if (phase === 'VII') return 10000; // Always for judge simulation
  if (tier !== 'A' && ['VI', 'VIII'].includes(phase)) return 8000;
  return null;
}

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
  const caseList = (caseCitationBank || []).map((c, i) => {
    const courtAbbrev = extractCourtAbbrev(c.court || '');
    const year = extractYear(c.date_filed || '');
    return `  ${i + 1}. ${c.caseName || 'Unknown'}
     Citation: ${c.citation || 'No citation'}
     Court: ${courtAbbrev || 'Unknown'}
     Year: ${year || 'Unknown'}
     CourtListener ID: ${c.courtlistener_id || 'N/A'}`;
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
${caseList || '  [No case citations available — use statutes only or write [CITATION NEEDED]]'}

STATUTORY CITATIONS (you may ALSO cite these statutes):
${statuteList || '  [No statutory citations in bank]'}

You may also cite Louisiana statutes directly:
  - La. C.C.P. art. [number] — Louisiana Code of Civil Procedure
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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE I: INTAKE & CLASSIFICATION

Your task is to:
1. Parse and classify the submitted case information
2. Identify the motion type and confirm the tier (A/B/C)
3. Extract all parties, dates, and key identifiers
4. Validate that required information is present
5. Flag any missing required fields

DO NOT write any motion content. Only analyze and structure the intake data.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "I",
  "classification": {
    "motionType": "string",
    "tier": "A|B|C",
    "path": "path_a|path_b",
    "jurisdiction": "string",
    "court": "string"
  },
  "parties": {
    "movingParty": { "name": "string", "role": "plaintiff|defendant" },
    "opposingParty": { "name": "string", "role": "plaintiff|defendant" }
  },
  "caseIdentifiers": {
    "caseNumber": "string",
    "caseCaption": "string",
    "filingDeadline": "string|null"
  },
  "extractedFacts": ["fact1", "fact2", ...],
  "proceduralEvents": ["event1", "event2", ...],
  "missingFields": ["field1", "field2", ...],
  "validationStatus": "complete|incomplete",
  "notes": "any relevant observations"
}`;

    const userMessage = `Analyze this submission for Phase I intake:

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}
CASE NUMBER: ${input.caseNumber}
CASE CAPTION: ${input.caseCaption}

STATEMENT OF FACTS:
${input.statementOfFacts}

PROCEDURAL HISTORY:
${input.proceduralHistory}

CLIENT INSTRUCTIONS:
${input.instructions}

UPLOADED DOCUMENTS:
${input.documents?.join('\n') || 'None provided'}

Provide your Phase I analysis as JSON.`;

    const model = getModelForPhase('I', input.tier);
    console.log(`[Phase I] Calling Claude with model: ${model}, max_tokens: 64000`);
    console.log(`[Phase I] Input context length: ${userMessage.length} chars`);

    const callStart = Date.now();
    const response = await createMessageWithStreaming(client, {
      model,
      max_tokens: 64000, // Phase I: Document intake analysis
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const callDuration = Date.now() - callStart;

    console.log(`[Phase I] Claude responded in ${callDuration}ms`);
    console.log(`[Phase I] Tokens used - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);
    console.log(`[Phase I] Stop reason: ${response.stop_reason}`);

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE II: LEGAL STANDARDS / MOTION DECONSTRUCTION

Your task is to:
1. Identify the applicable legal standard for this motion type
2. List ALL elements that must be proven/addressed
3. Identify the burden of proof and who bears it
4. Note relevant procedural rules and requirements
5. For oppositions (path_b): deconstruct the opponent's likely arguments

DO NOT draft any motion language. Only identify the legal framework.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "II",
  "legalStandard": {
    "name": "string",
    "source": "statute/rule/case",
    "citation": "string",
    "summary": "string"
  },
  "elements": [
    {
      "number": 1,
      "element": "string",
      "description": "string",
      "evidenceNeeded": "string"
    }
  ],
  "burdenOfProof": {
    "standard": "preponderance|clear_and_convincing|beyond_reasonable_doubt",
    "bearer": "movant|opponent",
    "shiftConditions": "string|null"
  },
  "proceduralRequirements": [
    { "requirement": "string", "rule": "string", "deadline": "string|null" }
  ],
  "oppositionAnalysis": {
    "likelyArguments": ["arg1", "arg2"],
    "weakPoints": ["weak1", "weak2"]
  }
}`;

    const userMessage = `Based on the Phase I intake, identify the legal framework:

PHASE I OUTPUT:
${JSON.stringify(phaseIOutput, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Provide your Phase II legal framework analysis as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('II', input.tier),
      max_tokens: 64000, // Phase II: Legal framework analysis
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'II';

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

async function executePhaseIII(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();
    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;

    // ========================================================================
    // SYSTEM PROMPT: Load v7.4.1 methodology prompt
    // ========================================================================
    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

${PHASE_PROMPTS.PHASE_III}`;

    const userMessage = `Analyze evidence and issues for Phase III:

PHASE I OUTPUT (facts and case info):
${JSON.stringify(phaseIOutput, null, 2)}

PHASE II OUTPUT (legal elements):
${JSON.stringify(phaseIIOutput, null, 2)}

Provide your Phase III evidence strategy as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('III', input.tier),
      max_tokens: 64000, // Phase III: Extended legal research
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'III';

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
  verificationResult: 'verified' | 'not_found' | 'api_error' | 'plurality_flagged' | 'dissent_blocked' | 'concurrence_flagged',
  apiResponse: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
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
      phaseIIIOutput,
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
    const minRequired = input.tier === 'A' ? 4 : input.tier === 'B' ? 8 : 12;
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
      allCitationsVerified: true,
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
${input.firmCity}, ${input.firmState} ${input.firmZip}
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
    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

${citationEnforcementBlock}

${PHASE_PROMPTS.PHASE_V}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: FILING ATTORNEY INFORMATION (USE EXACTLY - NO PLACEHOLDERS)
═══════════════════════════════════════════════════════════════════════════════

Attorney Name: ${input.attorneyName}
Bar Roll Number: ${input.barNumber}
Firm Name: ${input.firmName}
Street Address: ${input.firmAddress}
City, State ZIP: ${input.firmCity}, ${input.firmState} ${input.firmZip}
Phone: ${input.firmPhone}
Email: ${input.firmEmail}
Representing: ${getRepresentedPartyName()}

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
${input.firmCity}, ${input.firmState} ${input.firmZip}
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

    const model = getModelForPhase('V', input.tier);
    console.log(`[Phase V] Calling Claude with model: ${model}, max_tokens: 64000`);
    console.log(`[Phase V] User message length: ${userMessage.length} chars`);

    const callStart = Date.now();
    const response = await createMessageWithStreaming(client, {
      model,
      max_tokens: 64000, // Phase V: Full motion draft with all arguments
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

    // Parse JSON output with robust handling
    let phaseOutput: Record<string, unknown> | null = null;

    // ================================================================
    // ROBUST JSON PARSING (2026-01-30)
    // Handle multiple ways Claude might return the response
    // ================================================================
    console.log(`[Phase V] Attempting to parse JSON from response...`);

    try {
      // Method 1: Try to extract JSON object from response
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          phaseOutput = JSON.parse(jsonMatch[0]);
          console.log(`[Phase V] Parsed JSON via regex extraction`);
        } catch (e) {
          console.log(`[Phase V] Direct JSON parse failed, trying cleanup...`);
          // Try cleaning up common issues
          let cleaned = jsonMatch[0]
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
            .replace(/[\x00-\x1F\x7F]/g, ' '); // Remove control characters
          try {
            phaseOutput = JSON.parse(cleaned);
            console.log(`[Phase V] Parsed JSON after cleanup`);
          } catch (e2) {
            console.log(`[Phase V] Cleanup parse also failed`);
          }
        }
      }

      // Method 2: Try extracting from markdown code block
      if (!phaseOutput) {
        const codeBlockMatch = outputText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          try {
            phaseOutput = JSON.parse(codeBlockMatch[1].trim());
            console.log(`[Phase V] Parsed JSON from markdown code block`);
          } catch (e) {
            console.log(`[Phase V] Code block JSON parse failed`);
          }
        }
      }
    } catch (parseError) {
      console.error(`[Phase V] JSON parse failed:`, parseError);
    }

    // Log what we found
    if (phaseOutput) {
      console.log(`[Phase V] Parsed output keys: ${Object.keys(phaseOutput).join(', ')}`);
    } else {
      console.error(`[Phase V] No valid JSON found in response`);
      console.error(`[Phase V] Response preview: ${outputText.substring(0, 500)}...`);
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
      const caseCitationInputs: SaveCitationInput[] = fullCaseCitationBank.map((c, index) => ({
        citationString: c.citation || '',
        caseName: c.caseName || 'Unknown Case',
        courtlistenerOpinionId: c.courtlistener_id?.toString(),
        courtlistenerClusterId: c.courtlistener_cluster_id?.toString(),
        courtlistenerUrl: c.courtlistener_id
          ? `https://www.courtlistener.com/opinion/${c.courtlistener_id}/`
          : undefined,
        court: c.court,
        dateFiled: c.date_filed,
        citationType: 'case' as const,
        proposition: c.proposition,
        authorityLevel: c.authorityLevel === 'binding' ? 'binding' : 'persuasive',
        verificationStatus: c.courtlistener_id ? 'verified' : 'unverified',
        verificationMethod: c.verification_method || 'courtlistener_api',
        displayOrder: index + 1,
      }));

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

/**
 * Extract all case citations from text using regex patterns
 */
function extractCitationsFromText(text: string): string[] {
  const citations: string[] = [];
  const seen = new Set<string>();

  // Federal case citations: 123 F.3d 456
  const federalPattern = /\d+\s+(?:F\.\s*(?:2d|3d|4th)?|F\.\s*Supp\.\s*(?:2d|3d)?|F\.\s*App'x)\s+\d+/gi;
  // Supreme Court: 123 U.S. 456
  const scotusPattern = /\d+\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.\s*(?:2d)?)\s+\d+/gi;
  // State cases: 123 So.2d 456, 123 Cal.App.4th 456
  const statePattern = /\d+\s+(?:So\.\s*(?:2d|3d)?|Cal\.\s*(?:App\.\s*)?(?:2d|3d|4th|5th)?|N\.E\.\s*(?:2d|3d)?|N\.W\.\s*(?:2d)?|S\.E\.\s*(?:2d)?|S\.W\.\s*(?:2d|3d)?|A\.\s*(?:2d|3d)?|P\.\s*(?:2d|3d)?)\s+\d+/gi;

  const patterns = [federalPattern, scotusPattern, statePattern];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const citationText = match[0].trim();
      const normalized = citationText.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        citations.push(citationText);
      }
    }
  }

  return citations;
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

// ============================================================================
// PHASE V.1: Citation Accuracy Check (with Protocol 20 & 21 Integration)
// ============================================================================

async function executePhaseV1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase V.1] ========== STARTING PHASE V.1 (CITATION VERIFICATION) ==========`);
  console.log(`[Phase V.1] ZERO TOLERANCE - Will REMOVE any unverified citations`);

  try {
    const client = getAnthropicClient();

    // Extract Phase IV output (citation bank with CourtListener IDs)
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    const caseCitationBank = (phaseIVOutput?.caseCitationBank ?? []) as Array<{
      citation?: string;
      courtlistener_id?: number;
    }>;

    // Build a set of verified citations (those with courtlistener_id)
    const verifiedCitationIds = new Set<number>();
    const verifiedCitationTexts = new Map<string, number>(); // citation text -> courtlistener_id

    for (const citation of caseCitationBank) {
      if (citation.courtlistener_id) {
        verifiedCitationIds.add(citation.courtlistener_id);
        if (citation.citation) {
          // Normalize for comparison
          verifiedCitationTexts.set(citation.citation.toLowerCase().replace(/\s+/g, ' ').trim(), citation.courtlistener_id);
        }
      }
    }

    console.log(`[Phase V.1] Verified citation bank: ${verifiedCitationIds.size} citations with CourtListener IDs`);

    // Extract Phase V output (draft motion)
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    const draftMotion = (phaseVOutput?.draftMotion ?? phaseVOutput) as Record<string, unknown>;

    // Convert draft motion to text for citation extraction
    const motionText = JSON.stringify(draftMotion);

    // Extract all citations from the motion text
    const citationsInDraft = extractCitationsFromText(motionText);
    console.log(`[Phase V.1] Found ${citationsInDraft.length} citations in draft motion`);

    // =========================================================================
    // VERIFY EACH CITATION AGAINST COURTLISTENER
    // =========================================================================
    const verificationResults: Array<{
      citation: string;
      verified: boolean;
      courtlistener_id: number | null;
      action: 'kept' | 'removed' | 'verified_now';
    }> = [];

    const unverifiedCitations: string[] = [];

    for (const citation of citationsInDraft) {
      const normalized = citation.toLowerCase().replace(/\s+/g, ' ').trim();

      // Check if in our verified bank
      if (verifiedCitationTexts.has(normalized)) {
        verificationResults.push({
          citation,
          verified: true,
          courtlistener_id: verifiedCitationTexts.get(normalized) || null,
          action: 'kept',
        });
        continue;
      }

      // Not in bank - try to verify against CourtListener now
      console.log(`[Phase V.1] Citation not in bank, verifying: "${citation}"`);

      const verifyResult = await verifyCitationExists(citation);

      if (verifyResult.success && verifyResult.data?.exists && verifyResult.data.courtlistenerId) {
        console.log(`[Phase V.1] Citation verified now: ${citation} -> ID ${verifyResult.data.courtlistenerId}`);
        verificationResults.push({
          citation,
          verified: true,
          courtlistener_id: parseInt(verifyResult.data.courtlistenerId, 10),
          action: 'verified_now',
        });

        // Log to audit trail
        await logCitationVerification(
          input.orderId,
          'V.1',
          citation,
          parseInt(verifyResult.data.courtlistenerId, 10),
          'verified',
          { source: 'Phase V.1 verification' }
        );
      } else {
        // CITATION NOT VERIFIED - MARK FOR REMOVAL
        console.error(`[Phase V.1] UNVERIFIED CITATION DETECTED: "${citation}"`);
        verificationResults.push({
          citation,
          verified: false,
          courtlistener_id: null,
          action: 'removed',
        });
        unverifiedCitations.push(citation);

        // Log to audit trail
        await logCitationVerification(
          input.orderId,
          'V.1',
          citation,
          null,
          'not_found',
          { reason: 'Citation not found in CourtListener - potential hallucination' }
        );
      }
    }

    // =========================================================================
    // PROTOCOL 20 & 21: Check verified citations for plurality/dissent issues
    // =========================================================================
    console.log(`[Phase V.1] Running Protocol 20 (Plurality) and Protocol 21 (Concurrence/Dissent) checks...`);

    const protocol20Results: Array<{ citation: string; result: Protocol20Result }> = [];
    const protocol21Results: Array<{ citation: string; result: Protocol21Result }> = [];
    const dissentBlockedCitations: string[] = [];
    const concurrenceFlaggedCitations: string[] = [];
    const pluralitiesFlagged: string[] = [];

    for (const vr of verificationResults) {
      if (vr.verified && vr.courtlistener_id) {
        // Protocol 20: Check for plurality opinions
        const p20Result = await checkProtocol20Plurality(vr.citation, vr.courtlistener_id);
        protocol20Results.push({ citation: vr.citation, result: p20Result });

        if (p20Result.isPlurality) {
          pluralitiesFlagged.push(vr.citation);
          console.log(`[Phase V.1] Protocol 20: Plurality flagged - ${vr.citation}`);
          // Log to audit trail
          await logCitationVerification(
            input.orderId,
            'V.1-Protocol20',
            vr.citation,
            vr.courtlistener_id,
            'plurality_flagged',
            { protocol: 'Protocol20', ...p20Result }
          );
        }

        // Protocol 21: Check for concurrence/dissent
        const p21Result = await checkProtocol21ConcurrenceDissent(vr.citation, vr.courtlistener_id);
        protocol21Results.push({ citation: vr.citation, result: p21Result });

        if (p21Result.action === 'BLOCK_DISSENT') {
          dissentBlockedCitations.push(vr.citation);
          console.error(`[Phase V.1] Protocol 21: DISSENT BLOCKED - ${vr.citation}`);
          // Mark for removal
          vr.action = 'removed';
          vr.verified = false;
          unverifiedCitations.push(vr.citation);
          // Log to audit trail
          await logCitationVerification(
            input.orderId,
            'V.1-Protocol21',
            vr.citation,
            vr.courtlistener_id,
            'dissent_blocked',
            { protocol: 'Protocol21', ...p21Result }
          );
        } else if (p21Result.action === 'FLAG_CONCURRENCE') {
          concurrenceFlaggedCitations.push(vr.citation);
          console.log(`[Phase V.1] Protocol 21: Concurrence flagged - ${vr.citation}`);
          // Log but don't block
          await logCitationVerification(
            input.orderId,
            'V.1-Protocol21',
            vr.citation,
            vr.courtlistener_id,
            'concurrence_flagged',
            { protocol: 'Protocol21', ...p21Result }
          );
        }
      }
    }

    console.log(`[Phase V.1] Protocol 20: ${pluralitiesFlagged.length} pluralities flagged`);
    console.log(`[Phase V.1] Protocol 21: ${dissentBlockedCitations.length} dissents blocked, ${concurrenceFlaggedCitations.length} concurrences flagged`);

    // =========================================================================
    // IF UNVERIFIED CITATIONS FOUND, ASK CLAUDE TO REMOVE THEM
    // =========================================================================
    let cleanedMotion = draftMotion;
    let citationsRemoved = 0;

    if (unverifiedCitations.length > 0) {
      console.log(`[Phase V.1] REMOVING ${unverifiedCitations.length} unverified citations from motion`);

      const cleanupPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE V.1: CITATION CLEANUP - ZERO TOLERANCE FOR HALLUCINATED CITATIONS

The following citations in the motion could NOT be verified against CourtListener.
They may be hallucinations and MUST be removed.

UNVERIFIED CITATIONS TO REMOVE:
${unverifiedCitations.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

VERIFIED CITATIONS THAT CAN STAY:
${Array.from(verifiedCitationTexts.keys()).map((c, i) => `${i + 1}. "${c}"`).join('\n')}

DRAFT MOTION:
${JSON.stringify(draftMotion, null, 2)}

YOUR TASK:
1. Find every instance of the unverified citations in the motion
2. REMOVE the sentence containing the unverified citation, OR
3. REPLACE with a verified citation from the bank if it supports the same point
4. Ensure the motion still flows logically after removals

OUTPUT FORMAT (JSON only):
{
  "cleanedMotion": {
    // Same structure as original draftMotion but with unverified citations removed
  },
  "removals": [
    {
      "citation": "the unverified citation",
      "location": "which section",
      "action": "removed_sentence|replaced_with_verified"
    }
  ],
  "citationsRemoved": number,
  "motionStillCoherent": true|false
}`;

      const cleanupResponse = await createMessageWithStreaming(client, {
        model: getModelForPhase('V.1', input.tier),
        max_tokens: 64000,
        system: cleanupPrompt,
        messages: [{ role: 'user', content: 'Remove all unverified citations and return the cleaned motion.' }],
      });

      const cleanupText = cleanupResponse.content.find(c => c.type === 'text');
      const cleanupOutput = cleanupText?.type === 'text' ? cleanupText.text : '';

      try {
        const jsonMatch = cleanupOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanupResult = JSON.parse(jsonMatch[0]);
          cleanedMotion = cleanupResult.cleanedMotion || draftMotion;
          citationsRemoved = cleanupResult.citationsRemoved || unverifiedCitations.length;
          console.log(`[Phase V.1] Cleanup complete: ${citationsRemoved} citations removed`);
        }
      } catch {
        console.error('[Phase V.1] Failed to parse cleanup response - using original motion');
      }
    }

    // =========================================================================
    // Build final output with Protocol 20 & 21 summaries
    // =========================================================================
    const phaseOutput = {
      phaseComplete: 'V.1',
      citationVerification: {
        totalInDraft: citationsInDraft.length,
        verified: verificationResults.filter(r => r.verified).length,
        unverified: unverifiedCitations.length,
        removed: citationsRemoved,
        verificationRate: citationsInDraft.length > 0
          ? `${Math.round((verificationResults.filter(r => r.verified).length / citationsInDraft.length) * 100)}%`
          : '100%',
      },
      verificationResults,
      unverifiedCitationsRemoved: unverifiedCitations,
      cleanedMotion: unverifiedCitations.length > 0 ? cleanedMotion : null,
      auditTrail: {
        verifiedViaCourtListenerBank: verificationResults.filter(r => r.action === 'kept').length,
        verifiedNow: verificationResults.filter(r => r.action === 'verified_now').length,
        removed: verificationResults.filter(r => r.action === 'removed').length,
        timestamp: new Date().toISOString(),
      },
      // Protocol 20: Plurality Opinion Detection Summary
      protocol20Summary: {
        checked: protocol20Results.length,
        pluralitiesFound: pluralitiesFlagged.length,
        flaggedCitations: protocol20Results
          .filter(r => r.result.isPlurality)
          .map(r => ({
            citation: r.citation,
            flag: r.result.pluralityFlag,
            notes: r.result.notes,
          })),
      },
      // Protocol 21: Concurrence/Dissent Detection Summary
      protocol21Summary: {
        checked: protocol21Results.length,
        dissentsCitationsBlocked: dissentBlockedCitations.length,
        concurrencesFlagged: concurrenceFlaggedCitations.length,
        needsReview: protocol21Results.filter(r => r.result.action === 'NEEDS_REVIEW').length,
        flaggedCitations: [
          ...protocol21Results
            .filter(r => r.result.action === 'BLOCK_DISSENT')
            .map(r => ({
              citation: r.citation,
              action: r.result.action,
              notes: r.result.notes,
            })),
          ...protocol21Results
            .filter(r => r.result.action === 'FLAG_CONCURRENCE')
            .map(r => ({
              citation: r.citation,
              action: r.result.action,
              notes: r.result.notes,
            })),
        ],
      },
      overallStatus: unverifiedCitations.length === 0 ? 'pass' : 'citations_removed',
    };

    console.log(`[Phase V.1] ========== PHASE V.1 COMPLETE ==========`);
    console.log(`[Phase V.1] Verification: ${phaseOutput.citationVerification.verified}/${phaseOutput.citationVerification.totalInDraft} verified`);
    console.log(`[Phase V.1] Removed: ${phaseOutput.citationVerification.removed} unverified citations`);
    console.log(`[Phase V.1] Protocol 20: ${phaseOutput.protocol20Summary.pluralitiesFound} pluralities flagged`);
    console.log(`[Phase V.1] Protocol 21: ${phaseOutput.protocol21Summary.dissentsCitationsBlocked} dissents blocked, ${phaseOutput.protocol21Summary.concurrencesFlagged} concurrences flagged`);

    return {
      success: true,
      phase: 'V.1',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'VI',
      durationMs: Date.now() - start,
    };
  } catch (error) {
    console.error(`[Phase V.1] ========== PHASE V.1 FAILED ==========`);
    console.error(`[Phase V.1] Error:`, error);
    return {
      success: false,
      phase: 'V.1',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase V.1 failed',
      durationMs: Date.now() - start,
    };
  }
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
    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

${PHASE_PROMPTS.PHASE_VI}

${thinkingBudget ? 'Use extended thinking to deeply analyze potential opposition strategies and vulnerabilities.' : ''}`;

    const userMessage = `Anticipate opposition for Phase VI:

DRAFT MOTION (Phase V):
${JSON.stringify(draftMotion, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Analyze potential opposition. Provide as JSON.`;

    const requestParams: Anthropic.MessageCreateParams = {
      model: getModelForPhase('VI', input.tier),
      max_tokens: 64000, // Phase VI: Opposition anticipation with 8K thinking (Opus for B/C)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    // Add extended thinking if applicable (cast through unknown to satisfy TypeScript)
    if (thinkingBudget) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      };
    }

    const response = await createMessageWithStreaming(client, requestParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'VI';

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

    // Check if Phase VI was skipped (Tier A procedural motion)
    const phaseVISkipped = phaseVIOutput?.skipped === true;
    if (phaseVISkipped) {
      console.log('[Phase VII] Phase VI was skipped (Tier A procedural motion)');
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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

${PHASE_PROMPTS.PHASE_VII}

---

### CONTEXT FOR THIS EVALUATION

**Jurisdiction:** ${input.jurisdiction}
**Motion Type:** ${input.motionType}
**Revision Loop:** ${loopNumber} of 3
**Is Re-evaluation:** ${isReEvaluation ? 'YES - evaluating REVISED motion from Phase VIII' : 'NO - initial evaluation'}
**Phase VI Skipped:** ${phaseVISkipped ? 'YES - Tier A procedural motion (DO NOT penalize for missing opposition analysis)' : 'NO'}

Use extended thinking to thoroughly analyze before grading.
${phaseVISkipped ? '\nIMPORTANT: Phase VI (Opposition Anticipation) was skipped because this is a Tier A procedural motion. DO NOT penalize the grade for missing opposition analysis.' : ''}`;

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
    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('VII', input.tier), // Always Opus
      max_tokens: 64000, // Phase VII: Judge simulation (always Opus with extended thinking)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget || 10000, // Use config, fallback to 10K
      },
    } as Anthropic.MessageCreateParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'VII';

    // Extract pass/fail
    const evaluation = phaseOutput.evaluation || phaseOutput;
    const passes = evaluation.passes === true || evaluation.numericGrade >= 3.3;

    return {
      success: true,
      phase: 'VII',
      status: 'completed',
      output: {
        ...phaseOutput,
        passes,
        grade: evaluation.grade,
        numericGrade: evaluation.numericGrade,
        loopNumber,
      },
      nextPhase: passes ? 'VIII.5' : 'VIII',
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

// ============================================================================
// PHASE VII.1: Post-Revision Citation Check
// ============================================================================

async function executePhaseVII1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();
    const phaseVIIIOutput = input.previousPhaseOutputs['VIII'] as Record<string, unknown>;

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VII.1: POST-REVISION CITATION CHECK

Phase VIII revisions may have added NEW citations not in original bank.
Your task is to verify any new citations added during revision.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VII.1",
  "newCitationsFound": [
    {
      "citation": "string",
      "addedIn": "which section",
      "verification": "verified|needs_check|suspicious",
      "notes": "string"
    }
  ],
  "totalNewCitations": number,
  "allVerified": true|false
}`;

    const userMessage = `Check new citations from revision:

REVISED MOTION (Phase VIII):
${JSON.stringify(phaseVIIIOutput, null, 2)}

Verify any new citations. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('VII.1', input.tier),
      max_tokens: 64000, // Phase VII.1: Revision implementation
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'VII.1';

    return {
      success: true,
      phase: 'VII.1',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'VII', // Return to judge for regrade
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'VII.1',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase VII.1 failed',
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// PHASE VIII: Revisions
// ============================================================================

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

    console.log(`[Phase VIII] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VIII] Phase VII keys: ${Object.keys(phaseVIIOutput).join(', ') || 'EMPTY'}`);

    // Safe extraction of evaluation with multiple fallback paths
    const evaluation = (phaseVIIOutput?.evaluation ?? phaseVIIOutput?.judgeSimulation ?? phaseVIIOutput ?? {}) as Record<string, unknown>;

    // Safe property access with defaults
    const weaknesses = (evaluation?.weaknesses ?? evaluation?.concerns ?? []) as unknown[];
    const specificFeedback = (evaluation?.specificFeedback ?? evaluation?.feedback ?? evaluation?.notes ?? 'No specific feedback provided') as string;
    const revisionSuggestions = (evaluation?.revisionSuggestions ?? evaluation?.recommendations ?? evaluation?.suggestions ?? []) as unknown[];

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
    // Build attorney signature block for revisions
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
${input.firmCity}, ${input.firmState} ${input.firmZip}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}`.trim();

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

${citationEnforcementVIII}

${PHASE_PROMPTS.PHASE_VIII}

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
    "certificateOfService": "[CERTIFICATE OF SERVICE - to be completed with service details]",
    "signature": "[ATTORNEY SIGNATURE BLOCK - to be signed]"
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
${input.attorneyName}
Bar Roll No. ${input.barNumber}
${input.firmName}
${input.firmAddress}
${input.firmCity}, ${input.firmState} ${input.firmZip}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}

═══════════════════════════════════════════════════════════════
ORIGINAL DRAFT (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

JUDGE EVALUATION (Phase VII):
${JSON.stringify(phaseVIIOutput, null, 2)}

Address all weaknesses and revision suggestions. KEEP THE EXACT ATTORNEY INFO in the signature block. Provide as JSON.`;

    const requestParams: Anthropic.MessageCreateParams = {
      model: getModelForPhase('VIII', input.tier),
      max_tokens: 64000, // Phase VIII: Final draft with 8K thinking (Opus for B/C)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    // Add extended thinking if applicable (cast through unknown to satisfy TypeScript)
    if (thinkingBudget) {
      (requestParams as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      };
    }

    const response = await createMessageWithStreaming(client, requestParams) as Anthropic.Message;

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'VIII';

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
      console.log('[Phase VIII] ⚠️ UNAUTHORIZED CITATIONS DETECTED IN REVISION');
      console.log('[Phase VIII] Unauthorized citations:', validationResultVIII.unauthorizedCitations);

      // Strip unauthorized citations
      console.log('[Phase VIII] Stripping unauthorized citations from revised draft...');

      if (phaseOutput.revisedMotion && typeof phaseOutput.revisedMotion === 'object') {
        for (const key of Object.keys(phaseOutput.revisedMotion)) {
          const value = (phaseOutput.revisedMotion as Record<string, unknown>)[key];
          if (typeof value === 'string' && value.length > 100) {
            (phaseOutput.revisedMotion as Record<string, unknown>)[key] = stripUnauthorizedCitations(
              value,
              validationResultVIII.unauthorizedCitations
            );
          }
        }
      }

      citationValidationDataVIII.strippedCitations = validationResultVIII.unauthorizedCitations;
      console.log('[Phase VIII] ✅ Unauthorized citations stripped from revision');
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


    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VIII.5: CAPTION VALIDATION

Your task is to verify caption consistency:
1. Case number matches across all sections
2. Party names spelled consistently
3. Court name correct for jurisdiction
4. Caption format matches local rules
5. All required caption elements present

DO NOT modify the motion. Only validate captions.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VIII.5",
  "captionValidation": {
    "caseNumberConsistent": true|false,
    "partyNamesConsistent": true|false,
    "courtNameCorrect": true|false,
    "formatCompliant": true|false,
    "allElementsPresent": true|false
  },
  "issues": [
    { "issue": "string", "location": "string", "fix": "string" }
  ],
  "overallStatus": "valid|needs_correction"
}`;

    const userMessage = `Validate caption consistency:

MOTION:
${JSON.stringify(motionToCheck, null, 2)}

CASE NUMBER: ${input.caseNumber}
CASE CAPTION: ${input.caseCaption}
JURISDICTION: ${input.jurisdiction}

Validate captions. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('VIII.5', input.tier),
      max_tokens: 64000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'VIII.5';

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

    // Safe motion extraction with multiple fallback paths
    const finalMotion = phaseVIIIOutput?.revisedMotion ?? phaseVOutput?.draftMotion ?? phaseVOutput ?? {};
    console.log(`[Phase IX] Final motion source: ${phaseVIIIOutput?.revisedMotion ? 'Phase VIII (revised)' : 'Phase V (original)'}`);
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
${input.firmCity}, ${input.firmState} ${input.firmZip}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}`.trim();

    const todayDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE IX: SUPPORTING DOCUMENTS

Your task is to generate supporting documents:
1. Proposed Order (for judge to sign if motion granted)
2. Certificate of Service (WITH EXACT ATTORNEY INFO - see below)
3. Declaration/Affidavit outline (if needed)
4. Exhibit list (if applicable)

═══════════════════════════════════════════════════════════════════════════════
CRITICAL: ATTORNEY INFO FOR CERTIFICATE OF SERVICE
═══════════════════════════════════════════════════════════════════════════════

${signatureBlock}

The Certificate of Service MUST include this EXACT signature block.
DO NOT use [ATTORNEY NAME] or similar placeholders.
═══════════════════════════════════════════════════════════════════════════════

CERTIFICATE OF SERVICE FORMAT:

CERTIFICATE OF SERVICE

I hereby certify that a true and correct copy of the foregoing [MOTION TYPE] has been served upon all counsel of record by [electronic mail/United States Mail/hand delivery] on this date.

[OPPOSING COUNSEL INFO - may use placeholder for opposing counsel only]

Dated: ${todayDate}

${signatureBlock}

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "IX",
  "supportingDocuments": {
    "proposedOrder": {
      "title": "PROPOSED ORDER",
      "content": "full proposed order text"
    },
    "certificateOfService": {
      "title": "CERTIFICATE OF SERVICE",
      "content": "full COS text with REAL attorney signature - NO PLACEHOLDERS for our attorney"
    },
    "declarationOutline": {
      "needed": true|false,
      "declarant": "string",
      "keyPoints": ["point1", "point2"]
    },
    "exhibitList": {
      "needed": true|false,
      "exhibits": [
        { "number": "A", "description": "string" }
      ]
    }
  }
}`;

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
${input.firmCity}, ${input.firmState} ${input.firmZip}
${input.firmPhone}
${input.firmEmail}
Attorney for ${getRepresentedPartyName()}

═══════════════════════════════════════════════════════════════
MOTION:
${JSON.stringify(finalMotion, null, 2)}

Generate supporting documents. The Certificate of Service MUST include the exact attorney signature block shown above. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('IX', input.tier),
      max_tokens: 64000, // Phase IX: Document formatting and assembly
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'IX';

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

// ============================================================================
// PHASE IX.1: Separate Statement Check (MSJ/MSA only)
// ============================================================================

async function executePhaseIX1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase IX.1] ========== STARTING PHASE IX.1 (SEPARATE STATEMENT CHECK) ==========`);

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase IX.1] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction with defaults
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;

    console.log(`[Phase IX.1] Phase IV keys: ${Object.keys(phaseIVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase IX.1] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);


    // Determine jurisdiction-specific rules
    const isLouisiana = input.jurisdiction === 'la_state' || input.jurisdiction?.toLowerCase().includes('louisiana');
    const isCalifornia = input.jurisdiction === 'ca_state' || input.jurisdiction?.toLowerCase().includes('california');
    const formatRules = isCalifornia
      ? 'CRC 3.1350 (California Rules of Court)'
      : isLouisiana
        ? 'Louisiana Code of Civil Procedure'
        : 'applicable local rules';

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE IX.1: SEPARATE STATEMENT CHECK (MSJ/MSA)

For Motion for Summary Judgment, verify the Separate Statement:
1. Each material fact is numbered
2. Each fact has supporting evidence citation
3. Evidence citations match the citation bank
4. Format complies with ${formatRules}

JURISDICTION: ${input.jurisdiction}

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "IX.1",
  "separateStatementCheck": {
    "factsNumbered": true|false,
    "allFactsSupported": true|false,
    "citationsMatch": true|false,
    "formatCompliant": true|false
  },
  "issues": ["issue1", "issue2"],
  "status": "compliant|needs_correction"
}`;

    const userMessage = `Check Separate Statement for MSJ/MSA:

JURISDICTION: ${input.jurisdiction}
APPLICABLE RULES: ${formatRules}

CITATION BANK (Phase IV):
${JSON.stringify(phaseIVOutput, null, 2)}

MOTION (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

Verify Separate Statement complies with ${formatRules}. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('IX.1', input.tier),
      max_tokens: 64000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'IX.1';

    return {
      success: true,
      phase: 'IX.1',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'X',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      phase: 'IX.1',
      status: 'failed',
      output: null,
      error: error instanceof Error ? error.message : 'Phase IX.1 failed',
      durationMs: Date.now() - start,
    };
  }
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


    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE X: FINAL ASSEMBLY (BLOCKING CHECKPOINT)

Assemble the final motion package and perform final QA checks:

1. Compile final motion document (plain text, ready for Word)
2. Attach supporting documents from Phase IX
3. Final quality checks
4. Generate summary for admin review

This phase triggers CP3 - admin MUST approve before delivery.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "X",
  "finalPackage": {
    "motion": "FULL MOTION TEXT READY FOR FILING",
    "proposedOrder": "FULL PROPOSED ORDER TEXT",
    "certificateOfService": "FULL COS TEXT",
    "exhibitList": "if applicable"
  },
  "qualityChecks": {
    "allSectionsPresent": true|false,
    "citationsVerified": true|false,
    "captionConsistent": true|false,
    "noPlaceholders": true|false,
    "wordCount": number,
    "pageEstimate": number
  },
  "adminSummary": {
    "motionType": "${input.motionType}",
    "caseCaption": "${input.caseCaption}",
    "finalGrade": "from Phase VII",
    "revisionLoops": number,
    "keyStrengths": ["strength1"],
    "notesForAdmin": "any important notes"
  },
  "readyForDelivery": true|false,
  "blockingReason": "if not ready, why"
}`;

    const userMessage = `Assemble final package:

FINAL MOTION:
${JSON.stringify(finalMotion, null, 2)}

JUDGE EVALUATION:
${JSON.stringify(evaluation, null, 2)}

SUPPORTING DOCUMENTS (Phase IX):
${JSON.stringify(phaseIXOutput, null, 2)}

Assemble and check. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('X', input.tier),
      max_tokens: 64000, // Phase X: Final QA and deliverables - full output needed
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    phaseOutput.phaseComplete = 'X';

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

    // If placeholders detected, block delivery
    if (!placeholderValidation.valid && placeholderValidation.severity === 'blocking') {
      console.error(`[Phase X] BLOCKING: Motion contains placeholders - cannot deliver`);

      // Generate revision instructions
      const revisionInstructions = generateRevisionInstructions(placeholderValidation);

      return {
        success: true, // Phase ran successfully, but motion needs revision
        phase: 'X',
        status: 'blocked', // Blocked by placeholder validation
        output: {
          ...phaseOutput,
          readyForDelivery: false,
          blockingReason: 'PLACEHOLDER_DETECTED',
          placeholderValidation,
          revisionInstructions,
          adminSummary: {
            ...(phaseOutput.adminSummary || {}),
            notesForAdmin: `CRITICAL: Motion contains ${placeholderValidation.placeholders.length} placeholder(s) and ${placeholderValidation.genericNames.length} generic name(s). Requires revision before delivery. Placeholders: ${placeholderValidation.placeholders.concat(placeholderValidation.genericNames).join(', ')}`,
          },
        },
        requiresReview: true,
        gapsDetected: placeholderValidation.placeholders.length + placeholderValidation.genericNames.length,
        tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        durationMs: Date.now() - start,
      };
    }

    // Motion passed validation - ready for admin review
    console.log(`[Phase X] Motion passed placeholder validation - ready for CP3 approval`);

    // =========================================================================
    // ADD CITATION METADATA TO FINAL OUTPUT - Citation Viewer Feature
    // =========================================================================
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    const caseCitationBank = (phaseIVOutput?.caseCitationBank || []) as Array<{
      caseName?: string;
      citation?: string;
      courtlistener_id?: number;
      court?: string;
      date_filed?: string;
      authorityLevel?: string;
    }>;
    const statutoryCitationBank = (phaseIVOutput?.statutoryCitationBank || []) as Array<{
      citation?: string;
      name?: string;
    }>;
    const citationsSaved = (phaseVOutput?.citationsSaved || {}) as Record<string, unknown>;

    // Build citation metadata for the final package
    const citationMetadata = {
      totalCitations: caseCitationBank.length + statutoryCitationBank.length,
      caseCitations: caseCitationBank.length,
      statutoryCitations: statutoryCitationBank.length,
      bindingAuthority: caseCitationBank.filter(c => c.authorityLevel === 'binding').length,
      persuasiveAuthority: caseCitationBank.filter(c => c.authorityLevel === 'persuasive').length,
      verifiedViaCourtListener: caseCitationBank.filter(c => c.courtlistener_id).length,
      savedToDatabase: citationsSaved?.total || 0,
      // Include citation list for quick reference
      citationList: caseCitationBank.slice(0, 20).map(c => ({
        caseName: c.caseName,
        citation: c.citation,
        court: c.court,
        dateFiled: c.date_filed,
        opinionId: c.courtlistener_id?.toString(),
      })),
    };

    console.log(`[Phase X] Citation metadata: ${citationMetadata.totalCitations} total citations`);

    return {
      success: true,
      phase: 'X',
      status: 'requires_review', // Always requires admin approval
      output: {
        ...phaseOutput,
        readyForDelivery: true,
        placeholderValidation,
        citationMetadata, // Citation Viewer Feature
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

  return result;
}
