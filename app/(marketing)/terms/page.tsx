import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Motion Granted legal drafting services.',
}

export default function TermsPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Last updated: February 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-gray max-w-none">

            <h2>1. Agreement to Terms</h2>
            <p>
              By accessing or using the Motion Granted website and services (&quot;Services&quot;), you agree
              to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms,
              do not use our Services. These Terms constitute a legally binding agreement between
              you and Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            </p>

            <h2>2. Description of Service</h2>
            <p>
              Motion Granted provides AI-assisted legal drafting support to licensed attorneys. Our
              platform uses a 14-phase workflow pipeline to generate draft legal motions,
              memoranda, supporting documents, and related materials based on information and
              instructions provided by the ordering attorney. Our pipeline includes human
              checkpoints, citation integrity verification, and quality gates at multiple stages.
              We are not a law firm and do not provide legal advice or representation. See our
              Disclaimer for important information about the nature of our services.
            </p>
            <h3>2.1 Use of AI Technology</h3>
            <p>
              Motion Granted uses artificial intelligence (AI) systems as drafting tools to
              assist in the preparation of legal documents. By using our Services, you
              acknowledge and agree that:
            </p>
            <ul>
              <li>AI systems are used to generate drafts of legal documents through a multi-phase workflow pipeline</li>
              <li>AI systems assist with legal research, citation verification, and quality checking</li>
              <li>All AI-generated content passes through quality gates and citation integrity verification</li>
              <li>AI is a tool that enhances, but does not replace, human professional judgment</li>
            </ul>
            <h3>2.2 No Guarantee of Outcome</h3>
            <p>
              While we strive to provide high-quality work product, we make no guarantee
              regarding the outcome of any legal proceeding. The use of AI technology does
              not guarantee accuracy, completeness, or success. You are responsible for
              verifying all work product before use.
            </p>
            <h3>2.3 AI Disclosure Compliance</h3>
            <p>
              Certain jurisdictions may require disclosure of AI assistance in legal
              documents filed with courts. You are solely responsible for determining applicable
              disclosure requirements, making any required disclosures, and complying with all
              applicable rules of professional conduct regarding AI use. Our filing packages
              include an AI disclosure page option and jurisdiction-specific guidance in the
              Attorney Instruction Sheet, but the decision and responsibility to include
              disclosures remains with you.
            </p>

            <h2>3. User Eligibility</h2>
            <p>
              Our Services are available only to licensed attorneys in good standing with their
              state bar(s). By creating an account, you represent and warrant that you are a
              licensed attorney authorized to practice law in at least one United States
              jurisdiction and that all information you provide is accurate and complete.
              We reserve the right to verify your bar status and to suspend or terminate
              accounts that do not meet this requirement.
            </p>

            <h2>4. Account Registration</h2>
            <p>
              To use our Services, you must create an account. You agree to:
            </p>
            <ul>
              <li>Provide accurate, current, and complete registration information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>

            <h2>5. Service Tiers &amp; Pricing</h2>
            <h3>5.1 Motion Tiers</h3>
            <p>
              Motion types are organized into four tiers based on complexity. Pricing starts at
              the amounts listed below and may vary based on specific motion requirements:
            </p>
            <ul>
              <li>
                <strong>Tier A ($299+)</strong> &mdash; Procedural motions: extensions of time,
                continuances, pro hac vice admissions, motions to withdraw, and similar procedural filings
              </li>
              <li>
                <strong>Tier B ($499+)</strong> &mdash; Standard substantive motions: motions to compel
                discovery, motions to dismiss, demurrers, motions to strike, and similar substantive filings
              </li>
              <li>
                <strong>Tier C ($799+)</strong> &mdash; Complex motions: anti-SLAPP motions, motions
                in limine, motions for judgment notwithstanding the verdict (JNOV), complex discovery
                motions, and similar multi-issue filings
              </li>
              <li>
                <strong>Tier D ($1,499+)</strong> &mdash; Highly complex and dispositive motions: motions
                for summary judgment, motions for summary adjudication, preliminary injunctions,
                temporary restraining orders, class certification motions, Daubert/expert exclusion
                motions, habeas corpus petitions, and similar major dispositive filings
              </li>
            </ul>
            <h3>5.2 Rush Pricing</h3>
            <p>
              Rush delivery is available at additional cost applied as a multiplier to the
              base tier price:
            </p>
            <ul>
              <li><strong>72-Hour Rush:</strong> +25% of base price</li>
              <li><strong>48-Hour Rush:</strong> +50% of base price</li>
            </ul>
            <p>
              Rush availability depends on current capacity. We reserve the right to decline
              rush requests when capacity does not permit timely completion.
            </p>
            <h3>5.3 Additional Fees</h3>
            <p>
              Each order includes one round of revisions at no additional charge. Additional
              revision rounds beyond the included revision may incur additional fees, which
              will be disclosed before the revision work begins. No additional charges will
              be applied without your prior approval.
            </p>
            <h3>5.4 Jurisdiction-Based Pricing</h3>
            <p>
              Pricing may vary based on the jurisdiction of filing. State-specific formatting
              requirements, local court rules, and complexity factors may affect the final
              price displayed at checkout. All pricing, including any jurisdiction-based
              adjustments, is disclosed before payment is collected. Price changes do not
              affect orders already placed and paid for.
            </p>

            <h2>6. Turnaround Times</h2>
            <h3>6.1 Standard and Rush Delivery</h3>
            <p>
              Estimated turnaround times by tier under standard delivery:
            </p>
            <ul>
              <li><strong>Tier A:</strong> 2&ndash;3 business days</li>
              <li><strong>Tier B:</strong> 3&ndash;5 business days</li>
              <li><strong>Tier C:</strong> 5&ndash;7 business days</li>
              <li><strong>Tier D:</strong> 7&ndash;10 business days</li>
            </ul>
            <p>
              Rush delivery (72-hour or 48-hour) reduces the turnaround for all tiers.
              Delivery times are estimates and not guarantees. We will make reasonable efforts
              to meet deadlines but are not liable for delays beyond our control. If we
              determine we cannot meet your stated filing deadline, we will notify you before
              processing begins.
            </p>
            <h3>6.2 Attorney Review Checkpoint</h3>
            <p>
              Upon completion of the drafting process, your motion package will be made
              available for your review. You will have 14 days to review, approve, request
              changes, or cancel. If no action is taken within 14 days, a final 7-day notice
              will be sent. If no action is taken within the full 21-day review period, the
              order will be automatically cancelled with a 50% refund.
            </p>
            <h3>6.3 Conflict Check</h3>
            <p>
              All orders are subject to a conflict check before processing. If a potential
              conflict is identified, your order will be placed under review and you will not
              be charged until the review is resolved. We reserve the right to decline any
              order due to conflicts of interest.
            </p>

            <h2>7. Attorney Responsibilities</h2>
            <p>You acknowledge and agree that:</p>
            <ul>
              <li>You are responsible for supervising and directing all work product</li>
              <li>You must review and approve all drafts before use or filing</li>
              <li>You are responsible for verifying accuracy of all facts and citations</li>
              <li>You bear full professional responsibility for anything filed with a court</li>
              <li>You will comply with all applicable rules of professional conduct, including AI disclosure obligations</li>
              <li>You will maintain confidentiality of your client information</li>
              <li>You will make all strategic and substantive decisions regarding any filing</li>
            </ul>

            <h2>8. Intellectual Property &amp; Work Product</h2>
            <h3>8.1 Pre-Delivery</h3>
            <p>
              Prior to delivery and full payment, all draft work product, intermediate outputs,
              workflow data, and AI-generated content remain the property of Motion Granted.
              You may not use, distribute, or file any materials that have not been formally
              delivered through our platform.
            </p>
            <h3>8.2 Post-Delivery</h3>
            <p>
              Upon full payment and delivery, you own the final work product delivered to you.
              You may use, modify, and file the work product as you see fit. This ownership
              transfer applies to the delivered documents themselves, not to Motion Granted&apos;s
              underlying technology, workflow processes, prompt engineering, or platform software.
            </p>
            <h3>8.3 Platform Improvement License</h3>
            <p>
              You grant Motion Granted a limited, non-exclusive license to use anonymized,
              de-identified metadata (such as motion type, tier, jurisdiction, and aggregate
              quality metrics) for the purpose of improving our platform and services. This
              license does not include access to your case materials, attorney communications,
              client information, or any personally identifiable information. Your case data
              is never used for AI model training.
            </p>

            <h2>9. Refunds &amp; Cancellations</h2>
            <h3>9.1 Status-Based Refund Schedule</h3>
            <p>
              Refund amounts are determined by the stage of work completion at the time of
              cancellation request. Our phase-based refund schedule is as follows:
            </p>
            <ul>
              <li><strong>Phases I&ndash;III</strong> (Intake through Evidence Strategy): 85% refund</li>
              <li><strong>Phase IV</strong> (Authority Research): 65% refund</li>
              <li><strong>Phases V&ndash;VI</strong> (Drafting and Opposition Anticipation): 40% refund</li>
              <li><strong>Phases VII&ndash;IX</strong> (Judge Simulation through Supporting Documents): 20% refund</li>
              <li><strong>Phase X</strong> (Final Assembly complete / delivered): No refund</li>
            </ul>
            <h3>9.2 Phase Determination</h3>
            <p>
              The applicable refund percentage is determined by the last completed phase at the
              time we receive and process your cancellation request. Phase status is tracked
              automatically by our workflow system and is visible in your order dashboard. If
              a phase is in progress (but not completed) at the time of cancellation, the
              refund percentage for the prior completed phase applies.
            </p>
            <h3>9.3 Special Cancellation Circumstances</h3>
            <ul>
              <li>
                <strong>Conflict-related cancellations:</strong> If an order is cancelled due
                to a conflict of interest detected during our conflict check process, a full
                refund (100%) will be issued and no charge will be applied.
              </li>
              <li>
                <strong>Timeout cancellations:</strong> Orders that remain unreviewed for 21
                days after draft delivery will be automatically cancelled with a 50% refund.
              </li>
              <li>
                <strong>System errors:</strong> If an order cannot be completed due to a
                platform error or system failure, a full refund will be issued.
              </li>
            </ul>
            <h3>9.4 How Refunds Are Processed</h3>
            <p>
              Refunds are issued to the original payment method via Stripe. Processing
              times vary by financial institution but typically complete within 5&ndash;10
              business days. You will receive email confirmation when the refund is initiated.
            </p>

            <h2>10. Data Handling &amp; Retention</h2>
            <h3>10.1 Data Processing</h3>
            <p>
              All case materials are processed through encrypted channels. Your data is never
              used for AI model training. Our AI providers (Anthropic, OpenAI) contractually
              guarantee that API inputs are not used for model training. Each order is processed
              in an isolated environment with no cross-client data sharing. We will not disclose
              your case information to third parties except as required by law.
            </p>
            <h3>10.2 Data Retention</h3>
            <p>
              Order data and associated work product are retained for 365 days following
              order completion or cancellation, after which they are permanently and
              irreversibly deleted from all systems including backups.
            </p>
            <p>
              <strong>Extended retention:</strong> You may request an extended retention period
              of up to 2 years (730 days total) by contacting support before the standard
              365-day period expires. Extended retention is available at no additional cost
              and must be requested per order.
            </p>
            <p>
              <strong>Early deletion:</strong> You may request earlier deletion at any time
              by contacting support. Early deletion requests are processed within 30 days
              and are irreversible.
            </p>

            <h2>11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, MOTION GRANTED&apos;S TOTAL LIABILITY FOR
              ANY CLAIM ARISING FROM OR RELATED TO THESE TERMS OR OUR SERVICES IS LIMITED TO
              THE AMOUNT YOU PAID FOR THE SPECIFIC ORDER GIVING RISE TO THE CLAIM. IN NO EVENT
              SHALL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR
              BUSINESS OPPORTUNITIES, REGARDLESS OF THE THEORY OF LIABILITY.
            </p>
            <p>
              OUR SERVICES ARE PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED. WE DO NOT WARRANT THAT OUR SERVICES WILL BE UNINTERRUPTED OR ERROR-FREE.
              WE DO NOT GUARANTEE ANY PARTICULAR OUTCOME IN ANY LEGAL PROCEEDING.
            </p>
            <p>
              You agree to indemnify and hold harmless Motion Granted, its officers, directors,
              employees, and agents from any claims, damages, or expenses arising from your use
              of our Services, your violation of these Terms, or your violation of any rights
              of a third party.
            </p>

            <h2>12. Dispute Resolution</h2>
            <p>
              Any dispute arising from these Terms or our Services shall be resolved through
              binding arbitration in Baton Rouge, Louisiana, in accordance with the rules of
              the American Arbitration Association. You waive any right to participate in a
              class action lawsuit or class-wide arbitration. Either party may seek injunctive
              or other equitable relief in any court of competent jurisdiction to prevent the
              actual or threatened infringement or misappropriation of intellectual property
              rights.
            </p>

            <h2>13. Modification of Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material
              changes by email or by posting a notice on our website at least 30 days before
              the changes take effect. Continued use of our Services after the effective date
              of changes constitutes acceptance of the new Terms. If you do not agree to the
              modified Terms, you must stop using our Services. Changes do not affect orders
              already placed and paid for under previous Terms.
            </p>

            <h2>14. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the
              State of Louisiana, without regard to conflict of law principles. We may
              terminate or suspend your account at any time for violation of these Terms.
              You may close your account at any time. Termination does not affect orders
              already paid for and in progress.
            </p>

            <h2>15. Contact Information</h2>
            <p>
              Questions about these Terms should be directed to:
            </p>
            <p>
              Motion Granted, LLC<br />
              Louisiana-based legal drafting service<br />
              Email: support@motion-granted.com<br />
              Security inquiries: security@motion-granted.com
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 mt-12">
              <p className="text-sm text-gray-600 mb-0">
                By using Motion Granted, you acknowledge that you have read, understood, and
                agree to be bound by these Terms of Service. These Terms were last updated
                February 2026.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
