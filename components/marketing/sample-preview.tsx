'use client'

import { useState } from 'react'
import { FileText, ChevronRight, Check, Eye } from 'lucide-react'

const sampleSections = [
  {
    id: 'caption',
    title: "Caption & Style",
    preview: `UNITED STATES DISTRICT COURT
EASTERN DISTRICT OF [REDACTED]

[PLAINTIFF],
        Plaintiff,
    v.                                    Civil Action No. XX-XXXX

[DEFENDANT],
        Defendant.

DEFENDANT'S MOTION FOR SUMMARY JUDGMENT`,
  },
  {
    id: 'issues',
    title: "Statement of Issues",
    preview: `STATEMENT OF ISSUES PRESENTED

1. Whether Plaintiff can establish a genuine dispute of material fact
   as to any element of their negligence claim when the undisputed
   evidence shows Defendant exercised reasonable care under the
   circumstances.

2. Whether Plaintiff's failure to produce evidence of causation beyond
   mere speculation entitles Defendant to judgment as a matter of law.`,
  },
  {
    id: 'argument',
    title: "Legal Argument",
    preview: `II. ARGUMENT

A. Standard of Review

Summary judgment is appropriate when "the movant shows that there is
no genuine dispute as to any material fact and the movant is entitled
to judgment as a matter of law." Fed. R. Civ. P. 56(a). The Court must
view all facts and inferences in the light most favorable to the
nonmoving party. Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 255
(1986).

[Citation verified via Verified Precedent Index ✓]`,
  },
  {
    id: 'citations',
    title: "Citations",
    preview: `AUTHORITIES CITED

Cases:
• Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986) ✓
• Celotex Corp. v. Catrett, 477 U.S. 317 (1986) ✓
• Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574 (1986) ✓

All citations verified against Verified Precedent Index
Last Shepardized: [Date]
Status: Good Law ✓`,
  },
]

export function SamplePreview() {
  const [activeSection, setActiveSection] = useState(0)

  return (
    <section className="bg-navy py-20" aria-labelledby="sample-preview-heading">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Description */}
          <div>
            <div className="inline-flex items-center gap-3 mb-6">
              <Eye className="w-5 h-5 text-gold" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                See the Quality
              </span>
            </div>

            <h2 id="sample-preview-heading" className="font-serif text-4xl text-white mb-6">
              Work product you&apos;d be proud to file
            </h2>

            <p className="text-gray-300 leading-relaxed mb-8">
              Every motion follows proper court formatting, includes comprehensive
              legal analysis, and comes with fully verified citations. Click through
              to preview actual sections from a sample MSJ package.
            </p>

            {/* Section Tabs - Proper ARIA tablist */}
            <div
              role="tablist"
              aria-label="Sample document sections"
              className="space-y-3"
            >
              {sampleSections.map((section, index) => (
                <button
                  key={section.id}
                  id={`tab-${section.id}`}
                  role="tab"
                  aria-selected={activeSection === index}
                  aria-controls={`panel-${section.id}`}
                  onClick={() => setActiveSection(index)}
                  className={`w-full text-left px-5 py-4 rounded-lg transition-all duration-200 flex items-center justify-between group ${
                    activeSection === index
                      ? 'bg-gold text-navy shadow-lg'
                      : 'bg-white/5 text-white hover:bg-white/10 hover:translate-x-1'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText
                      className={`w-5 h-5 transition-colors ${
                        activeSection === index ? 'text-navy' : 'text-gold'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{section.title}</span>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 transition-transform duration-200 ${
                      activeSection === index ? 'rotate-90' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>

            {/* Features */}
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-gray-300 text-sm group">
                <Check className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span>Bluebook formatted</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm group">
                <Check className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span>Court-ready styling</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm group">
                <Check className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span>All citations verified</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 text-sm group">
                <Check className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" aria-hidden="true" />
                <span>ABA Formal Opinion 512 disclosure</span>
              </div>
            </div>
          </div>

          {/* Right: Preview Window */}
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
            {/* Window Header */}
            <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b">
              <div className="w-3 h-3 rounded-full bg-red-400" aria-hidden="true" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" aria-hidden="true" />
              <div className="w-3 h-3 rounded-full bg-green-400" aria-hidden="true" />
              <span className="ml-4 text-sm text-gray-500">sample-msj-preview.docx</span>
            </div>

            {/* Document Preview - Tab Panel */}
            {sampleSections.map((section, index) => (
              <div
                key={section.id}
                id={`panel-${section.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${section.id}`}
                hidden={activeSection !== index}
                className="p-8 bg-white min-h-[400px]"
              >
                <pre className="font-mono text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {section.preview}
                </pre>
              </div>
            ))}

            {/* Footer - Fixed VPI badge positioning */}
            <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Sample only. Actual deliverables are jurisdiction-specific.
              </span>
              <span className="text-xs font-semibold text-white bg-gold px-3 py-1 rounded-full">
                VPI Verified
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
