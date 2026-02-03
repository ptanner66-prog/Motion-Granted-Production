import Link from 'next/link'
import { FileText, Scale, Gavel, BookOpen } from 'lucide-react'

const motionTypes = [
  {
    icon: Scale,
    title: "Summary Judgment",
    description: "Complete MSJ packages with memorandum, separate statement of facts, and proposed order.",
    turnaround: "5-day standard",
  },
  {
    icon: FileText,
    title: "Discovery Motions",
    description: "Motions to compel, protective orders, and Rule 37 certifications with discovery logs.",
    turnaround: "5-day standard",
  },
  {
    icon: Gavel,
    title: "Pleadings & Responses",
    description: "Complaints, answers, affirmative defenses, and jurisdictional exceptions.",
    turnaround: "5-day standard",
  },
  {
    icon: BookOpen,
    title: "Appellate Briefs",
    description: "Opening briefs, reply briefs, and writs formatted for your appellate court.",
    turnaround: "7-day standard",
  },
];

export function ValueProps() {
  return (
    <section className="bg-white py-24 border-t border-navy/5">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold mb-4 block">
            What We Draft
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-navy mb-6">
            File-ready work product for your practice
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Flat-fee pricing you can quote to clients. Every citation verified before delivery.
          </p>
        </div>

        {/* Motion Types Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {motionTypes.map((item) => (
            <div
              key={item.title}
              className="bg-cream border border-navy/10 p-8 rounded-lg hover:shadow-lg hover:border-gold/30 transition-all duration-300 group"
            >
              <item.icon className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="font-serif text-xl text-navy mb-3">{item.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {item.description}
              </p>
              <span className="text-xs font-medium text-gold uppercase tracking-wider">
                {item.turnaround}
              </span>
            </div>
          ))}
        </div>

        {/* Rush Banner */}
        <div className="bg-navy text-white p-8 rounded-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">
              Deadline approaching?
            </span>
            <h3 className="font-serif text-2xl md:text-3xl">
              48-hour and 72-hour rush delivery available
            </h3>
          </div>
          <Link
            href="/pricing"
            className="bg-gold text-navy px-8 py-4 rounded font-semibold hover:bg-white transition-colors whitespace-nowrap"
          >
            View Rush Pricing
          </Link>
        </div>

        {/* Bottom Note */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 mb-4">
            Don&apos;t see your matter type? We handle complex litigation and specialized filings too.
          </p>
          <Link
            href="/pricing"
            className="text-navy font-medium hover:text-gold transition-colors inline-flex items-center gap-2"
          >
            View complete fee schedule
            <span className="text-gold">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
