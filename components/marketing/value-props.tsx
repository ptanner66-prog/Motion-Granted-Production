import Link from 'next/link'

const productionProtocols = [
  {
    protocol: "Summary Judgment",
    deliverables: [
      "Motion for Summary Judgment",
      "Memorandum of Points and Authorities",
      "Separate Statement of Undisputed Facts",
      "Proposed Order"
    ],
    jurisdiction: "State & Federal"
  },
  {
    protocol: "Discovery Enforcement",
    deliverables: [
      "Motion to Compel",
      "Rule 37 Certification",
      "Discovery Log",
      "Proposed Order"
    ],
    jurisdiction: "FRCP & State Rules"
  },
  {
    protocol: "Pleadings & Exceptions",
    deliverables: [
      "Petitions & Complaints",
      "Answers & Responses",
      "Affirmative Defenses",
      "Jurisdictional Exceptions"
    ],
    jurisdiction: "All Jurisdictions"
  },
  {
    protocol: "Appellate & Complex",
    deliverables: [
      "Appellate Briefs",
      "Writs & Extraordinary Relief",
      "Complex Motion Packages",
      "Multi-Party Filings"
    ],
    jurisdiction: "State & Federal"
  }
];

export function ValueProps() {
  return (
    <section className="relative bg-cream py-28 border-t border-navy/10 overflow-hidden">
      <div className="subtle-grid absolute inset-0 pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Emergency Production Banner */}
        <div className="bg-navy text-white p-8 mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">
              Emergency Production
            </span>
            <h3 className="font-serif text-2xl md:text-3xl">
              48-Hour and 72-Hour Rush Delivery Available
            </h3>
          </div>
          <Link
            href="/pricing"
            className="bg-gold text-navy px-8 py-4 font-semibold hover:bg-white transition-colors whitespace-nowrap"
          >
            View Rush Pricing
          </Link>
        </div>

        {/* Section Header */}
        <div className="mb-20">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Production Menu
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">What We Draft</h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            Each order produces a complete set of file-ready documents formatted for
            your jurisdiction. All citations verified through the Verified Precedent Index.
          </p>
        </div>

        {/* Protocol Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {productionProtocols.map((item) => (
            <div
              key={item.protocol}
              className="border border-navy/10 bg-white p-10 hover:border-gold/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-8">
                <h3 className="font-serif text-3xl text-navy">{item.protocol}</h3>
                <span className="text-xs font-bold uppercase tracking-widest text-gold bg-gold/10 px-3 py-1">
                  {item.jurisdiction}
                </span>
              </div>

              <div className="mb-8">
                <span className="text-xs font-bold uppercase tracking-widest text-navy/50 mb-4 block">
                  Included Deliverables
                </span>
                <ul className="space-y-3">
                  {item.deliverables.map((deliverable) => (
                    <li key={deliverable} className="flex items-start gap-3 text-gray-600">
                      <span className="text-gold mt-1">—</span>
                      <span className="text-base">{deliverable}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 border-t border-navy/10">
                <Link
                  href="/pricing"
                  className="text-navy font-serif italic hover:text-gold transition-colors inline-flex items-center gap-2"
                >
                  View pricing
                  <span className="text-gold group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Statement */}
        <div className="mt-16 border-l-4 border-gold pl-8 py-4">
          <p className="text-gray-600 text-lg leading-relaxed max-w-3xl">
            Don&apos;t see your matter type? We produce custom work product for
            complex litigation and specialized filings. Every deliverable includes
            full audit trail documentation.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-3 text-navy font-serif text-xl italic mt-6 hover:text-gold transition-colors"
          >
            View Complete Fee Schedule
            <span className="text-gold">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
