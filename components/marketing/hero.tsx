import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-teal/10 px-4 py-1.5 text-sm font-medium text-navy">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal"></span>
            </span>
            Now serving Louisiana attorneys
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl lg:text-6xl">
            Stop drafting.
            <br />
            <span className="text-teal">Start delegating.</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            We draft. You review. You file. It&apos;s that simple.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="xl" asChild>
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="xl" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-teal" />
              No retainers
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-teal" />
              Flat-fee pricing
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-teal" />
              One revision included
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
