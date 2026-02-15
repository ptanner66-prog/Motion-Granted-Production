import { Metadata } from 'next';
import Link from 'next/link';
import {
  FileText,
  Scale,
  Shield,
  ArrowRight,
  Search,
  AlertTriangle,
  BookOpen,
  Zap
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Motion Granted | AI-Powered Legal Motion Drafting',
  description: 'Professional motion drafting in hours, not days. Flat-fee pricing. Every citation screened for accuracy. No subscriptions, no minimums.',
  openGraph: {
    title: 'Motion Granted | AI-Powered Legal Motion Drafting',
    description: 'Flat-fee motion drafting for attorneys. Court-ready documents with every citation screened.',
  },
};

export default function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative min-h-[90vh] bg-gradient-to-br from-[#0F1F33] to-[#1E3A5F] text-white overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-32 pb-20">
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 bg-[#C9A227]/20 text-[#C9A227] text-sm font-semibold rounded-full mb-6">
              LEGAL DRAFTING REIMAGINED
            </span>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-tight mb-6">
              Motions drafted by AI.<br />
              <em className="text-[#C9A227]">Reviewed by attorneys.</em>
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
              Professional motion drafting in hours, not days. Flat-fee pricing.
              Every citation screened for accuracy. No subscriptions, no minimums.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/orders/new"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A227] text-[#0F1F33] font-bold rounded-lg hover:bg-[#D4B33A] transition-all shadow-lg hover:shadow-xl"
              >
                Submit Your First Order
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-all"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
              HOW IT WORKS
            </span>
            <h2 className="font-serif text-4xl text-[#0F1F33] mt-3">
              Three steps to <em className="text-[#C9A227]">better briefs</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative p-8 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="absolute -top-4 left-6 w-8 h-8 bg-[#1E3A5F] text-white rounded-full flex items-center justify-center font-bold text-sm">
                01
              </span>
              <FileText className="w-10 h-10 text-[#1E3A5F] mb-4" />
              <h3 className="text-xl font-bold text-[#0F1F33] mb-2">Submit your case</h3>
              <p className="text-slate-500">
                Upload your documents, describe the motion you need, and select your deadline.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative p-8 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="absolute -top-4 left-6 w-8 h-8 bg-[#1E3A5F] text-white rounded-full flex items-center justify-center font-bold text-sm">
                02
              </span>
              <Zap className="w-10 h-10 text-[#1E3A5F] mb-4" />
              <h3 className="text-xl font-bold text-[#0F1F33] mb-2">AI drafts your motion</h3>
              <p className="text-slate-500">
                Automated bad law screening and negative treatment analysis. Every citation checked.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative p-8 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="absolute -top-4 left-6 w-8 h-8 bg-[#1E3A5F] text-white rounded-full flex items-center justify-center font-bold text-sm">
                03
              </span>
              <Scale className="w-10 h-10 text-[#1E3A5F] mb-4" />
              <h3 className="text-xl font-bold text-[#0F1F33] mb-2">Attorney review &amp; delivery</h3>
              <p className="text-slate-500">
                Licensed attorney reviews the draft. You receive a court-ready document.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Citation Verification Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
              CITATION ACCURACY
            </span>
            <h2 className="font-serif text-4xl text-[#0F1F33] mt-3">
              Every citation screened. <em className="text-[#C9A227]">Not some. Every one.</em>
            </h2>
            <p className="text-slate-500 mt-4 max-w-xl mx-auto">
              Our 7-step verification pipeline catches bad law before it reaches your brief.
              <br />
              <span className="text-sm text-slate-400 mt-2 inline-block">
                Verified using open-source legal databases. Not a substitute for Shepard&apos;s® or KeyCite®.
              </span>
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <VerificationStep
              icon={<Search className="w-6 h-6" />}
              title="Existence Check"
              description="Verify the case actually exists in legal databases"
            />
            <VerificationStep
              icon={<BookOpen className="w-6 h-6" />}
              title="Holding Analysis"
              description="Extract and validate the legal holding"
            />
            <VerificationStep
              icon={<AlertTriangle className="w-6 h-6" />}
              title="Subsequent History"
              description="Check for overruling, distinguishing, or questioning"
            />
            <VerificationStep
              icon={<Shield className="w-6 h-6" />}
              title="Bad Law Flags"
              description="Flag citations with negative treatment signals"
            />
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
              FLAT-FEE PRICING
            </span>
            <h2 className="font-serif text-4xl text-[#0F1F33] mt-3">
              Know your cost <em className="text-[#C9A227]">upfront</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <PricingCard tier="A" price="$150" description="Simple procedural motions" />
            <PricingCard tier="B" price="$350" description="Standard substantive motions" featured />
            <PricingCard tier="C" price="$850" description="Complex motions with multiple issues" />
            <PricingCard tier="D" price="$1,500+" description="Major dispositive motions" />
          </div>

          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-[#1E3A5F] font-semibold hover:text-[#C9A227] transition-colors"
            >
              View full pricing details
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#0F1F33]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-4xl text-white mb-6">
            Ready to reclaim your <em className="text-[#C9A227]">billable hours?</em>
          </h2>
          <p className="text-slate-300 text-lg mb-10">
            Submit your first order today. No subscription required.
          </p>
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-2 px-10 py-5 bg-[#C9A227] text-[#0F1F33] font-bold text-lg rounded-lg hover:bg-[#D4B33A] transition-all shadow-lg"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function VerificationStep({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="w-12 h-12 bg-[#1E3A5F]/10 rounded-lg flex items-center justify-center text-[#1E3A5F] mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-[#0F1F33] mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  description,
  featured = false
}: {
  tier: string;
  price: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <div className={`
      relative p-6 rounded-xl border transition-all
      ${featured
        ? 'bg-white border-[#C9A227] shadow-lg scale-105'
        : 'bg-slate-50 border-slate-200'
      }
    `}>
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#C9A227] text-[#0F1F33] text-xs font-bold rounded-full">
          MOST POPULAR
        </span>
      )}
      <div className="text-center">
        <span className="text-sm font-bold text-slate-400">TIER {tier}</span>
        <div className="font-serif text-3xl text-[#0F1F33] mt-1">{price}</div>
        <p className="text-sm text-slate-500 mt-2">{description}</p>
      </div>
    </div>
  );
}
