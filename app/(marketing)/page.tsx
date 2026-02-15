import { Metadata } from 'next';
import { HeroSection } from '@/components/marketing/hero-section';
import { TrustBar } from '@/components/marketing/trust-bar';
import { AccuracySection } from '@/components/marketing/accuracy-section';
import { TestimonialsSection } from '@/components/marketing/testimonials-section';
import { CTASectionV2 } from '@/components/marketing/cta-section-v2';

export const metadata: Metadata = {
  title: 'Motion Granted — Court-Ready Litigation Documents',
  description: 'Complete filing packages with every citation verified. Motions, memoranda, declarations, and proposed orders delivered to your inbox.',
  openGraph: {
    title: 'Motion Granted — Court-Ready Litigation Documents',
    description: 'Complete filing packages with every citation verified against primary sources.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <TrustBar />
      <AccuracySection />
      <TestimonialsSection />
      <CTASectionV2 />
    </>
  );
}
