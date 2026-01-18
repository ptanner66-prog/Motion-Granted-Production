import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Upload,
  CreditCard,
  UserCheck,
  FileEdit,
  MessageSquare,
  Download,
  FileCheck,
  ArrowRight,
  CheckCircle,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how Motion Granted works. From order submission to final delivery.',
}

const steps = [
  {
    number: 1,
    icon: Upload,
    title: 'Submit Your Order',
    description:
      'Select your motion type, provide case information, upload relevant documents, and give us your drafting instructions. Our intake form guides you through every step.',
  },
  {
    number: 2,
    icon: CreditCard,
    title: 'Complete Payment',
    description:
      'Pay securely via Stripe. Your card is charged immediately, and your order enters our queue. You\'ll receive a confirmation email with your order number.',
  },
  {
    number: 3,
    icon: UserCheck,
    title: 'Order Assignment',
    description:
      'We review your order for conflicts and assign it to a qualified law clerk. You\'ll receive notification when work begins. Track status anytime in your dashboard.',
  },
  {
    number: 4,
    icon: FileEdit,
    title: 'Drafting in Progress',
    description:
      'Our clerk drafts your motion according to your instructions. If clarification is needed, we\'ll reach out through the platform messaging system.',
  },
  {
    number: 5,
    icon: Download,
    title: 'Draft Delivery',
    description:
      'Download your completed draft from your dashboard. Review it carefully before filing.',
  },
  {
    number: 6,
    icon: FileCheck,
    title: 'Review & File',
    description:
      'Review the draft, make any edits you need, then file under your name. You remain responsible for all supervision and filings.',
  },
]

const features = [
  'Secure, encrypted file storage',
  'Real-time order status tracking',
  'In-platform messaging with your clerk',
  'Downloadable Word documents',
  'Email notifications at every step',
]

export default function HowItWorksPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              How It Works
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              From submission to delivery in six simple steps. We handle the drafting
              so you can focus on your clients.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="space-y-12">
              {steps.map((step, index) => (
                <div key={step.number} className="relative">
                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-6 top-16 h-full w-0.5 bg-gray-200" />
                  )}

                  <div className="relative flex gap-6">
                    {/* Step icon */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal text-navy font-bold text-lg shadow-md">
                      {step.number}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-8">
                      <div className="flex items-center gap-3 mb-2">
                        <step.icon className="h-5 w-5 text-teal" />
                        <h3 className="text-xl font-semibold text-navy">{step.title}</h3>
                      </div>
                      <p className="text-gray-600 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-navy">
              Everything You Need in One Platform
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Our client portal gives you full visibility and control
            </p>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 text-left">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-teal shrink-0" />
                  <span className="text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <Button size="lg" asChild>
                <Link href="/register">
                  Create Your Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Important note */}
      <section className="bg-navy py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold text-white">Important Note</h2>
            <p className="mt-4 text-gray-300 leading-relaxed">
              Motion Granted is not a law firm and does not provide legal advice or representation.
              All work product is prepared under the direction and supervision of the hiring attorney,
              who retains full responsibility for review, revision, and filing. You remain the
              attorney of record and are responsible for all strategic decisions.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
