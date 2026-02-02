import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="bg-[#fdfcfb] pt-32 pb-24 border-b-[12px] border-navy">
      <div className="max-w-6xl mx-auto px-6">
        <div className="border-l-4 border-gold pl-6 mb-12">
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
            Louisiana Jurisdictional Production Standard
          </span>
        </div>

        <h1 className="font-serif text-7xl md:text-9xl text-navy leading-[0.95] mb-12">
          Precision Drafting. <br />
          <span className="italic font-normal text-gray-500 text-6xl md:text-8xl">Professional Results.</span>
        </h1>

        <p className="max-w-2xl text-2xl leading-relaxed text-navy/90 mb-16 font-sans">
          Motion Granted executes complex legal drafting through a 14-phase
          verification protocol. Every deliverable is graded against judicial
          standards and verified for Louisiana-specific statutory compliance.
        </p>

        <div className="flex flex-col sm:flex-row gap-6">
          <Button className="bg-navy text-white px-12 py-8 text-xl rounded-none hover:bg-black transition-all shadow-none" asChild>
            <Link href="/register">Initiate Production</Link>
          </Button>
          <Button variant="outline" className="border-2 border-navy text-navy px-12 py-8 text-xl rounded-none hover:bg-navy/5 shadow-none" asChild>
            <Link href="#protocol">Review Protocol</Link>
          </Button>
        </div>

        {/* Institutional Trust Indicators */}
        <div className="mt-20 pt-10 border-t border-navy/10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3">Protocol</span>
              <span className="text-navy font-serif text-lg">14-Phase Verification</span>
              <span className="text-gray-500 text-sm mt-1">Every draft systematically reviewed</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3">Judicial Review</span>
              <span className="text-navy font-serif text-lg">B+ Minimum Standard</span>
              <span className="text-gray-500 text-sm mt-1">Phase VII simulation gate</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3">Citation Integrity</span>
              <span className="text-navy font-serif text-lg">Batch Verification</span>
              <span className="text-gray-500 text-sm mt-1">2-per-pass hallucination prevention</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3">Compliance</span>
              <span className="text-navy font-serif text-lg">ABA Opinion 512</span>
              <span className="text-gray-500 text-sm mt-1">Built-in disclosure engine</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
