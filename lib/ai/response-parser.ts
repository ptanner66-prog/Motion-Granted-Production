/**
 * Phase-Specific Response Validation Schemas (D2-008)
 *
 * Zod schemas for validating AI phase output structure. Phases not listed
 * here fall through to GenericPhaseResponseSchema.
 */

import { z } from 'zod';

// ============================================================================
// PHASE I — Intake & Document Processing
// ============================================================================

export const PhaseIResponseSchema = z.object({
  filing_deadline: z.string().optional(),
  jurisdiction: z.string(),
  case_summary: z.string(),
  legal_theories: z.array(z.string()),
  parties: z.array(z.object({
    name: z.string(),
    role: z.string(),
  })).optional(),
  key_facts: z.array(z.string()).optional(),
}).passthrough();

// ============================================================================
// PHASE IV — Authority Research
// ============================================================================

export const PhaseIVResponseSchema = z.object({
  caseCitationBank: z.array(z.object({
    name: z.string(),
    citation: z.string().optional(),
    holding: z.string().optional(),
    relevance: z.string().optional(),
  })).optional(),
  statutoryCitationBank: z.array(z.object({
    name: z.string(),
    citation: z.string().optional(),
  })).optional(),
}).passthrough();

// ============================================================================
// PHASE V — Drafting
// ============================================================================

export const PhaseVResponseSchema = z.object({
  draft: z.string().optional(),
  draftMotion: z.object({
    caption: z.string().optional(),
    introduction: z.string().optional(),
    statement_of_facts: z.string().optional(),
    argument: z.string().optional(),
    conclusion: z.string().optional(),
    prayer_for_relief: z.string().optional(),
  }).passthrough().optional(),
  citations: z.array(z.object({ name: z.string() })).optional(),
}).passthrough();

// ============================================================================
// PHASE VII — Judge Simulation
// ============================================================================

export const PhaseVIIResponseSchema = z.object({
  overall_assessment: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  suggested_revisions: z.array(z.string()).optional(),
  likelihood_of_success: z.number().min(0).max(100).optional(),
  grade: z.object({
    letter: z.string().optional(),
    numeric_score: z.number().optional(),
  }).optional(),
}).passthrough();

// ============================================================================
// PHASE VIII — Revisions
// ============================================================================

export const PhaseVIIIResponseSchema = z.object({
  revisedMotion: z.object({
    caption: z.string().optional(),
    introduction: z.string().optional(),
    statement_of_facts: z.string().optional(),
    argument: z.string().optional(),
    conclusion: z.string().optional(),
    prayer_for_relief: z.string().optional(),
  }).passthrough().optional(),
  revisions_applied: z.array(z.string()).optional(),
}).passthrough();

// ============================================================================
// GENERIC FALLBACK
// ============================================================================

export const GenericPhaseResponseSchema = z.record(z.string(), z.unknown());

// ============================================================================
// PHASE SCHEMA MAP
// ============================================================================

const PHASE_SCHEMAS: Record<string, z.ZodType> = {
  'I': PhaseIResponseSchema,
  'IV': PhaseIVResponseSchema,
  'V': PhaseVResponseSchema,
  'VII': PhaseVIIResponseSchema,
  'VIII': PhaseVIIIResponseSchema,
};

/**
 * Validate a phase output against its schema.
 * Returns the parsed data on success, or null with logged warnings on failure.
 */
export function validatePhaseOutput(
  phase: string,
  data: unknown
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const schema = PHASE_SCHEMAS[phase] || GenericPhaseResponseSchema;

  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  );

  console.warn(`[ResponseParser] Phase ${phase} validation failed:`, errors);
  return { success: false, errors };
}
