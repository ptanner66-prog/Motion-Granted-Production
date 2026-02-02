import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative bg-cream pt-32 pb-24 border-b-[16px] border-navy overflow-hidden">
      <div className="subtle-grid absolute inset-0 pointer-events-none" />
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="flex flex-col items-start">
          <div className="inline-flex items-center gap-4 mb-10">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Universal Jurisdictional Production Engine
            </span>
          </div>

          <h1 className="text-7xl md:text-9xl text-navy leading-[0.9] mb-12 font-serif max-w-5xl">
            High-Fidelity Drafting. <br />
            <span className="italic font-normal text-gray-400">Validated work product.</span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end w-full">
            <div className="lg:col-span-7">
              <p className="text-2xl leading-relaxed text-navy/90 font-sans mb-12">
                Motion Granted executes complex legal production through a proprietary 14-phase
                verification protocol. Every deliverable is graded against a B+ judicial
                standard and cross-verified against state and federal statutory codes.
              </p>
              <div className="flex flex-wrap gap-8">
                <Button size="lg" className="bg-navy text-white px-12 py-8 text-xl hover:bg-gold transition-all duration-500 rounded-none shadow-none" asChild>
                  <Link href="/register">Initiate Production</Link>
                </Button>
                <Link
                  href="#protocol"
                  className="text-navy text-xl font-serif italic border-b border-navy hover:border-gold hover:text-gold transition-colors inline-flex items-center py-4"
                >
                  Review the 14-Phase Protocol
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 border-l border-navy/10 pl-12 pb-2">
              <div className="space-y-8">
                <div className="flex flex-col">
                  <span className="text-gold font-bold text-[10px] uppercase tracking-widest mb-1">Compliance</span>
                  <span className="text-navy text-lg italic font-serif">ABA Formal Opinion 512 Disclosures</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gold font-bold text-[10px] uppercase tracking-widest mb-1">Verification</span>
                  <span className="text-navy text-lg italic font-serif">Phase VII Judge Simulation Engine</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gold font-bold text-[10px] uppercase tracking-widest mb-1">Citation Integrity</span>
                  <span className="text-navy text-lg italic font-serif">Phase V Batch Verification System</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gold font-bold text-[10px] uppercase tracking-widest mb-1">Jurisdiction</span>
                  <span className="text-navy text-lg italic font-serif">State & Federal Code Compliance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
