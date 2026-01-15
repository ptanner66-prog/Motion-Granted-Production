import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RUSH_OPTIONS, getTierForMotion, getMotionById } from '@/config/motion-types'

interface Party {
  name: string
  role: string
}

interface UploadedDocument {
  id: string
  file: File
  name: string
  type: string
  size: number
  documentType: string
  uploadProgress: number
  url?: string
}

interface OrderFormState {
  // Current step
  step: number

  // Step 1: Motion Selection
  motionType: string
  motionTier: number
  basePrice: number | null
  otherDescription: string

  // Step 2: Turnaround
  turnaround: 'standard' | 'rush_72' | 'rush_48'
  filingDeadline: Date | null
  rushSurcharge: number
  totalPrice: number

  // Step 3: Case Information
  jurisdiction: string
  jurisdictionOther: string
  courtDivision: string
  caseNumber: string
  caseCaption: string

  // Step 4: Parties
  parties: Party[]
  relatedEntities: string

  // Step 5: Case Summary
  statementOfFacts: string
  proceduralHistory: string

  // Step 6: Instructions
  instructions: string

  // Step 7: Documents
  documents: UploadedDocument[]

  // Step 8: Acknowledgment
  supervisionAcknowledged: boolean

  // Actions
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  updateField: <K extends keyof Omit<OrderFormState, 'setStep' | 'nextStep' | 'prevStep' | 'updateField' | 'calculateTotal' | 'reset' | 'addParty' | 'removeParty' | 'updateParty' | 'addDocument' | 'removeDocument' | 'updateDocumentProgress'>>(
    key: K,
    value: Omit<OrderFormState, 'setStep' | 'nextStep' | 'prevStep' | 'updateField' | 'calculateTotal' | 'reset' | 'addParty' | 'removeParty' | 'updateParty' | 'addDocument' | 'removeDocument' | 'updateDocumentProgress'>[K]
  ) => void
  calculateTotal: () => void
  reset: () => void
  addParty: () => void
  removeParty: (index: number) => void
  updateParty: (index: number, field: keyof Party, value: string) => void
  addDocument: (doc: UploadedDocument) => void
  removeDocument: (id: string) => void
  updateDocumentProgress: (id: string, progress: number, url?: string) => void
  updateDocumentType: (id: string, documentType: string) => void
}

const initialState = {
  step: 1,
  motionType: '',
  motionTier: 0,
  basePrice: null,
  otherDescription: '',
  turnaround: 'standard' as const,
  filingDeadline: null,
  rushSurcharge: 0,
  totalPrice: 0,
  jurisdiction: '',
  jurisdictionOther: '',
  courtDivision: '',
  caseNumber: '',
  caseCaption: '',
  parties: [
    { name: '', role: '' },
    { name: '', role: '' },
  ],
  relatedEntities: '',
  statementOfFacts: '',
  proceduralHistory: '',
  instructions: '',
  documents: [],
  supervisionAcknowledged: false,
}

export const useOrderForm = create<OrderFormState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ step }),

      nextStep: () => set((state) => ({ step: Math.min(state.step + 1, 8) })),

      prevStep: () => set((state) => ({ step: Math.max(state.step - 1, 1) })),

      updateField: (key, value) => {
        set({ [key]: value } as Partial<OrderFormState>)

        // Recalculate price when relevant fields change
        if (key === 'motionType' || key === 'turnaround') {
          get().calculateTotal()
        }

        // Set motion tier and base price when motion type changes
        if (key === 'motionType' && typeof value === 'string') {
          const tier = getTierForMotion(value)
          const motion = getMotionById(value)
          set({
            motionTier: tier,
            basePrice: motion?.price || null,
          })
          get().calculateTotal()
        }
      },

      calculateTotal: () => {
        const state = get()
        const { basePrice, turnaround } = state

        if (basePrice === null) {
          set({ totalPrice: 0, rushSurcharge: 0 })
          return
        }

        const rushOption = RUSH_OPTIONS.find((r) => r.id === turnaround)
        const multiplier = rushOption?.multiplier || 1
        const surcharge = Math.round(basePrice * (multiplier - 1))
        const total = Math.round(basePrice * multiplier)

        set({ rushSurcharge: surcharge, totalPrice: total })
      },

      reset: () => set(initialState),

      addParty: () =>
        set((state) => ({
          parties: [...state.parties, { name: '', role: '' }],
        })),

      removeParty: (index) =>
        set((state) => ({
          parties: state.parties.filter((_, i) => i !== index),
        })),

      updateParty: (index, field, value) =>
        set((state) => ({
          parties: state.parties.map((party, i) =>
            i === index ? { ...party, [field]: value } : party
          ),
        })),

      addDocument: (doc) =>
        set((state) => ({
          documents: [...state.documents, doc],
        })),

      removeDocument: (id) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
        })),

      updateDocumentProgress: (id, progress, url) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === id ? { ...d, uploadProgress: progress, url } : d
          ),
        })),

      updateDocumentType: (id, documentType) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === id ? { ...d, documentType } : d
          ),
        })),
    }),
    {
      name: 'order-form-storage',
      partialize: (state) => ({
        step: state.step,
        motionType: state.motionType,
        motionTier: state.motionTier,
        basePrice: state.basePrice,
        otherDescription: state.otherDescription,
        turnaround: state.turnaround,
        filingDeadline: state.filingDeadline,
        rushSurcharge: state.rushSurcharge,
        totalPrice: state.totalPrice,
        jurisdiction: state.jurisdiction,
        jurisdictionOther: state.jurisdictionOther,
        courtDivision: state.courtDivision,
        caseNumber: state.caseNumber,
        caseCaption: state.caseCaption,
        parties: state.parties,
        relatedEntities: state.relatedEntities,
        statementOfFacts: state.statementOfFacts,
        proceduralHistory: state.proceduralHistory,
        instructions: state.instructions,
        supervisionAcknowledged: state.supervisionAcknowledged,
        // Documents are not persisted due to File object serialization
      }),
    }
  )
)
