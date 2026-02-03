import Link from 'next/link'

const qualityStandards = [
  {
    metric: "B+",
    label: "Minimum Quality Gate",
    description: "Every deliverable must pass our internal judicial review standard before reaching your desk."
  },
  {
    metric: "100%",
    label: "Citation Accuracy",
    description: "Verified authorities only. Our proprietary process eliminates hallucinated or fabricated citations."
  },
  {
    metric: "14",
    label: "Phase Protocol",
    description: "Comprehensive production workflow from intake through delivery with multiple quality checkpoints."
  },
  {
    metric: "512",
    label: "ABA Compliance",
    description: "Built-in disclosure engine for ABA Formal Opinion 512 requirements across all jurisdictions."
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
              Production Standard
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">Institutional-Grade Quality</h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            Motion Granted applies rigorous production standards to every deliverable.
            Our proprietary workflow ensures consistency, accuracy, and compliance.
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

        {/* Trust Statement */}
        <div className="border-l-4 border-gold pl-8 py-4 mb-16">
          <h3 className="font-serif text-3xl text-navy mb-6">Why Attorneys Trust Our Process</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Judicial-Standard Review.</strong> Work product is evaluated
                against the same standards applied by courts. Drafts that don&apos;t meet our threshold
                are revised internally before delivery.
              </p>
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Citation Integrity.</strong> Every authority is verified
                against live databases. We don&apos;t guess, hallucinate, or fabricate—your citations
                are real and accurately quoted.
              </p>
            </div>
            <div className="space-y-4">
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Compliance Built-In.</strong> AI disclosure requirements
                vary by jurisdiction. Our system automatically generates appropriate disclosures for
                state and federal courts nationwide.
              </p>
              <p className="text-gray-600 leading-relaxed">
                <strong className="text-navy">Complete Audit Trail.</strong> Every production decision
                is logged. You receive documentation suitable for malpractice defense and professional
                responsibility compliance.
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
            Initiate Your First Production
            <span className="text-gold group-hover:text-navy">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
