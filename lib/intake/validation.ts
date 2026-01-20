/**
 * Intake Form Validation
 *
 * v6.3: Zod validation schemas for the intake wizard.
 */

import { z } from 'zod';

// Complete intake form validation schema
export const intakeFormSchema = z.object({
  // Path selection
  path: z.enum(['A', 'B'], {
    message: 'Please select a workflow path',
  }),

  // Case information
  caseCaption: z.string()
    .min(10, 'Case caption must be at least 10 characters')
    .max(500, 'Case caption must not exceed 500 characters'),
  caseNumber: z.string()
    .min(1, 'Case number is required')
    .max(50, 'Case number must not exceed 50 characters'),
  jurisdiction: z.string().min(1, 'Please select a jurisdiction'),
  court: z.string().min(1, 'Please select a court'),
  judge: z.string().max(100).optional(),
  department: z.string().max(50).optional(),
  filingDeadline: z.date({
    message: 'Filing deadline is required',
  }).refine(
    (date) => date > new Date(),
    'Filing deadline must be in the future'
  ),

  // Motion type
  tier: z.enum(['A', 'B', 'C'], {
    message: 'Please select a complexity tier',
  }),
  motionType: z.string().min(1, 'Please select a motion type'),

  // Statement of facts
  statementOfFacts: z.string()
    .min(500, 'Statement of facts must be at least 500 characters')
    .max(50000, 'Statement of facts must not exceed 50,000 characters'),
  proceduralHistory: z.string()
    .min(200, 'Procedural history must be at least 200 characters')
    .max(10000, 'Procedural history must not exceed 10,000 characters'),
  keyDates: z.array(z.object({
    id: z.string(),
    description: z.string().min(1, 'Description required'),
    date: z.date(),
  })).optional(),

  // Drafting instructions
  primaryArguments: z.string()
    .min(100, 'Primary arguments must be at least 100 characters')
    .max(20000, 'Primary arguments must not exceed 20,000 characters'),
  tonePreference: z.enum(['aggressive', 'measured', 'conciliatory']),
  specificRequests: z.string().max(10000).optional(),
  knownWeaknesses: z.string().max(10000).optional(),

  // Documents
  uploadedFiles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    size: z.number().max(50 * 1024 * 1024, 'File must not exceed 50MB'),
    type: z.string(),
    url: z.string().optional(),
  })).refine(
    (files) => files.reduce((sum, f) => sum + f.size, 0) <= 200 * 1024 * 1024,
    'Total file size must not exceed 200MB'
  ),

  // Service & add-ons
  rushDelivery: z.boolean(),
  partiesToServe: z.array(z.object({
    id: z.string(),
    name: z.string().min(1, 'Name is required'),
    firmName: z.string().optional(),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().length(2, 'State must be 2 characters'),
    zip: z.string().min(5, 'ZIP code must be at least 5 characters'),
    email: z.string().email().optional().or(z.literal('')),
    serviceMethod: z.enum(['electronic', 'mail', 'personal', 'overnight']),
  })),
  addOns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
    selected: z.boolean(),
  })),
});

export type ValidatedIntakeForm = z.infer<typeof intakeFormSchema>;

// Step-specific validation schemas for progressive validation
export const stepSchemas = {
  path: z.object({
    path: z.enum(['A', 'B'], {
      message: 'Please select a workflow path',
    }),
  }),

  case: z.object({
    caseCaption: z.string().min(10, 'Case caption must be at least 10 characters'),
    caseNumber: z.string().min(1, 'Case number is required'),
    jurisdiction: z.string().min(1, 'Please select a jurisdiction'),
    court: z.string().min(1, 'Please select a court'),
    judge: z.string().optional(),
    department: z.string().optional(),
    filingDeadline: z.date({
      message: 'Filing deadline is required',
    }),
  }),

  motion: z.object({
    tier: z.enum(['A', 'B', 'C'], {
      message: 'Please select a complexity tier',
    }),
    motionType: z.string().min(1, 'Please select a motion type'),
  }),

  facts: z.object({
    statementOfFacts: z.string().min(500, 'Statement of facts must be at least 500 characters'),
    proceduralHistory: z.string().min(200, 'Procedural history must be at least 200 characters'),
    keyDates: z.array(z.object({
      id: z.string(),
      description: z.string(),
      date: z.date(),
    })).optional(),
  }),

  instructions: z.object({
    primaryArguments: z.string().min(100, 'Primary arguments must be at least 100 characters'),
    tonePreference: z.enum(['aggressive', 'measured', 'conciliatory']),
    specificRequests: z.string().optional(),
    knownWeaknesses: z.string().optional(),
  }),

  documents: z.object({
    uploadedFiles: z.array(z.object({
      id: z.string(),
      name: z.string(),
      size: z.number(),
      type: z.string(),
      url: z.string().optional(),
    })),
  }),

  service: z.object({
    rushDelivery: z.boolean(),
    partiesToServe: z.array(z.any()),
    addOns: z.array(z.any()),
  }),
};

/**
 * Validate a specific step's data
 */
export function validateStep(
  step: keyof typeof stepSchemas,
  data: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  try {
    stepSchemas[step].parse(data);
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => e.message),
      };
    }
    return { valid: false, errors: ['Validation failed'] };
  }
}
