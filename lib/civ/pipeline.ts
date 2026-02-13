/**
 * CIV Pipeline Orchestrator — Canonical Import Path (SP-03).
 * All new code should import from '@/lib/civ/pipeline'.
 * Implementation lives in lib/citation/civ/pipeline.ts (re-exported here).
 */
export {
  verifyCitation,
  verifyBatch,
  verifyNewCitations,
  verifyUnauthorizedCitation,
  type CitationToVerify,
  type BatchVerificationRequest,
  type BatchVerificationResult,
  type FinalVerificationOutput,
} from '@/lib/citation/civ/pipeline';
