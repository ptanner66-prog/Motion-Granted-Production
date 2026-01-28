/**
 * Motion Templates Module
 *
 * Contains templates and prompts for generating different motion types.
 * Each template includes structure, required sections, and AI generation hints.
 */

import type { MotionTier, WorkflowPath } from '@/types/workflow';

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

export interface MotionTemplate {
  code: string;
  name: string;
  tier: MotionTier;
  structure: DocumentSection[];
  requiredSections: string[];
  optionalSections: string[];
  citationGuidance: CitationGuidance;
  generationPrompts: GenerationPrompts;
  qualityCriteria: QualityCriteria;
}

export interface DocumentSection {
  id: string;
  name: string;
  required: boolean;
  order: number;
  description: string;
  estimatedParagraphs: number;
  contentGuidance: string;
}

export interface CitationGuidance {
  minimumCitations: number;
  primaryTypes: string[];
  authorityPreference: string[];
  citationStyle: string;
  specificGuidance: string;
}

export interface GenerationPrompts {
  introduction: string;
  facts: string;
  argument: string;
  conclusion: string;
  systemContext: string;
}

export interface QualityCriteria {
  minimumWordCount: number;
  maximumWordCount: number;
  minimumPageCount: number;
  maximumPageCount: number;
  requiredElements: string[];
  styleGuidelines: string[];
}

// ============================================================================
// BASE TEMPLATES
// ============================================================================

const BASE_DOCUMENT_SECTIONS: DocumentSection[] = [
  {
    id: 'caption',
    name: 'Caption',
    required: true,
    order: 1,
    description: 'Case caption with parties, court, and case number',
    estimatedParagraphs: 0,
    contentGuidance: 'Standard case caption format',
  },
  {
    id: 'introduction',
    name: 'Introduction/Preliminary Statement',
    required: true,
    order: 2,
    description: 'Brief overview of the motion and relief sought',
    estimatedParagraphs: 2,
    contentGuidance: 'Concise statement of what motion seeks and why',
  },
  {
    id: 'statement_of_facts',
    name: 'Statement of Facts',
    required: true,
    order: 3,
    description: 'Relevant factual background',
    estimatedParagraphs: 5,
    contentGuidance: 'Present facts objectively, cite to record',
  },
  {
    id: 'argument',
    name: 'Argument',
    required: true,
    order: 4,
    description: 'Legal arguments supporting the motion',
    estimatedParagraphs: 10,
    contentGuidance: 'Organize by issue, cite authority, apply to facts',
  },
  {
    id: 'conclusion',
    name: 'Conclusion',
    required: true,
    order: 5,
    description: 'Summary and specific relief requested',
    estimatedParagraphs: 2,
    contentGuidance: 'Briefly restate key points and precise relief sought',
  },
  {
    id: 'signature',
    name: 'Signature Block',
    required: true,
    order: 6,
    description: 'Attorney signature and contact information',
    estimatedParagraphs: 0,
    contentGuidance: 'Standard signature block format',
  },
];

const BASE_CITATION_GUIDANCE: CitationGuidance = {
  minimumCitations: 4,
  primaryTypes: ['case', 'statute'],
  authorityPreference: ['binding', 'persuasive'],
  citationStyle: 'Bluebook',
  specificGuidance: 'Cite binding authority from same jurisdiction when available',
};

const BASE_QUALITY_CRITERIA: QualityCriteria = {
  minimumWordCount: 1500,
  maximumWordCount: 10000,
  minimumPageCount: 5,
  maximumPageCount: 25,
  requiredElements: [
    'Clear thesis statement',
    'Proper legal standards',
    'Application of law to facts',
    'Specific relief requested',
  ],
  styleGuidelines: [
    'Professional tone',
    'Active voice preferred',
    'Avoid legalese when possible',
    'Precise, concise language',
  ],
};

// ============================================================================
// MOTION-SPECIFIC TEMPLATES
// ============================================================================

