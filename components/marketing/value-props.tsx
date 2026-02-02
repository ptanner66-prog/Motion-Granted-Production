import Link from 'next/link'

const productionProtocols = [
  {
    protocol: "Summary Judgment",
    deliverables: [
      "Motion for Summary Judgment",
      "Separate Statement of Undisputed Material Facts",
      "Memorandum in Support",
      "Proposed Order"
    ],
    statutes: "La. C.C.P. Art. 966"
  },
  {
    protocol: "Discovery Enforcement",
    deliverables: [
      "Motion to Compel Discovery",
      "Rule 37 Certification",
      "Discovery Response Log",
      "Fee Affidavit"
    ],
    statutes: "La. C.C.P. Art. 1469"
  },
  {
    protocol: "Peremptory Exceptions",
    deliverables: [
      "Exception of No Cause of Action",
      "Exception of Prescription",
      "Exception of Res Judicata",
      "Supporting Memorandum"
    ],
    statutes: "La. C.C.P. Art. 927"
  },
  {
    protocol: "Dilatory Exceptions",
    deliverables: [
      "Exception of Prematurity",
      "Exception of Lis Pendens",
      "Exception of Vagueness",
      "Proposed Order"
    ],
    statutes: "La. C.C.P. Art. 926"
  },
  {
    protocol: "Appellate Support",
    deliverables: [
      "Writ of Certiorari Application",
      "Appellate Brief",
      "Record Appendix",
      "Designation of Record"
    ],
    statutes: "La. C.C.P. Art. 2161"
  },
  {
    protocol: "Trial Preparation",
    deliverables: [
      "Pre-Trial Memorandum",
      "Proposed Jury Instructions",
      "Witness & Exhibit Lists",
      "Trial Brief"
    ],
    statutes: "Local Court Rules"
  }
];

export function ValueProps() {
  return (
    <section className="bg-[#fdfcfb] py-28 border-t border-navy/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <div className="border-l-4 border-gold pl-6 mb-8">
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
              Production Protocols
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-6xl text-navy mb-6">Drafting Menu</h2>
          <p className="text-xl text-gray-600 max-w-3xl">
            Each protocol produces a complete set of file-ready documents formatted for
            Louisiana state courts. Select your matter type below.
          </p>
        </div>

        {/* Protocol Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {productionProtocols.map((item) => (
            <div
              key={item.protocol}
              className="border border-navy/10 bg-white p-8 hover:border-gold/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-6">
                <h3 className="font-serif text-2xl text-navy">{item.protocol}</h3>
              </div>

              <ul className="space-y-3 mb-6">
                {item.deliverables.map((deliverable) => (
                  <li key={deliverable} className="flex items-start gap-3 text-gray-600">
                    <span className="text-gold mt-1.5">—</span>
                    <span className="text-sm">{deliverable}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4 border-t border-navy/10">
                <span className="text-xs font-medium text-gold uppercase tracking-wider">
                  {item.statutes}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-600 mb-6">
            Don&apos;t see your motion type? We produce custom work product for complex matters.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-navy font-medium hover:text-gold transition-colors"
          >
            View Complete Fee Schedule
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
