/**
 * CIV Step 7: Output Compilation
 *
 * Compile all verification results into a structured JSON object
 * for storage, reporting, and downstream use.
 */

import crypto from 'crypto';
import {
  calculateCompositeConfidence,
  FLAG_SEVERITY_MAP,
  FLAG_AUTO_RESOLVABLE,
  type FinalVerificationOutput,
  type ExistenceCheckOutput,
  type HoldingVerificationOutput,
  type DictaDetectionOutput,
  type QuoteVerificationOutput,
  type BadLawCheckOutput,
  type AuthorityStrengthOutput,
  type VerificationStatus,
  type ActionRequired,
  type CIVFlag,
  type FlagType,
  type PropositionType,
} from '../types';
import { parseCitation } from '../database';

/**
 * Execute Step 7: Compile final output
 */
export function compileVerificationOutput(
  citationInput: string,
  proposition: string,
  propositionType: PropositionType,
  inCitationBank: boolean,
  step1: ExistenceCheckOutput,
  step2: HoldingVerificationOutput,
  step3: DictaDetectionOutput,
  step4: QuoteVerificationOutput,
  step5: BadLawCheckOutput,
  step6: AuthorityStrengthOutput,
  metadata: {
    orderId?: string;
    phase: 'V.1' | 'VII.1' | 'IX.1';
    startTime: number;
    modelsUsed: string[];
    apiCallsMade: number;
  }
): FinalVerificationOutput {
  const verificationId = crypto.randomUUID();
  const endTime = Date.now();

  // Parse citation for structured data
  const parsedCitation = parseCitation(citationInput);

  // Calculate composite confidence
  // BUG-FIX A10-P0-001: Step 2 returns confidence on 0-100 scale (from GPT-4 Turbo Stage 1).
  // calculateCompositeConfidence expects ALL inputs on 0-1 scale.
  // Without normalization, step2's 85 * 0.35 weight = 29.75, clamped to 1.0 → always VERIFIED.
  const step2Normalized = step2.finalConfidence > 1 ? step2.finalConfidence / 100 : step2.finalConfidence;
  const step4Confidence = step4.result === 'N/A' ? null : step4.similarityScore ?? 0;
  const compositeConfidence = calculateCompositeConfidence(
    step1.confidence,
    step2Normalized,
    step3.confidence,
    step4Confidence,
    step5.confidence
  );

  // Collect flags
  const flags = collectFlags(step1, step2, step3, step4, step5, step6, propositionType);

  // Determine final status
  const status = determineFinalStatus(step1, step2, step5, flags, compositeConfidence);

  // Determine action required
  const actionRequired = determineActionRequired(status, flags);

  // Collect notes
  const notes = collectNotes(step1, step2, step3, step4, step5, step6);

  // Estimate cost based on API calls
  const estimatedCost = estimateCost(metadata.apiCallsMade, metadata.modelsUsed);

  return {
    verificationId,
    citation: {
      input: citationInput,
      normalized: step1.citationNormalized,
      caseName: parsedCitation.caseName || 'Unknown',
      volume: parsedCitation.volume,
      reporter: parsedCitation.reporter,
      page: parsedCitation.page,
      court: parsedCitation.court,
      year: parsedCitation.year,
    },
    proposition: {
      text: proposition,
      type: propositionType,
      inCitationBank,
    },
    verificationResults: {
      step1Existence: step1,
      step2Holding: step2,
      step3Dicta: step3,
      step4Quote: step4,
      step5BadLaw: step5,
      step6Strength: step6,
    },
    compositeResult: {
      status,
      confidenceScore: compositeConfidence,
      flags,
      notes,
      actionRequired,
    },
    metadata: {
      verifiedAt: new Date().toISOString(),
      verificationDurationMs: endTime - metadata.startTime,
      modelsUsed: metadata.modelsUsed,
      apiCallsMade: metadata.apiCallsMade,
      estimatedCost,
      orderId: metadata.orderId,
      phase: metadata.phase,
    },
  };
}

/**
 * Collect flags from all steps
 */
