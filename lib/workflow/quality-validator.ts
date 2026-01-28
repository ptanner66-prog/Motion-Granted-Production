/**
 * Quality Validator Module
 *
 * Validates documents against quality standards and best practices.
 * Provides comprehensive quality scoring and issue detection.
 */

import { askClaude } from '@/lib/automation/claude';
import { extractCitations } from './citation-verifier';
import { getMotionTemplate, validateAgainstTemplate } from './motion-templates';
import type { MotionType } from '@/types/workflow';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

export interface QualityReport {
  overallScore: number;
  categoryScores: CategoryScores;
  issues: QualityIssue[];
  strengths: string[];
  suggestions: string[];
  passesMinimumStandards: boolean;
  readyForDelivery: boolean;
}

export interface CategoryScores {
  legalAccuracy: number;
  citationQuality: number;
  grammarSpelling: number;
  organization: number;
  professionalism: number;
  completeness: number;
  formatting: number;
}

export interface QualityIssue {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  category: keyof CategoryScores;
  title: string;
  description: string;
  location?: string;
  suggestion?: string;
  autoFixable: boolean;
}

export interface ValidationContext {
  motionType: MotionType;
  jurisdiction?: string;
  courtType?: string;
  isOpposition?: boolean;
}

// ============================================================================
// QUALITY THRESHOLDS
// ============================================================================

/**
 * Quality thresholds per v6.3 specification
 * IMPORTANT: B+ = 0.87 is the PASSING grade threshold
 */
const QUALITY_THRESHOLDS = {
  minimum: 0.70,          // D+ — absolute floor, fails if below
  acceptable: 0.87,       // B+ — this is the PASSING grade per v6.3
  good: 0.93,             // A  — high quality
  excellent: 0.97,        // A+ — exceptional
};

const CATEGORY_WEIGHTS: Record<keyof CategoryScores, number> = {
  legalAccuracy: 0.25,
  citationQuality: 0.20,
  grammarSpelling: 0.15,
  organization: 0.15,
  professionalism: 0.10,
  completeness: 0.10,
  formatting: 0.05,
};

// ============================================================================
// AUTOMATED CHECKS
// ============================================================================

/**
 * Run automated quality checks on document
 */
function runAutomatedChecks(
  document: string,
  context: ValidationContext
): { issues: QualityIssue[]; scores: Partial<CategoryScores> } {
  const issues: QualityIssue[] = [];
  const scores: Partial<CategoryScores> = {};

  // Word count check
  const wordCount = document.split(/\s+/).filter(w => w.length > 0).length;
  const template = getMotionTemplate(context.motionType.code);

  if (template) {
    const templateValidation = validateAgainstTemplate(template, document);
    if (!templateValidation.valid) {
      for (const issue of templateValidation.issues) {
        issues.push({
          id: `template_${issues.length}`,
          severity: issue.includes('too short') || issue.includes('too long') ? 'major' : 'minor',
          category: 'completeness',
          title: 'Template Validation Issue',
          description: issue,
          autoFixable: false,
        });
      }
    }
  }

  // Citation check
  const citations = extractCitations(document);
  const citationCount = citations.length;
  const minCitations = context.motionType.citation_requirements?.minimum || 4;

  if (citationCount < minCitations) {
    issues.push({
      id: 'citation_count',
      severity: 'critical',
      category: 'citationQuality',
      title: 'Insufficient Citations',
      description: `Document has ${citationCount} citations but requires minimum of ${minCitations}`,
      autoFixable: false,
    });
    scores.citationQuality = Math.max(0, citationCount / minCitations);
  } else {
    scores.citationQuality = Math.min(1, 0.8 + (citationCount - minCitations) * 0.05);
  }

  // Grammar checks (basic patterns)
  const grammarIssues = checkGrammar(document);
  issues.push(...grammarIssues);
  scores.grammarSpelling = Math.max(0, 1 - grammarIssues.length * 0.1);

  // Formatting checks
  const formattingIssues = checkFormatting(document);
  issues.push(...formattingIssues);
  scores.formatting = Math.max(0, 1 - formattingIssues.length * 0.1);

  // Completeness check based on required sections
  const completenessScore = checkCompleteness(document, context);
  scores.completeness = completenessScore;

  // Organization check
  scores.organization = checkOrganization(document);

  return { issues, scores };
}

/**
 * Check for common grammar issues
 */
