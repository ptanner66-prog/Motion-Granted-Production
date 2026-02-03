'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export function CTASection() {
  return (
    <section className="bg-cream py-24">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="font-serif text-4xl md:text-5xl text-navy mb-6">
          Ready to delegate?
        </h2>

        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Join attorneys who trust Motion Granted for their motion drafting needs.
          No retainer. No commitment. Just file-ready work product when you need it.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button size="lg" className="bg-navy text-white px-10 py-7 text-lg hover:bg-gold hover:text-navy transition-all duration-300 rounded-md shadow-lg group" asChild>
            <Link href="/register">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="border-2 border-navy/20 text-navy px-10 py-7 text-lg hover:border-navy hover:bg-navy hover:text-white transition-all rounded-md" asChild>
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>

        {/* Simple trust markers */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-gray-500">
          <span>Flat-fee pricing</span>
          <span className="text-gold">•</span>
          <span>72-hour turnaround</span>
          <span className="text-gold">•</span>
          <span>Every citation verified</span>
          <span className="text-gold">•</span>
          <span>ABA 512 compliant</span>
        </div>
      </div>
    </section>
  )
}
