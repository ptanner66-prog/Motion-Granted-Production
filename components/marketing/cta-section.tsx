import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function CTASection() {
  return (
    <section className="bg-[#fdfcfb] py-28 border-t border-navy/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="border border-navy/10 bg-white p-12 md:p-16">
          <div className="max-w-3xl">
            <div className="border-l-4 border-gold pl-6 mb-8">
              <span className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
                Start Your Order
              </span>
            </div>

            <h2 className="font-serif text-4xl md:text-5xl text-navy mb-6">
              File-ready work product. Verified citations.
            </h2>

            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              Submit your matter through our secure portal. Receive scope confirmation
              within 24 hours. Get court-ready deliverables by your deadline—every
              authority verified through the Verified Precedent Index.
            </p>

            <div className="flex flex-col sm:flex-row gap-6">
              <Button className="bg-navy text-white px-12 py-8 text-xl rounded-none hover:bg-gold transition-all shadow-none" asChild>
                <Link href="/register">Start Your Order</Link>
              </Button>
              <Button variant="outline" className="border-2 border-navy text-navy px-12 py-8 text-xl rounded-none hover:bg-navy/5 shadow-none" asChild>
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>

            <div className="mt-12 pt-8 border-t border-navy/10 flex flex-col sm:flex-row gap-8">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-gold"></span>
                <span className="text-sm text-gray-600">Flat-fee pricing</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-gold"></span>
                <span className="text-sm text-gray-600">48-hour rush available</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-gold"></span>
                <span className="text-sm text-gray-600">ABA 512 disclosures included</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
