/**
 * Legal Research Tool Handler
 * Processes tool calls from Claude during motion generation
 */

import { searchCases, checkCitation, isLegalResearchConfigured } from './client';
import type { CaseSearchParams, CaseResult } from './types';
import { LEGAL_RESEARCH_TOOL, CITATION_CHECK_TOOL } from './types';

export { LEGAL_RESEARCH_TOOL, CITATION_CHECK_TOOL };

export interface ToolCallInput {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  success: boolean;
  content: string;
  data?: unknown;
}

/**
 * Check if legal research tools are available
 */
export function areLegalResearchToolsAvailable(): boolean {
  return isLegalResearchConfigured();
}

/**
 * Get the tool definitions to pass to Claude
 */
export function getLegalResearchTools() {
  if (!isLegalResearchConfigured()) {
    return [];
  }

  return [LEGAL_RESEARCH_TOOL, CITATION_CHECK_TOOL];
}

/**
 * Handle a tool call from Claude
 */
export async function handleLegalResearchToolCall(
  toolCall: ToolCallInput
): Promise<ToolCallResult> {
  if (toolCall.name === 'legal_research') {
    return handleSearchTool(toolCall.input);
  }

  if (toolCall.name === 'check_citation') {
    return handleCitationCheckTool(toolCall.input);
  }

  return {
    success: false,
    content: `Unknown tool: ${toolCall.name}`,
  };
}

/**
 * Handle legal_research tool call
 */
async function handleSearchTool(
  input: Record<string, unknown>
): Promise<ToolCallResult> {
  const params: CaseSearchParams = {
    query: input.query as string,
    jurisdiction: input.jurisdiction as string | undefined,
    court: input.court as string | undefined,
    topics: input.topics as string[] | undefined,
    maxResults: (input.max_results as number) || 10,
  };

  const response = await searchCases(params);

  if (!response.success || !response.results) {
    return {
      success: false,
      content: response.error || 'No cases found',
    };
  }

  // Format results for Claude
  const formattedResults = formatCaseResultsForClaude(response.results);

  return {
    success: true,
    content: formattedResults,
    data: response.results,
  };
}

/**
 * Handle check_citation tool call
 */
async function handleCitationCheckTool(
  input: Record<string, unknown>
): Promise<ToolCallResult> {
  const citation = input.citation as string;

  if (!citation) {
    return {
      success: false,
      content: 'No citation provided',
    };
  }

  const result = await checkCitation(citation);

  if (result.error) {
    return {
      success: false,
      content: result.error,
    };
  }

  // Format result for Claude
  const status = result.isGoodLaw ? '✓ GOOD LAW' : '⚠️ CHECK CAREFULLY';
  const citatorInfo = result.citatorStatus
    ? `Citator Status: ${result.citatorStatus.toUpperCase()}`
    : '';

  let content = `Citation: ${citation}\n`;
  content += `Valid: ${result.isValid ? 'Yes' : 'No'}\n`;
  content += `Status: ${status}\n`;
  if (citatorInfo) content += `${citatorInfo}\n`;
  if (result.subsequentHistory) {
    content += `\nSubsequent History:\n${result.subsequentHistory}\n`;
  }
  if (result.negativeHistory && result.negativeHistory.length > 0) {
    content += `\nNegative Treatment:\n${result.negativeHistory.join('\n')}\n`;
  }

  return {
    success: true,
    content,
    data: result,
  };
}

/**
 * Format case results in a way that's useful for Claude
 */
function formatCaseResultsForClaude(results: CaseResult[]): string {
  if (results.length === 0) {
    return 'No relevant cases found.';
  }

  let output = `Found ${results.length} relevant case(s):\n\n`;

  results.forEach((c, i) => {
    output += `═══════════════════════════════════════\n`;
    output += `CASE ${i + 1}: ${c.caseName}\n`;
    output += `═══════════════════════════════════════\n`;
    output += `Citation: ${c.citation}\n`;
    output += `Court: ${c.court}\n`;
    output += `Date: ${c.date}\n`;
    output += `Jurisdiction: ${c.jurisdiction}\n`;
    output += `Status: ${c.isGoodLaw ? '✓ Good Law' : '⚠️ Check Carefully'}\n`;
    if (c.citatorStatus) {
      output += `Citator: ${c.citatorStatus}\n`;
    }
    output += `\nSummary:\n${c.summary}\n`;
    if (c.holding) {
      output += `\nHolding:\n${c.holding}\n`;
    }
    if (c.relevantQuotes && c.relevantQuotes.length > 0) {
      output += `\nKey Quotes:\n`;
      c.relevantQuotes.forEach((q) => {
        output += `• "${q}"\n`;
      });
    }
    if (c.topics && c.topics.length > 0) {
      output += `\nTopics: ${c.topics.join(', ')}\n`;
    }
    output += '\n';
  });

  return output;
}
