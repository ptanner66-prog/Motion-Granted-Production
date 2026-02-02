import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { siteConfig } from '@/config/site'

export function Hero() {
  return (
    <section className="relative bg-cream pt-24 pb-20 border-b-8 border-navy">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="flex flex-col items-start text-left">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-gold" />
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-gold">
              Authorized Louisiana Jurisdictional Engine
            </span>
          </div>

          <h1 className="text-6xl md:text-8xl text-navy leading-[1.1] mb-8">
            High-Fidelity Drafting. <br />
            <span className="italic font-normal text-slate-gray">Professional Production.</span>
          </h1>

          <p className="max-w-2xl text-xl leading-relaxed text-navy/80 mb-12 font-sans">
            Motion Granted executes the production of complex motions, briefs, and exceptions
            through a rigorous 14-phase verification protocol. Built specifically for the
            {siteConfig.address.state} Bar.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button size="lg" className="bg-navy hover:bg-navy/90 text-white px-10 py-7 text-lg rounded-none shadow-none" asChild>
              <Link href="/register">Open a Production Case</Link>
            </Button>
            <Button variant="outline" size="lg" className="border-navy text-navy px-10 py-7 text-lg rounded-none hover:bg-navy/5 shadow-none" asChild>
              <Link href="/pricing">Review Fee Schedule</Link>
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 border-t border-navy/10 pt-8 w-full">
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-widest mb-2">Compliance</span>
              <span className="text-navy text-sm">ABA Formal Opinion 512 Disclosures</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-widest mb-2">Protocol</span>
              <span className="text-navy text-sm">14-Phase Production Workflow</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gold font-bold text-xs uppercase tracking-widest mb-2">Verification</span>
              <span className="text-navy text-sm">Multi-Step Judge Simulation</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
