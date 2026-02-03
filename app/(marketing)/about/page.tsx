import { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Scale, Users, Clock, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Motion Granted and our mission to help solo practitioners and small firms.',
}

const values = [
  {
    icon: Scale,
    title: 'Attorney-Supervised Quality',
    description:
      'Every draft is prepared by qualified law clerks working under the direction of the hiring attorney. We understand the ethical framework and respect your role.',
  },
  {
    icon: Users,
    title: 'Built for Small Firms',
    description:
      'We specialize in serving solo practitioners and small firms who need reliable drafting support without the overhead of full-time staff.',
  },
  {
    icon: Clock,
    title: 'Deadline-Focused',
    description:
      'We understand that court deadlines are non-negotiable. Our processes are designed to deliver on time, every time.',
  },
  {
    icon: Shield,
    title: 'Confidential & Secure',
    description:
      'Your client information is protected with industry-standard security. All staff are bound by strict confidentiality obligations.',
  },
]

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              About Motion Granted
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Professional motion drafting services built by attorneys, for attorneys.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-navy text-center">Our Mission</h2>
            <div className="mt-8 space-y-6 text-gray-600 text-lg leading-relaxed">
              <p>
                Motion Granted was founded with a simple observation: solo practitioners and
                small law firms deserve access to quality drafting support without the
                prohibitive cost of full-time associates or the uncertainty of hourly-billing
                contract attorneys.
              </p>
              <p>
                We provide flat-fee motion drafting services that let you know your cost upfront,
                maintain control over the strategy, and focus your time on what matters most—your
                clients and your cases.
              </p>
              <p>
                Our team of experienced law clerks works under your direction to produce
                professional drafts ready for your review and filing. We handle the research
                and writing; you provide the strategy and supervision required by ethical rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">Our Values</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-xl bg-white p-8 shadow-sm border border-gray-100"
              >
                <div className="flex h-12 w-12 items-center justify-center bg-gold/10">
                  <value.icon className="h-6 w-6 text-gold" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-navy">{value.title}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we are not */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-navy text-center">What We Are Not</h2>
            <div className="mt-8 rounded-xl bg-amber-50 border border-amber-200 p-8">
              <p className="text-gray-700 leading-relaxed">
                <strong className="text-navy">Motion Granted is not a law firm.</strong> We do not
                provide legal advice or representation. We do not have attorney-client relationships
                with your clients. We do not make strategic decisions about your cases.
              </p>
              <p className="mt-4 text-gray-700 leading-relaxed">
                We are a legal support service that provides drafting assistance under the direction
                and supervision of the hiring attorney. You remain responsible for all legal
                judgment, client relationships, and filings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white">Ready to Get Started?</h2>
            <p className="mt-4 text-gray-300">
              Join attorneys across Louisiana who trust Motion Granted for their motion drafting needs.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Create Account
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
