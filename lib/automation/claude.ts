/**
 * Claude API Integration for Motion Granted Automation
 *
 * This module provides a type-safe wrapper around the Anthropic Claude API
 * for use in automated workflow tasks like conflict checking, clerk assignment,
 * QA analysis, and report generation.
 *
 * API keys can be configured via:
 * 1. Database (admin dashboard) - takes priority
 * 2. Environment variables - fallback
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeAnalysisRequest, ClaudeAnalysisResponse } from '@/types/automation';
import { getAnthropicAPIKey } from '@/lib/api-keys';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Environment variable fallback
const envApiKey = process.env.ANTHROPIC_API_KEY;

// Static client for backward compatibility (uses env var)
export const anthropic = envApiKey && !envApiKey.includes('xxxxx')
  ? new Anthropic({ apiKey: envApiKey })
  : null;

export const isClaudeConfigured = !!anthropic || !!envApiKey;

/**
 * Get an Anthropic client with the current API key
 * Checks database first, falls back to environment variable
 */
export async function getAnthropicClient(): Promise<Anthropic | null> {
  try {
    const apiKey = await getAnthropicAPIKey();
    if (apiKey && !apiKey.includes('xxxxx')) {
      return new Anthropic({ apiKey });
    }
  } catch (error) {
    console.error('Error getting Anthropic API key from database:', error);
  }

  // Fall back to static client
  return anthropic;
}

// Default model configuration
// For quick tasks (conflict check, QA, etc.) - use Sonnet 4
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

// For motion generation (use Opus 4.5 for best legal reasoning)
export const MOTION_MODEL = 'claude-opus-4-5-20251101';
export const MOTION_MAX_TOKENS = 64000; // ~50 pages of output
export const MAX_CONTEXT_TOKENS = 180000; // Leave buffer from 200K limit

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

