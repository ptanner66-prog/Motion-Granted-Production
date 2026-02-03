import Link from 'next/link'

const qualityStandards = [
  {
    metric: "7",
    label: "Layer Verification",
    description: "Every deliverable passes through our proprietary 7-layer integrity check—verifying holdings, citation strength, and procedural compliance."
  },
  {
    metric: "B+",
    label: "Quality Gate",
    description: "Work product that fails to meet our B+ judicial review standard is revised internally. You receive file-ready drafts."
  },
  {
    metric: "VPI",
    label: "Verified Precedent Index",
    description: "Citations sourced exclusively from our curated library of court-validated legal principles. No hallucinations. No fabrications."
  },
  {
    metric: "512",
    label: "ABA Disclosure Ready",
    description: "AI-assisted drafting disclosures generated automatically per ABA Formal Opinion 512 requirements for your jurisdiction."
  }
];

export function HowItWorks() {
  return (
    <section id="protocol" className="bg-white py-28">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Motion Granted Verification Protocol
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">Every Citation Verified</h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            Our proprietary verification protocol ensures every authority in your deliverable
            is real, accurately quoted, and still good law. Zero hallucinated citations.
          </p>
        </div>

        {/* Quality Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {qualityStandards.map((item) => (
            <div key={item.label} className="border-t-2 border-gold pt-8">
              <div className="text-6xl font-serif text-navy mb-4">{item.metric}</div>
              <h3 className="text-lg font-semibold text-navy mb-3">{item.label}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Safety Intercept Feature */}
        <div className="bg-navy/5 border border-navy/10 p-10 mb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-4 block">
                The Safety Intercept
              </span>
              <h3 className="font-serif text-3xl text-navy mb-6">
                Flagged Authority? Production Pauses.
              </h3>
              <p className="text-gray-600 leading-relaxed mb-4">
                When our verification protocol flags a potentially problematic authority—overruled,
                distinguished, or questionable precedent—production halts automatically. You receive
                an immediate alert with the specific concern.
              </p>
              <p className="text-gray-600 leading-relaxed">
                You decide whether to proceed, substitute, or remove. The decision is yours;
                the protection is built-in.
              </p>
            </div>
            <div className="border-l-4 border-gold pl-8">
              <div className="space-y-6">
                <div>
                  <span className="text-navy font-semibold block mb-1">Overruled Authorities</span>
                  <span className="text-gray-500 text-sm">Flagged and held for your review</span>
                </div>
                <div>
                  <span className="text-navy font-semibold block mb-1">Distinguished Holdings</span>
                  <span className="text-gray-500 text-sm">Marked with jurisdictional context</span>
                </div>
                <div>
                  <span className="text-navy font-semibold block mb-1">Citation Strength Alerts</span>
                  <span className="text-gray-500 text-sm">Weak or dicta-based support identified</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust Statement */}
        <div className="border-l-4 border-gold pl-8 py-4 mb-16">
          <h3 className="font-serif text-3xl text-navy mb-6">You Review. You File.</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Drafting Service Only.</strong> Motion Granted is a legal
                process outsourcing company. We are not a law firm. We do not provide legal advice
                or create attorney-client relationships with your clients.
              </p>
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Your Supervision.</strong> You review every deliverable,
                verify our work against your professional judgment, and file under your name.
                The work product is yours to approve or revise.
              </p>
            </div>
            <div className="space-y-4">
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Complete Audit Trail.</strong> Every production decision
                is logged. You receive documentation suitable for professional responsibility
                compliance and malpractice defense.
              </p>
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Flat-Fee Pricing.</strong> No hourly billing. No scope creep.
                You know your cost upfront. Rush delivery available for 48-hour and 72-hour turnaround.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-3 bg-navy text-white px-12 py-6 text-xl hover:bg-gold transition-all duration-500"
          >
            Start Your Order
            <span className="text-gold group-hover:text-navy">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