function checkGrammar(document: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Common legal writing issues
  const patterns: Array<{ pattern: RegExp; title: string; suggestion: string }> = [
    {
      pattern: /\bi\s/g,
      title: 'Lowercase "I"',
      suggestion: 'Capitalize personal pronoun "I"',
    },
    {
      pattern: /\s{2,}/g,
      title: 'Multiple Spaces',
      suggestion: 'Use single spaces between words',
    },
    {
      pattern: /\.\s*,/g,
      title: 'Period Before Comma',
      suggestion: 'Remove extra punctuation',
    },
    {
      pattern: /\bwhich\b(?!\s*,)/gi,
      title: 'Missing Comma Before "Which"',
      suggestion: 'Add comma before "which" in non-restrictive clauses',
    },
    {
      pattern: /\bit's\b/gi,
      title: 'Contraction in Formal Document',
      suggestion: 'Use "it is" instead of "it\'s" in formal legal writing',
    },
    {
      pattern: /\bcan't\b|\bwon't\b|\bdon't\b|\bdoesn't\b/gi,
      title: 'Contraction in Formal Document',
      suggestion: 'Avoid contractions in formal legal writing',
    },
  ];

  for (const { pattern, title, suggestion } of patterns) {
    const matches = document.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        id: `grammar_${issues.length}`,
        severity: 'minor',
        category: 'grammarSpelling',
        title,
        description: `Found ${matches.length} instance(s) of this issue`,
        suggestion,
        autoFixable: true,
      });
    }
  }

  return issues;
}

/**
 * Check document formatting
 */
function checkFormatting(document: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for proper paragraphing
  const lines = document.split('\n');
  const longParagraphs = lines.filter(l => l.length > 1000);
  if (longParagraphs.length > 0) {
    issues.push({
      id: 'long_paragraphs',
      severity: 'minor',
      category: 'formatting',
      title: 'Overly Long Paragraphs',
      description: `${longParagraphs.length} paragraph(s) exceed recommended length`,
      suggestion: 'Break long paragraphs into smaller, focused paragraphs',
      autoFixable: false,
    });
  }

  // Check for consistent heading format
  const headingPatterns = [
    /^[IVX]+\.\s/m,  // Roman numerals
    /^[A-Z]\.\s/m,   // Letter headings
    /^\d+\.\s/m,     // Numbered headings
  ];

  const headingsFound = headingPatterns.filter(p => p.test(document));
  if (headingsFound.length > 2) {
    issues.push({
      id: 'inconsistent_headings',
      severity: 'minor',
      category: 'formatting',
      title: 'Inconsistent Heading Styles',
      description: 'Document uses multiple heading numbering systems',
      suggestion: 'Use consistent heading numbering throughout',
      autoFixable: false,
    });
  }

  // Check for signature block
  if (!/respectfully\s+submitted/i.test(document) &&
      !/signature|attorney|counsel/i.test(document.slice(-500))) {
    issues.push({
      id: 'missing_signature',
      severity: 'major',
      category: 'formatting',
      title: 'Missing Signature Block',
      description: 'Document appears to be missing a signature block',
      suggestion: 'Add proper signature block with attorney information',
      autoFixable: false,
    });
  }

  return issues;
}

/**
 * Check document completeness
 */
function checkCompleteness(
  document: string,
  context: ValidationContext
): number {
  const requiredElements = [
    { pattern: /introduction|preliminary\s+statement/i, name: 'Introduction' },
    { pattern: /statement\s+of\s+facts|factual\s+background/i, name: 'Statement of Facts' },
    { pattern: /argument|discussion|analysis/i, name: 'Argument Section' },
    { pattern: /conclusion|relief\s+requested/i, name: 'Conclusion' },
    { pattern: /wherefore|respectfully\s+(request|submit)/i, name: 'Prayer for Relief' },
  ];

  let foundCount = 0;
  for (const element of requiredElements) {
    if (element.pattern.test(document)) {
      foundCount++;
    }
  }

  return foundCount / requiredElements.length;
}

/**
 * Check document organization
 */
