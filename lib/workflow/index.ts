/**
 * Workflow Module Index
 *
 * Exports all workflow-related functionality for the Motion Granted
 * document production system.
 */

// Citation Verification
export {
  extractCitations,
  verifyCitation,
  verifyWorkflowCitations,
  checkCitationRequirements,
  storeCitations,
  manuallyVerifyCitation,
  CITATION_HARD_STOP_MINIMUM,
} from './citation-verifier';

// Document Parsing
export {
  parseDocument,
  parseOrderDocuments,
  getParsedDocument,
  getOrderParsedDocuments,
} from './document-parser';

// Workflow Engine
export {
  startWorkflow,
  executeCurrentPhase,
  getWorkflowProgress,
  approvePhase,
  runWorkflow,
} from './workflow-engine';

// Motion Templates
export {
  getMotionTemplate,
  getOppositionTemplate,
  getTemplateForPath,
  generateSectionPrompt,
  validateAgainstTemplate,
  MOTION_TEMPLATES,
} from './motion-templates';

// Quality Validation
export {
  validateDocument,
  quickValidate,
  getQualityLabel,
  getRecommendedActions,
} from './quality-validator';

// Document Extraction
export {
  extractDocumentContent,
  extractOrderDocuments,
  getCombinedDocumentText,
} from './document-extractor';

// Orchestration (combines checkout + docs + superprompt + workflow)
export {
  gatherOrderContext,
  buildSuperprompt,
  orchestrateWorkflow,
  executePhaseWithContext,
  generateDraftWithSuperprompt,
  getWorkflowSuperprompt,
} from './orchestrator';

// Re-export types
export type {
  MotionTemplate,
  DocumentSection,
  CitationGuidance,
  GenerationPrompts,
  QualityCriteria,
} from './motion-templates';

export type {
  QualityReport,
  CategoryScores,
  QualityIssue,
  ValidationContext,
} from './quality-validator';

export type {
  ExtractedContent,
  DocumentExtractionResult,
} from './document-extractor';

export type {
  OrderContext,
  SuperPromptContext,
  OrchestrationResult,
} from './orchestrator';
