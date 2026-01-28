/**
 * Intake Form Context
 *
 * v6.3: React context for managing multi-step intake wizard state.
 */

'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { IntakeFormData, IntakeContextValue } from './types';

const initialFormData: Partial<IntakeFormData> = {
  path: null,
  caseCaption: '',
  caseNumber: '',
  jurisdiction: '',
  court: '',
  judge: '',
  department: '',
  filingDeadline: null,
  tier: null,
  motionType: '',
  statementOfFacts: '',
  proceduralHistory: '',
  keyDates: [],
  primaryArguments: '',
  tonePreference: 'measured',
  specificRequests: '',
  knownWeaknesses: '',
  uploadedFiles: [],
  rushDelivery: false,
  partiesToServe: [],
  addOns: [],
};

const IntakeContext = createContext<IntakeContextValue | null>(null);

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [formData, setFormData] = useState<Partial<IntakeFormData>>(initialFormData);
  const [currentStep, setCurrentStep] = useState(0);
  const [canProceed, setCanProceed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateFormData = useCallback((data: Partial<IntakeFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setCurrentStep(0);
    setCanProceed(false);
    setIsSubmitting(false);
  }, []);

  const value: IntakeContextValue = {
    formData,
    updateFormData,
    currentStep,
    setCurrentStep,
    canProceed,
    setCanProceed,
    isSubmitting,
    setIsSubmitting,
    resetForm,
  };

  return (
    <IntakeContext.Provider value={value}>
      {children}
    </IntakeContext.Provider>
  );
}

export function useIntakeForm(): IntakeContextValue {
  const context = useContext(IntakeContext);
  if (!context) {
    throw new Error('useIntakeForm must be used within an IntakeProvider');
  }
  return context;
}

export default IntakeContext;