export const MOTION_TEMPLATES: Record<string, MotionTemplate> = {
  // TIER A: Procedural/Administrative Motions
  MTD_12B6: {
    code: 'MTD_12B6',
    name: 'Motion to Dismiss (12(b)(6))',
    tier: 'A',
    structure: [
      ...BASE_DOCUMENT_SECTIONS.slice(0, 3),
      {
        id: 'legal_standard',
        name: 'Legal Standard',
        required: true,
        order: 3.5,
        description: '12(b)(6) standard of review',
        estimatedParagraphs: 3,
        contentGuidance: 'Explain plausibility standard from Twombly/Iqbal',
      },
      ...BASE_DOCUMENT_SECTIONS.slice(3),
    ],
    requiredSections: ['caption', 'introduction', 'statement_of_facts', 'legal_standard', 'argument', 'conclusion'],
    optionalSections: ['procedural_history'],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 6,
      specificGuidance: `
        REQUIRED CITATIONS:
        - Ashcroft v. Iqbal, 556 U.S. 662 (2009)
        - Bell Atl. Corp. v. Twombly, 550 U.S. 544 (2007)
        - Circuit-specific 12(b)(6) standards
        - Cases addressing specific elements of each claim
      `,
    },
    generationPrompts: {
      introduction: 'Begin by identifying which claims fail and the primary deficiency (legal or factual)',
      facts: 'Focus on what plaintiff alleges vs. what is required to state a claim',
      argument: 'Address each claim separately. For each: (1) identify elements, (2) show what is missing',
      conclusion: 'Request dismissal with prejudice if futility can be shown, otherwise without prejudice',
      systemContext: `You are drafting a motion to dismiss under FRCP 12(b)(6). The standard requires showing that
        even accepting all well-pleaded facts as true and drawing all reasonable inferences in plaintiff's favor,
        the complaint fails to state a claim that is plausible on its face.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      requiredElements: [
        'Twombly/Iqbal plausibility standard',
        'Elements of each challenged claim',
        'Specific deficiency for each claim',
        'Whether dismissal should be with or without prejudice',
      ],
    },
  },

  MSJ: {
    code: 'MSJ',
    name: 'Motion for Summary Judgment',
    tier: 'A',
    structure: [
      ...BASE_DOCUMENT_SECTIONS.slice(0, 2),
      {
        id: 'statement_of_undisputed_facts',
        name: 'Statement of Undisputed Material Facts',
        required: true,
        order: 2.5,
        description: 'Numbered statement of material facts',
        estimatedParagraphs: 10,
        contentGuidance: 'Each fact numbered, cite to evidence, material to claims/defenses',
      },
      {
        id: 'legal_standard',
        name: 'Legal Standard',
        required: true,
        order: 3,
        description: 'Summary judgment standard',
        estimatedParagraphs: 2,
        contentGuidance: 'FRCP 56 standard - no genuine dispute of material fact',
      },
      ...BASE_DOCUMENT_SECTIONS.slice(3),
    ],
    requiredSections: ['caption', 'introduction', 'statement_of_undisputed_facts', 'legal_standard', 'argument', 'conclusion'],
    optionalSections: ['response_to_opposing_facts'],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 8,
      specificGuidance: `
        REQUIRED CITATIONS:
        - Celotex Corp. v. Catrett, 477 U.S. 317 (1986)
        - Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986)
        - Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574 (1986)
        - Circuit-specific summary judgment standards
        - Substantive law for each claim/defense
      `,
    },
    generationPrompts: {
      introduction: 'State whether seeking full or partial summary judgment and on which claims',
      facts: 'Present undisputed facts in numbered paragraphs, each citing specific evidence',
      argument: 'For each claim: (1) legal elements, (2) undisputed facts establishing each element or showing opponent cannot',
      conclusion: 'Specify exact relief: judgment on claims X, Y, Z; alternative partial summary judgment',
      systemContext: `You are drafting a motion for summary judgment under FRCP 56. Must show no genuine dispute
        of material fact and entitlement to judgment as a matter of law. Support each fact with admissible evidence.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      minimumWordCount: 3000,
      requiredElements: [
        'Separate statement of undisputed facts',
        'Each fact supported by evidence citation',
        'Clear link between facts and legal elements',
        'Address all claims or specify partial judgment',
      ],
    },
  },

  MCOMPEL: {
    code: 'MCOMPEL',
    name: 'Motion to Compel Discovery',
    tier: 'A',
    structure: [
      ...BASE_DOCUMENT_SECTIONS.slice(0, 3),
      {
        id: 'meet_and_confer',
        name: 'Meet and Confer Statement',
        required: true,
        order: 3.5,
        description: 'Description of good faith efforts to resolve',
        estimatedParagraphs: 2,
        contentGuidance: 'Document all meet and confer efforts with dates',
      },
      {
        id: 'discovery_at_issue',
        name: 'Discovery Requests at Issue',
        required: true,
        order: 3.6,
        description: 'Specific requests and responses/objections',
        estimatedParagraphs: 5,
        contentGuidance: 'Quote each request and the response/objection',
      },
      ...BASE_DOCUMENT_SECTIONS.slice(3),
    ],
    requiredSections: ['caption', 'introduction', 'meet_and_confer', 'discovery_at_issue', 'argument', 'conclusion'],
    optionalSections: ['proposed_order'],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 5,
      specificGuidance: `
        REQUIRED CITATIONS:
        - FRCP 26(b)(1) scope of discovery
        - FRCP 37(a) motion to compel
        - Proportionality factors from FRCP 26
        - Privilege cases if applicable
      `,
    },
    generationPrompts: {
      introduction: 'Identify what discovery is at issue and why it matters to the case',
      facts: 'Timeline of discovery, requests, responses, meet and confer efforts',
      argument: 'For each request: (1) why relevant, (2) why objection fails, (3) proportionality',
      conclusion: 'Request order compelling responses by specific date and sanctions',
      systemContext: `You are drafting a motion to compel discovery responses. Must demonstrate good faith
        meet and confer, relevance of discovery, and why objections are improper.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      requiredElements: [
        'Meet and confer certification',
        'Specific requests quoted',
        'Relevance of each request',
        'Response to each objection',
        'Request for sanctions if appropriate',
      ],
    },
  },

  // TIER B: Intermediate Motions
  MTC: {
    code: 'MTC',
    name: 'Motion to Continue',
    tier: 'B',
    structure: BASE_DOCUMENT_SECTIONS,
    requiredSections: ['caption', 'introduction', 'statement_of_facts', 'argument', 'conclusion'],
    optionalSections: [],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 2,
      specificGuidance: 'Cite local rules on continuances and good cause standard',
    },
    generationPrompts: {
      introduction: 'State what date needs to be continued and proposed new date',
      facts: 'Explain circumstances requiring continuance',
      argument: 'Establish good cause and lack of prejudice to opposing party',
      conclusion: 'Request specific new date or time frame',
      systemContext: `You are drafting a motion to continue. Must show good cause and that
        the continuance will not unduly prejudice the opposing party or delay proceedings.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      minimumWordCount: 500,
      maximumWordCount: 2000,
      minimumPageCount: 2,
      maximumPageCount: 5,
      requiredElements: ['Current deadline', 'Proposed new deadline', 'Good cause', 'No prejudice'],
    },
  },

  MSTRIKE: {
    code: 'MSTRIKE',
    name: 'Motion to Strike',
    tier: 'B',
    structure: BASE_DOCUMENT_SECTIONS,
    requiredSections: ['caption', 'introduction', 'statement_of_facts', 'argument', 'conclusion'],
    optionalSections: [],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 4,
      specificGuidance: 'Cite FRCP 12(f) and cases on what is immaterial, impertinent, or scandalous',
    },
    generationPrompts: {
      introduction: 'Identify specific allegations or defenses to be stricken',
      facts: 'Describe the offending content and its context',
      argument: 'Explain why content is immaterial, impertinent, or scandalous under 12(f)',
      conclusion: 'Request specific paragraphs or content be stricken',
      systemContext: `You are drafting a motion to strike under FRCP 12(f). The court may strike
        matter that is redundant, immaterial, impertinent, or scandalous.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      minimumWordCount: 1000,
      requiredElements: ['Specific content to strike', 'Category (immaterial/impertinent/scandalous)', 'Prejudice if not stricken'],
    },
  },

  // TIER C: Complex/Dispositive Motions
  MEXT: {
    code: 'MEXT',
    name: 'Motion for Extension of Time',
    tier: 'C',
    structure: BASE_DOCUMENT_SECTIONS,
    requiredSections: ['caption', 'introduction', 'statement_of_facts', 'argument', 'conclusion'],
    optionalSections: [],
    citationGuidance: {
      ...BASE_CITATION_GUIDANCE,
      minimumCitations: 1,
      specificGuidance: 'Cite FRCP 6(b) or applicable local rule',
    },
    generationPrompts: {
      introduction: 'State current deadline and requested extension',
      facts: 'Briefly explain why extension is needed',
      argument: 'Good cause exists and excusable neglect if deadline passed',
      conclusion: 'Request specific number of additional days',
      systemContext: `You are drafting a motion for extension of time. Keep it brief and focused.
        Show good cause for the extension.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      minimumWordCount: 300,
      maximumWordCount: 1000,
      minimumPageCount: 1,
      maximumPageCount: 3,
      requiredElements: ['Current deadline', 'Requested new deadline', 'Reason for extension'],
    },
  },

  MPRO_HAC: {
    code: 'MPRO_HAC',
    name: 'Motion for Pro Hac Vice Admission',
    tier: 'C',
    structure: [
      BASE_DOCUMENT_SECTIONS[0],
      {
        id: 'attorney_qualifications',
        name: 'Attorney Qualifications',
        required: true,
        order: 2,
        description: 'Bar admissions and good standing',
        estimatedParagraphs: 2,
        contentGuidance: 'List all bar admissions and confirm good standing',
      },
      {
        id: 'local_counsel',
        name: 'Local Counsel',
        required: true,
        order: 3,
        description: 'Identification of sponsoring local counsel',
        estimatedParagraphs: 1,
        contentGuidance: 'Identify local counsel who will sponsor admission',
      },
      BASE_DOCUMENT_SECTIONS[4],
      BASE_DOCUMENT_SECTIONS[5],
    ],
    requiredSections: ['caption', 'attorney_qualifications', 'local_counsel', 'conclusion'],
    optionalSections: [],
    citationGuidance: {
      minimumCitations: 0,
      primaryTypes: [],
      authorityPreference: [],
      citationStyle: 'Bluebook',
      specificGuidance: 'Cite local rule governing pro hac vice admission',
    },
    generationPrompts: {
      introduction: 'State attorney name and request for pro hac vice admission',
      facts: 'Attorney credentials and bar admissions',
      argument: 'Meets all requirements for pro hac vice admission',
      conclusion: 'Request admission pro hac vice',
      systemContext: `You are drafting a motion for pro hac vice admission. Follow local court rules precisely.`,
    },
    qualityCriteria: {
      ...BASE_QUALITY_CRITERIA,
      minimumWordCount: 200,
      maximumWordCount: 800,
      minimumPageCount: 1,
      maximumPageCount: 2,
      requiredElements: ['Attorney name and bar numbers', 'Good standing certification', 'Local counsel identification'],
    },
  },
};

