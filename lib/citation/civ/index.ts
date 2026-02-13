/**
 * Citation Integrity Verification (CIV) System
 *
 * Motion Granted's seven-step automated process that validates every
 * legal citation in a motion by:
 *
 * 1. Confirming the case exists in legal databases (not hallucinated)
 * 2. Verifying the cited proposition is actually supported by the court's holding
 * 3. Checking dicta vs. holding classification
 * 4. Verifying quote accuracy (if direct quotes are used)
 * 5. Determining good law status (not overruled, reversed, or abrogated)
 * 6. Assessing authority strength (landmark vs. declining precedent)
 * 7. Generating confidence scores and structured output
 *
 * Target Accuracy: ~0.08% per-citation undetected error rate
 *
 * @module lib/citation/civ
 */

// Main pipeline exports
export {
  verifyCitation,
  verifyBatch,
  verifyNewCitations,
  verifyUnauthorizedCitation,
  type CitationToVerify,
  type BatchVerificationRequest,
  type BatchVerificationResult,
  type FinalVerificationOutput,
} from './pipeline';

// Type exports
export {
  type PropositionType,
  type VerificationStatus,
  type HoldingVerificationResult,
  type DictaClassification,
  type QuoteVerificationResult,
  type BadLawStatus,
  type StabilityClass,
  type StrengthAssessment,
  type CitationTrend,
  type FlagType,
  type FlagSeverity,
  type ActionRequired,
  type ExistenceCheckOutput,
  type HoldingVerificationOutput,
  type DictaDetectionOutput,
  type QuoteVerificationOutput,
  type BadLawCheckOutput,
  type AuthorityStrengthOutput,
  type CIVFlag,
  type CIVConfig,
  DEFAULT_CIV_CONFIG,
  calculateCompositeConfidence,
} from './types';

// Database operations exports
export {
  normalizeCitation,
  hashProposition,
  parseCitation,
  createOrUpdateCitation,
  getCitationByNormalized,
  recordPropositionVerification,
  checkVPICache,
  recordGoodLawCheck,
  getValidGoodLawCheck,
  recordStrengthAssessment,
  startVerificationRun,
  completeVerificationRun,
  checkCuratedOverruledList,
} from './database';

// Report generation exports
export {
  generateTextReport,
  generateAttorneyInstructionNotes,
  generateStructuredSummary,
  generateUnpublishedDisclosure,
} from './report';

// Individual step exports (for advanced usage)
export { executeExistenceCheck, normalizeAndParseCitation, batchExistenceCheck } from './steps/step-1-existence';
export { executeHoldingVerification, retryHoldingVerification } from './steps/step-2-holding';
export { executeDictaDetection, extractSurroundingContext } from './steps/step-3-dicta';
export { executeQuoteVerification, isAcceptableVariation } from './steps/step-4-quote';
export { executeBadLawCheck } from './steps/step-5-bad-law';
export { executeAuthorityStrength } from './steps/step-6-strength';
export { compileVerificationOutput, generateVerificationSummary } from './steps/step-7-output';
