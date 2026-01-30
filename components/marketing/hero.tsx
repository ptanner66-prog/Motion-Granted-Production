'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Clock, CreditCard, RefreshCw } from 'lucide-react'

const trustBadges = [
  { icon: Clock, label: 'No retainers' },
  { icon: CreditCard, label: 'Flat-fee pricing' },
  { icon: RefreshCw, label: 'One revision included' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#faf9f7] via-white to-white">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Large gradient orb - top right */}
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-teal/10 to-teal/5 blur-3xl" />
        {/* Smaller orb - bottom left */}
        <div className="absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-gradient-to-tr from-navy/5 to-transparent blur-2xl" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 sm:py-36 lg:px-8 lg:py-44">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-in mb-10 inline-flex items-center gap-2.5 rounded-full border border-teal/20 bg-white/80 px-5 py-2 text-sm font-medium text-navy shadow-sm backdrop-blur-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal"></span>
            </span>
            Now serving Louisiana attorneys
          </div>

          {/* Headline - MUCH BIGGER */}
          <h1 className="animate-slide-up">
            <span className="block text-5xl font-bold tracking-tight text-navy sm:text-6xl md:text-7xl lg:text-8xl">
              Stop drafting.
            </span>
            <span className="mt-2 block text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              <span className="text-gradient">Start delegating.</span>
            </span>
          </h1>

          {/* Subheadline */}
          <p className="animate-slide-up-stagger stagger-1 mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-gray-600 sm:text-2xl sm:leading-relaxed">
            We draft. You review. You file. It&apos;s that simple.
          </p>

          {/* CTA Buttons */}
          <div className="animate-slide-up-stagger stagger-2 mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Button 
              size="xl" 
              className="btn-premium group h-14 px-8 text-lg shadow-lg shadow-teal/25 ring-1 ring-teal/20" 
              asChild
            >
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="xl"
              className="h-14 border-2 px-8 text-lg transition-all duration-300 hover:border-navy hover:bg-navy hover:text-white"
              asChild
            >
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>

          {/* Trust indicators with icons and better separation */}
          <div className="animate-slide-up-stagger stagger-3 mt-16">
            <div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white/60 px-6 py-4 shadow-sm backdrop-blur-sm sm:gap-1 sm:divide-x sm:divide-gray-200 sm:px-2">
              {trustBadges.map((item, index) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2.5 px-4 py-1 text-sm font-medium text-gray-700 sm:text-base"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10">
                    <item.icon className="h-4 w-4 text-teal" />
                  </div>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom decorative gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
    </section>
  )
}
