'use client'

import { Shield, Clock, RefreshCw, CheckCircle, MessageSquare } from 'lucide-react'
import Link from 'next/link'

const trustFeatures = [
  {
    icon: Shield,
    title: "Every Citation Verified",
    description: "We check every case citation against official databases before delivery. No hallucinations.",
  },
  {
    icon: Clock,
    title: "Predictable Turnaround",
    description: "5-day standard delivery. 72-hour and 48-hour rush options available.",
  },
  {
    icon: RefreshCw,
    title: "Revisions Included",
    description: "One revision included with every order. We make it right until you're satisfied.",
  },
]

const qualityPromises = [
  "Court-ready formatting for your jurisdiction",
  "Bluebook-compliant citations",
  "Revision included with every order",
  "ABA Formal Opinion 512 disclosure included",
]

export function SocialProof() {
  return (
    <section className="bg-cream py-20 border-t border-navy/5">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold mb-4 block">
            Why Attorneys Choose Us
          </span>
          <h2 className="font-serif text-3xl md:text-4xl text-navy mb-4">
            What we guarantee
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Every order. Every time. No exceptions.
          </p>
        </div>

        {/* Trust Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {trustFeatures.map((feature) => (
            <div
              key={feature.title}
              className="bg-white border border-navy/10 rounded-lg p-8 hover:shadow-lg hover:border-gold/30 transition-all duration-300"
            >
              <div className="w-12 h-12 bg-navy/5 rounded-lg flex items-center justify-center mb-6">
                <feature.icon className="w-6 h-6 text-gold" />
              </div>
              <h3 className="font-serif text-xl text-navy mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Testimonial Placeholder */}
        <div className="bg-white border border-navy/10 rounded-lg p-8 md:p-12 mb-16">
          <div className="text-center max-w-2xl mx-auto">
            <MessageSquare className="w-10 h-10 text-gold/40 mx-auto mb-6" />
            <h3 className="font-serif text-2xl text-navy mb-4">
              What attorneys are saying
            </h3>
            <p className="text-gray-500 mb-6">
              We&apos;re onboarding our first cohort of Louisiana attorneys now.
              Early clients will be featured here.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-navy font-medium hover:text-gold transition-colors"
            >
              Join our founding clients
              <span className="text-gold">→</span>
            </Link>
          </div>
        </div>

        {/* Quality Promises */}
        <div className="bg-navy rounded-lg p-8 md:p-12">
          <div className="text-center mb-8">
            <h3 className="font-serif text-2xl text-white mb-2">
              What&apos;s included with every order
            </h3>
            <p className="text-gray-400">No hidden fees. No surprises.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {qualityPromises.map((promise) => (
              <div key={promise} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-gold flex-shrink-0" />
                <span className="text-gray-300">{promise}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location Badge */}
        <div className="mt-16 pt-12 border-t border-navy/10">
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-500 text-sm">
            <span>Specializing in</span>
            <span className="font-semibold text-navy">Louisiana State Courts</span>
            <span className="text-gold">|</span>
            <span className="font-semibold text-navy">Louisiana Federal Courts</span>
            <span className="text-gold">|</span>
            <span className="font-semibold text-navy">Fifth Circuit</span>
          </div>
        </div>
      </div>
    </section>
  )
}
