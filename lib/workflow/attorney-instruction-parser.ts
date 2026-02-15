/**
 * ATTORNEY INSTRUCTION PARSER
 *
 * TASK-15: Prioritize attorney-instructed theory in legal framework.
 *
 * Audit Evidence (Pelican order):
 * Attorney said: "Focus on the undisputed facts showing Fontenot
 * violated provisions while still employed."
 * Phase II buried this in Element 3 as a subpoint.
 * Revision loops spent cycles restructuring — work that should
 * have been done at Phase II.
 *
 * Solution:
 * - Parse attorney_instructions for priority keywords
 * - Elevate specified theory to Element 1
 * - Add note: "Per attorney instruction, this is primary argument"
 *
 * @module attorney-instruction-parser
 */

// =======================================================================
// TYPES
// =======================================================================

export interface ParsedInstruction {
  hasPriority: boolean;
  priorityTheory?: string;
  priorityKeywords: string[];
  originalInstruction: string;
}

export interface FrameworkElement {
  elementNumber: number;
  title: string;
  description: string;
  isPrimaryArgument: boolean;
  perAttorneyInstruction: boolean;
}

// =======================================================================
// CONSTANTS
// =======================================================================

// Keywords that indicate attorney priority
const PRIORITY_KEYWORDS = [
  'focus on',
  'primary argument',
  'lead with',
  'emphasize',
  'key argument',
  'main theory',
  'most important',
  'central to',
  'the heart of',
  'primarily',
  'principally',
];

// Theory extraction patterns
const THEORY_PATTERNS: { pattern: RegExp; theory: string }[] = [
  { pattern: /while\s+(still\s+)?employed/i, theory: 'breach_during_employment' },
  { pattern: /during\s+employment/i, theory: 'breach_during_employment' },
  { pattern: /non-?compete/i, theory: 'non_compete_enforceability' },
  { pattern: /non-?solicit/i, theory: 'non_solicitation' },
  { pattern: /duty\s+of\s+loyalty/i, theory: 'duty_of_loyalty' },
  { pattern: /fiduciary/i, theory: 'fiduciary_duty' },
  { pattern: /trade\s+secret/i, theory: 'trade_secrets' },
  { pattern: /confidential/i, theory: 'confidentiality' },
  { pattern: /undisputed\s+facts/i, theory: 'undisputed_material_facts' },
  { pattern: /no\s+genuine\s+issue/i, theory: 'summary_judgment_standard' },
];

// =======================================================================
// PARSING
// =======================================================================

/**
 * Parse attorney instructions for priority indicators.
 */
export function parseAttorneyInstructions(
  instructions: string
): ParsedInstruction {
  const instructionsLower = instructions.toLowerCase();

  // Find priority keywords
  const foundKeywords: string[] = [];
  let priorityContext = '';

  for (const keyword of PRIORITY_KEYWORDS) {
    if (instructionsLower.includes(keyword)) {
      foundKeywords.push(keyword);

      // Extract context around keyword
      const index = instructionsLower.indexOf(keyword);
      const start = Math.max(0, index);
      const end = Math.min(instructions.length, index + 200);
      priorityContext = instructions.slice(start, end);
    }
  }

  if (foundKeywords.length === 0) {
    return {
      hasPriority: false,
      priorityKeywords: [],
      originalInstruction: instructions,
    };
  }

  // Extract the specific theory
  let priorityTheory: string | undefined;

  for (const { pattern, theory } of THEORY_PATTERNS) {
    if (pattern.test(priorityContext)) {
      priorityTheory = theory;
      break;
    }
  }

  return {
    hasPriority: true,
    priorityTheory,
    priorityKeywords: foundKeywords,
    originalInstruction: instructions,
  };
}

/**
 * Reorder framework elements based on attorney priority.
 */
export function reorderFrameworkElements(
  elements: FrameworkElement[],
  parsedInstruction: ParsedInstruction
): FrameworkElement[] {
  if (!parsedInstruction.hasPriority || !parsedInstruction.priorityTheory) {
    return elements;
  }

  const theory = parsedInstruction.priorityTheory;

  // Find element matching the priority theory
  const priorityIndex = elements.findIndex(e =>
    e.title.toLowerCase().includes(theory.replace(/_/g, ' ')) ||
    e.description.toLowerCase().includes(theory.replace(/_/g, ' '))
  );

  if (priorityIndex === -1 || priorityIndex === 0) {
    // No match found or already first
    return elements;
  }

  // Move priority element to position 1
  const priorityElement = {
    ...elements[priorityIndex],
    isPrimaryArgument: true,
    perAttorneyInstruction: true,
  };

  const reordered = [
    priorityElement,
    ...elements.slice(0, priorityIndex),
    ...elements.slice(priorityIndex + 1),
  ];

  // Renumber
  return reordered.map((e, i) => ({
    ...e,
    elementNumber: i + 1,
  }));
}

/**
 * Generate framework note for attorney-prioritized element.
 */
export function generatePriorityNote(parsedInstruction: ParsedInstruction): string {
  if (!parsedInstruction.hasPriority) {
    return '';
  }

  return `**Per attorney instruction**, this theory is the primary argument track. ` +
    `Keywords identified: ${parsedInstruction.priorityKeywords.join(', ')}.`;
}
