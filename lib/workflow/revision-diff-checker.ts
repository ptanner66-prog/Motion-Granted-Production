/**
 * Revision Diff Checker
 *
 * PROBLEM (BUG 4): Phase VII Loop 1 gave explicit revision instruction
 * "add citations to Arguments III and IV" as Priority 3. Phase VIII
 * ran. Loop 2 shows Arguments III and IV STILL have zero citations.
 * Phase VIII silently passed through without executing the instructions.
 *
 * FIX: After Phase VIII revises, BEFORE sending to Phase VII for
 * re-evaluation, run this checker to verify each revision instruction
 * was actually addressed. If critical instructions were ignored,
 * either re-run Phase VIII with stronger emphasis or flag for admin.
 *
 * EMERGENCY FIX: 2026-02-17 — Addresses BUG 4 (revision non-execution)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RevisionInstruction {
  priority: number;             // 1 = highest
  instruction: string;          // The revision instruction text
  category: 'citation' | 'content' | 'structure' | 'formatting' | 'other';
  isCritical: boolean;          // If true, non-execution blocks the motion
  targetSections?: string[];    // Which sections this applies to
}

export interface DiffCheckResult {
  allCriticalExecuted: boolean;
  results: Array<{
    instruction: RevisionInstruction;
    executed: boolean;
    evidence: string;           // What changed (or didn't)
    confidence: 'high' | 'medium' | 'low';
  }>;
  summary: {
    total: number;
    executed: number;
    notExecuted: number;
    criticalNotExecuted: number;
  };
}

// ============================================================================
// DIFF CHECKER
// ============================================================================

/**
 * Check if revision instructions were executed by comparing
 * the original draft with the revised draft.
 *
 * Detection strategies:
 * - Citation instructions: count citations per section before/after
 * - Content instructions: check for keyword presence/absence
 * - Structure instructions: check section headers/organization
 */
export function checkRevisionExecution(
  originalDraft: string,
  revisedDraft: string,
  instructions: RevisionInstruction[]
): DiffCheckResult {
  const results: DiffCheckResult['results'] = [];

  for (const instruction of instructions) {
    let executed = false;
    let evidence = '';
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (instruction.category === 'citation') {
      // Count citation patterns before and after
      const citationPattern = /\d+\s+(?:So\.|F\.|S\.\s*Ct\.|U\.S\.|Cal\.|N\.Y\.|La\.)[\s\d.]+\d+/g;

      for (const section of instruction.targetSections ?? ['full']) {
        const origSection = extractSection(originalDraft, section);
        const revSection = extractSection(revisedDraft, section);

        const origCount = (origSection.match(citationPattern) || []).length;
        const revCount = (revSection.match(citationPattern) || []).length;

        if (revCount > origCount) {
          executed = true;
          evidence = `Section "${section}": citations increased from ${origCount} to ${revCount}`;
          confidence = 'high';
        } else if (revCount === origCount && origCount === 0) {
          executed = false;
          evidence = `Section "${section}": still has 0 citations (was 0 before revision)`;
          confidence = 'high';
        } else {
          evidence = `Section "${section}": citations ${origCount} -> ${revCount}`;
          confidence = 'medium';
        }
      }
    } else if (instruction.category === 'content') {
      // Check if the revised draft is meaningfully different
      const similarity = computeJaccardSimilarity(originalDraft, revisedDraft);
      if (similarity < 0.95) {
        executed = true;
        evidence = `Draft changed (similarity: ${Math.round(similarity * 100)}%)`;
        confidence = 'medium';
      } else {
        executed = false;
        evidence = `Draft nearly identical (similarity: ${Math.round(similarity * 100)}%)`;
        confidence = 'high';
      }
    } else {
      // Structure/formatting/other — check for general changes
      const origLength = originalDraft.length;
      const revLength = revisedDraft.length;
      const lengthDiff = Math.abs(revLength - origLength);

      if (origLength > 0 && lengthDiff > origLength * 0.05) {
        executed = true;
        evidence = `Draft length changed by ${lengthDiff} chars (${Math.round((lengthDiff / origLength) * 100)}%)`;
        confidence = 'low';
      } else {
        executed = false;
        evidence = origLength > 0
          ? `Minimal changes detected (${lengthDiff} chars, ${Math.round((lengthDiff / origLength) * 100)}%)`
          : 'Original draft empty — cannot compute diff';
        confidence = 'low';
      }
    }

    results.push({ instruction, executed, evidence, confidence });
  }

  const executedCount = results.filter(r => r.executed).length;
  const notExecutedCount = results.filter(r => !r.executed).length;
  const criticalNotExecuted = results.filter(
    r => !r.executed && r.instruction.isCritical
  ).length;

  return {
    allCriticalExecuted: criticalNotExecuted === 0,
    results,
    summary: {
      total: instructions.length,
      executed: executedCount,
      notExecuted: notExecutedCount,
      criticalNotExecuted,
    },
  };
}