// ============================================================================
// OPPOSITION TEMPLATES (Path B)
// ============================================================================

export const OPPOSITION_TEMPLATE_ADDITIONS: Partial<Record<string, Partial<MotionTemplate>>> = {
  MTD_12B6: {
    structure: [
      ...BASE_DOCUMENT_SECTIONS.slice(0, 2),
      {
        id: 'response_to_arguments',
        name: 'Response to Defendant\'s Arguments',
        required: true,
        order: 3.5,
        description: 'Point-by-point response to motion arguments',
        estimatedParagraphs: 10,
        contentGuidance: 'Address each argument raised, explain why complaint states valid claims',
      },
      ...BASE_DOCUMENT_SECTIONS.slice(3),
    ],
    generationPrompts: {
      introduction: 'State that complaint properly states claims and motion should be denied',
      facts: 'Highlight facts supporting each element of claims',
      argument: 'For each claim challenged: (1) correct legal standard, (2) facts meeting each element, (3) why defendant misreads complaint',
      conclusion: 'Request denial of motion; alternative request for leave to amend if needed',
      systemContext: `You are drafting an opposition to a motion to dismiss. Must show that accepting
        well-pleaded facts as true, the complaint states plausible claims.`,
    },
  },

  MSJ: {
    structure: [
      ...BASE_DOCUMENT_SECTIONS.slice(0, 2),
      {
        id: 'response_to_facts',
        name: 'Response to Statement of Facts',
        required: true,
        order: 2.5,
        description: 'Response to each numbered fact',
        estimatedParagraphs: 10,
        contentGuidance: 'Admit, deny, or dispute each fact with citation',
      },
      {
        id: 'statement_of_additional_facts',
        name: 'Statement of Additional Material Facts',
        required: false,
        order: 2.6,
        description: 'Additional facts supporting opposition',
        estimatedParagraphs: 5,
        contentGuidance: 'Additional facts that create genuine disputes',
      },
      ...BASE_DOCUMENT_SECTIONS.slice(3),
    ],
    generationPrompts: {
      introduction: 'State that genuine disputes of material fact exist',
      facts: 'Respond to each fact; present additional facts showing disputes',
      argument: 'For each claim: show disputed facts or alternative legal interpretation',
      conclusion: 'Request denial of motion; identify facts requiring trial',
      systemContext: `You are drafting an opposition to summary judgment. Must show genuine disputes
        of material fact or that movant is not entitled to judgment as a matter of law.`,
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get template for a specific motion type
 */
export function getMotionTemplate(motionCode: string): MotionTemplate | null {
  return MOTION_TEMPLATES[motionCode] || null;
}

/**
 * Get opposition template additions for a motion type
 */
export function getOppositionTemplate(motionCode: string): Partial<MotionTemplate> | null {
  return OPPOSITION_TEMPLATE_ADDITIONS[motionCode] || null;
}

/**
 * Get full template for a workflow path
 */
export function getTemplateForPath(
  motionCode: string,
  path: WorkflowPath
): MotionTemplate | null {
  const baseTemplate = getMotionTemplate(motionCode);
  if (!baseTemplate) return null;

  if (path === 'path_a') {
    return baseTemplate;
  }

  // Path B: merge opposition additions
  const oppositionAdditions = getOppositionTemplate(motionCode);
  if (!oppositionAdditions) return baseTemplate;

  return {
    ...baseTemplate,
    ...oppositionAdditions,
    name: `Opposition to ${baseTemplate.name}`,
  } as MotionTemplate;
}

/**
 * Generate AI prompt for a specific section
 */
export function generateSectionPrompt(
  template: MotionTemplate,
  sectionId: string,
  context: Record<string, unknown>
): string {
  const section = template.structure.find(s => s.id === sectionId);
  if (!section) return '';

  const prompts = template.generationPrompts;
  let basePrompt = '';

  switch (sectionId) {
    case 'introduction':
      basePrompt = prompts.introduction;
      break;
    case 'statement_of_facts':
    case 'statement_of_undisputed_facts':
      basePrompt = prompts.facts;
      break;
    case 'argument':
    case 'response_to_arguments':
      basePrompt = prompts.argument;
      break;
    case 'conclusion':
      basePrompt = prompts.conclusion;
      break;
    default:
      basePrompt = section.contentGuidance;
  }

  return `${template.generationPrompts.systemContext}

Section: ${section.name}
Guidance: ${basePrompt}
Content Guidance: ${section.contentGuidance}
Estimated Length: ${section.estimatedParagraphs} paragraphs

Context:
${JSON.stringify(context, null, 2)}`;
}

/**
 * Validate document against template quality criteria
 */
export function validateAgainstTemplate(
  template: MotionTemplate,
  document: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const wordCount = document.split(/\s+/).length;
  const criteria = template.qualityCriteria;

  if (wordCount < criteria.minimumWordCount) {
    issues.push(`Document is too short: ${wordCount} words (minimum ${criteria.minimumWordCount})`);
  }

  if (wordCount > criteria.maximumWordCount) {
    issues.push(`Document is too long: ${wordCount} words (maximum ${criteria.maximumWordCount})`);
  }

  // Check for required sections
  const documentLower = document.toLowerCase();
  for (const section of template.requiredSections) {
    const sectionDef = template.structure.find(s => s.id === section);
    if (sectionDef && !documentLower.includes(sectionDef.name.toLowerCase())) {
      issues.push(`Missing required section: ${sectionDef.name}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
