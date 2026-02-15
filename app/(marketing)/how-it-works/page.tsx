// app/how-it-works/page.tsx
import Link from 'next/link';
import {
  Upload,
  Cpu,
  Search,
  FileCheck,
  Download,
  ArrowRight,
  Clock,
  Shield,
  DollarSign,
  CheckCircle
} from 'lucide-react';

export default function HowItWorksPage() {
  return (
    <div className="font-sans">
      {/* Page Header */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
            HOW IT WORKS
          </span>
          <h1 className="font-serif text-5xl text-[#0F1F33] mt-3 mb-4">
            From submission to <em className="text-[#C9A227]">court-ready</em>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Our streamlined process delivers professional motions in hours, not days.
            Here&apos;s exactly what happens after you submit your order.
          </p>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-16">
            <ProcessStep
              number={1}
              icon={<Upload className="w-8 h-8" />}
              title="Submit Your Case"
              description="Upload your documents, describe the motion you need, and select your deadline. Our 8-step intake wizard guides you through everything we need."
              details={[
                'Upload complaint, prior orders, and relevant discovery',
                'Describe the legal issues and desired outcome',
                'Choose standard or rush delivery',
                'Pay the flat fee — no surprises',
              ]}
            />

            <ProcessStep
              number={2}
              icon={<Cpu className="w-8 h-8" />}
              title="AI Drafts Your Motion"
              description="Our 14-phase AI workflow analyzes your documents, researches applicable law, and generates a comprehensive first draft tailored to your jurisdiction."
              details={[
                'Extracts facts and legal issues from your documents',
                'Researches applicable statutes and case law',
                'Structures arguments according to local rules',
                'Generates draft with proper citations',
              ]}
              badge="AI-POWERED"
            />

            <ProcessStep
              number={3}
              icon={<Search className="w-8 h-8" />}
              title="Citation Screening"
              description="Every citation goes through our 7-step verification pipeline. We check existence, holdings, and subsequent history to catch bad law before it reaches your brief."
              details={[
                'Verify case exists in legal databases',
                'Extract and validate holdings',
                'Check for overruling or negative treatment',
                'Flag citations with warning signals',
              ]}
              badge="QUALITY GATE"
              note="Screened using open-source legal databases. Not a substitute for Shepard's® or KeyCite®."
            />

            <ProcessStep
              number={4}
              icon={<FileCheck className="w-8 h-8" />}
              title="Attorney Review"
              description="A licensed attorney reviews the AI-generated draft for legal accuracy, argument strength, and compliance with local rules. Revisions are made as needed."
              details={[
                'Legal accuracy review',
                'Argument structure assessment',
                'Local rule compliance check',
                'Final polish and formatting',
              ]}
              badge="ATTORNEY-VERIFIED"
            />

            <ProcessStep
              number={5}
              icon={<Download className="w-8 h-8" />}
              title="Delivery"
              description="You receive your court-ready motion in DOCX and PDF format via your secure client portal. One revision is included if you need any changes."
              details={[
                'Download from secure portal',
                'Receive email notification',
                'Request revision if needed',
                'File under your name',
              ]}
            />
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-sm font-bold text-[#C9A227] uppercase tracking-wider">
              WHY MOTION GRANTED
            </span>
            <h2 className="font-serif text-3xl text-[#0F1F33] mt-3">
              The <em className="text-[#C9A227]">smart</em> choice for busy attorneys
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <BenefitCard
              icon={<Clock className="w-6 h-6" />}
              title="Fast Turnaround"
              description="24-48 hour standard delivery. Rush options available."
            />
            <BenefitCard
              icon={<DollarSign className="w-6 h-6" />}
              title="Flat-Fee Pricing"
              description="Know your cost upfront. No hourly billing surprises."
            />
            <BenefitCard
              icon={<Shield className="w-6 h-6" />}
              title="Citation Accuracy"
              description="Every citation screened for bad law and negative treatment."
            />
            <BenefitCard
              icon={<CheckCircle className="w-6 h-6" />}
              title="Revision Included"
              description="One revision included with every order. Your satisfaction matters."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#0F1F33]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-serif text-3xl text-white mb-6">
            Ready to <em className="text-[#C9A227]">get started?</em>
          </h2>
          <p className="text-slate-300 mb-8">
            Submit your first order today and see the Motion Granted difference.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
            >
              View Pricing
            </Link>
            <Link
              href="/orders/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A227] text-[#0F1F33] font-bold rounded-lg hover:bg-[#D4B33A] transition-colors"
            >
              Submit Order
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProcessStep({
  number,
  icon,
  title,
  description,
  details,
  badge,
  note,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
  badge?: string;
  note?: string;
}) {
  return (
    <div className="flex gap-8 items-start">
      {/* Number & Line */}
      <div className="flex flex-col items-center">
        <div className="w-14 h-14 bg-[#1E3A5F] text-white rounded-2xl flex items-center justify-center font-bold text-xl">
          {number}
        </div>
        <div className="w-0.5 h-full bg-slate-200 mt-4" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 bg-[#C9A227]/20 rounded-xl flex items-center justify-center text-[#C9A227]">
            {icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-2xl font-bold text-[#0F1F33]">{title}</h3>
              {badge && (
                <span className="px-2 py-0.5 bg-[#1E3A5F] text-white text-xs font-bold rounded">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-slate-600 text-lg">{description}</p>
          </div>
        </div>

        <div className="ml-[4.5rem] grid md:grid-cols-2 gap-3">
          {details.map((detail, idx) => (
            <div key={idx} className="flex items-start gap-2 text-slate-500">
              <CheckCircle className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
              <span>{detail}</span>
            </div>
          ))}
        </div>

        {note && (
          <p className="ml-[4.5rem] mt-4 text-sm text-slate-400 italic">{note}</p>
        )}
      </div>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 text-center">
      <div className="w-12 h-12 bg-[#1E3A5F]/10 rounded-lg flex items-center justify-center text-[#1E3A5F] mx-auto mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-[#0F1F33] mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
