import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { ValueProps } from '@/components/marketing/value-props'
import { TrustSection } from '@/components/marketing/trust-section'
import { CTASection } from '@/components/marketing/cta-section'

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
