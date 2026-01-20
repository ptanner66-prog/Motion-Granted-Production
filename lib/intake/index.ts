/**
 * Intake Module Index
 *
 * v6.3: Exports for the intake form system.
 */

// Types
export * from './types';

// Context
export { IntakeProvider, useIntakeForm } from './context';

// Motion types
export {
  MOTION_TYPES,
  getMotionTypesByTier,
  getMotionTypeByCode,
  getMotionCategories,
  type MotionType,
} from './motion-types';

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

// Pricing
export {
  calculatePricing,
  getTurnaroundDays,
  getEstimatedDeliveryDate,
  formatPrice,
  REVISION_PRICING,
  FREE_REVISIONS,
} from './pricing';

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
