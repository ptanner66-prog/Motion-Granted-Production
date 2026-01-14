'use client'

import { useRouter } from 'next/navigation'
import { useOrderForm } from '@/hooks/use-order-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { MotionSelect } from '@/components/orders/intake-form/motion-select'
import { TurnaroundSelect } from '@/components/orders/intake-form/turnaround-select'
import { CaseInfo } from '@/components/orders/intake-form/case-info'
import { PartiesForm } from '@/components/orders/intake-form/parties-form'
import { CaseSummary } from '@/components/orders/intake-form/case-summary'
import { Instructions } from '@/components/orders/intake-form/instructions'
import { DocumentUpload } from '@/components/orders/intake-form/document-upload'
import { OrderSummary } from '@/components/orders/intake-form/order-summary'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, ArrowRight, Loader2, CreditCard } from 'lucide-react'
import { useState } from 'react'

const steps = [
  { number: 1, title: 'Motion Type', component: MotionSelect },
  { number: 2, title: 'Turnaround', component: TurnaroundSelect },
  { number: 3, title: 'Case Info', component: CaseInfo },
  { number: 4, title: 'Parties', component: PartiesForm },
  { number: 5, title: 'Case Summary', component: CaseSummary },
  { number: 6, title: 'Instructions', component: Instructions },
  { number: 7, title: 'Documents', component: DocumentUpload },
  { number: 8, title: 'Review', component: OrderSummary },
]

export default function NewOrderPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    step,
    setStep,
    nextStep,
    prevStep,
    reset,
    // Validation fields
    motionType,
    filingDeadline,
    jurisdiction,
    jurisdictionOther,
    caseNumber,
    caseCaption,
    parties,
    statementOfFacts,
    proceduralHistory,
    instructions,
    supervisionAcknowledged,
  } = useOrderForm()

  const currentStep = steps[step - 1]
  const StepComponent = currentStep.component
  const progress = (step / steps.length) * 100

  // Validation for each step
  const validateStep = () => {
    switch (step) {
      case 1:
        if (!motionType) {
          toast({ title: 'Please select a motion type', variant: 'destructive' })
          return false
        }
        return true
      case 2:
        if (!filingDeadline) {
          toast({ title: 'Please select a filing deadline', variant: 'destructive' })
          return false
        }
        return true
      case 3:
        if (!jurisdiction || !caseNumber || !caseCaption) {
          toast({ title: 'Please fill in all required fields', variant: 'destructive' })
          return false
        }
        if (jurisdiction === 'other' && !jurisdictionOther) {
          toast({ title: 'Please specify the jurisdiction', variant: 'destructive' })
          return false
        }
        return true
      case 4:
        const validParties = parties.filter((p) => p.name && p.role)
        if (validParties.length < 2) {
          toast({ title: 'Please add at least two parties', variant: 'destructive' })
          return false
        }
        return true
      case 5:
        if (statementOfFacts.length < 200) {
          toast({ title: 'Statement of facts must be at least 200 characters', variant: 'destructive' })
          return false
        }
        if (proceduralHistory.length < 100) {
          toast({ title: 'Procedural history must be at least 100 characters', variant: 'destructive' })
          return false
        }
        return true
      case 6:
        if (instructions.length < 100) {
          toast({ title: 'Instructions must be at least 100 characters', variant: 'destructive' })
          return false
        }
        return true
      case 7:
        // Documents are optional but recommended
        return true
      case 8:
        if (!supervisionAcknowledged) {
          toast({ title: 'Please acknowledge the supervision requirement', variant: 'destructive' })
          return false
        }
        return true
      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep()) {
      nextStep()
    }
  }

  const handleSubmit = async () => {
    if (!validateStep()) return

    setIsSubmitting(true)

    try {
      // In production, this would:
      // 1. Create a Stripe PaymentIntent
      // 2. Process payment
      // 3. Create the order in Supabase
      // 4. Send confirmation email

      await new Promise((resolve) => setTimeout(resolve, 2000)) // Simulate API call

      toast({
        title: 'Order submitted successfully!',
        description: 'You will receive a confirmation email shortly.',
      })

      reset()
      router.push('/dashboard')
    } catch {
      toast({
        title: 'Error submitting order',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy">New Order</h1>
          <p className="text-gray-500">Complete the form to submit your order</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-navy">
              Step {step} of {steps.length}: {currentStep.title}
            </span>
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2">
            {steps.map((s) => (
              <button
                key={s.number}
                onClick={() => s.number < step && setStep(s.number)}
                className={`text-xs ${
                  s.number === step
                    ? 'text-teal font-medium'
                    : s.number < step
                    ? 'text-gray-500 hover:text-teal cursor-pointer'
                    : 'text-gray-300'
                }`}
                disabled={s.number > step}
              >
                {s.number}
              </button>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            <StepComponent />
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={step === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step === steps.length ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Submit & Pay
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
