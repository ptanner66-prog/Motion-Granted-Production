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
  getAdminSuperpromptTemplate,
  mergeSuperpromptWithContext,
} from './orchestrator';

// Superprompt-Driven Phase Executor (uses admin superprompt for phase execution)
export {
  executePhaseWithSuperprompt,
  getModelForPhase,
  shouldUseExtendedThinking,
  getThinkingBudget,
} from './superprompt-phase-executor';

// PDF Generation
export {
  generateMotionPDF,
  generatePDFFromWorkflow,
  savePDFAsDeliverable,
} from './pdf-generator';

// Automation Service (end-to-end hands-off processing)
export {
  startOrderAutomation,
  resumeOrderAutomation,
  getOrderProgress,
  getOrdersProgress,
  syncOrderWithWorkflow,
  processPendingOrders,
  retryFailedWorkflows,
} from './automation-service';

// Superprompt System (production-grade motion generation)
export {
  generateSuperprompt,
  generateMotion,
  generateMotionFromOrder,
} from './superprompt';

// Superprompt Engine (merge lawyer's superprompt with order data)
export {
  generateMotionWithSuperprompt,
  gatherOrderData,
  mergeSuperprompt,
  executeSuperprompt,
  saveSuperpromptTemplate,
  getSuperpromptTemplate,
  generateMotionFromStoredTemplate,
  AVAILABLE_PLACEHOLDERS,
  EXAMPLE_SUPERPROMPT_TEMPLATE,
} from './superprompt-engine';

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

export type {
  MotionDocument,
  PDFGenerationResult,
} from './pdf-generator';

export type {
  AutomationConfig,
  AutomationResult,
  OrderProgress,
} from './automation-service';

export type {
  CaseContext,
  MotionRequest,
  GeneratedMotion,
  MotionType as SuperpromptMotionType,
} from './superprompt';

export type {
  SuperpromptTemplate,
  MergedSuperprompt,
  OrderData,
  GenerationResult,
} from './superprompt-engine';

// Phase Gate Enforcement
export {
  validatePhaseGate,
  enforcePhaseTransition,
  markPhaseComplete,
  getNextAllowedPhase,
  canEnterPhase,
  getCompletedPhases,
  isWorkflowComplete,
  executePhaseWithGates,
  PHASES,
  PHASE_ORDER,
  PHASE_PREREQUISITES,
  PHASE_COMPLETION_REQUIREMENTS,
} from './phase-gates';

export type {
  PhaseId,
  PhaseGateResult,
} from './phase-gates';

// Prompt Guardrails
export {
  buildPhasePrompt,
  detectOutputViolation,
  extractCitationsFromOutput,
  validateCitationsAgainstBank,
  detectPhaseSkipAttempt,
  PHASE_OUTPUT_TYPES,
} from './prompt-guardrails';

// API Guards
export {
  requirePhaseGate,
  requireWorkflowCanProceed,
  blockDirectGeneration,
  validateWorkflowSource,
  blockPhaseSkip,
  checkGenerationRateLimit,
  rateLimitResponse,
  validateWorkflowRequest,
  runWorkflowGuards,
} from './api-guards';

// Violation Alerts
export {
  alertPhaseViolation,
  alertCitationViolation,
  alertOutputViolation,
  alertBypassAttempt,
  getUnresolvedViolations,
  getAllCriticalViolations,
  resolveViolation,
} from './violation-alerts';

export type {
  ViolationSeverity,
  ViolationDetails,
} from './violation-alerts';
