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
  statementOfFacts: string;
  proceduralHistory: string;
  instructions: string;
  previousPhaseOutputs: Record<WorkflowPhaseCode, unknown>;
  documents?: string[];
  revisionLoop?: number;
  // Extended case data for complete motion generation
  courtDivision?: string;
  filingDeadline?: string;
  parties?: Array<{ name: string; role: string }>;
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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE III: EVIDENCE STRATEGY / ISSUE IDENTIFICATION

Your task is to:
1. Map available evidence to each legal element from Phase II
2. Identify evidence GAPS that could weaken the motion
3. Determine which issues are strongest vs weakest
4. Flag any HOLD conditions (critical missing evidence)
5. Prioritize issues for argument structure

DO NOT draft any motion language. Only analyze evidence and issues.

If critical evidence is missing, set "holdRequired": true

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "III",
  "evidenceMapping": [
    {
      "element": "string (from Phase II)",
      "availableEvidence": ["evidence1", "evidence2"],
      "evidenceStrength": "strong|moderate|weak|none",
      "gaps": ["gap1", "gap2"]
    }
  ],
  "issueRanking": [
    {
      "issue": "string",
      "strength": 1-10,
      "strategy": "lead|support|defensive|omit",
      "reason": "string"
    }
  ],
  "criticalGaps": [
    {
      "gap": "string",
      "impact": "fatal|significant|minor",
      "resolution": "string"
    }
  ],
  "holdRequired": false,
  "holdReason": "string|null",
  "recommendedApproach": "string"
}`;

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
// PHASE IV: Authority Research (CP1)
// ============================================================================

async function executePhaseIV(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;
    const phaseIIIOutput = input.previousPhaseOutputs['III'] as Record<string, unknown>;

    // Determine citation targets based on tier
    const citationTarget = input.tier === 'C' ? 20 : input.tier === 'B' ? 12 : 6;

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE IV: AUTHORITY RESEARCH

Your task is to:
1. Identify ${citationTarget}+ relevant legal authorities for this motion
2. For each authority, provide the EXACT citation in Bluebook format
3. Explain what proposition each authority supports
4. Distinguish between binding and persuasive authority
5. Build both CASE and STATUTORY authority banks

CRITICAL: Only cite REAL cases and statutes. Do not hallucinate citations.
If you're unsure about a citation, mark it as "needs_verification": true

DO NOT draft any motion language. Only research and compile authorities.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "IV",
  "caseCitationBank": [
    {
      "citation": "exact Bluebook citation",
      "caseName": "string",
      "court": "string",
      "year": number,
      "proposition": "what this case stands for",
      "relevantHolding": "key holding text",
      "authorityLevel": "binding|persuasive",
      "forElement": "which element this supports",
      "needs_verification": false
    }
  ],
  "statutoryCitationBank": [
    {
      "citation": "exact citation",
      "name": "statute/rule name",
      "relevantText": "key text",
      "purpose": "how this supports the motion"
    }
  ],
  "totalCitations": number,
  "bindingCount": number,
  "persuasiveCount": number,
  "gapsInAuthority": ["areas needing more research"]
}`;

    const userMessage = `Research authorities for Phase IV:

LEGAL FRAMEWORK (Phase II):
${JSON.stringify(phaseIIOutput, null, 2)}

ISSUE RANKING (Phase III):
${JSON.stringify(phaseIIIOutput, null, 2)}

JURISDICTION: ${input.jurisdiction}
MOTION TYPE: ${input.motionType}

Find at least ${citationTarget} relevant authorities. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('IV', input.tier),
      max_tokens: 64000, // Phase IV: Deep citation research (Opus for B/C)
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

    phaseOutput.phaseComplete = 'IV';

    return {
      success: true,
      phase: 'IV',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'V',
      requiresReview: true, // CP1: Notify admin research is complete
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
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
// PHASE V: Draft Motion
// ============================================================================

async function executePhaseV(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();
  console.log(`[Phase V] ========== STARTING PHASE V (DRAFT MOTION) ==========`);
  console.log(`[Phase V] Order: ${input.orderId}, Tier: ${input.tier}`);

  try {
    console.log(`[Phase V] Getting Anthropic client...`);
    const client = getAnthropicClient();
    console.log(`[Phase V] Anthropic client ready`);

    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;
    const phaseIIIOutput = input.previousPhaseOutputs['III'] as Record<string, unknown>;
    const phaseIVOutput = input.previousPhaseOutputs['IV'] as Record<string, unknown>;

    // Validate we have outputs from previous phases
    console.log(`[Phase V] Phase I output exists: ${!!phaseIOutput}`);
    console.log(`[Phase V] Phase II output exists: ${!!phaseIIOutput}`);
    console.log(`[Phase V] Phase III output exists: ${!!phaseIIIOutput}`);
    console.log(`[Phase V] Phase IV output exists: ${!!phaseIVOutput}`);

    // Extract case data from Phase I output or use input fallbacks
    const phaseIClassification = (phaseIOutput?.classification ?? {}) as Record<string, unknown>;
    const phaseICaseIdentifiers = (phaseIOutput?.caseIdentifiers ?? {}) as Record<string, unknown>;
    const phaseIParties = (phaseIOutput?.parties ?? {}) as Record<string, unknown>;

    // Build parties string from input
    const partiesText = input.parties && input.parties.length > 0
      ? input.parties.map(p => `  - ${p.name} (${p.role})`).join('\n')
      : '  [Parties not specified in order]';

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE V: DRAFT MOTION

NOW you will draft the actual motion document. Use ALL the work from previous phases:
- Phase I: Case information and parties
- Phase II: Legal standard and elements
- Phase III: Evidence strategy and issue ranking
- Phase IV: Citation bank

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
#  ABSOLUTE REQUIREMENTS                                                        #
################################################################################

1. Start with proper court caption using EXACT case number and caption above
2. Use the REAL party names - do NOT use "John Doe" or "Jane Smith"
3. Include Introduction
4. Address each element with supporting authority from Phase IV
5. Use citations EXACTLY as provided in Phase IV citation banks
6. Include Statement of Facts using the CLIENT-PROVIDED facts above
7. Build arguments following Phase III strategy
8. Include Conclusion and Prayer for Relief
9. Include Certificate of Service placeholder

CRITICAL PLACEHOLDER PROHIBITION:
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
    "certificateOfService": "[CERTIFICATE OF SERVICE - to be completed with service details]",
    "signature": "[ATTORNEY SIGNATURE BLOCK - to be signed]"
  },
  "wordCount": number,
  "citationsIncluded": number,
  "sectionsComplete": ["caption", "intro", "facts", "arguments", "conclusion", "prayer", "cos"],
  "missingDataFlags": ["list any critical data that was missing"]
}`;

    const userMessage = `Draft the motion using all previous phase outputs AND the case data provided in the system prompt:

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

    // Parse JSON output
    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[Phase V] No JSON found in Claude response`);
        console.error(`[Phase V] Response preview: ${outputText.substring(0, 500)}...`);
        return {
          success: false,
          phase: 'V',
          status: 'failed',
          output: { raw: outputText },
          error: 'Claude did not return valid JSON for motion draft. Response may need manual review.',
          durationMs: Date.now() - start,
        };
      }
      phaseOutput = JSON.parse(jsonMatch[0]);
      console.log(`[Phase V] Successfully parsed JSON output`);
    } catch (parseError) {
      console.error(`[Phase V] JSON parse failed:`, parseError);
      console.error(`[Phase V] Response preview: ${outputText.substring(0, 500)}...`);
      return {
        success: false,
        phase: 'V',
        status: 'failed',
        output: { raw: outputText },
        error: `Failed to parse motion draft as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        durationMs: Date.now() - start,
      };
    }

    // Validate motion draft has expected structure
    if (!phaseOutput.draftMotion) {
      console.error(`[Phase V] Output missing draftMotion field`);
      console.error(`[Phase V] Output keys: ${Object.keys(phaseOutput).join(', ')}`);
      return {
        success: false,
        phase: 'V',
        status: 'failed',
        output: phaseOutput,
        error: 'Claude response missing draftMotion field. Motion draft incomplete.',
        durationMs: Date.now() - start,
      };
    }

    phaseOutput.phaseComplete = 'V';

    console.log(`[Phase V] ========== PHASE V COMPLETE ==========`);
    console.log(`[Phase V] Total duration: ${Date.now() - start}ms`);
    console.log(`[Phase V] Motion word count: ${phaseOutput.wordCount || 'N/A'}`);

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
// PHASE V.1: Citation Accuracy Check
// ============================================================================

async function executePhaseV1(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();

    // Defensive: Log available phase outputs
    const availablePhases = Object.keys(input.previousPhaseOutputs ?? {});
    console.log(`[Phase V.1] Available previous phase outputs: ${availablePhases.join(', ') || 'NONE'}`);

    // Safe extraction of Phase IV output (citation bank)
    const phaseIVOutput = (input.previousPhaseOutputs?.['IV'] ?? {}) as Record<string, unknown>;
    console.log(`[Phase V.1] Phase IV keys: ${Object.keys(phaseIVOutput).join(', ') || 'EMPTY'}`);

    // Extract specific citation banks from Phase IV
    const caseCitationBank = (phaseIVOutput?.caseCitationBank ?? []) as unknown[];
    const statutoryCitationBank = (phaseIVOutput?.statutoryCitationBank ?? []) as unknown[];
    const allCitations = [...caseCitationBank, ...statutoryCitationBank];
    console.log(`[Phase V.1] Citation bank: ${caseCitationBank.length} case citations, ${statutoryCitationBank.length} statutory citations`);

    // Safe extraction of Phase V output (draft motion)
    const phaseVOutput = (input.previousPhaseOutputs?.['V'] ?? {}) as Record<string, unknown>;
    console.log(`[Phase V.1] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);

    // Extract draftMotion from Phase V
    const draftMotion = phaseVOutput?.draftMotion ?? phaseVOutput;
    console.log(`[Phase V.1] Draft motion exists: ${!!draftMotion}, keys: ${Object.keys(draftMotion as Record<string, unknown>).join(', ') || 'EMPTY'}`);

    // Check if we have required data
    if (allCitations.length === 0) {
      console.warn(`[Phase V.1] WARNING: No citations found in Phase IV output`);
    }
    if (!draftMotion || Object.keys(draftMotion as Record<string, unknown>).length === 0) {
      console.warn(`[Phase V.1] WARNING: No draft motion found in Phase V output`);
    }

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE V.1: CITATION ACCURACY CHECK

Your task is to:
1. Verify every citation in the draft matches the citation bank from Phase IV
2. Check that citations are used for the correct propositions
3. Verify Bluebook formatting is correct
4. Identify any citations in the draft NOT from the citation bank (flag as suspicious)
5. Check pinpoint page references are appropriate

DO NOT modify the motion. Only audit citations.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "V.1",
  "citationAudit": [
    {
      "citationInDraft": "string",
      "matchInBank": true|false,
      "formatCorrect": true|false,
      "usedForCorrectProposition": true|false,
      "issues": ["issue1", "issue2"]
    }
  ],
  "suspiciousCitations": ["citations not in bank"],
  "formattingErrors": ["error1", "error2"],
  "totalChecked": number,
  "passRate": "percentage",
  "overallStatus": "pass|needs_correction"
}`;

    const userMessage = `Audit citations for Phase V.1:

