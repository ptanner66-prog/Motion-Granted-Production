import { Metadata } from 'next'
import { Hero } from '@/components/marketing/hero'
import { SocialProof } from '@/components/marketing/social-proof'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { SamplePreview } from '@/components/marketing/sample-preview'
import { ValueProps } from '@/components/marketing/value-props'
import { TrustSection } from '@/components/marketing/trust-section'
import { FAQSection } from '@/components/marketing/faq-section'
import { CTASection } from '@/components/marketing/cta-section'

export const metadata: Metadata = {
  title: 'Motion Granted | Professional Legal Motion Drafting Services',
  description: 'Your drafting team—without the overhead. Court-ready motions and briefs for solo practitioners and small firms. Flat-fee pricing. Every citation verified. Not a law firm.',
  openGraph: {
    title: 'Motion Granted | Professional Legal Motion Drafting Services',
    description: 'Flat-fee motion drafting for attorneys. Summary judgments, motions to compel, exceptions, and more. Court-ready documents with verified citations.',
  },
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <HowItWorks />
      <SamplePreview />
      <ValueProps />
      <TrustSection />
      <FAQSection />
      <CTASection />
    </>
  )
}
