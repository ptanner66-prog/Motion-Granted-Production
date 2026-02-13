/**
 * @deprecated Re-export shim. Canonical location: lib/citation/citation-verifier.ts (CGA6-050).
 * This file exists because lib/inngest/workflow-orchestration.ts (frozen for SP23)
 * and other workflow files import from this path.
 * New code should import from '@/lib/citation/citation-verifier'.
 */
export {
  CITATION_HARD_STOP_MINIMUM,
  CITATION_VERIFICATION_TIMEOUT_MS,
  CITATION_BATCH_SIZE,
  extractCitations,
  verifyCitation,
  checkCitationRequirements,
  verifyWorkflowCitations,
  verifyWorkflowCitationsBatched,
  storeCitations,
  manuallyVerifyCitation,
  type BatchVerificationProgress,
} from '@/lib/citation/citation-verifier';
