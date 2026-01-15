import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-[#faf9f7] py-28 sm:py-36">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <div className="absolute -top-20 left-1/4 h-64 w-64 rounded-full bg-teal/5 blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 h-64 w-64 rounded-full bg-navy/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* CTA Card */}
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl bg-white p-10 shadow-xl ring-1 ring-gray-100 sm:p-16">
            {/* Inner decorative gradient */}
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br from-teal/10 to-transparent blur-2xl" />
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-gradient-to-tr from-navy/5 to-transparent blur-2xl" />

            <div className="relative text-center">
              <h2 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl lg:text-5xl">
                Ready to delegate?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-gray-600 sm:text-xl">
                Join attorneys across Louisiana who trust Motion Granted for their motion drafting needs.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                <Button size="xl" className="btn-premium group h-14 px-10 text-lg shadow-lg" asChild>
                  <Link href="/register">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="xl"
                  className="h-14 border-2 px-10 text-lg transition-all duration-300 hover:border-navy hover:bg-navy hover:text-white"
                  asChild
                >
                  <Link href="/pricing">View Pricing</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