CITATION BANK (Phase IV):
Case Citations (${caseCitationBank.length}):
${JSON.stringify(caseCitationBank, null, 2)}

Statutory Citations (${statutoryCitationBank.length}):
${JSON.stringify(statutoryCitationBank, null, 2)}

DRAFT MOTION (Phase V):
${JSON.stringify(draftMotion, null, 2)}

Total citations to verify: ${allCitations.length}
Verify all citations in the draft match the citation bank. Provide audit as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('V.1', input.tier),
      max_tokens: 64000, // Phase V.1: Citation accuracy verification
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

    phaseOutput.phaseComplete = 'V.1';

    return {
      success: true,
      phase: 'V.1',
      status: 'completed',
      output: phaseOutput,
      nextPhase: 'VI',
      tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      durationMs: Date.now() - start,
    };
  } catch (error) {
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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VI: OPPOSITION ANTICIPATION

Your task is to:
1. Predict the strongest arguments the opposing party will make
2. Identify weaknesses in our motion they will exploit
3. Prepare counter-arguments for each anticipated opposition point
4. Suggest preemptive language to add to the motion
5. Rate the likelihood and severity of each opposition argument

${thinkingBudget ? 'Use extended thinking to deeply analyze potential opposition strategies.' : ''}

DO NOT rewrite the motion. Only analyze opposition strategy.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VI",
  "anticipatedOpposition": [
    {
      "argument": "string",
      "likelihood": "high|medium|low",
      "severity": "fatal|significant|minor",
      "ourWeakness": "what they'll attack",
      "counterArgument": "our response",
      "preemptiveLanguage": "suggested addition to motion"
    }
  ],
  "overallVulnerability": "low|medium|high",
  "recommendedStrengthening": ["suggestion1", "suggestion2"],
  "motionStrengths": ["strength1", "strength2"]
}`;

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

    console.log(`[Phase VII] Phase V keys: ${Object.keys(phaseVOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VII] Phase VI keys: ${Object.keys(phaseVIOutput).join(', ') || 'EMPTY'}`);
    console.log(`[Phase VII] Phase VIII exists: ${!!phaseVIIIOutput}`);
    console.log(`[Phase VII] Loop number: ${loopNumber}`);

    // CRITICAL: Use revised motion if this is a re-evaluation after Phase VIII
    const motionToEvaluate = phaseVIIIOutput?.revisedMotion || phaseVOutput?.draftMotion || phaseVOutput;
    const isReEvaluation = !!phaseVIIIOutput?.revisedMotion;
    console.log(`[Phase VII] Motion source: ${phaseVIIIOutput?.revisedMotion ? 'Phase VIII (revised)' : phaseVOutput?.draftMotion ? 'Phase V (draftMotion)' : 'Phase V (raw)'}`);
    console.log(`[Phase VII] Is re-evaluation: ${isReEvaluation}`);

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VII: JUDGE SIMULATION (QUALITY GATE)

You are an experienced ${input.jurisdiction} judge evaluating this motion.
Use extended thinking to thoroughly analyze before grading.

${isReEvaluation ? `**RE-EVALUATION**: This is revision loop ${loopNumber}. You are evaluating the REVISED motion after Phase VIII corrections.` : `This is the initial evaluation.`}

GRADING CRITERIA:
1. Legal soundness (are arguments legally correct?)
2. Citation quality (real cases used appropriately?)
3. Organization and clarity
4. Persuasiveness
5. Procedural compliance
6. Anticipation of opposition

GRADE SCALE:
- A+ (4.3): Exceptional, would likely grant
- A (4.0): Excellent, strong motion
- A- (3.7): Very good
- B+ (3.3): MINIMUM ACCEPTABLE - Good, competent motion
- B (3.0): Below standard, needs work
- B- (2.7): Significant issues
- C or below: Major problems

If grade < B+, this motion will go through ${isReEvaluation ? 'another' : ''} revision (Phase VIII).
This is revision loop ${loopNumber} of max 3.

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VII",
  "evaluation": {
    "grade": "A+|A|A-|B+|B|B-|C+|C|D|F",
    "numericGrade": 0.0-4.3,
    "passes": true|false,
    "criteria": {
      "legalSoundness": { "score": 1-10, "notes": "string" },
      "citationQuality": { "score": 1-10, "notes": "string" },
      "organization": { "score": 1-10, "notes": "string" },
      "persuasiveness": { "score": 1-10, "notes": "string" },
      "proceduralCompliance": { "score": 1-10, "notes": "string" },
      "oppositionAnticipation": { "score": 1-10, "notes": "string" }
    },
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"],
    "specificFeedback": "detailed feedback",
    "revisionSuggestions": ["if grade < B+, specific fixes"],
    "loopNumber": ${loopNumber},
    "isReEvaluation": ${isReEvaluation}
  }
}`;

    const userMessage = `Evaluate this motion as a judge:

${isReEvaluation ? 'REVISED MOTION (Phase VIII):' : 'DRAFT MOTION (Phase V):'}
${JSON.stringify(motionToEvaluate, null, 2)}

OPPOSITION ANALYSIS (Phase VI):
${JSON.stringify(phaseVIOutput, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Provide your judicial evaluation as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('VII', input.tier), // Always Opus
      max_tokens: 64000, // Phase VII: Judge simulation (always Opus with extended thinking)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      thinking: {
        type: 'enabled',
        budget_tokens: 50000, // MAXED OUT - deep judicial reasoning
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

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VIII: REVISIONS

The judge simulation (Phase VII) graded this motion below B+.
Your task is to revise the motion to address the specific weaknesses.

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

ORIGINAL DRAFT (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

JUDGE EVALUATION (Phase VII):
${JSON.stringify(phaseVIIOutput, null, 2)}

Address all weaknesses and revision suggestions. Provide as JSON.`;

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

    // Check if new citations were added (triggers VII.1)
    const newCitations = phaseOutput.newCitationsAdded === true;

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


    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE IX: SUPPORTING DOCUMENTS

Your task is to generate supporting documents:
1. Proposed Order (for judge to sign if motion granted)
2. Certificate of Service (with placeholders for service details)
3. Declaration/Affidavit outline (if needed)
4. Exhibit list (if applicable)

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
      "content": "full COS text with placeholders"
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

MOTION:
${JSON.stringify(finalMotion, null, 2)}

CASE: ${input.caseCaption}
CASE NUMBER: ${input.caseNumber}
MOTION TYPE: ${input.motionType}

Generate supporting documents. Provide as JSON.`;

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


    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE IX.1: SEPARATE STATEMENT CHECK (MSJ/MSA)

For Motion for Summary Judgment, verify the Separate Statement:
1. Each material fact is numbered
2. Each fact has supporting evidence citation
3. Evidence citations match the citation bank
4. Format complies with CRC 3.1350 (California) or local rules

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

CITATION BANK (Phase IV):
${JSON.stringify(phaseIVOutput, null, 2)}

MOTION (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

Verify Separate Statement. Provide as JSON.`;

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

    return {
      success: true,
      phase: 'X',
      status: 'requires_review', // Always requires admin approval
      output: {
        ...phaseOutput,
        readyForDelivery: true,
        placeholderValidation,
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
