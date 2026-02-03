import { Shield, Scale, Lock, FileCheck } from 'lucide-react'

const securityFeatures = [
  {
    icon: Shield,
    title: "ABA Formal Opinion 512",
    description: "AI-assisted drafting disclosures generated automatically for every deliverable. Jurisdiction-specific language ensures compliance with disclosure requirements.",
    detail: "Auto-generated disclosures"
  },
  {
    icon: Scale,
    title: "Nationwide Compliance",
    description: "Work product formatted for state and federal court requirements. Current with procedural rules across all 50 states and federal circuits.",
    detail: "All jurisdictions supported"
  },
  {
    icon: FileCheck,
    title: "Production Audit Trail",
    description: "Every decision point in your production is logged. Receive complete documentation for professional responsibility compliance and malpractice defense.",
    detail: "Exportable records"
  },
  {
    icon: Lock,
    title: "Data Isolation",
    description: "Case materials processed in isolated environments. Data scrubbed after delivery per your retention preferences. No training on your files.",
    detail: "SOC 2 Type II"
  }
];

export function TrustSection() {
  return (
    <section className="bg-navy py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Professional Compliance
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-white mb-6">
            Built for Bar Compliance
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl leading-relaxed">
            Every production includes disclosure-ready documentation for ABA Formal Opinion 512
            and state bar requirements. Your professional responsibility is protected.
          </p>
        </div>

        {/* Security Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {securityFeatures.map((feature) => (
            <div
              key={feature.title}
              className="border border-white/10 bg-white/[0.02] p-8 hover:border-gold/30 transition-colors"
            >
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-14 h-14 bg-gold/10 flex items-center justify-center">
                  <feature.icon className="w-7 h-7 text-gold" />
                </div>
                <div>
                  <h3 className="font-serif text-xl text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">
                    {feature.description}
                  </p>
                  <span className="text-xs font-medium text-gold uppercase tracking-wider">
                    {feature.detail}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer Banner */}
        <div className="bg-white/5 border border-white/10 p-8 mb-16">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1">
              <h3 className="font-serif text-2xl text-white mb-4">
                Motion Granted Is Not a Law Firm
              </h3>
              <p className="text-gray-400 leading-relaxed">
                We are a legal process outsourcing company providing drafting support to licensed attorneys.
                We do not provide legal advice or representation. The supervising attorney reviews, approves,
                and files all work product. Your clients remain your clients.
              </p>
            </div>
            <div className="text-gold text-sm font-medium uppercase tracking-wider whitespace-nowrap">
              Drafting Service Only
            </div>
          </div>
        </div>

        {/* Bottom Statement */}
        <div className="pt-12 border-t border-white/10">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Attorney Supervision
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                You review every deliverable. You verify against your professional judgment.
                You file under your name. We provide the draft; you provide the oversight.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Confidentiality
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Case materials processed in isolated environments. No data used for
                training. Attorney-client privilege preserved.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                E&O Coverage
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Errors & omissions insurance backs every production. Certificate of
                insurance available upon request for institutional clients.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
