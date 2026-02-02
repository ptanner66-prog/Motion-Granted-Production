const protocolSteps = [
  {
    phase: "I-III",
    name: "Intake & Issue ID",
    desc: "Automated document processing and deconstruction of legal standards for Louisiana compliance."
  },
  {
    phase: "IV-VI",
    name: "Authority & Strategy",
    desc: "Parallel research paths using Opus 4.5 to anticipate opposition arguments and verify holding vs. dicta."
  },
  {
    phase: "VII-VIII",
    name: "Judge Simulation",
    desc: "Work product is graded by a simulation engine. Drafts below a 3.3 (B+) are automatically routed for revision."
  },
  {
    phase: "IX-X",
    name: "Final Assembly",
    desc: "Production of supporting documents, caption validation, and delivery of file-ready work product."
  }
];

export function HowItWorks() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-4xl text-navy mb-16">The 14-Phase Protocol</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {protocolSteps.map((step) => (
            <div key={step.phase} className="flex flex-col border-t-2 border-gold pt-6">
              <span className="text-gold font-bold mb-4 font-sans text-sm">PHASE {step.phase}</span>
              <h3 className="text-xl mb-3 text-navy">{step.name}</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-sans">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
