/**
 * Intake Wizard Component
 *
 * v6.3: Multi-step intake wizard with progress tracking.
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { IntakeProvider, useIntakeForm } from '@/lib/intake/context';
import { submitOrder } from '@/lib/intake/api';
import { PathSelection } from './PathSelection';
import { CaseInformationForm } from './CaseInformationForm';
import { MotionTypeSelection } from './MotionTypeSelection';
import { StatementOfFactsForm } from './StatementOfFactsForm';
import { DraftingInstructionsForm } from './DraftingInstructionsForm';
import { DocumentUploadWizard } from './DocumentUploadWizard';
import { ServiceAddonsForm } from './ServiceAddonsForm';
import { OrderSummary } from './OrderSummary';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 'path', title: 'Get Started', component: PathSelection },
  { id: 'case', title: 'Case Info', component: CaseInformationForm },
  { id: 'motion', title: 'Motion Type', component: MotionTypeSelection },
  { id: 'facts', title: 'Statement of Facts', component: StatementOfFactsForm },
  { id: 'instructions', title: 'Instructions', component: DraftingInstructionsForm },
  { id: 'documents', title: 'Documents', component: DocumentUploadWizard },
  { id: 'service', title: 'Service & Add-Ons', component: ServiceAddonsForm },
  { id: 'summary', title: 'Review & Submit', component: OrderSummary },
];

function IntakeWizardContent() {
  const router = useRouter();
  const {
    currentStep,
    setCurrentStep,
    canProceed,
    formData,
    isSubmitting,
    setIsSubmitting,
  } = useIntakeForm();

  const CurrentStepComponent = STEPS[currentStep].component;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;

  const handleNext = () => {
    if (canProceed && !isLastStep) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    if (!canProceed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await submitOrder(formData);
      router.push(`/orders/${result.orderId}/confirmation`);
    } catch (error) {
      console.error('Order submission failed:', error);
      // Handle error - show toast, etc.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>
                Step {currentStep + 1} of {STEPS.length}
              </span>
              <span>
                {Math.round(((currentStep + 1) / STEPS.length) * 100)}% complete
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-between overflow-x-auto">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                onClick={() => index < currentStep && setCurrentStep(index)}
                disabled={index > currentStep}
                className={`
                  flex items-center flex-shrink-0
                  ${index <= currentStep ? 'text-blue-600' : 'text-gray-400'}
                  ${index < currentStep ? 'cursor-pointer hover:text-blue-700' : ''}
                  ${index > currentStep ? 'cursor-not-allowed' : ''}
                `}
              >
                <span
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                    ${index < currentStep ? 'bg-blue-600 text-white' : ''}
                    ${index === currentStep ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600' : ''}
                    ${index > currentStep ? 'bg-gray-200 text-gray-500' : ''}
                  `}
                >
                  {index < currentStep ? '✓' : index + 1}
                </span>
                <span className="ml-2 text-sm font-medium hidden md:inline">
                  {step.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <CurrentStepComponent />
      </div>

      {/* Navigation Footer */}
      <div className="bg-white border-t border-gray-200 sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between">
          <button
            onClick={handleBack}
            disabled={isFirstStep}
            className={`
              inline-flex items-center px-4 py-2 rounded-lg font-medium
              ${isFirstStep
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
              }
            `}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>

          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={!canProceed || isSubmitting}
              className={`
                inline-flex items-center px-6 py-2 rounded-lg font-medium text-white
                ${canProceed && !isSubmitting
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-300 cursor-not-allowed'
                }
              `}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Order
                  <ChevronRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className={`
                inline-flex items-center px-6 py-2 rounded-lg font-medium text-white
                ${canProceed
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-300 cursor-not-allowed'
                }
              `}
            >
              Continue
              <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function IntakeWizard() {
  return (
    <IntakeProvider>
      <IntakeWizardContent />
    </IntakeProvider>
  );
}

export default IntakeWizard;
