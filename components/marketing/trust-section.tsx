import { Shield, Scale, Lock, FileCheck } from 'lucide-react'

const securityFeatures = [
  {
    icon: Scale,
    title: "Jurisdictional Compliance",
    description: "Work product formatted and verified for state and federal court requirements. Current with all procedural rules.",
    detail: "All 50 states + Federal"
  },
  {
    icon: Shield,
    title: "ABA Opinion 512 Ready",
    description: "Appropriate AI-assisted drafting disclosures generated automatically per jurisdiction requirements.",
    detail: "Built-in compliance"
  },
  {
    icon: Lock,
    title: "Data Protection",
    description: "Your case materials are processed securely and scrubbed after delivery. You control retention.",
    detail: "SOC 2 Type II infrastructure"
  },
  {
    icon: FileCheck,
    title: "Complete Audit Trail",
    description: "Every production decision is logged and documented for your records.",
    detail: "Malpractice defense ready"
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
              Enterprise Infrastructure
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-white mb-6">
            Compliance & Security
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl leading-relaxed">
            Built for attorneys who demand institutional-grade security and
            professional responsibility compliance.
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

        {/* Bottom Statement */}
        <div className="pt-12 border-t border-white/10">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Professional Oversight
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                All work product reviewed by licensed attorneys for compliance with
                Rules of Professional Conduct.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Confidentiality
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                Case materials processed in isolated environments. No data used for
                training. Privilege preserved.
              </p>
            </div>
            <div>
              <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-3 block">
                Insurance
              </span>
              <p className="text-gray-300 text-sm leading-relaxed">
                E&O coverage backs every production. Certificate available for
                institutional clients.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