export const SYSTEM_PROMPTS = {
  conflictCheck: `You are a legal conflict checking assistant for Motion Granted, a legal motion drafting service.

Your task is to analyze party names from a new order against historical parties to identify potential conflicts of interest.

IMPORTANT RULES:
1. An exact match is when normalized names are identical
2. A fuzzy match is when names are similar but not identical (e.g., "Smith Industries" vs "Smith Ind. LLC")
3. A related entity match is when entities appear to be related (parent/subsidiary, d/b/a, etc.)
4. Consider common legal entity variations: LLC, Inc, Corp, LP, LLP, d/b/a, f/k/a
5. Watch for name variations: "John Smith" vs "J. Smith", "Smith, John"
6. Pay attention to role context - opposing parties in different cases may be a conflict

Risk Level Guidelines:
- HIGH: Exact match or very high similarity (>0.95) especially between opposing parties
- MEDIUM: Fuzzy match (0.85-0.95) or related entity detection
- LOW: Possible match but low confidence (<0.85)

Always respond with valid JSON matching the expected schema.`,

  clerkAssignment: `You are a work assignment assistant for Motion Granted, a legal motion drafting service.

Your task is to recommend the best clerk to assign to a new order based on:
1. Current workload and capacity
2. Expertise in the specific motion type
3. Available time buffer before the deadline
4. Overall workload balance across the team

SCORING FACTORS (configurable weights):
- Capacity: How much room does the clerk have? (current/max workload)
- Expertise: How experienced is the clerk with this motion type? (1-5 scale)
- Deadline: Does the clerk have time to complete before the deadline?
- Balance: Does assigning this order help balance overall workload?

Consider rush orders carefully - clerks with too many rush orders may become overwhelmed.

Always respond with valid JSON matching the expected schema.`,

  qaAnalysis: `You are a quality assurance assistant for Motion Granted, a legal motion drafting service.

Your task is to analyze a draft legal document and check for:
1. Placeholder text that should have been replaced (INSERT, TBD, TODO, [PLACEHOLDER])
2. Missing or incorrect case caption
3. Formatting issues
4. Incomplete sections
5. Potential errors in legal citations (if detectable)

Severity Levels:
- ERROR: Must be fixed before delivery (placeholders, wrong case info)
- WARNING: Should be reviewed but not blocking (formatting, style)

Always respond with valid JSON matching the expected schema.`,

  reportSummary: `You are a business intelligence assistant for Motion Granted, a legal motion drafting service.

Your task is to analyze operational data and generate concise, actionable summaries.

Focus on:
1. Key metrics and trends
2. Items requiring attention
3. Opportunities for improvement
4. Risk factors

Keep summaries professional and data-driven.`,
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Generic function to call Claude API with structured output
 * Uses API key from database if available, falls back to environment variable
 */
export async function callClaude<T>(
  systemPrompt: string,
  userMessage: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<{ success: boolean; result?: T; error?: string; tokensUsed?: number }> {
  // Get dynamic client (checks database first)
  const client = await getAnthropicClient();
  if (!client) {
    return {
      success: false,
      error: 'Claude API is not configured. Add your Anthropic API key in Admin Settings.',
    };
  }

  const startTime = Date.now();
  const model = options?.model || DEFAULT_MODEL;
  const maxTokens = options?.maxTokens || DEFAULT_MAX_TOKENS;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options?.temperature ?? 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return {
        success: false,
        error: 'No text content in Claude response',
      };
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/```json\n?([\s\S]*?)\n?```/);
    const jsonText = jsonMatch ? jsonMatch[1] : textContent.text;

    try {
      const result = JSON.parse(jsonText.trim()) as T;
      return {
        success: true,
        result,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse Claude response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error calling Claude API';
    console.error('[Claude API Error]', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Simpler helper function to call Claude with a single prompt
 * Returns raw text content rather than parsed JSON
 * Uses API key from database if available, falls back to environment variable
 */
export async function askClaude(options: {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{
  success: boolean;
  result?: { content: string; tokensUsed: number };
  error?: string;
}> {
  // Get dynamic client (checks database first)
  const client = await getAnthropicClient();
  if (!client) {
    return {
      success: false,
      error: 'Claude API is not configured. Add your Anthropic API key in Admin Settings.',
    };
  }

  const model = DEFAULT_MODEL;
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.2,
      system: options.systemPrompt || 'You are a helpful assistant.',
      messages: [
        {
          role: 'user',
          content: options.prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return {
        success: false,
        error: 'No text content in Claude response',
      };
    }

    return {
      success: true,
      result: {
        content: textContent.text,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error calling Claude API';
    console.error('[Claude API Error]', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// CONFLICT CHECKING
// ============================================================================

export interface ConflictAnalysisInput {
  newOrderParties: Array<{
    name: string;
    normalizedName: string;
    role: string;
  }>;
  historicalParties: Array<{
    name: string;
    normalizedName: string;
    role: string;
    orderId: string;
    orderNumber: string;
    caseCaption: string;
    clientId: string;
  }>;
  relatedEntities?: string;
}

export interface ConflictAnalysisOutput {
  hasConflicts: boolean;
  matches: Array<{
    newPartyName: string;
    matchedPartyName: string;
    matchedOrderId: string;
    matchedOrderNumber: string;
    matchedCaseCaption: string;
    matchType: 'exact' | 'fuzzy' | 'related_entity';
    similarityScore: number;
    riskLevel: 'low' | 'medium' | 'high';
    reasoning: string;
  }>;
  recommendation: 'clear' | 'review' | 'reject';
  overallConfidence: number;
  summary: string;
}

export async function analyzeConflicts(
  input: ConflictAnalysisInput
): Promise<{ success: boolean; result?: ConflictAnalysisOutput; error?: string; tokensUsed?: number }> {
  const userMessage = `Analyze the following parties for potential conflicts:

NEW ORDER PARTIES:
${JSON.stringify(input.newOrderParties, null, 2)}

${input.relatedEntities ? `RELATED ENTITIES MENTIONED:\n${input.relatedEntities}\n\n` : ''}
HISTORICAL PARTIES DATABASE:
${JSON.stringify(input.historicalParties, null, 2)}

Please analyze for conflicts and respond with JSON in this format:
{
  "hasConflicts": boolean,
  "matches": [
    {
      "newPartyName": "string",
      "matchedPartyName": "string",
      "matchedOrderId": "string",
      "matchedOrderNumber": "string",
      "matchedCaseCaption": "string",
      "matchType": "exact" | "fuzzy" | "related_entity",
      "similarityScore": number (0-1),
      "riskLevel": "low" | "medium" | "high",
      "reasoning": "string explaining why this is a match"
    }
  ],
  "recommendation": "clear" | "review" | "reject",
  "overallConfidence": number (0-1),
  "summary": "Brief summary of findings"
}`;

  return callClaude<ConflictAnalysisOutput>(SYSTEM_PROMPTS.conflictCheck, userMessage);
}

// ============================================================================
// CLERK ASSIGNMENT
// ============================================================================

export interface ClerkAssignmentInput {
  order: {
    motionType: string;
    motionTier: number;
    jurisdiction: string;
    turnaround: string;
    filingDeadline: string;
    documentCount: number;
  };
  clerks: Array<{
    id: string;
    name: string;
    currentWorkload: number;
    maxWorkload: number;
    availabilityStatus: string;
    expertise: Array<{
      motionType: string;
      expertiseLevel: number;
      ordersCompleted: number;
      avgCompletionDays: number | null;
    }>;
    currentRushOrders: number;
  }>;
  weights: {
    capacity: number;
    expertise: number;
    deadline: number;
    balance: number;
  };
}

export interface ClerkAssignmentOutput {
  recommendedClerkId: string;
  recommendedClerkName: string;
  confidence: number;
  reasoning: string;
  scores: Array<{
    clerkId: string;
    clerkName: string;
    totalScore: number;
    breakdown: {
      capacityScore: number;
      expertiseScore: number;
      deadlineScore: number;
      balanceScore: number;
    };
    notes: string;
  }>;
}

export async function recommendClerkAssignment(
  input: ClerkAssignmentInput
): Promise<{ success: boolean; result?: ClerkAssignmentOutput; error?: string; tokensUsed?: number }> {
  const userMessage = `Recommend a clerk for this order:

ORDER DETAILS:
${JSON.stringify(input.order, null, 2)}

AVAILABLE CLERKS:
${JSON.stringify(input.clerks, null, 2)}

SCORING WEIGHTS:
${JSON.stringify(input.weights, null, 2)}

Please analyze and respond with JSON in this format:
{
  "recommendedClerkId": "string",
  "recommendedClerkName": "string",
  "confidence": number (0-1),
  "reasoning": "string explaining the recommendation",
  "scores": [
    {
      "clerkId": "string",
      "clerkName": "string",
      "totalScore": number (0-100),
      "breakdown": {
        "capacityScore": number (0-100),
        "expertiseScore": number (0-100),
        "deadlineScore": number (0-100),
        "balanceScore": number (0-100)
      },
      "notes": "string with any concerns or notes"
    }
  ]
}

Order clerks by total score descending.`;

  return callClaude<ClerkAssignmentOutput>(SYSTEM_PROMPTS.clerkAssignment, userMessage);
}

// ============================================================================
// QA ANALYSIS
// ============================================================================

export interface QAAnalysisInput {
  documentContent: string;
  expectedCaseCaption: string;
  expectedJurisdiction: string;
  motionType: string;
  placeholderPatterns: string[];
}

export interface QAAnalysisOutput {
  passed: boolean;
  score: number;
  issues: Array<{
    type: 'placeholder' | 'formatting' | 'content' | 'metadata';
    severity: 'warning' | 'error';
    description: string;
    location?: string;
  }>;
  recommendation: 'deliver' | 'review' | 'reject';
  confidence: number;
  summary: string;
}

export async function analyzeDocumentQA(
  input: QAAnalysisInput
): Promise<{ success: boolean; result?: QAAnalysisOutput; error?: string; tokensUsed?: number }> {
  const userMessage = `Analyze this legal document for quality issues:

EXPECTED CASE CAPTION: ${input.expectedCaseCaption}
EXPECTED JURISDICTION: ${input.expectedJurisdiction}
MOTION TYPE: ${input.motionType}

PLACEHOLDER PATTERNS TO CHECK:
${input.placeholderPatterns.join(', ')}

DOCUMENT CONTENT (first 10000 chars):
${input.documentContent.substring(0, 10000)}

Please analyze and respond with JSON in this format:
{
  "passed": boolean,
  "score": number (0-100),
  "issues": [
    {
      "type": "placeholder" | "formatting" | "content" | "metadata",
      "severity": "warning" | "error",
      "description": "string describing the issue",
      "location": "optional string indicating where the issue is"
    }
  ],
  "recommendation": "deliver" | "review" | "reject",
  "confidence": number (0-1),
  "summary": "Brief summary of QA findings"
}`;

  return callClaude<QAAnalysisOutput>(SYSTEM_PROMPTS.qaAnalysis, userMessage);
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

export interface ReportSummaryInput {
  reportType: 'daily' | 'weekly' | 'monthly';
  data: Record<string, unknown>;
}

export interface ReportSummaryOutput {
  title: string;
  executiveSummary: string;
  keyMetrics: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'stable';
    note?: string;
  }>;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
}

export async function generateReportSummary(
  input: ReportSummaryInput
): Promise<{ success: boolean; result?: ReportSummaryOutput; error?: string; tokensUsed?: number }> {
  const userMessage = `Generate a ${input.reportType} operations summary from this data:

${JSON.stringify(input.data, null, 2)}

Please respond with JSON in this format:
{
  "title": "string",
  "executiveSummary": "2-3 sentence summary",
  "keyMetrics": [
    {
      "label": "string",
      "value": "string",
      "trend": "up" | "down" | "stable" (optional),
      "note": "optional context"
    }
  ],
  "highlights": ["positive items"],
  "concerns": ["items needing attention"],
  "recommendations": ["actionable suggestions"]
}`;

  return callClaude<ReportSummaryOutput>(SYSTEM_PROMPTS.reportSummary, userMessage);
}

// ============================================================================
// GENERIC ANALYSIS
// ============================================================================

/**
 * Generic analysis function for custom tasks
 */
export async function runAnalysis(
  request: ClaudeAnalysisRequest
): Promise<ClaudeAnalysisResponse> {
  const startTime = Date.now();

  const systemPrompt = request.systemPrompt || SYSTEM_PROMPTS[request.task as keyof typeof SYSTEM_PROMPTS] || '';

  const response = await callClaude<Record<string, unknown>>(
    systemPrompt,
    JSON.stringify(request.context)
  );

  return {
    success: response.success,
    result: response.result || {},
    tokensUsed: response.tokensUsed || 0,
    processingTimeMs: Date.now() - startTime,
    error: response.error,
  };
}

// ============================================================================
// MOTION GENERATION (Opus + Max Tokens + Legal Research Tools)
// ============================================================================

import {
  getLegalResearchTools,
  handleLegalResearchToolCall,
  areLegalResearchToolsAvailable,
} from '@/lib/legal-research';

/**
 * Generate a legal motion using Claude Opus with maximum context and output
 * Supports legal research tools (Westlaw/LexisNexis) when configured
 * Uses API key from database if available, falls back to environment variable
 */
export async function generateMotion(options: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  onProgress?: (text: string) => void;
  enableLegalResearch?: boolean;
}): Promise<{
  success: boolean;
  content?: string;
  tokensUsed?: { input: number; output: number };
  toolCalls?: number;
  error?: string;
}> {
  // Get Anthropic client (checks database first, then env var)
  const client = await getAnthropicClient();

  if (!client) {
    return {
      success: false,
      error: 'Claude API is not configured. Add your Anthropic API key in Admin Settings.',
    };
  }

  const maxTokens = options.maxOutputTokens || MOTION_MAX_TOKENS;
  const useLegalResearch = options.enableLegalResearch !== false && areLegalResearchToolsAvailable();
  const tools = useLegalResearch ? getLegalResearchTools() : [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: 'user', content: options.userPrompt },
    ];
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCallCount = 0;
    let continueLoop = true;

    // Agentic loop - continue until Claude is done or max iterations
    const maxIterations = 20; // Prevent infinite loops
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      const response = await client.messages.create({
        model: MOTION_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        system: options.systemPrompt + (useLegalResearch ? '\n\nYou have access to legal research tools. Use the legal_research tool to find relevant case law and the check_citation tool to verify citations before including them.' : ''),
        messages,
        tools: tools.length > 0 ? tools as Parameters<typeof client.messages.create>[0]['tools'] : undefined,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Check if there are tool calls to process
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
      const textBlocks = response.content.filter((block) => block.type === 'text');

      // Collect text content
      for (const block of textBlocks) {
        if (block.type === 'text') {
          fullContent += block.text;
          if (options.onProgress) {
            options.onProgress(fullContent);
          }
        }
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0) {
        continueLoop = false;
        break;
      }

      // Process tool calls
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

      for (const toolBlock of toolUseBlocks) {
        if (toolBlock.type === 'tool_use') {
          toolCallCount++;
          console.log(`[Legal Research] Tool call: ${toolBlock.name}`, toolBlock.input);

          const result = await handleLegalResearchToolCall({
            name: toolBlock.name,
            input: toolBlock.input as Record<string, unknown>,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result.content,
          });
        }
      }

      // Add assistant response and tool results to messages
      messages.push({
        role: 'assistant',
        content: response.content,
      });
      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        continueLoop = false;
      }
    }

    return {
      success: true,
      content: fullContent,
      tokensUsed: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
      toolCalls: toolCallCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error generating motion';
    console.error('[Motion Generation Error]', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Estimate token count for a string (rough approximation)
 * ~4 chars per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content fits within context limits
 */
export function checkContextBudget(
  superpromptTokens: number,
  documentTokens: number,
  conversationTokens: number = 0
): {
  fits: boolean;
  total: number;
  available: number;
  outputBudget: number;
} {
  const total = superpromptTokens + documentTokens + conversationTokens;
  const available = MAX_CONTEXT_TOKENS - total;
  const outputBudget = Math.min(available, MOTION_MAX_TOKENS);

  return {
    fits: total < MAX_CONTEXT_TOKENS,
    total,
    available,
    outputBudget,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate string similarity using Levenshtein distance
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * Normalize a party name for comparison
 */
export function normalizePartyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,\s*(inc|llc|llp|corp|ltd|lp|pc|pllc)\.?$/i, '')
    .replace(/\s+(inc|llc|llp|corp|ltd|lp|pc|pllc)\.?$/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[.,]/g, '');
}
