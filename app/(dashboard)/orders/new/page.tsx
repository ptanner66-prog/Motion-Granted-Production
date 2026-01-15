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
import { ArrowLeft, ArrowRight, Loader2, Send } from 'lucide-react'
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
    // Form data
    motionType,
    motionTier,
    basePrice,
    turnaround,
    filingDeadline,
    rushSurcharge,
    totalPrice,
    jurisdiction,
    jurisdictionOther,
    courtDivision,
    caseNumber,
    caseCaption,
    parties,
    relatedEntities,
    statementOfFacts,
    proceduralHistory,
    instructions,
    documents,
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
      // Prepare order data with documents
      const uploadedDocs = documents
        .filter(d => d.url) // Only include successfully uploaded docs
        .map(d => ({
          file_name: d.name,
          file_type: d.type,
          file_size: d.size,
          file_url: d.url,
          document_type: d.documentType || 'other',
        }))

      const orderData = {
        motion_type: motionType,
        motion_tier: motionTier,
        base_price: basePrice,
        turnaround,
        rush_surcharge: rushSurcharge,
        total_price: totalPrice,
        filing_deadline: filingDeadline instanceof Date
          ? filingDeadline.toISOString().split('T')[0]
          : filingDeadline,
        jurisdiction: jurisdiction === 'other' ? jurisdictionOther : jurisdiction,
        court_division: courtDivision || null,
        case_number: caseNumber,
        case_caption: caseCaption,
        statement_of_facts: statementOfFacts,
        procedural_history: proceduralHistory,
        instructions,
        related_entities: relatedEntities || null,
        parties: parties.filter(p => p.name && p.role),
        documents: uploadedDocs,
      }

      // Submit to API
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit order')
      }

      // Upload documents if any
      if (documents.length > 0 && data.order?.id) {
        const uploadPromises = documents.map(async (doc) => {
          if (!doc.file) return null

          const formData = new FormData()
          formData.append('file', doc.file)
          formData.append('orderId', data.order.id)
          formData.append('documentType', doc.documentType || 'other')

          const uploadResponse = await fetch('/api/documents', {
            method: 'POST',
            body: formData,
          })

          if (!uploadResponse.ok) {
            const uploadError = await uploadResponse.json()
            console.error('Document upload failed:', doc.name, uploadError)
            return { error: true, fileName: doc.name }
          }

          return { error: false, fileName: doc.name }
        })

        const uploadResults = await Promise.all(uploadPromises)
        const failedUploads = uploadResults.filter(r => r?.error)

        if (failedUploads.length > 0) {
          toast({
            title: 'Some documents failed to upload',
            description: `${failedUploads.length} document(s) could not be uploaded. You can upload them later from the order details page.`,
            variant: 'destructive',
          })
        }
      }

      toast({
        title: 'Order submitted successfully!',
        description: 'You will receive a confirmation email shortly.',
      })

      reset()
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      toast({
        title: 'Error submitting order',
        description: error instanceof Error ? error.message : 'Please try again or contact support.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-warm-gray p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">New Order</h1>
          <p className="text-gray-500 mt-1">Complete the form to submit your order</p>
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
        <Card className="border-0 shadow-sm">
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
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {step === steps.length ? (
            <Button onClick={handleSubmit} disabled={isSubmitting} className="btn-premium gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Order
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext} className="btn-premium gap-2">
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
