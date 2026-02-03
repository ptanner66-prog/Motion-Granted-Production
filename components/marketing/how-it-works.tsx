import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const workflowSteps = [
  {
    number: "01",
    title: "Order",
    description: "Submit your matter details through our secure portal. Upload case materials, specify jurisdiction, set your deadline."
  },
  {
    number: "02",
    title: "Protocol",
    description: "Your order enters our institutional production workflow. Research, drafting, and assembly follow a standardized 14-phase protocol."
  },
  {
    number: "03",
    title: "Verification",
    description: "Every citation runs through our 7-layer integrity check. Authorities are verified against the Verified Precedent Index."
  },
  {
    number: "04",
    title: "Delivery",
    description: "You receive court-ready work product with perfect Bluebook citations, complete audit trail, and ABA 512 disclosures."
  }
];

export function HowItWorks() {
  return (
    <section id="verification" className="bg-white py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Zero-Hallucination Security
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">
            Your Reputation, Protected.
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            One bad citation doesn&apos;t just hurt your case—it hurts your reputation and your license.
            Motion Granted was built to ensure that never happens.
          </p>
        </div>

        {/* Workflow Visual */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {workflowSteps.map((step, index) => (
            <div key={step.number} className="relative">
              <div className="border border-navy/10 bg-cream/30 p-8 h-full">
                <div className="text-5xl font-serif text-gold/30 mb-4">{step.number}</div>
                <h3 className="text-2xl font-serif text-navy mb-4">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
              </div>
              {index < workflowSteps.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-6 h-6 text-gold" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Verification Protocol Section */}
        <div className="bg-navy text-white p-12 mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
                Motion Granted Verification Protocol
              </span>
              <h3 className="font-serif text-4xl mb-6">
                We Don&apos;t Just Write. We Verify.
              </h3>
              <p className="text-gray-300 leading-relaxed mb-6">
                Every citation in your deliverable passes through our proprietary 7-layer integrity
                check. We verify that each authority exists, is binding in your jurisdiction, and
                remains &ldquo;Good Law.&rdquo;
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-gold mt-1">—</span>
                  <span className="text-gray-300">Citation existence verified against primary sources</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gold mt-1">—</span>
                  <span className="text-gray-300">Holding accuracy confirmed for your specific use</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gold mt-1">—</span>
                  <span className="text-gray-300">Subsequent history checked for overruling or distinguishing</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gold mt-1">—</span>
                  <span className="text-gray-300">Jurisdictional binding authority confirmed</span>
                </div>
              </div>
            </div>
            <div className="border-l border-white/10 pl-12">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
                The Safety Intercept
              </span>
              <h3 className="font-serif text-4xl mb-6">
                Built to Fail Safe.
              </h3>
              <p className="text-gray-300 leading-relaxed mb-6">
                If our verification protocol flags an authority as uncertain—overruled, questioned,
                or potentially problematic—production stops immediately. We alert you with the
                specific concern before you ever see a draft.
              </p>
              <div className="bg-white/5 border border-white/10 p-6">
                <p className="text-white font-medium mb-2">You never file a draft that hasn&apos;t been double-verified.</p>
                <p className="text-gray-400 text-sm">
                  The decision to proceed, substitute, or remove is always yours.
                  The protection is built-in.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Verified Precedent Index */}
        <div className="border-l-4 border-gold pl-8 py-4 mb-16">
          <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
            The Verified Precedent Index
          </span>
          <h3 className="font-serif text-3xl text-navy mb-6">
            Your Firm&apos;s New Intellectual Bank
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <p className="text-gray-600 leading-relaxed">
                The VPI is our proprietary library of court-validated legal principles. Every motion
                we produce is grounded in landmark authority that has been vetted, categorized, and
                confirmed as current law.
              </p>
            </div>
            <div>
              <p className="text-gray-600 leading-relaxed">
                No hallucinations. No fabricated citations. No &ldquo;made-up case names.&rdquo;
                Your work product draws exclusively from verified, citable precedent that exists
                in the real legal record.
              </p>
            </div>
          </div>
        </div>

        {/* Defensible Audit Trail */}
        <div className="bg-cream/50 border border-navy/10 p-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
                Defensible Audit Trail
              </span>
              <h3 className="font-serif text-3xl text-navy mb-4">
                Every Decision Documented.
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Every motion comes with a complete digital record of the verification steps taken.
                This audit trail provides a layer of protection for your firm&apos;s internal compliance
                and serves as documentation for professional responsibility inquiries.
              </p>
            </div>
            <div className="flex flex-col justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-3 bg-navy text-white px-8 py-6 text-lg hover:bg-gold transition-all duration-500"
              >
                Start Your Order
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
