import { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { ValueProps } from '@/components/marketing/value-props'
import { TrustSection } from '@/components/marketing/trust-section'
import { CTASection } from '@/components/marketing/cta-section'

export const metadata: Metadata = {
  title: 'Motion Granted | The Associate You Don\'t Have to Manage',
  description: 'Motion drafting for solo practitioners and small firms. Zero hallucinated citations. Bluebook-perfect formatting. 48-hour rush available. We draft, you review, you file. Not a law firm.',
  keywords: [
    'motion drafting for solo attorneys',
    'legal document drafting service',
    'motion to compel drafting',
    'summary judgment drafting',
    'legal brief writing service',
    'solo practitioner support',
    'small law firm outsourcing',
    'legal motion preparation',
    'court-ready legal documents',
    'verified legal citations',
    'Bluebook citation formatting',
    'rush legal drafting',
    'flat-fee legal drafting',
    'ABA Opinion 512 compliance',
  ],
  openGraph: {
    title: 'Motion Granted | The Associate You Don\'t Have to Manage',
    description: 'Institutional-grade motion drafting for solo practitioners. Zero hallucinated citations. Bluebook-perfect formatting. 48-hour rush available.',
  },
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ValueProps />
      <TrustSection />
      <CTASection />
    </>
  )
}
