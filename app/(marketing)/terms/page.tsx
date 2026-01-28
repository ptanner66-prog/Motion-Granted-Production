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
              Last updated: January 2025
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-gray max-w-none">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Motion Granted website and services (&quot;Services&quot;), you agree
              to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms,
              do not use our Services. These Terms constitute a legally binding agreement between
              you and Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            </p>

            <h2>2. Eligibility</h2>
            <p>
              Our Services are available only to licensed attorneys in good standing with their
              state bar(s). By creating an account, you represent and warrant that you are a
              licensed attorney and that all information you provide is accurate and complete.
            </p>

            <h2>3. Description of Services</h2>
            <p>
              Motion Granted provides legal drafting assistance to attorneys. Our law clerks
              prepare draft documents based on instructions and materials provided by the
              ordering attorney. We are not a law firm and do not provide legal advice or
              representation. See our Disclaimer for important information about the nature
              of our services.
            </p>

            <h2>4. Artificial Intelligence Assistance</h2>
            <h3>4.1 Use of AI Technology</h3>
            <p>
              Motion Granted uses artificial intelligence (AI) systems as drafting tools to
              assist in the preparation of legal documents. By using our Services, you
              acknowledge and agree that:
            </p>
            <ul>
              <li>AI systems may be used to generate initial drafts of legal documents</li>
              <li>AI systems may assist with legal research and citation checking</li>
              <li>All AI-generated content is reviewed by qualified legal professionals</li>
              <li>AI is a tool that enhances, but does not replace, human professional judgment</li>
            </ul>
            <h3>4.2 No Guarantee of Outcome</h3>
            <p>
              While we strive to provide high-quality work product, we make no guarantee
              regarding the outcome of any legal proceeding. The use of AI technology does
              not guarantee accuracy, completeness, or success. You are responsible for
              verifying all work product before use.
            </p>
            <h3>4.3 AI Disclosure Compliance</h3>
            <p>
              Certain jurisdictions may require disclosure of AI assistance in legal
              documents filed with courts. You are solely responsible for:
            </p>
            <ul>
              <li>Determining applicable disclosure requirements in your jurisdiction</li>
              <li>Making any required disclosures in documents you file</li>
              <li>Complying with all applicable rules of professional conduct regarding AI</li>
            </ul>
            <p>
              Our Services include AI disclosure language that you may choose to include in
              filed documents, but the decision and responsibility to include such disclosures
              remains with you.
            </p>

            <h2>5. Account Registration</h2>
            <p>
              To use our Services, you must create an account. You agree to:
            </p>
            <ul>
              <li>Provide accurate, current, and complete registration information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>

            <h2>6. Orders and Payment</h2>
            <h3>5.1 Placing Orders</h3>
            <p>
              When you place an order, you agree to provide all necessary information and
              materials for us to complete the work. You acknowledge that the quality of
              our work depends on the information you provide.
            </p>
            <h3>5.2 Pricing</h3>
            <p>
              Prices for our services are listed on our website. We reserve the right to
              change prices at any time, but price changes will not affect orders already
              placed and paid for.
            </p>
            <h3>5.3 Payment</h3>
            <p>
              Payment is due at the time of order submission. We accept major credit cards
              via Stripe. All payments are processed securely and are non-refundable except
              as provided in these Terms.
            </p>
            <h3>5.4 Additional Charges</h3>
            <p>
              If your order requires substantially more work than typical for that motion
              type, we may contact you with a supplemental quote. We will not charge
              additional fees without your prior approval.
            </p>

            <h2>7. Delivery</h2>
            <p>
              We will deliver completed drafts within the timeframe specified for your
              order type. Delivery times are estimates and not guarantees. We will make
              reasonable efforts to meet deadlines but are not liable for delays beyond
              our control.
            </p>

            <h2>8. Your Responsibilities</h2>
            <p>You acknowledge and agree that:</p>
            <ul>
              <li>You are responsible for supervising all work product</li>
              <li>You must review and approve all drafts before use or filing</li>
              <li>You are responsible for verifying accuracy of all facts and citations</li>
              <li>You bear professional responsibility for anything filed with a court</li>
              <li>You will comply with all applicable rules of professional conduct</li>
              <li>You will maintain confidentiality of your client information</li>
            </ul>

            <h2>9. Intellectual Property</h2>
            <h3>8.1 Work Product</h3>
            <p>
              Upon full payment, you own the work product delivered to you. You may use,
              modify, and file the work product as you see fit.
            </p>
            <h3>8.2 Our Materials</h3>
            <p>
              All other content on our website, including text, graphics, logos, and
              software, is owned by Motion Granted or our licensors and is protected
              by intellectual property laws.
            </p>

            <h2>10. Confidentiality</h2>
            <p>
              We will maintain the confidentiality of your case information and will not
              disclose it to third parties except as required by law. All staff are bound
              by confidentiality obligations. However, you acknowledge that electronic
              transmission of information cannot be guaranteed to be completely secure.
            </p>

            <h2>11. Conflicts of Interest</h2>
            <p>
              We maintain a conflicts database and check all new orders against it. If a
              potential conflict is identified, we will notify you. We reserve the right
              to decline any order due to conflicts of interest.
            </p>

            <h2>12. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, MOTION GRANTED&apos;S LIABILITY FOR ANY
              CLAIM ARISING FROM OR RELATED TO THESE TERMS OR OUR SERVICES IS LIMITED TO
              THE AMOUNT YOU PAID FOR THE SPECIFIC ORDER GIVING RISE TO THE CLAIM. WE ARE
              NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES.
            </p>

            <h2>13. Disclaimer of Warranties</h2>
            <p>
              OUR SERVICES ARE PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
              IMPLIED. WE DO NOT WARRANT THAT OUR SERVICES WILL BE UNINTERRUPTED OR ERROR-FREE.
              WE DO NOT GUARANTEE ANY PARTICULAR OUTCOME IN ANY LEGAL PROCEEDING.
            </p>

            <h2>14. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Motion Granted, its officers, directors,
              employees, and agents from any claims, damages, or expenses arising from your use
              of our Services, your violation of these Terms, or your violation of any rights
              of a third party.
            </p>

            <h2>15. Termination</h2>
            <p>
              We may terminate or suspend your account at any time for violation of these Terms.
              You may close your account at any time. Termination does not affect orders already
              paid for and in progress.
            </p>

            <h2>16. Dispute Resolution</h2>
            <p>
              Any dispute arising from these Terms or our Services shall be resolved through
              binding arbitration in Baton Rouge, Louisiana, in accordance with the rules of
              the American Arbitration Association. You waive any right to participate in a
              class action lawsuit or class-wide arbitration.
            </p>

            <h2>17. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Louisiana, without regard
              to conflict of law principles.
            </p>

            <h2>18. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material
              changes by email or by posting a notice on our website. Continued use of our
              Services after changes constitutes acceptance of the new Terms.
            </p>

            <h2>19. Contact</h2>
            <p>
              Questions about these Terms should be directed to:
            </p>
            <p>
              Motion Granted, LLC<br />
              123 Main Street, Suite 400<br />
              Baton Rouge, LA 70801<br />
              support@motiongranted.com
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 mt-12">
              <p className="text-sm text-gray-600 mb-0">
                By using Motion Granted, you acknowledge that you have read, understood, and
                agree to be bound by these Terms of Service.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
