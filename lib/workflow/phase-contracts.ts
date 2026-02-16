/**
 * Phase Boundary Contracts — Motion Granted
 *
 * SP-12 AI-1/AI-2/AI-3: Typed contracts for all 14 phase boundaries.
 * Zod schemas validate phase outputs at runtime to catch malformed data
 * before it crosses phase boundaries.
 *
 * Includes:
 *   - AI-1: Phase IX-to-X data contract + CP3 payload
 *   - AI-2: Typed phase boundary contracts for all 14 phases
 *   - AI-3: Phase VII re-entry discriminated union
 */

import { z } from 'zod';
import { NonRetriableError } from 'inngest';

// ============================================================================
// OUTPUT VALIDATION ERROR
// ============================================================================

export class OutputValidationError extends NonRetriableError {
  constructor(phase: string, errors: z.ZodError) {
    super(`Phase ${phase} output validation failed: ${errors.message}`);
  }
}

// ============================================================================
// AI-1: PHASE IX-TO-X DATA CONTRACT
// ============================================================================

/** Phase IX output schema — data flowing into Phase X assembly */
export const PhaseIXOutputSchema = z.object({
  orderId: z.string().uuid(),
  motion: z.object({
    title: z.string(),
    content: z.string(),
    citations: z.array(z.object({
      id: z.string(),
      text: z.string(),
      verified: z.boolean(),
      status: z.string(),
    })),
  }),
  supportingDocs: z.array(z.object({
    type: z.string(),
    title: z.string(),
    content: z.string(),
  })).optional(),
  qualityScore: z.number().min(0).max(1),
  phaseTimings: z.record(z.number()).optional(),
});

export type PhaseIXOutput = z.infer<typeof PhaseIXOutputSchema>;

/** Normalize supporting docs for Phase X assembly */
export function normalizeSupportingDocs(docs: PhaseIXOutput['supportingDocs']): string[] {
  if (!docs || docs.length === 0) return [];
  return docs.map((doc: { type: string; title: string; content: string }) => `## ${doc.title}\n\n${doc.content}`);
}

// ============================================================================
// AI-1: CP3 REACHED CANONICAL PAYLOAD (v5-XDC-007)
// ============================================================================

/** [v5-XDC-007] CP3 reached canonical payload */
export interface CP3ReachedPayload {
  orderId: string;        // REQUIRED
  workflowId: string;     // REQUIRED — from DB, NOT from client request
  packageId: string;      // REQUIRED — delivery_packages.id
  tier?: string;          // RECOMMENDED — 'A'|'B'|'C'|'D'
  attorneyEmail?: string; // RECOMMENDED — for notification email
}

export const CP3ReachedSchema = z.object({
  orderId: z.string().uuid(),
  workflowId: z.string(),
  packageId: z.string().uuid(),
  tier: z.enum(['A', 'B', 'C', 'D']).optional(),
  attorneyEmail: z.string().email().optional(),
});

// ============================================================================
// AI-2: TYPED PHASE BOUNDARY CONTRACTS FOR ALL 14 PHASES
// ============================================================================

/** Base schema all phases extend */
const PhaseOutputBase = z.object({
  orderId: z.string().uuid(),
  phase: z.string(),
  tier: z.enum(['A', 'B', 'C', 'D']),
  timestamp: z.string().datetime(),
});

export const PhaseSchemas: Record<string, z.ZodSchema> = {
  PHASE_I: PhaseOutputBase.extend({
    jurisdiction: z.string(),
    motionType: z.string(),
    caseAnalysis: z.string(),
    stateCode: z.string().length(2).optional(),
  }),
  PHASE_II: PhaseOutputBase.extend({
    legalFramework: z.string(),
    applicableStatutes: z.array(z.string()),
  }),
  PHASE_III: PhaseOutputBase.extend({
    researchResults: z.string(),
    caselaw: z.array(z.string()),
  }),
  PHASE_IV: PhaseOutputBase.extend({
    draftContent: z.string().min(100),
    wordCount: z.number().positive(),
  }),
  PHASE_V: PhaseOutputBase.extend({
    citationsVerified: z.number(),
    citationsFailed: z.number(),
    verificationRate: z.number().min(0).max(1),
  }),
  PHASE_V1: PhaseOutputBase.extend({ // V.1
    deepVerificationResults: z.array(z.object({
      citationId: z.string(),
      status: z.string(),
    })),
  }),
  PHASE_VI: PhaseOutputBase.extend({
    formattedDraft: z.string(),
    pageCount: z.number().positive(),
  }),
  PHASE_VII: PhaseOutputBase.extend({
    qualityScore: z.number().min(0).max(1),
    grade: z.string(),
    issues: z.array(z.string()),
  }),
  PHASE_VIII: PhaseOutputBase.extend({
    revisedContent: z.string(),
    changesApplied: z.array(z.string()),
    iterationNumber: z.number(),
  }),
  PHASE_VIII5: PhaseOutputBase.extend({ // VIII.5
    fabricationAuditResult: z.object({
      passed: z.boolean(),
      flaggedCitations: z.array(z.string()),
    }),
  }),
  PHASE_IX: PhaseIXOutputSchema,
  PHASE_IX1: PhaseOutputBase.extend({ // IX.1
    hardStopVerification: z.object({
      citationsChecked: z.number(),
      allPassed: z.boolean(),
    }),
  }),
  PHASE_X: PhaseOutputBase.extend({
    packageAssembled: z.boolean(),
    deliverableCount: z.number(),
  }),
  PHASE_X5: PhaseOutputBase.extend({ // X.5
    cp3Ready: z.boolean(),
    packageId: z.string().uuid(),
  }),
};

/**
 * Validate phase output — throws OutputValidationError if invalid.
 *
 * @param phase - Phase identifier (e.g., 'PHASE_VII')
 * @param output - The phase output to validate
 * @throws OutputValidationError if validation fails
 */
export function validatePhaseOutput(phase: string, output: unknown): void {
  const schema = PhaseSchemas[phase];
  if (!schema) {
    console.warn(`No schema defined for phase ${phase} — skipping validation`);
    return;
  }

  const result = schema.safeParse(output);
  if (!result.success) {
    throw new OutputValidationError(phase, result.error);
  }
}

// ============================================================================
// AI-3: PHASE VII RE-ENTRY DISCRIMINATED UNION
// ============================================================================

export type PhaseVIISource = 'PHASE_VI' | 'ATTORNEY_REWORK' | 'INTERNAL_REVISION';

export const PhaseVIIInputSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('PHASE_VI'),
    orderId: z.string().uuid(),
    draftContent: z.string(),
    iterationNumber: z.literal(0), // First pass from Phase VI
  }),
  z.object({
    source: z.literal('ATTORNEY_REWORK'),
    orderId: z.string().uuid(),
    draftContent: z.string(),
    attorneyFeedback: z.string(),
    reworkCycleNumber: z.number().min(1).max(3), // Max 3 attorney reworks
  }),
  z.object({
    source: z.literal('INTERNAL_REVISION'),
    orderId: z.string().uuid(),
    draftContent: z.string(),
    phaseVIIIFeedback: z.string(),
    internalIterationNumber: z.number().min(1),
    priorScore: z.number().min(0).max(1),
  }),
]);

export type PhaseVIIInput = z.infer<typeof PhaseVIIInputSchema>;
