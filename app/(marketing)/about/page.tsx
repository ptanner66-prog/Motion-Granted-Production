import { Metadata } from 'next';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { FeatureCard } from '@/components/marketing/FeatureCard';
import { CTASection } from '@/components/marketing/CTASection';
import { Target, Scale, DollarSign, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About — Motion Granted',
  description:
    'Motion Granted was founded by attorneys who know what judges expect. We combine AI drafting with rigorous citation verification to deliver court-ready motions you can trust.',
  openGraph: {
    title: 'About — Motion Granted',
    description:
      'Founded by attorneys who know what judges expect. AI-powered motion drafting with every citation verified.',
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="page-hero page-hero--navy">
        <div className="section-inner">
          <div className="section-label">About Motion Granted</div>
          <h1 className="section-title">We know what judges expect.</h1>
          <p className="section-subtitle">
            Motion Granted was built by litigators who spent decades in the courtroom.
            We know what a judge reads first, what makes them skeptical, and what earns
            a ruling in your favor.
          </p>
        </div>
      </section>

      {/* ── Founder Story ── */}
      <section className="section">
        <div className="section-inner">
          <div className="about-two-col">
            <div>
              <div className="section-label">Our Story</div>
              <h2 className="section-title">
                Founded by attorneys who&rsquo;ve been in the courtroom.
              </h2>
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p>
                  <strong>After 30+ years of litigation practice</strong>, our founding attorney
                  had drafted thousands of motions. He knew the process intimately — and he knew
                  how much time it consumed.
                </p>
                <p>
                  Solo practitioners and small firms face an impossible choice: spend entire
                  weekends on motion drafting — eating into billable work and family time — or
                  refer complex cases to larger firms with deeper benches.
                </p>
                <p>
                  Motion Granted exists to give small firms the drafting capacity of a large
                  firm — without the large firm overhead. We pair AI-assisted drafting with
                  rigorous citation verification so every document that reaches your desk is
                  ready for the courtroom.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <StatCard value="30+" label="Years legal experience" />
              <StatCard value="< 0.1%" label="Hallucination rate" />
              <StatCard value="3 Days" label="Standard delivery" />
              <StatCard value="50 States" label="Federal & state courts" />
            </div>
          </div>
        </div>
      </section>

      {/* ── The Problem ── */}
      <section className="section" style={{ background: 'var(--slate-50)' }}>
        <div className="section-inner">
          <SectionHeader
            label="The Problem"
            title="AI legal tools have an accuracy problem."
            subtitle="Most AI tools generate plausible-sounding drafts full of fabricated citations. We built something different."
            center
          />
          <div className="feature-grid feature-grid--2col" style={{ marginTop: '2.5rem' }}>
            <ProblemCard
              number="01"
              title="AI tools generate drafts you can&rsquo;t trust."
              description="Large language models hallucinate case law at alarming rates — some platforms cite cases that don't exist, misstate holdings, or reference overruled authority. You can't file a brief you haven't independently verified."
            />
            <ProblemCard
              number="02"
              title="Verification takes longer than drafting."
              description="Attorneys who use AI drafting tools often spend more time checking citations than they saved on the initial draft. The efficiency promise collapses under the verification burden."
            />
            <ProblemCard
              number="03"
              title="We verify before you ever see it."
              description="Every citation in every Motion Granted document passes through a multi-step verification pipeline — checked for existence, holding accuracy, and subsequent history — before delivery."
            />
            <ProblemCard
              number="04"
              title="Court-ready documents at a fraction of the cost."
              description="Instead of billing hours for research and drafting, you get a flat-fee filing package: motion, memorandum, declaration, and proposed order — with verified citations throughout."
            />
          </div>
        </div>
      </section>

      {/* ── Our Principles ── */}
      <section className="section">
        <div className="section-inner">
          <SectionHeader
            label="Our Principles"
            title="What guides our work."
            center
          />
          <div className="feature-grid feature-grid--4col" style={{ marginTop: '2.5rem' }}>
            <FeatureCard
              icon={Target}
              title="Accuracy First"
              description="Every citation is independently verified. Every fact is cross-referenced. We don't cut corners because your reputation is on the line."
            />
            <FeatureCard
              icon={Scale}
              title="Attorney-Led"
              description="AI drafts. Attorneys review. You get the efficiency of automation with the judgment of experienced litigators."
            />
            <FeatureCard
              icon={DollarSign}
              title="Transparent Pricing"
              description="Flat fees, no surprises. Know your cost before you submit. No hourly billing, no retainers, no minimums."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Confidential & Secure"
              description="Your case data is encrypted at rest and in transit. We never train on your documents. Attorney-client privilege is preserved."
            />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <CTASection
        title="Ready to see the difference?"
        subtitle="Submit your first matter and get a court-ready filing package delivered to your inbox."
        primaryHref="/register"
        primaryLabel="Get Started"
        secondaryHref="/pricing"
        secondaryLabel="View Pricing"
        reassurances={[
          'No retainer required',
          'Flat-fee pricing',
          'Every citation verified',
          'One revision included',
        ]}
      />
    </>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--slate-200)',
        borderRadius: '14px',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          color: 'var(--navy-700)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '0.82rem',
          color: 'var(--slate-500)',
          marginTop: '0.35rem',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ProblemCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="feature-card">
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--gold-600)',
          letterSpacing: '0.08em',
          marginBottom: '0.75rem',
        }}
      >
        {number}
      </div>
      <h3 dangerouslySetInnerHTML={{ __html: title }} />
      <p>{description}</p>
    </div>
  );
}
