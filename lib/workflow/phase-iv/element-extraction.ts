/**
 * Element Extraction Module (Phase IV-A)
 *
 * Legal-Grade Citation Research System
 * Chen Megaprompt Specification — January 30, 2026
 *
 * Extracts 4-6 legal elements that need citation support based on:
 * - Motion type and templates
 * - Jurisdiction requirements
 * - Statement of facts
 *
 * Example for Motion to Compel:
 * 1. Valid discovery request (Art. 1422 scope)
 * 2. Response deadline expired (Art. 1458 - 30 days)
 * 3. Failure to respond waives objections
 * 4. Good faith conference requirement
 * 5. Court authority to compel (Art. 1469)
 * 6. Sanctions entitlement (Art. 1471)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@/lib/security/logger';
import { MODELS } from '@/lib/config/models';
import { getModel } from '@/lib/config/phase-registry';

const log = createLogger('workflow-phase-iv-element-extraction');
import {
  type MotionTypeCode,
  type ElementExtractionInput,
  type ElementExtractionOutput,
  type ExtractedElement,
  type LegalElement,
  MOTION_ELEMENT_TEMPLATES,
} from '@/types/citation-research';

// ============================================================================
// ELEMENT EXTRACTION
// ============================================================================

/**
 * Extract legal elements for citation research
 *
 * This combines template elements with Claude's analysis of the facts
 * to produce customized elements specific to the case.
 */
export async function extractElements(
  input: ElementExtractionInput,
  anthropicClient?: Anthropic,
  modelId?: string,
  thinkingBudget?: number,
  maxTokens?: number,
): Promise<ElementExtractionOutput> {
  const start = Date.now();

  log.info(`╔══════════════════════════════════════════════════════════════╗`);
  log.info(`║  PHASE IV-A: ELEMENT EXTRACTION                              ║`);
  log.info(`╚══════════════════════════════════════════════════════════════╝`);
  log.info(`[Phase IV-A] Motion Type: ${input.motionType}`);
  log.info(`[Phase IV-A] Jurisdiction: ${input.jurisdiction}`);

  try {
    // Step 1: Get template elements for this motion type
    const templateElements = getTemplateElements(input.motionType);
    log.info(`[Phase IV-A] Template elements loaded: ${templateElements.length}`);

    // Step 2: Customize elements based on facts if Claude client provided
    let customizedElements: ExtractedElement[];

    if (anthropicClient && input.statementOfFacts) {
      customizedElements = await customizeElementsWithClaude(
        templateElements,
        input,
        anthropicClient,
        modelId,
        thinkingBudget,
        maxTokens,
      );
    } else {
      // Use template elements directly
      customizedElements = templateElements.map(el => ({
        ...el,
        searchQueries: optimizeSearchQueries(el.searchQueries),
        customizedForFacts: false,
      }));
    }

    // Step 3: Validate we have enough elements
    if (customizedElements.length < 4) {
      log.warn(`[Phase IV-A] Only ${customizedElements.length} elements extracted, adding fallback elements`);
      customizedElements = addFallbackElements(customizedElements, input.motionType);
    }

    // Cap at 6 elements per spec
    if (customizedElements.length > 6) {
      log.info(`[Phase IV-A] Trimming to 6 elements (had ${customizedElements.length})`);
      customizedElements = prioritizeElements(customizedElements, 6);
    }

    const criticalCount = customizedElements.filter(el => el.priority === 'critical').length;
    const customCount = customizedElements.filter(el => el.customizedForFacts).length;

    const duration = Date.now() - start;

    log.info(`[Phase IV-A] Elements extracted: ${customizedElements.length}`);
    log.info(`[Phase IV-A] Critical elements: ${criticalCount}`);
    log.info(`[Phase IV-A] Custom elements: ${customCount}`);
    log.info(`[Phase IV-A] Duration: ${duration}ms`);

    return {
      success: true,
      elements: customizedElements,
      totalElements: customizedElements.length,
      criticalElements: criticalCount,
      customElements: customCount,
      durationMs: duration,
    };
  } catch (error) {
    log.error('[Phase IV-A] Element extraction failed:', error);
    return {
      success: false,
      elements: [],
      totalElements: 0,
      criticalElements: 0,
      customElements: 0,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Element extraction failed',
    };
  }
}

// ============================================================================
// TEMPLATE LOADING
// ============================================================================

/**
 * Get template elements for a motion type
 */
function getTemplateElements(motionType: MotionTypeCode): LegalElement[] {
  const template = MOTION_ELEMENT_TEMPLATES[motionType];

  if (template && template.length > 0) {
    return template;
  }

  // Fallback for unknown motion types
  log.warn(`[Phase IV-A] No template for motion type: ${motionType}, using generic elements`);
  return getGenericElements(motionType);
}

/**
 * Generate generic elements for unknown motion types
 */
