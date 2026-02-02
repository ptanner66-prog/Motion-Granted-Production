import { Shield, FileText, Lock, ClipboardList } from 'lucide-react'

const securityFeatures = [
  {
    icon: FileText,
    title: "Louisiana Statute Parser",
    description: "Custom parsing engine for La. C.C.P. and La. R.S. ensures every citation and procedural reference is current and correctly formatted.",
    detail: "Updated weekly from legislative sources"
  },
  {
    icon: Shield,
    title: "ABA Opinion 512 Compliance",
    description: "Built-in disclosure engine generates appropriate AI-assisted drafting disclosures per ABA Formal Opinion 512 requirements.",
    detail: "Automatic disclosure integration"
  },
  {
    icon: Lock,
    title: "Data Sovereignty & Retention",
    description: "Automated anonymization scrubs sensitive client data after production. You control retention periods and deletion schedules.",
    detail: "SOC 2 Type II compliant infrastructure"
  },
  {
    icon: ClipboardList,
    title: "Institutional Audit Trail",
    description: "Complete workflow audit log provides a paper trail for every decision made during the drafting process—from intake to delivery.",
    detail: "Exportable for malpractice defense"
  }
];

export function TrustSection() {
  return (
    <section className="bg-navy py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <div className="border-l-4 border-gold pl-6 mb-8">
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
              Enterprise Infrastructure
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-6xl text-white mb-6">
            Compliance & Security
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl">
            For institutional clients, security is not a checkbox—it&apos;s the foundation.
            Every component of Motion Granted is built to withstand scrutiny.
          </p>
        </div>

        {/* Security Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

        {/* Bottom Statement */}
        <div className="mt-16 pt-12 border-t border-white/10">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Professional Responsibility
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Motion Granted operates under the supervision of licensed Louisiana attorneys.
                All work product is reviewed for compliance with the Louisiana Rules of Professional Conduct.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Confidentiality
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Case materials are processed in isolated environments. No client data is used
                for model training. Attorney-client privilege is preserved throughout production.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Insurance
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Errors & Omissions coverage backs every production. Certificate of insurance
                available upon request for institutional clients.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