function collectFlags(
  step1: ExistenceCheckOutput,
  step2: HoldingVerificationOutput,
  step3: DictaDetectionOutput,
  step4: QuoteVerificationOutput,
  step5: BadLawCheckOutput,
  step6: AuthorityStrengthOutput,
  propositionType: PropositionType
): CIVFlag[] {
  const flags: CIVFlag[] = [];

  // Step 1 flags
  if (step1.result === 'NOT_FOUND') {
    flags.push(createFlag('EXISTENCE_FAILED', 1, 'Citation not found in legal databases'));
  }
  if (step1.result === 'UNPUBLISHED') {
    flags.push(createFlag('UNPUBLISHED', 1, 'Unpublished opinion - verify citability per local rules'));
  }

  // Step 2 flags
  if (step2.finalResult === 'REJECTED') {
    flags.push(createFlag('HOLDING_MISMATCH', 2, 'Case does not support the stated proposition'));
  }
  if (step2.finalResult === 'PARTIAL') {
    flags.push(createFlag('PARTIAL_SUPPORT', 2, 'Case provides only partial support for proposition'));
  }
  if (step2.finalResult === 'DICTA_ONLY') {
    flags.push(createFlag('HOLDING_MISMATCH', 2, 'Proposition supported only by dicta, not holding'));
  }

  // Step 3 flags
  if (step3.classification === 'DICTA') {
    if (propositionType === 'PRIMARY_STANDARD' || propositionType === 'REQUIRED_ELEMENT') {
      flags.push(createFlag('DICTA_AS_HOLDING', 3, 'Citing dicta as holding for critical legal standard'));
    }
  }

  // Step 4 flags
  if (step4.result === 'NOT_FOUND') {
    flags.push(createFlag('QUOTE_INACCURATE', 4, 'Quoted text not found in opinion'));
  }
  if (step4.result === 'PARTIAL_MATCH' && step4.actionTaken === 'FLAGGED') {
    flags.push(createFlag('QUOTE_INACCURATE', 4, 'Quote significantly differs from source text'));
  }

  // Step 5 flags
  if (step5.compositeStatus === 'OVERRULED') {
    flags.push(createFlag('OVERRULED', 5, 'Case has been overruled or reversed'));
  }
  if (step5.compositeStatus === 'NEGATIVE_TREATMENT') {
    flags.push(createFlag('OVERRULED', 5, 'Case has received significant negative treatment'));
  }

  // Step 6 flags
  if (step6.stabilityClass === 'DECLINING') {
    flags.push(createFlag('DECLINING_AUTHORITY', 6, 'Case is declining in citation frequency'));
  }
  if (step6.stabilityClass === 'CONTROVERSIAL') {
    flags.push(createFlag('CONTROVERSIAL', 6, 'Case has notable distinction or criticism rate'));
  }

  return flags;
}

/**
 * Create a flag object
 */
function createFlag(type: FlagType, step: number, message: string): CIVFlag {
  return {
    type,
    severity: FLAG_SEVERITY_MAP[type],
    message,
    step,
    autoResolvable: FLAG_AUTO_RESOLVABLE[type],
  };
}

/**
 * Determine final verification status
 */
function determineFinalStatus(
  step1: ExistenceCheckOutput,
  step2: HoldingVerificationOutput,
  step5: BadLawCheckOutput,
  flags: CIVFlag[],
  compositeConfidence: number
): VerificationStatus {
  // BLOCKED conditions (per spec)
  if (step1.result === 'NOT_FOUND') {
    return 'BLOCKED';
  }
  if (step5.compositeStatus === 'OVERRULED') {
    return 'BLOCKED';
  }

  // REJECTED conditions
  if (step2.finalResult === 'REJECTED') {
    return 'REJECTED';
  }

  // FLAGGED conditions
  const criticalFlags = flags.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  if (criticalFlags.length > 0) {
    return 'FLAGGED';
  }

  // Confidence-based thresholds
  if (compositeConfidence < 0.70) {
    return 'REJECTED';
  }
  if (compositeConfidence < 0.80) {
    return 'FLAGGED';
  }

  return 'VERIFIED';
}

/**
 * Determine required action
 */
