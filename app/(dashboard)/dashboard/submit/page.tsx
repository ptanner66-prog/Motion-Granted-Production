import { Metadata } from 'next'
import Link from 'next/link'
import { IntakeForm } from '@/components/intake/intake-form'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Submit New Matter - Motion Granted',
  description: 'Submit a new motion drafting request.',
}

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-warm-gray p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-gray-500 hover:text-teal transition-colors mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>

          <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">
            Submit New Matter
          </h1>
          <p className="text-gray-500 mt-1">
            Complete the form below to submit a new motion drafting request.
          </p>
        </div>

        {/* Form */}
        <IntakeForm />
      </div>
    </div>
  )
}