function getGenericElements(motionType: MotionTypeCode): LegalElement[] {
  const motionName = motionType.replace(/_/g, ' ').toLowerCase();

  return [
    {
      id: `${motionType}_standard`,
      name: 'Legal Standard',
      proposition: `The governing legal standard for a ${motionName}`,
      requiredAuthority: 'binding',
      priority: 'critical',
      searchQueries: [`${motionName} Louisiana`, `${motionName} standard`, `Louisiana ${motionName}`],
    },
    {
      id: `${motionType}_elements`,
      name: 'Required Elements',
      proposition: `The required elements to establish grounds for a ${motionName}`,
      requiredAuthority: 'binding',
      priority: 'critical',
      searchQueries: [`${motionName} elements`, `${motionName} requirements Louisiana`],
    },
    {
      id: `${motionType}_authority`,
      name: 'Court Authority',
      proposition: `Court has authority to grant a ${motionName}`,
      requiredAuthority: 'any',
      priority: 'important',
      searchQueries: [`court authority ${motionName}`, `grant ${motionName} Louisiana`],
    },
    {
      id: `${motionType}_relief`,
      name: 'Available Relief',
      proposition: `The relief available when a ${motionName} is granted`,
      requiredAuthority: 'persuasive',
      priority: 'supporting',
      searchQueries: [`${motionName} relief`, `${motionName} remedy Louisiana`],
    },
  ];
}

// ============================================================================
// SEARCH QUERY OPTIMIZATION
// ============================================================================

/**
 * Optimize search queries per Chen's rules:
 * 1. Keep queries SHORT — 2-5 words
 * 2. Include "Louisiana" in at least one query
 * 3. NO statute numbers — "Article 1469" returns nothing
 * 4. Use legal terms that appear in opinions
 * 5. 3 queries per element maximum
 */
function optimizeSearchQueries(queries: string[]): string[] {
  const optimized: string[] = [];
  let hasLouisiana = false;

  for (const query of queries) {
    // Clean up the query
    let cleaned = query
      // Remove statute references (they don't work in CourtListener)
      .replace(/Article \d+/gi, '')
      .replace(/Art\.\s*\d+/gi, '')
      .replace(/Section \d+/gi, '')
      .replace(/§\s*\d+/gi, '')
      // Remove citation formats
      .replace(/La\.?\s*(C\.?C\.?P\.?|R\.?S\.?)/gi, '')
      .replace(/C\.?C\.?P\.?/gi, '')
      // Remove parentheticals
      .replace(/\([^)]*\)/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned || cleaned.length < 3) continue;

    // Check if query has Louisiana
    if (cleaned.toLowerCase().includes('louisiana')) {
      hasLouisiana = true;
    }

    // Limit to 5 words
    const words = cleaned.split(' ').filter(w => w.length > 0);
    if (words.length > 5) {
      cleaned = words.slice(0, 5).join(' ');
    }

    if (cleaned.length >= 3) {
      optimized.push(cleaned);
    }
  }

  // Ensure at least one query has Louisiana
  if (!hasLouisiana && optimized.length > 0) {
    // Add Louisiana to the first query
    optimized[0] = `${optimized[0]} Louisiana`;
  }

  // Cap at 3 queries per element
  return optimized.slice(0, 3);
}

// ============================================================================
// CLAUDE CUSTOMIZATION
// ============================================================================

/**
 * Customize elements based on case facts using Claude
 */
async function customizeElementsWithClaude(
  templateElements: LegalElement[],
  input: ElementExtractionInput,
  client: Anthropic,
  modelId?: string,
  thinkingBudget?: number,
  maxTokens?: number,
): Promise<ExtractedElement[]> {
  const prompt = `You are extracting legal elements for citation research.

MOTION TYPE: ${input.motionType}
JURISDICTION: ${input.jurisdiction}

STATEMENT OF FACTS:
${input.statementOfFacts}

TEMPLATE ELEMENTS:
${JSON.stringify(templateElements, null, 2)}

${input.phaseIIOutput ? `\nLEGAL STANDARDS (Phase II):\n${JSON.stringify(input.phaseIIOutput, null, 2)}` : ''}
${input.phaseIIIOutput ? `\nISSUES IDENTIFIED (Phase III):\n${JSON.stringify(input.phaseIIIOutput, null, 2)}` : ''}

TASK:
1. Review the template elements for this motion type
2. Customize the propositions based on the specific facts
3. Add any case-specific elements identified in Phase II/III
4. Generate optimized search queries (2-5 words each, no statute numbers)

SEARCH QUERY RULES:
- Keep queries SHORT: 2-5 words
- Include "Louisiana" in at least one query per element
- NO statute numbers: "Article 1469" returns nothing
- Use legal terms that appear in opinions
- Maximum 3 queries per element

OUTPUT FORMAT (JSON only):
{
  "elements": [
    {
      "id": "unique_id",
      "name": "Element Name",
      "proposition": "Specific proposition customized for these facts",
      "requiredAuthority": "binding" | "persuasive" | "any",
      "priority": "critical" | "important" | "supporting",
      "searchQueries": ["query 1", "query 2", "query 3"],
      "customizedForFacts": true
    }
  ]
}`;

  try {
    if (!modelId) {
      log.warn('[Phase IV-A] No modelId passed — falling back to phase-registry default (caller should pass model from registry)');
    }
    const resolvedModel = modelId || getModel('IV', 'A') || MODELS.SONNET;
    const resolvedMaxTokens = maxTokens || 4096;
    log.info(`[Phase IV-A] Using model: ${resolvedModel} (max_tokens: ${resolvedMaxTokens}${thinkingBudget ? `, ET: ${thinkingBudget}` : ''})`);

    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: resolvedMaxTokens,
      ...(thinkingBudget ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudget } } : {}),
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find((c: { type: string }) => c.type === 'text');
    const text = textContent?.type === 'text' ? textContent.text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('[Phase IV-A] Could not parse Claude response, using templates');
      return templateElements.map(el => ({
        ...el,
        searchQueries: optimizeSearchQueries(el.searchQueries),
        customizedForFacts: false,
      }));
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const elements = (parsed.elements || []) as ExtractedElement[];

    // Ensure search queries are optimized
    return elements.map(el => ({
      ...el,
      searchQueries: optimizeSearchQueries(el.searchQueries),
    }));
  } catch (error) {
    log.error('[Phase IV-A] Claude customization failed:', error);
    return templateElements.map(el => ({
      ...el,
      searchQueries: optimizeSearchQueries(el.searchQueries),
      customizedForFacts: false,
    }));
  }
}

