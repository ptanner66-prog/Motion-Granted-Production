import { z } from 'zod'

export const partySchema = z.object({
  name: z.string().min(1, 'Party name is required'),
  role: z.string().min(1, 'Party role is required'),
})

export const orderFormSchema = z.object({
  // Step 1: Motion Selection
  motionType: z.string().min(1, 'Please select a motion type'),
  otherDescription: z.string().optional(),

  // Step 2: Turnaround
  turnaround: z.enum(['standard', 'rush_72', 'rush_48']),
  filingDeadline: z.date({
    message: 'Filing deadline is required',
  }),

  // Step 3: Case Information
  jurisdiction: z.string().min(1, 'Jurisdiction is required'),
  jurisdictionOther: z.string().optional(),
  courtDivision: z.string().optional(),
  caseNumber: z.string().min(1, 'Case number is required'),
  caseCaption: z.string().min(1, 'Case caption is required'),

  // Step 4: Parties
  parties: z.array(partySchema).min(2, 'At least two parties are required'),
  relatedEntities: z.string().optional(),

  // Step 5: Case Summary
  statementOfFacts: z.string().min(200, 'Statement of facts must be at least 200 characters'),
  proceduralHistory: z.string().optional().default(''),

  // Step 6: Instructions
  instructions: z.string().min(100, 'Instructions must be at least 100 characters'),

  // Step 7: Documents (validated separately)

  // Step 8: Acknowledgment
  supervisionAcknowledged: z.literal(true, {
    message: 'You must acknowledge your supervisory responsibility',
  }),
})

export const stepValidations = {
  1: z.object({
    motionType: z.string().min(1, 'Please select a motion type'),
    otherDescription: z.string().optional(),
  }),
  2: z.object({
    turnaround: z.enum(['standard', 'rush_72', 'rush_48']),
    filingDeadline: z.date({
      message: 'Filing deadline is required',
    }),
  }),
  3: z.object({
    jurisdiction: z.string().min(1, 'Jurisdiction is required'),
    jurisdictionOther: z.string().optional(),
    courtDivision: z.string().optional(),
    caseNumber: z.string().min(1, 'Case number is required'),
    caseCaption: z.string().min(1, 'Case caption is required'),
  }),
  4: z.object({
    parties: z.array(partySchema).min(2, 'At least two parties are required'),
    relatedEntities: z.string().optional(),
  }),
  5: z.object({
    statementOfFacts: z.string().min(200, 'Statement of facts must be at least 200 characters'),
    proceduralHistory: z.string().optional().default(''),
  }),
  6: z.object({
    instructions: z.string().min(100, 'Instructions must be at least 100 characters'),
  }),
  7: z.object({}), // Documents validated separately
  8: z.object({
    supervisionAcknowledged: z.literal(true, {
      message: 'You must acknowledge your supervisory responsibility',
    }),
  }),
}

export type OrderFormInput = z.infer<typeof orderFormSchema>
export type PartyInput = z.infer<typeof partySchema>
