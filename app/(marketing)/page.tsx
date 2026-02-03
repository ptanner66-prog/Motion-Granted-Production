import { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { ValueProps } from '@/components/marketing/value-props'
import { TrustSection } from '@/components/marketing/trust-section'
import { CTASection } from '@/components/marketing/cta-section'

export const metadata: Metadata = {
  title: 'Motion Granted | Professional Legal Motion Drafting Services',
  description: 'Professional motion drafting services for attorneys. Flat-fee legal document production with verified citations, court-ready formatting, and fast turnaround. We draft. You review. You file. Not a law firm.',
  openGraph: {
    title: 'Motion Granted | Professional Legal Motion Drafting Services',
    description: 'Flat-fee motion drafting for attorneys. Summary judgments, motions to compel, exceptions, and more. Court-ready documents with verified citations.',
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