// ============================================================================
// FALLBACK AND PRIORITIZATION
// ============================================================================

/**
 * Add fallback elements if we don't have enough
 */
function addFallbackElements(
  elements: ExtractedElement[],
  motionType: MotionTypeCode
): ExtractedElement[] {
  const fallbackQueries = getFallbackQueries(motionType);

  // Add fallback elements until we have 4
  let index = 0;
  while (elements.length < 4 && index < fallbackQueries.length) {
    elements.push({
      id: `fallback_${index}`,
      name: `Supporting Element ${index + 1}`,
      proposition: fallbackQueries[index].proposition,
      requiredAuthority: 'any',
      priority: 'supporting',
      searchQueries: fallbackQueries[index].queries,
      customizedForFacts: false,
    });
    index++;
  }

  return elements;
}

/**
 * Get fallback search queries by motion type
 */
function getFallbackQueries(motionType: MotionTypeCode): Array<{ proposition: string; queries: string[] }> {
  switch (motionType) {
    case 'MCOMPEL':
      return [
        { proposition: 'Discovery obligations under Louisiana law', queries: ['Louisiana discovery', 'discovery Louisiana civil'] },
        { proposition: 'Court discretion in discovery matters', queries: ['discovery discretion Louisiana', 'court discovery order'] },
        { proposition: 'Discovery sanctions in Louisiana', queries: ['discovery sanctions Louisiana', 'sanctions motion compel'] },
      ];
    case 'MTD_12B6':
      return [
        { proposition: 'Standard for dismissal under Louisiana law', queries: ['dismiss standard Louisiana', 'peremptory exception'] },
        { proposition: 'Pleading requirements in Louisiana', queries: ['pleading Louisiana', 'petition requirements Louisiana'] },
      ];
    case 'MSJ':
      return [
        { proposition: 'Summary judgment standard in Louisiana', queries: ['summary judgment Louisiana', 'genuine issue material'] },
        { proposition: 'Burden shifting in summary judgment', queries: ['burden summary judgment', 'movant burden Louisiana'] },
      ];
    default:
      return [
        { proposition: 'Louisiana civil procedure standards', queries: ['Louisiana civil procedure', 'Louisiana court procedure'] },
        { proposition: 'Louisiana motion practice', queries: ['Louisiana motion practice', 'motion Louisiana court'] },
      ];
  }
}

/**
 * Prioritize elements and select top N
 */
function prioritizeElements(elements: ExtractedElement[], max: number): ExtractedElement[] {
  // Sort by priority: critical > important > supporting
  const priorityOrder = { critical: 0, important: 1, supporting: 2 };

  return [...elements]
    .sort((a, b) => {
      const aPriority = priorityOrder[a.priority] ?? 3;
      const bPriority = priorityOrder[b.priority] ?? 3;
      return aPriority - bPriority;
    })
    .slice(0, max);
}

// ============================================================================
// ELEMENT PRIORITY MAP
// ============================================================================

/**
 * Build element priority map for scoring/selection
 */
export function buildElementPriorityMap(
  elements: ExtractedElement[]
): Map<string, 'critical' | 'important' | 'supporting'> {
  const map = new Map<string, 'critical' | 'important' | 'supporting'>();

  for (const element of elements) {
    map.set(element.id, element.priority);
    map.set(element.name, element.priority);
  }

  return map;
}
