// app/pricing/page.tsx
import Link from 'next/link';
import { Check, ArrowRight, Clock, HelpCircle } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="font-sans">
      {/* Page Header */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
            PRICING
          </span>
          <h1 className="font-serif text-5xl text-[#0F1F33] mt-3 mb-4">
            Flat-fee pricing. <em className="text-[#C9A227]">No surprises.</em>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Know your cost before you submit. No hourly billing, no retainers, no minimums.
            Every order includes one revision.
          </p>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-6">
            <PricingCard
              tier="A"
              price="$150"
              subtitle="Simple Procedural"
              description="Motions that primarily address procedural or scheduling matters"
              features={[
                'Motion to extend deadline',
                'Motion to continue hearing',
                'Motion for leave to file',
                'Consent motions',
                'Standard turnaround: 24 hrs',
              ]}
            />

            <PricingCard
              tier="B"
              price="$350"
              subtitle="Standard Substantive"
              description="Motions that require legal argument but involve established law"
              features={[
                'Motion to compel discovery',
                'Motion to dismiss (simple)',
                'Motion to strike',
                'Motion for protective order',
                'Standard turnaround: 24-48 hrs',
              ]}
              featured
            />

            <PricingCard
              tier="C"
              price="$850"
              subtitle="Complex Substantive"
              description="Motions involving multiple legal issues or novel arguments"
              features={[
                'Motion for summary judgment (contested)',
                'Motion to dismiss (complex)',
                'Motion for preliminary injunction',
                'Motions with multiple defendants',
                'Standard turnaround: 48-72 hrs',
              ]}
            />

            <PricingCard
              tier="D"
              price="$1,500+"
              subtitle="Major Dispositive"
              description="Complex dispositive motions requiring extensive research"
              features={[
                'Summary judgment (extensive facts)',
                'Class certification motions',
                'Complex injunction briefing',
                'Multi-issue dispositive motions',
                'Standard turnaround: 72-96 hrs',
              ]}
            />
          </div>
        </div>
      </section>

      {/* Rush Pricing */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold mb-4">
              <Clock className="w-4 h-4" />
              RUSH DELIVERY
            </div>
            <h2 className="font-serif text-3xl text-[#0F1F33]">
              Need it <em className="text-[#C9A227]">faster?</em>
            </h2>
            <p className="text-slate-500 mt-3">
              Rush delivery is available for time-sensitive matters.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Rush Option</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Turnaround</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Additional Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-6 py-4 font-medium text-[#0F1F33]">24-Hour Rush</td>
                  <td className="px-6 py-4 text-slate-600">Delivered within 24 hours</td>
                  <td className="px-6 py-4 text-[#C9A227] font-semibold">+50%</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-[#0F1F33]">Same-Day Rush</td>
                  <td className="px-6 py-4 text-slate-600">Delivered same business day</td>
                  <td className="px-6 py-4 text-[#C9A227] font-semibold">+100%</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-[#0F1F33]">Weekend/Holiday</td>
                  <td className="px-6 py-4 text-slate-600">Delivery on non-business days</td>
                  <td className="px-6 py-4 text-[#C9A227] font-semibold">+25%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl text-[#0F1F33]">
              Every order <em className="text-[#C9A227]">includes</em>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <IncludedFeature
              title="Full Draft Motion"
              description="Court-ready document in DOCX and PDF format"
            />
            <IncludedFeature
              title="Citation Screening"
              description="Every citation checked for accuracy and bad law"
            />
            <IncludedFeature
              title="Attorney Review"
              description="Licensed attorney reviews all work product"
            />
            <IncludedFeature
              title="One Revision"
              description="Modifications to address your feedback"
            />
            <IncludedFeature
              title="Secure Portal Access"
              description="Upload, download, and communicate securely"
            />
            <IncludedFeature
              title="Deadline Guarantee"
              description="On-time delivery or we&apos;ll make it right"
            />
          </div>
        </div>
      </section>

      {/* FAQ Quick */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <HelpCircle className="w-10 h-10 text-[#C9A227] mx-auto mb-4" />
          <h2 className="font-serif text-2xl text-[#0F1F33] mb-4">
            Have questions about pricing?
          </h2>
          <p className="text-slate-500 mb-6">
            Check our FAQ or contact us directly.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-white transition-colors"
            >
              View FAQ
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E3A5F] text-white font-semibold rounded-lg hover:bg-[#152C4A] transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0F1F33]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-3xl text-white mb-6">
            Ready to <em className="text-[#C9A227]">submit?</em>
          </h2>
          <p className="text-slate-300 mb-8">
            Create an account and submit your first order today.
          </p>
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A227] text-[#0F1F33] font-bold rounded-lg hover:bg-[#D4B33A] transition-all shadow-lg"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  subtitle,
  description,
  features,
  featured = false,
}: {
  tier: string;
  price: string;
  subtitle: string;
  description: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div className={`
      relative rounded-2xl border overflow-hidden transition-all
      ${featured
        ? 'bg-white border-[#C9A227] shadow-xl scale-105 z-10'
        : 'bg-white border-slate-200 hover:shadow-lg hover:-translate-y-1'
      }
    `}>
      {featured && (
        <div className="bg-[#C9A227] text-[#0F1F33] text-center py-1.5 text-xs font-bold uppercase tracking-wide">
          Most Popular
        </div>
      )}

      <div className="p-6">
        <div className="mb-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Tier {tier}
          </span>
          <div className="font-serif text-4xl text-[#0F1F33] mt-1">{price}</div>
          <div className="text-sm font-semibold text-[#1E3A5F] mt-1">{subtitle}</div>
        </div>

        <p className="text-sm text-slate-500 mb-6">{description}</p>

        <ul className="space-y-3">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-slate-600">{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/orders/new"
          className={`
            mt-6 block w-full text-center py-3 rounded-lg font-semibold transition-colors
            ${featured
              ? 'bg-[#C9A227] text-[#0F1F33] hover:bg-[#D4B33A]'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }
          `}
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}

function IncludedFeature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-slate-200">
      <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
      <div>
        <h4 className="font-semibold text-[#0F1F33]">{title}</h4>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