// ============================================================================
// INSTRUCTION PARSER
// ============================================================================

/**
 * Parse Phase VII revision instructions from the judge simulation output.
 *
 * Phase VII returns structured JSON with a deficiencies array. This function
 * converts those into typed RevisionInstruction objects with priority and
 * category classification.
 */
export function parseRevisionInstructions(
  phaseVIIOutput: {
    deficiencies?: Array<{
      issue: string;
      priority?: number;
      section?: string;
    }>;
    revisionInstructions?: string[];
  }
): RevisionInstruction[] {
  const instructions: RevisionInstruction[] = [];

  // From structured deficiencies
  if (phaseVIIOutput.deficiencies) {
    for (const deficiency of phaseVIIOutput.deficiencies) {
      const category = classifyInstruction(deficiency.issue);
      instructions.push({
        priority: deficiency.priority ?? instructions.length + 1,
        instruction: deficiency.issue,
        category,
        isCritical:
          category === 'citation' ||
          (deficiency.priority !== undefined && deficiency.priority <= 3),
        targetSections: deficiency.section ? [deficiency.section] : undefined,
      });
    }
  }

  // From plain text instructions
  if (phaseVIIOutput.revisionInstructions) {
    for (let i = 0; i < phaseVIIOutput.revisionInstructions.length; i++) {
      const instr = phaseVIIOutput.revisionInstructions[i];
      const category = classifyInstruction(instr);
      instructions.push({
        priority: i + 1,
        instruction: instr,
        category,
        isCritical: category === 'citation' || i < 3,
        targetSections: extractTargetSections(instr),
      });
    }
  }

  return instructions;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Extract a named section from draft text */
function extractSection(text: string, sectionName: string): string {
  if (sectionName === 'full') return text;

  // Try to find section by common heading patterns
  const patterns = [
    new RegExp(
      `(?:^|\\n)(?:#{1,3}|[IVX]+\\.|\\d+\\.)\\s*${escapeRegex(sectionName)}` +
      `[\\s\\S]*?(?=(?:^|\\n)(?:#{1,3}|[IVX]+\\.|\\d+\\.)\\s|$)`,
      'im'
    ),
    new RegExp(
      `(?:^|\\n)${escapeRegex(sectionName)}` +
      `[\\s\\S]*?(?=(?:^|\\n)(?:[A-Z][A-Z\\s]{3,}|[IVX]+\\.|\\d+\\.)|$)`,
      'im'
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  // Fallback: return full text if section not found
  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeJaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 1;
}

function classifyInstruction(text: string): RevisionInstruction['category'] {
  const lower = text.toLowerCase();
  if (
    lower.includes('citation') ||
    lower.includes('authority') ||
    lower.includes('case law') ||
    lower.includes('legal support')
  ) {
    return 'citation';
  }
  if (
    lower.includes('reorganize') ||
    lower.includes('consolidate') ||
    lower.includes('structure') ||
    lower.includes('merge')
  ) {
    return 'structure';
  }
  if (
    lower.includes('format') ||
    lower.includes('caption') ||
    lower.includes('signature') ||
    lower.includes('spacing')
  ) {
    return 'formatting';
  }
  return 'content';
}

function extractTargetSections(text: string): string[] | undefined {
  const sectionPattern = /(?:argument|section)\s+([IVX]+|[A-D]|\d+)/gi;
  const matches = [...text.matchAll(sectionPattern)];
  if (matches.length > 0) {
    return matches.map(m => `Argument ${m[1]}`);
  }
  return undefined;
}
