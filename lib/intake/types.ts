/**
 * Intake Form Types
 *
 * v6.3: Type definitions for the multi-step intake wizard.
 */

export type WorkflowPath = 'A' | 'B';
export type Tier = 'A' | 'B' | 'C';
export type TonePreference = 'aggressive' | 'measured' | 'conciliatory';
export type ServiceMethod = 'electronic' | 'mail' | 'personal' | 'overnight';

export interface KeyDate {
  id: string;
  description: string;
  date: Date;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  uploadProgress?: number;
  error?: string;
}

export interface ServiceParty {
  id: string;
  name: string;
  firmName?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email?: string;
  serviceMethod: ServiceMethod;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  selected: boolean;
}

export interface PricingBreakdown {
  basePrice: number;
  rushFee: number;
  addOnTotal: number;
  total: number;
}

export interface IntakeFormData {
  // Step 1: Path Selection
  path: WorkflowPath | null;

  // Step 2: Case Information
  caseCaption: string;
  caseNumber: string;
  jurisdiction: string;
  court: string;
  judge?: string;
  department?: string;
  filingDeadline: Date | null;

  // Step 3: Motion Type
  tier: Tier | null;
  motionType: string;

  // Step 4: Statement of Facts
  statementOfFacts: string;
  proceduralHistory: string;
  keyDates?: KeyDate[];

  // Step 5: Drafting Instructions
  primaryArguments: string;
  tonePreference: TonePreference;
  specificRequests?: string;
  knownWeaknesses?: string;

  // Step 6: Documents
  uploadedFiles: UploadedFile[];

  // Step 7: Service & Add-Ons
  rushDelivery: boolean;
  partiesToServe: ServiceParty[];
  addOns: AddOn[];

  // Calculated
  pricing?: PricingBreakdown;
}

export interface IntakeContextValue {
  formData: Partial<IntakeFormData>;
  updateFormData: (data: Partial<IntakeFormData>) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  canProceed: boolean;
  setCanProceed: (can: boolean) => void;
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  resetForm: () => void;
}

export const STEP_NAMES = [
  'Path Selection',
  'Case Information',
  'Motion Type',
  'Statement of Facts',
  'Drafting Instructions',
  'Documents',
  'Service & Add-Ons',
  'Review & Submit',
] as const;
