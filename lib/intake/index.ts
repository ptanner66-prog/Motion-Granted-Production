/**
 * Intake Module Index
 *
 * v6.3: Exports for the intake form system.
 */

// Types
export * from './types';

// Context
export { IntakeProvider, useIntakeForm } from './context';

// Jurisdictions
export {
  JURISDICTIONS,
  getJurisdictionByCode,
  getCourtByCode,
  getFederalJurisdictions,
  getStateJurisdictions,
  type Jurisdiction,
  type Court,
} from './jurisdictions';

// Validation
export {
  intakeFormSchema,
  stepSchemas,
  validateStep,
  type ValidatedIntakeForm,
} from './validation';

// API
export {
  submitOrder,
  uploadDocument,
  getJurisdictions,
  getMotionTypes,
  calculateOrderPricing,
  saveDraftOrder,
  loadDraftOrder,
  type OrderSubmissionResult,
} from './api';
