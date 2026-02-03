'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Scale } from 'lucide-react'

const painPoints = [
  "3 AM citation checking",
  "Weekend brief writing",
  "Sunday night research",
  "Solo motion marathons",
]

export function Hero() {
  const [currentPain, setCurrentPain] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const announcerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentPain((prev) => (prev + 1) % painPoints.length)
        setIsTransitioning(false)
      }, 300)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (announcerRef.current) {
      announcerRef.current.textContent = `${painPoints[currentPain]} is over. Delegate the grunt work.`
    }
  }, [currentPain])

  return (
    <section className="relative bg-cream pt-32 pb-20 overflow-hidden">
      {/* Screen reader announcer */}
      <div
        ref={announcerRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      <div className="subtle-grid absolute inset-0 pointer-events-none" />

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        {/* Status Banner with Scarcity */}
        <div className="inline-flex items-center gap-3 bg-navy/5 border border-navy/10 rounded-full px-4 py-2 mb-8 animate-fade-in">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-sm text-navy font-medium">
            Now onboarding Louisiana attorneys
          </span>
          <span className="text-gray-400" aria-hidden="true">·</span>
          <span className="text-sm text-gray-600">
            Limited Q1 availability
          </span>
        </div>

        {/* Main Content - Simplified */}
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              For Solo Practitioners & Small Firms
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl text-navy leading-[0.95] mb-6 font-serif">
            Your drafting team—<br />
            <span className="text-gold">without the overhead.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mb-6 leading-relaxed">
            Court-ready motions and briefs delivered to your inbox.
            Every citation verified. Flat-fee pricing.
          </p>

          {/* Rotating Pain Point */}
          <div
            className="text-lg text-navy/80 mb-10 border-l-2 border-gold pl-4 max-w-xl h-14 flex items-center"
            aria-label={`${painPoints[currentPain]} is over. Delegate the grunt work.`}
          >
            <span className="italic">
              &ldquo;
              <span
                className={`inline-block transition-all duration-300 ease-in-out ${
                  isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                }`}
              >
                {painPoints[currentPain]}
              </span>
              &rdquo; is over.
              <span className="not-italic ml-2 text-gray-600">Delegate the grunt work.</span>
            </span>
          </div>

          {/* CTAs - Simplified */}
          <div className="flex flex-wrap items-center gap-6 mb-8">
            <Button
              size="lg"
              className="bg-navy text-white px-10 py-7 text-lg hover:bg-gold hover:text-navy transition-all duration-300 rounded-md shadow-md hover:shadow-lg hover:-translate-y-0.5 group"
              asChild
            >
              <Link href="/register">
                Start Your First Order
                <span className="ml-2 group-hover:translate-x-1 transition-transform inline-block" aria-hidden="true">→</span>
              </Link>
            </Button>
            <Link
              href="/pricing"
              className="text-navy font-medium hover:text-gold transition-colors underline underline-offset-4"
            >
              View Pricing
            </Link>
          </div>

          {/* Disclaimer + Clay's Credentials */}
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              We draft. You review. You file. <span className="font-medium text-navy">Not a law firm.</span>
            </p>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Scale className="w-4 h-4 text-gold" aria-hidden="true" />
              <span>Attorney-supervised by a Louisiana-barred litigation attorney</span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-navy/20 via-navy to-navy/20" aria-hidden="true" />
    </section>
  )
}
