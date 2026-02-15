import { Metadata } from 'next';
import {
  ShieldCheck,
  FileText,
  RefreshCw,
  Scale,
  FileCheck,
  Lock,
} from 'lucide-react';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { FeatureCard } from '@/components/marketing/FeatureCard';
import { CTASection } from '@/components/marketing/CTASection';

export const metadata: Metadata = {
  title: 'How It Works — Motion Granted',
  description:
    'Submit a matter. Get court-ready documents. Three simple steps: submit your matter, we draft and verify every citation, you review and file.',
  openGraph: {
    title: 'How It Works — Motion Granted',
    description:
      'Three steps to court-ready motions with every citation verified.',
    type: 'website',
  },
};

export default function HowItWorksPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="page-hero page-hero--light">
        <div className="section-inner">
          <div className="section-label">How It Works</div>
          <h1 className="section-title">
            Submit a matter. Get court-ready documents.
          </h1>
          <p className="section-subtitle">
            Three steps. No phone calls. No back-and-forth. Submit your case
            details, and we handle the rest — from drafting through citation
            verification to final assembly.
          </p>
        </div>
      </section>

      {/* ── 3-Step Process ── */}
      <section className="section">
        <div className="section-inner">
          <div className="process-steps">
            <div className="process-step">
              <div className="process-step-indicator">
                <div className="process-step-number">1</div>
                <div className="process-step-line" />
              </div>
              <div className="process-step-content">
                <h3>Submit Your Matter</h3>
                <p>
                  Create an account and complete our intake form. Upload your
                  complaint, relevant orders, and key exhibits. Describe the motion
                  you need, select your jurisdiction and deadline, and pay the flat
                  fee. The entire process takes about 15 minutes.
                </p>
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <StepDetail text="Upload complaint, prior orders, and relevant discovery" />
                  <StepDetail text="Describe the legal issues and desired outcome" />
                  <StepDetail text="Choose standard or rush delivery" />
                  <StepDetail text="Pay the flat fee — no surprises" />
                </div>
              </div>
            </div>

            <div className="process-step">
              <div className="process-step-indicator">
                <div className="process-step-number">2</div>
                <div className="process-step-line" />
              </div>
              <div className="process-step-content">
                <h3>We Draft &amp; Verify</h3>
                <p>
                  Our 14-phase AI workflow analyzes your documents, researches
                  applicable law, drafts your motion, and runs every citation through
                  a multi-step verification pipeline. An attorney reviews the final
                  work product before delivery.
                </p>
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <StepDetail text="AI extracts facts and identifies legal issues" />
                  <StepDetail text="Researches statutes, case law, and local rules" />
                  <StepDetail text="Every citation verified for existence and accuracy" />
                  <StepDetail text="Attorney reviews draft for quality and compliance" />
                </div>
              </div>
            </div>

            <div className="process-step">
              <div className="process-step-indicator">
                <div className="process-step-number">3</div>
                <div className="process-step-line" />
              </div>
              <div className="process-step-content">
                <h3>You Review &amp; File</h3>
                <p>
                  Download your complete filing package from the secure client
                  portal — motion, memorandum of points and authorities, declaration,
                  and proposed order. Review everything, request a revision if needed,
                  and file under your name.
                </p>
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <StepDetail text="Download from your secure client portal" />
                  <StepDetail text="Complete filing package in DOCX and PDF" />
                  <StepDetail text="One revision included at no extra charge" />
                  <StepDetail text="File under your name with the court" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What's Included ── */}
      <section className="section" style={{ background: 'var(--slate-50)' }}>
        <div className="section-inner">
          <SectionHeader
            label="What&rsquo;s Included"
            title="No hidden fees. No surprises."
            subtitle="Every order comes with a complete filing package and these guarantees."
            center
          />
          <div className="feature-grid" style={{ marginTop: '2.5rem' }}>
            <FeatureCard
              icon={ShieldCheck}
              title="Citation Verification"
              description="Every citation is checked for existence, holding accuracy, and subsequent history before delivery. No fabricated case law."
            />
            <FeatureCard
              icon={FileText}
              title="Court-Specific Formatting"
              description="Documents formatted to comply with the local rules of your target jurisdiction, including caption format, page limits, and citation style."
            />
            <FeatureCard
              icon={RefreshCw}
              title="One Revision Included"
              description="Not quite right? Every order includes one round of revisions at no additional cost. We want you satisfied with every filing."
            />
            <FeatureCard
              icon={Scale}
              title="ABA Opinion 512 Disclosure"
              description="Every filing package includes the required AI-assistance disclosure language, keeping you compliant with evolving ethics guidance."
            />
            <FeatureCard
              icon={FileCheck}
              title="Complete Filing Package"
              description="Motion, memorandum of points and authorities, declaration, and proposed order — everything you need to file, delivered to your portal."
            />
            <FeatureCard
              icon={Lock}
              title="Secure &amp; Confidential"
              description="Your case data is encrypted at rest and in transit. We never train on your documents. Attorney-client privilege is preserved."
            />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <CTASection
        title="Stop the Sunday night research."
        subtitle="Your next motion doesn&rsquo;t have to cost you a weekend. Delegate the drafting. Keep your evenings."
        primaryHref="/register"
        primaryLabel="Start Your First Order"
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

function StepDetail({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        fontSize: '0.88rem',
        color: 'var(--slate-500)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="var(--green-500)"
        style={{ flexShrink: 0, marginTop: '2px' }}
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