function checkOrganization(document: string): number {
  let score = 1.0;

  // Check if facts come before argument
  const factsIndex = document.search(/statement\s+of\s+facts/i);
  const argumentIndex = document.search(/argument|discussion/i);
  const conclusionIndex = document.search(/conclusion/i);

  if (factsIndex > 0 && argumentIndex > 0 && factsIndex > argumentIndex) {
    score -= 0.2; // Facts should come before argument
  }

  if (argumentIndex > 0 && conclusionIndex > 0 && argumentIndex > conclusionIndex) {
    score -= 0.2; // Argument should come before conclusion
  }

  // Check for section transitions
  const transitionWords = /therefore|accordingly|moreover|furthermore|however|nevertheless/gi;
  const transitions = document.match(transitionWords);
  if (!transitions || transitions.length < 3) {
    score -= 0.1; // Needs more transitions
  }

  return Math.max(0, score);
}

// ============================================================================
// AI-POWERED VALIDATION
// ============================================================================

/**
 * Run AI-powered quality validation
 */
async function runAIValidation(
  document: string,
  context: ValidationContext
): Promise<OperationResult<Partial<QualityReport>>> {
  const truncatedDoc = document.length > 12000
    ? document.substring(0, 12000) + '\n\n[Document truncated...]'
    : document;

  const prompt = `Review this legal document for quality and accuracy.

Document Type: ${context.motionType.name}
Jurisdiction: ${context.jurisdiction || 'Federal'}
${context.isOpposition ? 'This is an OPPOSITION document.' : ''}

Document:
${truncatedDoc}

Analyze the document and respond with JSON:
{
  "category_assessments": {
    "legal_accuracy": {
      "score": 0.0-1.0,
      "issues": ["Issue description"],
      "strengths": ["Strength description"]
    },
    "argument_quality": {
      "score": 0.0-1.0,
      "issues": [],
      "strengths": []
    },
    "professionalism": {
      "score": 0.0-1.0,
      "issues": [],
      "strengths": []
    }
  },
  "critical_issues": [
    {
      "title": "Issue title",
      "description": "Detailed description",
      "location": "Where in document",
      "suggestion": "How to fix"
    }
  ],
  "overall_strengths": ["Strength 1"],
  "improvement_suggestions": ["Suggestion 1"],
  "professional_assessment": "Brief professional assessment of document quality"
}`;

  const result = await askClaude({
    prompt,
    maxTokens: 32000, // MAXED OUT - comprehensive quality review
    systemPrompt: 'You are an expert legal document reviewer. Provide thorough, constructive feedback.',
  });

  if (!result.success || !result.result) {
    return { success: false, error: result.error || 'AI validation failed' };
  }

  try {
    const jsonMatch = result.result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const analysis = JSON.parse(jsonMatch[0]);
    const assessments = analysis.category_assessments || {};

    // Convert AI issues to QualityIssues
    const aiIssues: QualityIssue[] = (analysis.critical_issues || []).map(
      (issue: Record<string, string>, idx: number) => ({
        id: `ai_${idx}`,
        severity: 'major' as const,
        category: 'legalAccuracy' as const,
        title: issue.title,
        description: issue.description,
        location: issue.location,
        suggestion: issue.suggestion,
        autoFixable: false,
      })
    );

    return {
      success: true,
      data: {
        categoryScores: {
          legalAccuracy: assessments.legal_accuracy?.score || 0.7,
          professionalism: assessments.professionalism?.score || 0.8,
          citationQuality: 0, // Will be filled by automated check
          grammarSpelling: 0,
          organization: 0,
          completeness: 0,
          formatting: 0,
        },
        issues: aiIssues,
        strengths: analysis.overall_strengths || [],
        suggestions: analysis.improvement_suggestions || [],
      },
    };
  } catch {
    return { success: false, error: 'Failed to parse AI validation response' };
  }
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate a document against quality standards
 */
export async function validateDocument(
  document: string,
  context: ValidationContext
): Promise<OperationResult<QualityReport>> {
  try {
    // Run automated checks
    const { issues: automatedIssues, scores: automatedScores } = runAutomatedChecks(
      document,
      context
    );

    // Run AI validation
    const aiResult = await runAIValidation(document, context);

    // Merge results
    const categoryScores: CategoryScores = {
      legalAccuracy: aiResult.data?.categoryScores?.legalAccuracy || 0.7,
      citationQuality: automatedScores.citationQuality || 0.5,
      grammarSpelling: automatedScores.grammarSpelling || 0.8,
      organization: automatedScores.organization || 0.7,
      professionalism: aiResult.data?.categoryScores?.professionalism || 0.8,
      completeness: automatedScores.completeness || 0.7,
      formatting: automatedScores.formatting || 0.8,
    };

    // Calculate overall score
    let overallScore = 0;
    for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      overallScore += categoryScores[category as keyof CategoryScores] * weight;
    }

    // Combine issues
    const allIssues = [
      ...automatedIssues,
      ...(aiResult.data?.issues || []),
    ];

    // Sort by severity
    const severityOrder = { critical: 0, major: 1, minor: 2, suggestion: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Determine readiness
    const hasCriticalIssues = allIssues.some(i => i.severity === 'critical');
    const passesMinimum = overallScore >= QUALITY_THRESHOLDS.minimum && !hasCriticalIssues;
    const readyForDelivery = overallScore >= QUALITY_THRESHOLDS.acceptable && !hasCriticalIssues;

    const report: QualityReport = {
      overallScore,
      categoryScores,
      issues: allIssues,
      strengths: aiResult.data?.strengths || [],
      suggestions: aiResult.data?.suggestions || [],
      passesMinimumStandards: passesMinimum,
      readyForDelivery,
    };

    return { success: true, data: report };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Quality validation failed',
    };
  }
}

