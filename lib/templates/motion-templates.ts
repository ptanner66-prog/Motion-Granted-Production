/**
 * Motion Template Library (Task 73)
 *
 * Template library for common motion sections.
 *
 * Templates for:
 * - Introduction paragraphs (by motion type)
 * - Procedural history sections
 * - Legal standard paragraphs (by motion type + jurisdiction)
 * - Conclusion paragraphs
 * - Prayer for relief (by motion type)
 *
 * Source: Chunk 10, Task 73 - P2 Pre-Launch
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('motion-templates');

// ============================================================================
// TYPES
// ============================================================================

export interface MotionTemplate {
  id: string;
  motionType: string;
  jurisdiction: string;
  section: 'introduction' | 'procedural_history' | 'legal_standard' | 'argument' | 'conclusion' | 'prayer';
  content: string;
  variables: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateSection = MotionTemplate['section'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseKey);
}

/**
 * Extract variables from template content
 */
function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{[A-Z_]+\}\}/g) || [];
  return [...new Set(matches)];
}

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

const DEFAULT_TEMPLATES: Record<string, Record<string, Record<TemplateSection, string>>> = {
  motion_summary_judgment: {
    ca_state: {
      introduction: `{{MOVING_PARTY}} hereby moves for summary judgment, or in the alternative, summary adjudication, pursuant to California Code of Civil Procedure § 437c. This motion is made on the grounds that there is no triable issue as to any material fact and {{MOVING_PARTY}} is entitled to judgment as a matter of law.`,
      procedural_history: `On {{COMPLAINT_DATE}}, {{PLAINTIFF}} filed a complaint against {{DEFENDANT}} alleging causes of action for {{CAUSES_OF_ACTION}}. {{DEFENDANT}} filed an answer on {{ANSWER_DATE}}. Discovery closed on {{DISCOVERY_CLOSE_DATE}}.`,
      legal_standard: `Summary judgment is appropriate when "all the papers submitted show that there is no triable issue as to any material fact and that the moving party is entitled to a judgment as a matter of law." CCP § 437c(c). The moving party bears the initial burden of production to make a prima facie showing that there are no triable issues of material fact. Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826, 850.

Once the moving party meets this burden, the burden shifts to the opposing party to show that a triable issue of material fact exists. Id. at 849. A triable issue of material fact exists only if "the evidence would allow a reasonable trier of fact to find the underlying fact in favor of the party opposing the motion in accordance with the applicable standard of proof." Id. at 850.`,
      argument: `{{MOVING_PARTY}} has demonstrated that no triable issues of material fact exist as to {{LEGAL_ISSUES}}. The evidence conclusively establishes that {{KEY_FACTS}}.`,
      conclusion: `For the foregoing reasons, {{MOVING_PARTY}} respectfully requests that this Court grant summary judgment in favor of {{MOVING_PARTY}} and against {{OPPOSING_PARTY}}.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} respectfully requests that this Court:

1. Grant this Motion for Summary Judgment;
2. Enter judgment in favor of {{MOVING_PARTY}} and against {{OPPOSING_PARTY}};
3. Award {{MOVING_PARTY}} costs of suit; and
4. Grant such other and further relief as the Court deems just and proper.`,
    },
    ca_federal: {
      introduction: `{{MOVING_PARTY}} respectfully moves for summary judgment pursuant to Federal Rule of Civil Procedure 56. {{MOVING_PARTY}} is entitled to judgment as a matter of law because there are no genuine disputes as to any material fact.`,
      procedural_history: `Plaintiff {{PLAINTIFF}} initiated this action on {{COMPLAINT_DATE}}, asserting claims for {{CAUSES_OF_ACTION}}. Defendant {{DEFENDANT}} answered the complaint on {{ANSWER_DATE}}. The parties have completed discovery.`,
      legal_standard: `Summary judgment is appropriate when "the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a). A fact is "material" if it "might affect the outcome of the suit under the governing law." Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986).

The moving party bears the initial burden of demonstrating the absence of a genuine issue of material fact. Celotex Corp. v. Catrett, 477 U.S. 317, 323 (1986). Once the moving party satisfies its burden, the nonmoving party must "go beyond the pleadings and by her own affidavits, or by the depositions, answers to interrogatories, and admissions on file, designate specific facts showing that there is a genuine issue for trial." Id. at 324.`,
      argument: `The undisputed material facts demonstrate that {{MOVING_PARTY}} is entitled to judgment as a matter of law on {{LEGAL_ISSUES}}.`,
      conclusion: `For the reasons stated herein, {{MOVING_PARTY}} respectfully requests that this Court grant summary judgment in its favor.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} respectfully requests that the Court:

1. Grant this Motion for Summary Judgment;
2. Enter judgment in favor of {{MOVING_PARTY}};
3. Award {{MOVING_PARTY}} its reasonable costs and attorneys' fees; and
4. Grant such other relief as the Court deems appropriate.`,
    },
    federal_5th: {
      introduction: `{{MOVING_PARTY}} moves for summary judgment pursuant to Federal Rule of Civil Procedure 56. No genuine dispute exists as to any material fact, and {{MOVING_PARTY}} is entitled to judgment as a matter of law.`,
      procedural_history: `This action arises from {{CASE_SUMMARY}}. {{PLAINTIFF}} filed suit on {{COMPLAINT_DATE}}, alleging {{CAUSES_OF_ACTION}}. {{DEFENDANT}} timely answered. The parties have engaged in discovery, which is now closed.`,
      legal_standard: `Summary judgment is proper where "the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a). The Fifth Circuit applies the standard articulated in Celotex Corp. v. Catrett, 477 U.S. 317 (1986), requiring the moving party to demonstrate the absence of genuine disputes of material fact.

A dispute about a material fact is genuine "if the evidence is such that a reasonable jury could return a verdict for the nonmoving party." Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986). Courts must view all facts and inferences in the light most favorable to the non-movant. Rosado v. Deters, 5 F.3d 119, 123 (5th Cir. 1993).`,
      argument: `Based on the undisputed facts, {{MOVING_PARTY}} has established that it is entitled to judgment as a matter of law.`,
      conclusion: `{{MOVING_PARTY}} has demonstrated the absence of any genuine dispute of material fact and its entitlement to judgment as a matter of law.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} prays that the Court:

1. Grant this Motion for Summary Judgment;
2. Enter final judgment in favor of {{MOVING_PARTY}};
3. Award costs to {{MOVING_PARTY}}; and
4. Grant such other relief as is just and proper.`,
    },
    federal_9th: {
      introduction: `Pursuant to Federal Rule of Civil Procedure 56, {{MOVING_PARTY}} moves for summary judgment. There is no genuine dispute as to any material fact, and {{MOVING_PARTY}} is entitled to judgment as a matter of law.`,
      procedural_history: `This case concerns {{CASE_SUMMARY}}. {{PLAINTIFF}} commenced this action on {{COMPLAINT_DATE}}, bringing claims for {{CAUSES_OF_ACTION}}. {{DEFENDANT}} filed its answer on {{ANSWER_DATE}}. The parties have completed fact discovery.`,
      legal_standard: `A party is entitled to summary judgment if "the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a). "A fact is 'material' if it might affect the outcome of the suit under the governing law." Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986).

The Ninth Circuit requires the court to view the evidence in the light most favorable to the non-moving party. T.W. Elec. Serv., Inc. v. Pac. Elec. Contractors Ass'n, 809 F.2d 626, 630-31 (9th Cir. 1987). However, the non-moving party must present "specific facts showing that there is a genuine issue for trial." Id. at 630.`,
      argument: `The evidence demonstrates that no genuine dispute of material fact exists regarding {{LEGAL_ISSUES}}.`,
      conclusion: `For the foregoing reasons, {{MOVING_PARTY}} is entitled to summary judgment.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} respectfully requests that the Court:

1. Grant summary judgment in favor of {{MOVING_PARTY}};
2. Enter judgment accordingly;
3. Award {{MOVING_PARTY}} its costs; and
4. Grant such other and further relief as the Court deems just.`,
    },
  },
  motion_dismiss: {
    ca_federal: {
      introduction: `{{MOVING_PARTY}} moves to dismiss the complaint pursuant to Federal Rule of Civil Procedure 12(b)(6) for failure to state a claim upon which relief can be granted.`,
      procedural_history: `{{PLAINTIFF}} filed the complaint on {{COMPLAINT_DATE}}, alleging {{CAUSES_OF_ACTION}}.`,
      legal_standard: `To survive a motion to dismiss under Rule 12(b)(6), a complaint must "state a claim to relief that is plausible on its face." Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570 (2007). A claim is facially plausible when the plaintiff pleads "factual content that allows the court to draw the reasonable inference that the defendant is liable for the misconduct alleged." Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).

Courts must accept factual allegations as true, but need not accept "legal conclusions" or "conclusory statements." Id. at 678-79. "Threadbare recitals of the elements of a cause of action, supported by mere conclusory statements, do not suffice." Id. at 678.`,
      argument: `The complaint fails to state a plausible claim for relief because {{DEFICIENCY_REASONS}}.`,
      conclusion: `The complaint fails to state any claim upon which relief may be granted and should be dismissed.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} respectfully requests that the Court:

1. Dismiss the complaint in its entirety with prejudice;
2. Award {{MOVING_PARTY}} its costs and attorneys' fees; and
3. Grant such other relief as the Court deems proper.`,
    },
    federal_5th: {
      introduction: `{{MOVING_PARTY}} moves to dismiss {{PLAINTIFF}}'s complaint under Federal Rule of Civil Procedure 12(b)(6).`,
      procedural_history: `{{PLAINTIFF}} initiated this action on {{COMPLAINT_DATE}}.`,
      legal_standard: `A motion to dismiss under Rule 12(b)(6) tests the legal sufficiency of the complaint. A complaint must contain "a short and plain statement of the claim showing that the pleader is entitled to relief." Fed. R. Civ. P. 8(a)(2). Under the Twombly/Iqbal standard, the factual allegations must "raise a right to relief above the speculative level." Bell Atl. Corp. v. Twombly, 550 U.S. 544, 555 (2007).`,
      argument: `{{PLAINTIFF}}'s complaint fails to plead sufficient facts to state a claim.`,
      conclusion: `The complaint should be dismissed for failure to state a claim.`,
      prayer: `WHEREFORE, {{MOVING_PARTY}} requests dismissal of the complaint with prejudice.`,
    },
    federal_9th: {
      introduction: `{{MOVING_PARTY}} moves to dismiss under Rule 12(b)(6) for failure to state a claim.`,
      procedural_history: `{{PLAINTIFF}} filed the complaint on {{COMPLAINT_DATE}}.`,
      legal_standard: `"To survive a motion to dismiss, a complaint must contain sufficient factual matter, accepted as true, to 'state a claim to relief that is plausible on its face.'" Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). The Ninth Circuit requires courts to accept all factual allegations as true but need not accept legal conclusions. Sprewell v. Golden State Warriors, 266 F.3d 979, 988 (9th Cir. 2001).`,
      argument: `{{PLAINTIFF}} has not alleged facts sufficient to support a plausible claim.`,
      conclusion: `The motion to dismiss should be granted.`,
      prayer: `{{MOVING_PARTY}} requests that the Court dismiss the complaint with prejudice.`,
    },
  },
};

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

