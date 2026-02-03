import Link from 'next/link'
import { Clock, FileText, Scale, Zap } from 'lucide-react'

const efficiencyFeatures = [
  {
    icon: FileText,
    title: "Perfect Bluebook Citations",
    headline: "Never Format a Citation Again",
    description: "Every citation in your deliverable is formatted to the 21st Edition Bluebook standard. Tables of Authorities generated automatically. Signal phrases, parentheticals, and pinpoint citations—all handled.",
    detail: "Bluebook Native"
  },
  {
    icon: Scale,
    title: "B+ Minimum Standard",
    headline: "A Guaranteed Quality Floor",
    description: "Work product that doesn't meet our B+ judicial review standard never reaches your inbox. We revise internally until it passes. You receive file-ready drafts, not rough sketches.",
    detail: "Quality Guaranteed"
  },
  {
    icon: Clock,
    title: "Emergency Turnaround",
    headline: "When Deadlines Don't Wait",
    description: "Facing an unexpected opposition motion? Need to respond to a TRO? Our 48-hour and 72-hour rush production is designed for the emergencies that define solo practice.",
    detail: "48hr Rush Available"
  },
  {
    icon: Zap,
    title: "Instant Delegation",
    headline: "No Onboarding. No Training.",
    description: "Upload your case materials. Specify your jurisdiction. Set your deadline. That's it. No associate training, no quality control headaches, no supervision required.",
    detail: "Submit & Receive"
  }
];

const deliverables = [
  {
    category: "Motions & Briefs",
    items: ["Summary Judgment", "Motion to Compel", "Motion to Dismiss", "Motion in Limine", "Opposition Briefs"]
  },
  {
    category: "Pleadings",
    items: ["Petitions & Complaints", "Answers & Responses", "Affirmative Defenses", "Cross-Claims", "Third-Party Complaints"]
  },
  {
    category: "Discovery",
    items: ["Interrogatories", "Requests for Production", "Requests for Admission", "Deposition Outlines", "Discovery Motions"]
  },
  {
    category: "Appellate",
    items: ["Opening Briefs", "Reply Briefs", "Writs", "Extraordinary Relief", "Amicus Briefs"]
  }
];

export function ValueProps() {
  return (
    <section className="relative bg-cream py-28 border-t border-navy/10 overflow-hidden">
      <div className="subtle-grid absolute inset-0 pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Emergency Banner */}
        <div className="bg-navy text-white p-8 mb-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">
              For the Emergencies That Define Solo Practice
            </span>
            <h3 className="font-serif text-2xl md:text-3xl">
              48-Hour and 72-Hour Rush Production Available
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
              The Billable Hour Saver
            </span>
          </div>
          <h2 className="font-serif text-5xl md:text-7xl text-navy mb-6">
            Reclaim Your Practice.
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl leading-relaxed">
            Big Law has armies of associates for the grunt work. Now you have Motion Granted.
            Institutional-grade production at flat-fee pricing.
          </p>
        </div>

        {/* Efficiency Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          {efficiencyFeatures.map((feature) => (
            <div
              key={feature.title}
              className="border border-navy/10 bg-white p-10 hover:border-gold/50 transition-colors"
            >
              <div className="flex items-start gap-6 mb-6">
                <div className="flex-shrink-0 w-14 h-14 bg-navy/5 flex items-center justify-center">
                  <feature.icon className="w-7 h-7 text-navy" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-gold mb-1 block">
                    {feature.detail}
                  </span>
                  <h3 className="font-serif text-2xl text-navy">{feature.headline}</h3>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* What We Draft */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-4 mb-8">
            <div className="h-[2px] w-12 bg-gold" />
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              Production Menu
            </span>
          </div>
          <h3 className="font-serif text-4xl text-navy mb-12">What We Draft</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {deliverables.map((category) => (
              <div key={category.category} className="border-t-2 border-gold pt-6">
                <h4 className="font-semibold text-navy mb-4">{category.category}</h4>
                <ul className="space-y-2">
                  {category.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-gray-600 text-sm">
                      <span className="text-gold mt-0.5">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="border-l-4 border-gold pl-8 py-4">
          <p className="text-gray-600 text-lg leading-relaxed max-w-3xl mb-6">
            Don&apos;t see your matter type? We produce custom work product for complex
            litigation and specialized filings. Every deliverable includes Bluebook-perfect
            citations and a defensible audit trail.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-3 text-navy font-serif text-xl italic hover:text-gold transition-colors"
          >
            View Complete Fee Schedule
            <span className="text-gold">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
