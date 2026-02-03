import { Shield, Clock, FileCheck, Lock } from 'lucide-react'

export function TrustSection() {
  return (
    <section className="bg-navy py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Emotional Hook - The Pain Point */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="font-serif text-4xl md:text-5xl text-white mb-8 leading-tight">
            You don&apos;t have associates to delegate to.
          </h2>
          <p className="text-xl text-gray-300 leading-relaxed mb-6">
            You don&apos;t have time to draft a 20-page summary judgment brief while juggling
            court appearances, client calls, and discovery deadlines.
          </p>
          <p className="text-xl text-gray-300 leading-relaxed mb-6">
            That&apos;s where we come in.
          </p>
          <p className="text-2xl text-gold font-serif italic">
            Motion Granted gives you a reliable drafting team on demand—without
            the overhead of full-time staff.
          </p>
        </div>

        {/* Divider */}
        <div className="h-px w-48 mx-auto bg-gradient-to-r from-transparent via-gold/50 to-transparent mb-20" />

        {/* Why Attorneys Trust Us - Compact Grid */}
        <div className="mb-16">
          <h3 className="text-center text-xs font-bold uppercase tracking-[0.3em] text-gold mb-12">
            Why Attorneys Trust Us
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/5 p-6 rounded-sm border border-white/10 hover:border-gold/30 transition-colors">
              <Shield className="w-8 h-8 text-gold mb-4" />
              <h4 className="text-white font-semibold mb-2">Verified Citations</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every authority checked against our Verified Precedent Index. No hallucinated cases.
              </p>
            </div>
            <div className="bg-white/5 p-6 rounded-sm border border-white/10 hover:border-gold/30 transition-colors">
              <Clock className="w-8 h-8 text-gold mb-4" />
              <h4 className="text-white font-semibold mb-2">Predictable Turnaround</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Standard 5-day delivery. 72-hour and 48-hour rush options when deadlines hit.
              </p>
            </div>
            <div className="bg-white/5 p-6 rounded-sm border border-white/10 hover:border-gold/30 transition-colors">
              <FileCheck className="w-8 h-8 text-gold mb-4" />
              <h4 className="text-white font-semibold mb-2">ABA Formal Opinion 512 Ready</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                AI disclosure language auto-generated for every deliverable. Stay compliant effortlessly.
              </p>
            </div>
            <div className="bg-white/5 p-6 rounded-sm border border-white/10 hover:border-gold/30 transition-colors">
              <Lock className="w-8 h-8 text-gold mb-4" />
              <h4 className="text-white font-semibold mb-2">Your Data, Protected</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Isolated processing. No training on your files. Attorney-client privilege preserved.
              </p>
            </div>
          </div>
        </div>

        {/* Simple Process Reminder */}
        <div className="bg-white/5 border border-white/10 rounded-sm p-8 text-center">
          <p className="text-gray-300 text-lg">
            <span className="text-white font-medium">We draft.</span>
            {' '}You review.{' '}
            <span className="text-white font-medium">You file.</span>
            <span className="text-gold ml-4 italic">Simple as that.</span>
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Motion Granted is not a law firm. We provide drafting support to licensed attorneys.
          </p>
        </div>
      </div>
    </section>
  )
}
