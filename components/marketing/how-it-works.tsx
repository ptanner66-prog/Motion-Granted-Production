'use client'

import { Upload, PenTool, CheckCircle, ChevronRight } from 'lucide-react'
import { useScrollAnimation } from '@/hooks/use-scroll-animation'

const steps = [
  {
    icon: Upload,
    title: 'Submit',
    description:
      'Tell us what you need. Upload your case documents, select your motion type, and provide your instructions.',
  },
  {
    icon: PenTool,
    title: 'We Draft',
    description:
      'Our law clerks prepare a polished draft based on your direction. Track progress in your dashboard.',
  },
  {
    icon: CheckCircle,
    title: 'You File',
    description:
      'Download, review, and file under your name. One round of revisions included.',
  },
]

export function HowItWorks() {
  const { ref, isInView } = useScrollAnimation<HTMLDivElement>({ threshold: 0.2 })

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#f8f7f4] to-[#faf9f7] py-28 sm:py-36">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-1/4 h-72 w-72 rounded-full bg-teal/5 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-72 w-72 rounded-full bg-navy/5 blur-3xl" />
      </div>

      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div 
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mb-4 inline-flex items-center rounded-full bg-teal/10 px-4 py-1.5 text-sm font-medium text-navy">
            Simple Process
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl lg:text-5xl">
            How It Works
          </h2>
          <p className="mt-5 text-lg text-gray-600 sm:text-xl">
            Three simple steps to professional motion drafts
          </p>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-20 max-w-5xl">
          <div className="relative">
            {/* Connecting line with arrows - desktop */}
            <div className="absolute left-0 right-0 top-[60px] hidden items-center justify-center sm:flex">
              <div className="relative mx-auto flex w-full max-w-3xl items-center justify-between px-20">
                {/* First connector */}
                <div className="flex flex-1 items-center">
                  <div className="h-0.5 flex-1 bg-gradient-to-r from-teal/20 via-teal/40 to-teal/20" />
                  <ChevronRight className="mx-1 h-5 w-5 text-teal/40" />
                </div>
                {/* Second connector */}
                <div className="flex flex-1 items-center">
                  <div className="h-0.5 flex-1 bg-gradient-to-r from-teal/20 via-teal/40 to-teal/20" />
                  <ChevronRight className="mx-1 h-5 w-5 text-teal/40" />
                </div>
              </div>
            </div>

            <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
              {steps.map((step, index) => (
                <div 
                  key={step.title} 
                  className={`group relative transition-all duration-700 ${
                    isInView 
                      ? 'opacity-100 translate-y-0' 
                      : 'opacity-0 translate-y-12'
                  }`}
                  style={{ transitionDelay: `${150 + index * 150}ms` }}
                >
                  <div className="flex flex-col items-center text-center">
                    {/* Step number and icon container */}
                    <div className="relative">
                      {/* Outer glow ring - shows on hover */}
                      <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-teal/20 to-teal/5 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

                      {/* Main icon circle */}
                      <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full bg-white shadow-lg shadow-gray-200/50 ring-1 ring-gray-100 transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-teal/10 group-hover:ring-teal/20">
                        {/* Inner gradient */}
                        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-teal/8 to-transparent" />

                        <step.icon className="relative h-10 w-10 text-teal transition-transform duration-500 group-hover:scale-110" />
                      </div>

                      {/* Step number badge with gradient */}
                      <span className="absolute -right-1 -top-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-navy via-navy to-navy-light text-sm font-bold text-white shadow-lg shadow-navy/25 ring-4 ring-white transition-transform duration-300 group-hover:scale-110">
                        {index + 1}
                      </span>
                    </div>

                    {/* Content */}
                    <h3 className="mt-8 text-xl font-semibold text-navy lg:text-2xl">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-xs text-gray-600 leading-relaxed lg:text-lg">
                      {step.description}
                    </p>
                  </div>

                  {/* Mobile connector arrow */}
                  {index < steps.length - 1 && (
                    <div className="mt-8 flex flex-col items-center justify-center sm:hidden">
                      <div className="h-6 w-0.5 bg-gradient-to-b from-teal/40 to-teal/20" />
                      <ChevronRight className="h-5 w-5 rotate-90 text-teal/40" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