function determineActionRequired(status: VerificationStatus, flags: CIVFlag[]): ActionRequired {
  if (status === 'BLOCKED') {
    return 'REMOVE';
  }
  if (status === 'REJECTED') {
    return 'REPLACE';
  }
  if (status === 'FLAGGED') {
    // Check if any flags require review vs auto-resolvable
    const nonAutoResolvable = flags.filter(f => !f.autoResolvable);
    return nonAutoResolvable.length > 0 ? 'REVIEW' : 'REPLACE';
  }
  return 'NONE';
}

/**
 * Collect notes from all steps
 */
function collectNotes(
  step1: ExistenceCheckOutput,
  step2: HoldingVerificationOutput,
  step3: DictaDetectionOutput,
  step4: QuoteVerificationOutput,
  step5: BadLawCheckOutput,
  step6: AuthorityStrengthOutput
): string[] {
  const notes: string[] = [];

  // Step 1 notes
  if (step1.result === 'UNPUBLISHED') {
    notes.push('Unpublished opinion - check citability rules for jurisdiction');
  }
  if (step1.sourcesChecked.length > 1) {
    notes.push(`Verified across ${step1.sourcesChecked.length} sources: ${step1.sourcesChecked.join(', ')}`);
  }

  // Step 2 notes
  if (step2.stage2?.triggered) {
    notes.push(`Adversarial verification (${step2.stage2.model}) ${step2.stage2.result?.toLowerCase()}`);
  }
  if (step2.stage1.supportingQuote) {
    notes.push(`Key quote: "${truncate(step2.stage1.supportingQuote, 100)}"`);
  }

  // Step 3 notes
  if (step3.classification !== 'HOLDING' && step3.actionTaken === 'NOTE') {
    notes.push(`Classification: ${step3.classification} - ${step3.reasoning}`);
  }

  // Step 4 notes
  if (step4.actionTaken === 'AUTO_CORRECTED' || step4.actionTaken === 'PARAPHRASED') {
    notes.push(`Quote ${step4.actionTaken.toLowerCase().replace('_', ' ')}`);
  }

  // Step 5 notes
  if (step5.compositeStatus === 'CAUTION') {
    notes.push(`Good law check: CAUTION - ${step5.layer2.concerns.join('; ')}`);
  }

  // Step 6 notes
  notes.push(`Authority: ${step6.stabilityClass} (strength: ${step6.strengthScore}/100)`);
  if (step6.notes) {
    notes.push(step6.notes);
  }

  return notes;
}

/**
 * Estimate cost based on API calls and models used
 */
function estimateCost(apiCalls: number, modelsUsed: string[]): number {
  // Rough cost estimates per spec
  // Sonnet: ~$0.02-0.03 per call
  // Opus: ~$0.05-0.08 per call

  let cost = 0;

  for (const model of modelsUsed) {
    if (model.includes('opus')) {
      cost += 0.065; // Average of $0.05-0.08
    } else {
      cost += 0.025; // Average of $0.02-0.03
    }
  }

  // Add small cost for external API calls (CourtListener, Case.law are free)
  // but we track them for metrics

  return Math.round(cost * 100) / 100; // Round to 2 decimal places
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Generate verification report summary
 */
export function generateVerificationSummary(results: FinalVerificationOutput[]): {
  totalCitations: number;
  verified: number;
  flagged: number;
  rejected: number;
  blocked: number;
  averageConfidence: number;
  totalDurationMs: number;
  estimatedTotalCost: number;
} {
  let verified = 0;
  let flagged = 0;
  let rejected = 0;
  let blocked = 0;
  let totalConfidence = 0;
  let totalDuration = 0;
  let totalCost = 0;

  for (const result of results) {
    switch (result.compositeResult.status) {
      case 'VERIFIED':
        verified++;
        break;
      case 'FLAGGED':
        flagged++;
        break;
      case 'REJECTED':
        rejected++;
        break;
      case 'BLOCKED':
        blocked++;
        break;
    }

    totalConfidence += result.compositeResult.confidenceScore;
    totalDuration += result.metadata.verificationDurationMs;
    totalCost += result.metadata.estimatedCost;
  }

  return {
    totalCitations: results.length,
    verified,
    flagged,
    rejected,
    blocked,
    averageConfidence: results.length > 0 ? totalConfidence / results.length : 0,
    totalDurationMs: totalDuration,
    estimatedTotalCost: totalCost,
  };
}
