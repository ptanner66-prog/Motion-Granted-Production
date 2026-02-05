'use client'

import Link from 'next/link'
import { Upload, FileEdit, FileCheck, ArrowRight, ShieldAlert } from 'lucide-react'
import { useInView, useCountUp } from '@/hooks/use-in-view'

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Submit Your Matter",
    description: "Upload case materials through our secure portal. Specify motion type, deadline, and jurisdiction. Scope confirmation within 24 hours.",
  },
  {
    number: "02",
    icon: FileEdit,
    title: "We Draft & Verify",
    description: "Your matter enters our production workflow. Every citation verified against the Verified Precedent Index before delivery.",
  },
  {
    number: "03",
    icon: FileCheck,
    title: "You Review & File",
    description: "Receive file-ready documents with perfect Bluebook citations. Review against your judgment. File under your name.",
  },
];

function AnimatedStat({ value, label, suffix = '', delay = 0 }: {
  value: number | string
  label: string
  suffix?: string
  delay?: number
}) {
  const [ref, isInView] = useInView<HTMLDivElement>({ threshold: 0.3 })
  const numericValue = typeof value === 'number' ? value : 0
  const count = useCountUp(numericValue, isInView, 1500, delay)

  return (
    <div
      ref={ref}
      className={`text-center p-6 bg-cream rounded-lg border border-navy/10 hover:shadow-lg hover:border-gold/30 transition-all duration-500 ${
        isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-3xl font-serif text-navy mb-2">
        {typeof value === 'number' ? count : value}{suffix}
      </div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  )
}

export function HowItWorks() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>({ threshold: 0.2 })
  const [stepsRef, stepsInView] = useInView<HTMLDivElement>({ threshold: 0.1 })
  const [protocolRef, protocolInView] = useInView<HTMLDivElement>({ threshold: 0.2 })

  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div
          ref={headerRef}
          className={`text-center mb-16 transition-all duration-700 ${
            headerInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold mb-4 block">
            How It Works
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-navy mb-6">
            Three steps to file-ready work product
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            No long-term contracts. No retainer. Order what you need, when you need it.
          </p>
        </div>

        {/* Steps */}
        <div ref={stepsRef} className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className={`relative transition-all duration-700 ${
                stepsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`hidden md:block absolute top-16 left-full w-full h-px bg-gradient-to-r from-gold/50 to-transparent z-0 transition-all duration-1000 ${
                    stepsInView ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                  }`}
                  style={{ transitionDelay: `${(index + 1) * 200}ms`, transformOrigin: 'left' }}
                />
              )}
              <div className="bg-cream border border-navy/10 rounded-lg p-8 relative z-10 h-full hover:shadow-lg hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-navy rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <step.icon className="w-6 h-6 text-gold" aria-hidden="true" />
                  </div>
                  <span className="text-4xl font-serif text-navy/20">{step.number}</span>
                </div>
                <h3 className="font-serif text-2xl text-navy mb-4">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification Protocol - Two Column */}
        <div
          ref={protocolRef}
          className={`bg-navy rounded-lg p-10 mb-16 transition-all duration-700 ${
            protocolInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Verified Precedent Index */}
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
                Verified Precedent Index
              </span>
              <h3 className="font-serif text-3xl text-white mb-6">
                Every citation verified.
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Every citation is verified against our curated library of court-validated
                legal principles. No fabricated cases. No made-up quotes.
              </p>
              <div className="space-y-3 text-gray-300 text-sm">
                <div className="flex items-start gap-3 group">
                  <span className="text-gold mt-0.5 group-hover:scale-125 transition-transform" aria-hidden="true">—</span>
                  <span>Citation existence verified against primary sources</span>
                </div>
                <div className="flex items-start gap-3 group">
                  <span className="text-gold mt-0.5 group-hover:scale-125 transition-transform" aria-hidden="true">—</span>
                  <span>Holding accuracy confirmed for your specific use</span>
                </div>
                <div className="flex items-start gap-3 group">
                  <span className="text-gold mt-0.5 group-hover:scale-125 transition-transform" aria-hidden="true">—</span>
                  <span>Subsequent history checked for overruling</span>
                </div>
              </div>
            </div>

            {/* Safety Intercept */}
            <div className="lg:border-l border-white/10 lg:pl-10">
              <div className="flex items-center gap-3 mb-4">
                <ShieldAlert className="w-5 h-5 text-gold" aria-hidden="true" />
                <span className="text-gold font-bold text-xs uppercase tracking-[0.2em]">
                  The Safety Intercept
                </span>
              </div>
              <h3 className="font-serif text-3xl text-white mb-6">
                Built to fail safe.
              </h3>
              <p className="text-gray-300 leading-relaxed mb-6">
                If our verification flags an authority as uncertain—overruled, questioned,
                or problematic—production stops. You&apos;re alerted before you ever see a draft.
              </p>
              <div className="bg-white/5 border border-white/10 rounded p-5 hover:bg-white/10 transition-colors">
                <p className="text-white font-medium mb-2">Your reputation, protected.</p>
                <p className="text-gray-400 text-sm">
                  The decision to proceed is always yours. The protection is built-in.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row with Count-Up Animation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          <AnimatedStat value="Every" label="Citation Verified" delay={0} />
          <AnimatedStat value="A-" label="Minimum Standard" delay={100} />
          <AnimatedStat value="5 Days" label="Standard Delivery" delay={200} />
          <AnimatedStat value="48 Hr" label="Rush Available" delay={300} />
        </div>

        {/* Simple CTA */}
        <div className="text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-3 bg-navy text-white px-10 py-5 text-lg rounded-md hover:bg-gold hover:text-navy hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group"
          >
            Start Your First Order
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </Link>
          <p className="text-gray-500 text-sm mt-4">No retainer required</p>
        </div>
      </div>
    </section>
  )
}
