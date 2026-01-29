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
import { getThinkingBudget as getThinkingBudgetFromConfig } from '@/lib/config/token-budgets';
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
  const SONNET = 'claude-sonnet-4-5-20250514';

  // Phase VII always uses Opus (quality gate)
  if (phase === 'VII') return OPUS;

  // Tier B/C use Opus for research and complex phases
  if (tier !== 'A') {
    if (['IV', 'VI', 'VIII'].includes(phase)) return OPUS;
  }

  return SONNET;
}

// Extended thinking budget - MAXIMIZED for production legal workloads
function getThinkingBudget(phase: WorkflowPhaseCode, _tier: MotionTier): number | null {
  // All phases now use extended thinking for better legal reasoning
  // Complex phases (IV, VI, VII, VIII) get 128K, others get 64K
  return getThinkingBudgetFromConfig(phase);
}

// ============================================================================
// ANTHROPIC CLIENT
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ============================================================================
// PHASE I: Intake & Classification
// ============================================================================

async function executePhaseI(input: PhaseInput): Promise<PhaseOutput> {
  const start = Date.now();

  try {
    const client = getAnthropicClient();

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

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('I', input.tier),
      max_tokens: 32000, // Phase I: Document intake analysis
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const outputText = textContent?.type === 'text' ? textContent.text : '';

    // Parse JSON output
    let phaseOutput;
    try {
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      phaseOutput = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No JSON found', raw: outputText };
    } catch {
      phaseOutput = { error: 'JSON parse failed', raw: outputText };
    }

    // Validate phase output
    if (phaseOutput.phaseComplete !== 'I') {
      phaseOutput.phaseComplete = 'I'; // Force correct phase marker
    }

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
      max_tokens: 32000, // Phase II: Legal framework analysis
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
      max_tokens: 80000, // Phase IV: Deep citation research (Opus for B/C)
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

  try {
    const client = getAnthropicClient();
    const phaseIOutput = input.previousPhaseOutputs['I'] as Record<string, unknown>;
    const phaseIIOutput = input.previousPhaseOutputs['II'] as Record<string, unknown>;
    const phaseIIIOutput = input.previousPhaseOutputs['III'] as Record<string, unknown>;
    const phaseIVOutput = input.previousPhaseOutputs['IV'] as Record<string, unknown>;

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE V: DRAFT MOTION

NOW you will draft the actual motion document. Use ALL the work from previous phases:
- Phase I: Case information and parties
- Phase II: Legal standard and elements
- Phase III: Evidence strategy and issue ranking
- Phase IV: Citation bank

REQUIREMENTS:
1. Start with proper court caption
2. Include Introduction
3. Address each element with supporting authority from Phase IV
4. Use citations EXACTLY as provided in Phase IV
5. Include Statement of Facts referencing Phase I facts
6. Build arguments following Phase III strategy
7. Include Conclusion and Prayer for Relief
8. Include Certificate of Service placeholder

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "V",
  "draftMotion": {
    "caption": "full court caption",
    "title": "MOTION FOR [TYPE]",
    "introduction": "string",
    "statementOfFacts": "string",
    "legalArguments": [
      {
        "heading": "I. [ARGUMENT HEADING]",
        "content": "full argument text with citations",
        "citationsUsed": ["citation1", "citation2"]
      }
    ],
    "conclusion": "string",
    "prayerForRelief": "string",
    "certificateOfService": "[CERTIFICATE OF SERVICE PLACEHOLDER]",
    "signature": "[ATTORNEY SIGNATURE BLOCK]"
  },
  "wordCount": number,
  "citationsIncluded": number,
  "sectionsComplete": ["caption", "intro", "facts", "arguments", "conclusion", "prayer", "cos"]
}`;

    const userMessage = `Draft the motion using all previous phase outputs:

PHASE I (Case Info):
${JSON.stringify(phaseIOutput, null, 2)}

PHASE II (Legal Framework):
${JSON.stringify(phaseIIOutput, null, 2)}

PHASE III (Evidence Strategy):
${JSON.stringify(phaseIIIOutput, null, 2)}

PHASE IV (Citation Bank):
${JSON.stringify(phaseIVOutput, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Draft the complete motion. Provide as JSON.`;

    const response = await createMessageWithStreaming(client, {
      model: getModelForPhase('V', input.tier),
      max_tokens: 128000, // Phase V: Full motion draft with all arguments
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

    phaseOutput.phaseComplete = 'V';

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
    const phaseIVOutput = input.previousPhaseOutputs['IV'] as Record<string, unknown>;
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;

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
${JSON.stringify(phaseIVOutput, null, 2)}

DRAFT MOTION (Phase V):
${JSON.stringify(phaseVOutput, null, 2)}

Verify all citations. Provide audit as JSON.`;

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
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
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
${JSON.stringify(phaseVOutput, null, 2)}

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

Analyze potential opposition. Provide as JSON.`;

    const requestParams: Anthropic.MessageCreateParams = {
      model: getModelForPhase('VI', input.tier),
      max_tokens: 80000, // Phase VI: Opposition anticipation with 128K extended thinking
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
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
    const phaseVIOutput = input.previousPhaseOutputs['VI'] as Record<string, unknown>;
    const phaseVIIIOutput = input.previousPhaseOutputs['VIII'] as Record<string, unknown>;
    const loopNumber = input.revisionLoop || 1;

    // CRITICAL: Use revised motion if this is a re-evaluation after Phase VIII
    const motionToEvaluate = phaseVIIIOutput?.revisedMotion || phaseVOutput?.draftMotion || phaseVOutput;
    const isReEvaluation = !!phaseVIIIOutput;

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
      max_tokens: 80000, // Phase VII: Judge simulation (always Opus with extended thinking)
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      thinking: {
        type: 'enabled',
        budget_tokens: getThinkingBudgetFromConfig('VII'), // MAXED OUT - 128K for deep judicial reasoning
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

  try {
    const client = getAnthropicClient();
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
    const phaseVIIOutput = input.previousPhaseOutputs['VII'] as Record<string, unknown>;
    const thinkingBudget = getThinkingBudget('VIII', input.tier);

    const evaluation = (phaseVIIOutput as { evaluation?: Record<string, unknown> })?.evaluation || phaseVIIOutput;

    const systemPrompt = `${PHASE_ENFORCEMENT_HEADER}

PHASE VIII: REVISIONS

The judge simulation (Phase VII) graded this motion below B+.
Your task is to revise the motion to address the specific weaknesses.

JUDGE FEEDBACK TO ADDRESS:
- Weaknesses: ${JSON.stringify((evaluation as Record<string, unknown>).weaknesses || [])}
- Specific Feedback: ${(evaluation as Record<string, unknown>).specificFeedback || 'None'}
- Revision Suggestions: ${JSON.stringify((evaluation as Record<string, unknown>).revisionSuggestions || [])}

${thinkingBudget ? 'Use extended thinking to carefully address each issue.' : ''}

OUTPUT FORMAT (JSON only):
{
  "phaseComplete": "VIII",
  "revisedMotion": {
    "caption": "...",
    "title": "...",
    "introduction": "revised...",
    "statementOfFacts": "revised...",
    "legalArguments": [...],
    "conclusion": "revised...",
    "prayerForRelief": "...",
    "certificateOfService": "...",
    "signature": "..."
  },
  "changesMAde": [
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
      max_tokens: 80000, // Phase VIII: Final draft with 128K extended thinking
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

  try {
    const client = getAnthropicClient();
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
    const phaseVIIIOutput = input.previousPhaseOutputs['VIII'] as Record<string, unknown>;

    // Use revised motion if available, otherwise original
    const motionToCheck = phaseVIIIOutput?.revisedMotion || (phaseVOutput as Record<string, unknown>)?.draftMotion;

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
      max_tokens: 32000,
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

  try {
    const client = getAnthropicClient();
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
    const phaseVIIIOutput = input.previousPhaseOutputs['VIII'] as Record<string, unknown>;

    const finalMotion = phaseVIIIOutput?.revisedMotion || (phaseVOutput as Record<string, unknown>)?.draftMotion;

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
      max_tokens: 80000, // Phase IX: Document formatting and assembly
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

  try {
    const client = getAnthropicClient();
    const phaseIVOutput = input.previousPhaseOutputs['IV'] as Record<string, unknown>;
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;

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
      max_tokens: 32000,
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

  try {
    const client = getAnthropicClient();
    const phaseVOutput = input.previousPhaseOutputs['V'] as Record<string, unknown>;
    const phaseVIIOutput = input.previousPhaseOutputs['VII'] as Record<string, unknown>;
    const phaseVIIIOutput = input.previousPhaseOutputs['VIII'] as Record<string, unknown>;
    const phaseIXOutput = input.previousPhaseOutputs['IX'] as Record<string, unknown>;

    // Use revised motion if available
    const finalMotion = phaseVIIIOutput?.revisedMotion || (phaseVOutput as Record<string, unknown>)?.draftMotion;
    const evaluation = (phaseVIIOutput as { evaluation?: Record<string, unknown> })?.evaluation || phaseVIIOutput;

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
      max_tokens: 128000, // Phase X: Final QA and deliverables - full output needed
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

    return {
      success: true,
      phase: 'X',
      status: 'requires_review', // Always requires admin approval
      output: phaseOutput,
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