/**
 * Get template from database or defaults
 */
export async function getTemplate(
  motionType: string,
  jurisdiction: string,
  section: TemplateSection
): Promise<MotionTemplate | null> {
  const supabase = getAdminClient();

  if (supabase) {
    // Try database first
    const { data } = await supabase
      .from('motion_templates')
      .select('*')
      .eq('motion_type', motionType)
      .eq('jurisdiction', jurisdiction)
      .eq('section', section)
      .single();

    if (data) {
      return {
        id: data.id,
        motionType: data.motion_type,
        jurisdiction: data.jurisdiction,
        section: data.section as TemplateSection,
        content: data.content,
        variables: data.variables || extractVariables(data.content),
        version: data.version,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    }
  }

  // Fall back to defaults
  const defaultContent = DEFAULT_TEMPLATES[motionType]?.[jurisdiction]?.[section];

  if (defaultContent) {
    return {
      id: `default_${motionType}_${jurisdiction}_${section}`,
      motionType,
      jurisdiction,
      section,
      content: defaultContent,
      variables: extractVariables(defaultContent),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return null;
}

/**
 * Get all templates for a motion type and jurisdiction
 */
export async function getTemplatesForMotion(
  motionType: string,
  jurisdiction: string
): Promise<MotionTemplate[]> {
  const sections: TemplateSection[] = [
    'introduction',
    'procedural_history',
    'legal_standard',
    'argument',
    'conclusion',
    'prayer',
  ];

  const templates: MotionTemplate[] = [];

  for (const section of sections) {
    const template = await getTemplate(motionType, jurisdiction, section);
    if (template) {
      templates.push(template);
    }
  }

  return templates;
}

/**
 * Create or update a template
 */
export async function createTemplate(
  template: Omit<MotionTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<MotionTemplate | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    return null;
  }

  const variables = template.variables.length > 0
    ? template.variables
    : extractVariables(template.content);

  const { data, error } = await supabase
    .from('motion_templates')
    .upsert(
      {
        motion_type: template.motionType,
        jurisdiction: template.jurisdiction,
        section: template.section,
        content: template.content,
        variables,
        version: 1,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'motion_type,jurisdiction,section',
      }
    )
    .select()
    .single();

  if (error || !data) {
    log.error('Create error', { error });
    return null;
  }

  return {
    id: data.id,
    motionType: data.motion_type,
    jurisdiction: data.jurisdiction,
    section: data.section as TemplateSection,
    content: data.content,
    variables: data.variables,
    version: data.version,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  id: string,
  content: string
): Promise<MotionTemplate | null> {
  const supabase = getAdminClient();

  if (!supabase) {
    return null;
  }

  // Get current version
  const { data: current } = await supabase
    .from('motion_templates')
    .select('version')
    .eq('id', id)
    .single();

  const newVersion = (current?.version || 0) + 1;
  const variables = extractVariables(content);

  const { data, error } = await supabase
    .from('motion_templates')
    .update({
      content,
      variables,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    motionType: data.motion_type,
    jurisdiction: data.jurisdiction,
    section: data.section as TemplateSection,
    content: data.content,
    variables: data.variables,
    version: data.version,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Apply template by substituting variables
 */
export function applyTemplate(
  template: MotionTemplate,
  variables: Record<string, string>
): string {
  let content = template.content;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
    content = content.split(placeholder).join(value);
  }

  return content;
}

/**
 * Get available motion types
 */
export function getAvailableMotionTypes(): string[] {
  return Object.keys(DEFAULT_TEMPLATES);
}

/**
 * Get available jurisdictions for a motion type
 */
export function getAvailableJurisdictions(motionType: string): string[] {
  return Object.keys(DEFAULT_TEMPLATES[motionType] || {});
}
