'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative bg-cream pt-32 pb-24 overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      <div className="subtle-grid absolute inset-0 pointer-events-none" />

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="flex flex-col items-start">
          <div className="inline-flex items-center gap-4 mb-10">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              For Solo Practitioners & Small Firms
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl text-navy leading-[0.95] mb-8 font-serif max-w-5xl">
            Your drafting team—<br />
            <span className="text-gold">without the overhead.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mb-12 leading-relaxed">
            Court-ready motions and briefs in 72 hours. Every citation verified.
            Flat-fee pricing you can quote to clients.
          </p>

          <div className="flex flex-wrap gap-6 mb-16">
            <Button size="lg" className="bg-navy text-white px-10 py-7 text-lg hover:bg-gold hover:text-navy transition-all duration-300 rounded-sm shadow-md" asChild>
              <Link href="/register">Start Your First Order</Link>
            </Button>
            <Button variant="outline" size="lg" className="border-2 border-navy/20 text-navy px-10 py-7 text-lg hover:border-navy hover:bg-navy/5 transition-all rounded-sm" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>

          {/* Trust signals - compact */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gold" />
              <span>Every citation verified</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gold" />
              <span>ABA 512 compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gold" />
              <span>48-hour rush available</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-gold" />
              <span>No retainer required</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom border - softer */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-navy/20 via-navy to-navy/20" />
    </section>
  )
}