/**
 * Quick validation check (no AI)
 */
export function quickValidate(
  document: string,
  context: ValidationContext
): { passes: boolean; issues: QualityIssue[] } {
  const { issues, scores } = runAutomatedChecks(document, context);

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const passes = criticalIssues.length === 0 &&
                 (scores.citationQuality || 0) >= 0.5 &&
                 (scores.completeness || 0) >= 0.6;

  return { passes, issues };
}

/**
 * Get quality score label
 */
export function getQualityLabel(score: number): string {
  if (score >= QUALITY_THRESHOLDS.excellent) return 'Excellent';
  if (score >= QUALITY_THRESHOLDS.good) return 'Good';
  if (score >= QUALITY_THRESHOLDS.acceptable) return 'Acceptable';
  if (score >= QUALITY_THRESHOLDS.minimum) return 'Needs Improvement';
  return 'Below Standards';
}

/**
 * Get recommended actions based on quality report
 */
export function getRecommendedActions(report: QualityReport): string[] {
  const actions: string[] = [];

  if (!report.passesMinimumStandards) {
    actions.push('Document does not meet minimum quality standards - revision required');
  }

  const criticalIssues = report.issues.filter(i => i.severity === 'critical');
  for (const issue of criticalIssues) {
    actions.push(`CRITICAL: ${issue.title} - ${issue.suggestion || 'Fix required'}`);
  }

  const majorIssues = report.issues.filter(i => i.severity === 'major');
  for (const issue of majorIssues.slice(0, 3)) {
    actions.push(`${issue.title} - ${issue.suggestion || 'Review required'}`);
  }

  if (report.categoryScores.citationQuality < 0.7) {
    actions.push('Add more supporting citations');
  }

  if (report.categoryScores.completeness < 0.8) {
    actions.push('Ensure all required sections are present');
  }

  return actions;
}

// ============================================================================
// EXPORTED QUALITY HELPERS (v6.3)
// ============================================================================

/**
 * Export thresholds for use in other modules
 */
export { QUALITY_THRESHOLDS };

/**
 * Convert numeric score to letter grade
 */
export function scoreToGrade(score: number): string {
  if (score >= 0.97) return 'A+';
  if (score >= 0.93) return 'A';
  if (score >= 0.90) return 'A-';
  if (score >= 0.87) return 'B+';
  if (score >= 0.83) return 'B';
  if (score >= 0.80) return 'B-';
  if (score >= 0.77) return 'C+';
  if (score >= 0.73) return 'C';
  if (score >= 0.70) return 'C-';
  if (score >= 0.67) return 'D+';
  if (score >= 0.63) return 'D';
  if (score >= 0.60) return 'D-';
  return 'F';
}

/**
 * Check if score meets B+ passing threshold
 */
export function isPassingGrade(score: number): boolean {
  return score >= QUALITY_THRESHOLDS.acceptable; // B+ = 0.87
}

/**
 * Get failure threshold by tier
 * Returns the maximum allowed citation failure rate
 */
export function getFailureThreshold(tier: 'A' | 'B' | 'C'): number {
  const thresholds = {
    A: 0.20, // 20% citation failure allowed (procedural)
    B: 0.15, // 15% citation failure allowed (intermediate)
    C: 0.10, // 10% citation failure allowed (dispositive)
  };
  return thresholds[tier];
}
