import { Metadata } from 'next';
import Link from 'next/link';
import { Users, Target, Lightbulb, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Motion Granted — built by attorneys, for attorneys. AI-powered motion drafting for solo practitioners and small firms.',
};

export default function AboutPage() {
  return (
    <div>
      {/* Page Header */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
            ABOUT US
          </span>
          <h1 className="font-serif text-5xl text-[#0F1F33] mt-3 mb-4">
            Built by attorneys, <em className="text-[#C9A227]">for attorneys</em>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Motion Granted was founded to solve a problem every solo practitioner knows:
            great legal work takes time you don&apos;t have.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="font-serif text-3xl text-[#0F1F33] mb-6">
                The <em className="text-[#C9A227]">origin</em> story
              </h2>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p>
                  <strong className="text-slate-700">After 30+ years of litigation practice</strong>,
                  our founding attorney had drafted thousands of motions. He knew the process
                  intimately — and he knew how much time it consumed.
                </p>
                <p>
                  Solo practitioners face an impossible choice: spend hours on motion drafting
                  (eating into billable work), or refer complex cases to larger firms.
                </p>
                <p>
                  Motion Granted exists to give small firms the drafting capacity of a
                  large firm — without the large firm overhead.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <StatCard value="30+" label="Years legal experience" />
              <StatCard value="1000s" label="Motions drafted" />
              <StatCard value="24hr" label="Standard turnaround" />
              <StatCard value="95%" label="Citation accuracy target" />
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
              OUR VALUES
            </span>
            <h2 className="font-serif text-3xl text-[#0F1F33] mt-3">
              What drives <em className="text-[#C9A227]">us</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <ValueCard
              icon={<Target className="w-8 h-8" />}
              title="Accuracy First"
              description="Every citation is screened. Every fact is verified. We don't cut corners."
            />
            <ValueCard
              icon={<Users className="w-8 h-8" />}
              title="Attorney-Led"
              description="AI drafts. Attorneys review. You get the best of both worlds."
            />
            <ValueCard
              icon={<Lightbulb className="w-8 h-8" />}
              title="Transparent Pricing"
              description="Flat fees, no surprises. Know your cost before you submit."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0F1F33]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-3xl text-white mb-6">
            Ready to work with <em className="text-[#C9A227]">us?</em>
          </h2>
          <p className="text-slate-300 mb-8">
            Submit your first order today and see the difference.
          </p>
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A227] text-[#0F1F33] font-bold rounded-lg hover:bg-[#D4B33A] transition-all"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
      <div className="font-serif text-3xl text-[#1E3A5F]">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function ValueCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-8 bg-slate-50 rounded-2xl border border-slate-200">
      <div className="w-14 h-14 bg-[#C9A227]/20 rounded-xl flex items-center justify-center text-[#C9A227] mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[#0F1F33] mb-2">{title}</h3>
      <p className="text-slate-500">{description}</p>
    </div>
  );
}
