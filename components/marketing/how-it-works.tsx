const protocolPhases = [
  {
    phase: "I",
    name: "Document Intake",
    desc: "Secure upload and OCR processing of case materials, pleadings, and exhibits.",
    detail: "Automated classification"
  },
  {
    phase: "II",
    name: "Issue Identification",
    desc: "Extraction of legal issues, causes of action, and affirmative defenses.",
    detail: "La. C.C.P. mapping"
  },
  {
    phase: "III",
    name: "Standards Deconstruction",
    desc: "Breakdown of applicable legal standards into testable elements.",
    detail: "Element-by-element analysis"
  },
  {
    phase: "IV",
    name: "Authority Research",
    desc: "Parallel research paths for binding precedent and persuasive authority.",
    detail: "Louisiana Supreme Court priority"
  },
  {
    phase: "V",
    name: "Citation Batching",
    desc: "Small-batch verification (2 citations per pass) to eliminate hallucinations.",
    detail: "100% accuracy standard",
    highlight: true
  },
  {
    phase: "VI",
    name: "Opposition Anticipation",
    desc: "Predictive analysis of opposing counsel's likely counterarguments.",
    detail: "Preemptive rebuttal drafting"
  },
  {
    phase: "VII",
    name: "Judge Simulation",
    desc: "Draft graded by judicial simulation engine. Minimum B+ (3.3) required to proceed.",
    detail: "Automatic revision routing",
    highlight: true
  },
  {
    phase: "VIII",
    name: "Holding vs. Dicta",
    desc: "Verification that cited authority supports proposition as holding, not dicta.",
    detail: "Precedential integrity check"
  },
  {
    phase: "IX",
    name: "Document Assembly",
    desc: "Production of motion, memorandum, exhibits, and proposed order.",
    detail: "Court-specific formatting"
  },
  {
    phase: "X",
    name: "Caption Validation",
    desc: "Verification of case caption, court designation, and party names.",
    detail: "Louisiana district compliance"
  },
  {
    phase: "XI",
    name: "ABA Disclosure",
    desc: "Integration of AI-assisted drafting disclosure per ABA Formal Opinion 512.",
    detail: "Professional responsibility"
  },
  {
    phase: "XII",
    name: "Quality Assurance",
    desc: "Final human review checkpoint before client delivery.",
    detail: "Attorney oversight"
  },
  {
    phase: "XIII",
    name: "Secure Delivery",
    desc: "Encrypted transmission of file-ready work product to client portal.",
    detail: "Audit trail generated"
  },
  {
    phase: "XIV",
    name: "Data Retention",
    desc: "Automated anonymization and secure archival per retention policy.",
    detail: "Client data sovereignty"
  }
];

export function HowItWorks() {
  return (
    <section id="protocol" className="bg-white py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <div className="border-l-4 border-gold pl-6 mb-8">
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
              Production Methodology
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-6xl text-navy mb-6">The 14-Phase Protocol</h2>
          <p className="text-xl text-gray-600 max-w-3xl">
            Every motion, brief, and exception passes through a rigorous verification workflow
            before reaching your desk. No shortcuts. No exceptions.
          </p>
        </div>

        {/* Phase Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {protocolPhases.slice(0, 8).map((phase) => (
            <div
              key={phase.phase}
              className={`border-t-2 ${phase.highlight ? 'border-gold bg-gold/5' : 'border-navy/20'} pt-6 pb-4 px-4`}
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`font-bold text-sm ${phase.highlight ? 'text-gold' : 'text-navy/50'}`}>
                  PHASE {phase.phase}
                </span>
              </div>
              <h3 className="font-serif text-lg text-navy mb-2">{phase.name}</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">{phase.desc}</p>
              <span className="text-xs font-medium text-gold uppercase tracking-wider">{phase.detail}</span>
            </div>
          ))}
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {protocolPhases.slice(8, 11).map((phase) => (
            <div
              key={phase.phase}
              className={`border-t-2 ${phase.highlight ? 'border-gold bg-gold/5' : 'border-navy/20'} pt-6 pb-4 px-4`}
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`font-bold text-sm ${phase.highlight ? 'text-gold' : 'text-navy/50'}`}>
                  PHASE {phase.phase}
                </span>
              </div>
              <h3 className="font-serif text-lg text-navy mb-2">{phase.name}</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">{phase.desc}</p>
              <span className="text-xs font-medium text-gold uppercase tracking-wider">{phase.detail}</span>
            </div>
          ))}
        </div>

        {/* Final Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {protocolPhases.slice(11).map((phase) => (
            <div
              key={phase.phase}
              className={`border-t-2 ${phase.highlight ? 'border-gold bg-gold/5' : 'border-navy/20'} pt-6 pb-4 px-4`}
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`font-bold text-sm ${phase.highlight ? 'text-gold' : 'text-navy/50'}`}>
                  PHASE {phase.phase}
                </span>
              </div>
              <h3 className="font-serif text-lg text-navy mb-2">{phase.name}</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">{phase.desc}</p>
              <span className="text-xs font-medium text-gold uppercase tracking-wider">{phase.detail}</span>
            </div>
          ))}
        </div>

        {/* Critical Gates Callout */}
        <div className="mt-16 border border-navy/10 p-8 bg-navy/[0.02]">
          <h3 className="font-serif text-2xl text-navy mb-6">Critical Quality Gates</h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gold/10 flex items-center justify-center">
                <span className="font-bold text-gold">V</span>
              </div>
              <div>
                <h4 className="font-semibold text-navy mb-1">Citation Batch Verification</h4>
                <p className="text-gray-600 text-sm">
                  Citations are verified in batches of 2 to ensure 100% accuracy.
                  This prevents the "hallucination" problem common in AI-assisted research.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-gold/10 flex items-center justify-center">
                <span className="font-bold text-gold">VII</span>
              </div>
              <div>
                <h4 className="font-semibold text-navy mb-1">Judicial Simulation Gate</h4>
                <p className="text-gray-600 text-sm">
                  Every draft is graded by a simulation engine calibrated to judicial standards.
                  Work product scoring below B+ (3.3/4.0) is automatically routed for revision.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
