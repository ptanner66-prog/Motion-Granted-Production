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
    detail: "State & Federal mapping"
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
    detail: "Jurisdictional hierarchy"
  },
  {
    phase: "V",
    name: "Citation Integrity Audit",
    desc: "Hallucinations structurally eliminated by processing citations in batches of two.",
    detail: "Live precedent verification",
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
    desc: "Production gated by minimum GPA of 3.3 (B+). Below-threshold drafts routed for revision.",
    detail: "Three revision cycles max",
    highlight: true
  },
  {
    phase: "VIII",
    name: "Holding vs. Dicta",
    desc: "Verification that cited authority supports proposition as holding, not dicta.",
    detail: "Precedential integrity"
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
    detail: "Jurisdictional compliance"
  },
  {
    phase: "XI",
    name: "National Compliance",
    desc: "Jurisdiction-specific AI disclosures (CA, TX, NY, Federal) per ABA Opinion 512.",
    detail: "Multi-state compliance",
    highlight: true
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
    name: "Data Sovereignty",
    desc: "Automated anonymization and scrubbing of sensitive case data upon completion.",
    detail: "Professional retention",
    highlight: true
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
              Production Methodology
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">The 14-Phase Protocol</h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            Every motion, brief, and exception passes through a rigorous verification workflow
            before reaching your desk. No shortcuts. No exceptions.
          </p>
        </div>

        {/* Institutional Trust Pillars - Featured Section */}
        <div className="mb-20 border-l-4 border-gold pl-8 py-4">
          <h3 className="font-serif text-3xl text-navy mb-8">Institutional Trust Pillars</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-gold font-bold text-sm">PHASE VII</span>
                  <span className="text-navy/30">—</span>
                  <span className="text-navy font-serif text-lg">The Judge Simulation</span>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  Every document undergoes a simulated judicial review. Production is gated by a
                  <strong className="text-navy"> minimum GPA of 3.3 (B+)</strong>; drafts falling below
                  this threshold are automatically routed for up to three cycles of internal revision
                  before any work product reaches your desk.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-gold font-bold text-sm">PHASE V</span>
                  <span className="text-navy/30">—</span>
                  <span className="text-navy font-serif text-lg">Citation Integrity Audit</span>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  Hallucinations are structurally eliminated by processing citations in
                  <strong className="text-navy"> batches of two</strong>. Every authority is cross-verified
                  against a live precedent index to ensure current validity and correct citation format.
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-gold font-bold text-sm">PHASE XI</span>
                  <span className="text-navy/30">—</span>
                  <span className="text-navy font-serif text-lg">National Compliance Engine</span>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  The system generates jurisdiction-specific AI disclosures for
                  <strong className="text-navy"> California, Texas, New York, and Federal courts</strong> in
                  strict accordance with ABA Formal Opinion 512. Disclosure language is automatically
                  calibrated to local bar requirements.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-gold font-bold text-sm">PHASE XIV</span>
                  <span className="text-navy/30">—</span>
                  <span className="text-navy font-serif text-lg">Institutional Data Sovereignty</span>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  A professional retention service provides <strong className="text-navy">automated
                  anonymization and scrubbing</strong> of sensitive case data upon project completion.
                  You control retention periods, deletion schedules, and data export formats.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full Phase Grid */}
        <div className="mb-8">
          <h3 className="font-serif text-2xl text-navy mb-8">Complete Protocol Breakdown</h3>
        </div>

        {/* Phase Grid - Row 1 */}
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

        {/* Phase Grid - Row 2 */}
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

        {/* Phase Grid - Row 3 */}
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
      </div>
    </section>
  )
}
