// /app/(public)/terms/page.tsx
// Terms of Service with Legal Process, Conflict, and Compliance sections
// Task 63 | Source: TOS_SECURITY_AMENDMENT_v1

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Motion Granted',
  description: 'Terms of Service for Motion Granted legal document preparation services.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
            <p className="mt-4 text-lg text-gray-600">Motion Granted, LLC</p>
            <p className="mt-2 text-sm text-gray-500">
              Last Updated: January 26, 2026 | Effective Date: January 26, 2026
            </p>
          </div>

          {/* Acceptance */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By accessing or using the Motion Granted platform and services (&quot;Services&quot;), you agree to be
              bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the
              Services. Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) reserves the right
              to modify these Terms at any time, with notice provided through the platform or via email.
            </p>
          </section>

          {/* Description of Services */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Description of Services</h2>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted provides AI-assisted legal document preparation services for licensed attorneys.
              Our Services include drafting motions, briefs, and supporting documents based on case information
              you provide. Motion Granted is not a law firm and does not provide legal advice or representation.
            </p>
          </section>

          {/* Eligibility */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Eligibility</h2>
            <p className="text-gray-700 leading-relaxed">
              The Services are available only to attorneys licensed to practice law in one or more U.S. jurisdictions.
              By using the Services, you represent and warrant that you are a licensed attorney in good standing
              and that all work product will be reviewed, approved, and filed under your supervision and professional responsibility.
            </p>
          </section>

          {/* User Responsibilities */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. User Responsibilities</h2>
            <p className="text-gray-700 leading-relaxed mb-4">As a user of the Services, you agree to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Provide accurate and complete case information</li>
              <li>Review all deliverables before filing with any court</li>
              <li>Verify all citations, legal conclusions, and factual statements</li>
              <li>Comply with all applicable court rules and filing requirements</li>
              <li>Maintain confidentiality of your account credentials</li>
              <li>Not use the Services for any unlawful purpose</li>
            </ul>
          </section>

          {/* Attorney-Client Privilege Section - NEW */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Attorney-Client Privilege and Confidentiality</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.1 Agency Relationship</h3>
            <p className="text-gray-700 leading-relaxed">
              When you use Motion Granted&apos;s services, Motion Granted acts as your agent for the limited
              purpose of preparing litigation documents at your direction. This agency relationship is
              intended to preserve the attorney-client privilege and work product protection that would
              otherwise apply to materials you provide to us.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              All case materials, client information, and work product prepared by Motion Granted remain
              your property and are subject to the same confidentiality protections as if prepared by your
              own staff.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.2 Confidentiality Obligations</h3>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted maintains strict confidentiality of all information you provide:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>We do not disclose your case information to any third party except as necessary to provide the Service (see Privacy Policy for service providers)</li>
              <li>We do not use your case information to serve other clients</li>
              <li>We do not use your case information for any purpose other than fulfilling your order</li>
              <li>All Motion Granted personnel with access to customer data are bound by confidentiality obligations</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.3 Work Product Protection</h3>
            <p className="text-gray-700 leading-relaxed">
              Documents prepared by Motion Granted at your direction constitute attorney work product.
              Motion Granted will assert work product protection on your behalf in response to any
              third-party request for such materials.
            </p>
          </section>

          {/* Legal Process Section - NEW */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Legal Process and Subpoenas</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.1 Notification Commitment</h3>
            <p className="text-gray-700 leading-relaxed">
              If Motion Granted receives any subpoena, court order, or other legal process seeking your
              data or information about your use of the Service (&quot;Legal Process&quot;), we will:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Notify you within 24 hours of receipt, unless prohibited by law or court order</li>
              <li>Provide you a copy of the Legal Process</li>
              <li>Assert attorney-client privilege and work product protection on your behalf</li>
              <li>Allow you 10 business days to file a motion to quash or other protective action before producing any materials</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.2 Your Responsibilities</h3>
            <p className="text-gray-700 leading-relaxed">
              Upon receiving our notification, you are responsible for:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Determining whether to challenge the Legal Process</li>
              <li>Filing any motion to quash or for protective order</li>
              <li>Instructing us regarding any objections to assert on your behalf</li>
              <li>Notifying your client as appropriate</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.3 Scope of Production</h3>
            <p className="text-gray-700 leading-relaxed">
              If no protective action is taken within 10 business days, Motion Granted will produce
              only the materials specifically identified in the Legal Process and legally required to
              be produced. We will not voluntarily produce materials beyond the scope of the Legal Process.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.4 Government Requests</h3>
            <p className="text-gray-700 leading-relaxed">
              For requests from law enforcement or government agencies, Motion Granted will:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Require valid legal process (subpoena, warrant, or court order) before producing any data</li>
              <li>Notify you unless legally prohibited (e.g., by court order or statutory gag provision)</li>
              <li>Challenge overly broad requests where appropriate</li>
              <li>Produce only what is legally required</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.5 Emergency Exceptions</h3>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted may disclose information without prior notice only if we reasonably believe
              disclosure is necessary to prevent imminent death or serious bodily injury. We will notify
              you as soon as legally permitted after any such disclosure.
            </p>
          </section>

          {/* Conflict of Interest Section - NEW */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Conflict of Interest</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.1 No Conflict Checking</h3>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted does not perform conflict of interest checks. You are solely responsible for
              ensuring that your use of the Service does not create a conflict of interest with any
              current or former client, or with any other matter in which you are involved.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.2 Same-Case Notification</h3>
            <p className="text-gray-700 leading-relaxed">
              As a courtesy, our system may flag orders involving the same case number submitted by
              different attorneys. If we identify that another attorney has submitted an order involving
              the same case number, we may:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Delay processing pending review</li>
              <li>Contact both attorneys to confirm no conflict exists</li>
              <li>Decline to process one or both orders at our discretion</li>
            </ul>
            <div className="mt-4 p-4 bg-amber-50 rounded-lg">
              <p className="text-amber-800">
                <strong>Important:</strong> This courtesy flagging is not guaranteed and does not constitute
                conflict checking. You remain solely responsible for conflict compliance.
              </p>
            </div>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.3 Adverse Representation</h3>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted may, at the same time or at different times, provide services to attorneys
              representing adverse parties in the same or related matters. By using the Service, you
              acknowledge and consent to this possibility, subject to our strict confidentiality
              obligations. Information from one engagement will never be used in connection with any
              other engagement.
            </p>
          </section>

          {/* State Bar Compliance Section - NEW */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. State Bar Compliance</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.1 AI Disclosure Requirements</h3>
            <p className="text-gray-700 leading-relaxed">
              Some jurisdictions require attorneys to disclose the use of artificial intelligence in
              document preparation. You are solely responsible for:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Determining whether your jurisdiction requires AI disclosure</li>
              <li>Making any required disclosures to the court</li>
              <li>Making any required disclosures to your client</li>
              <li>Complying with all applicable rules of professional conduct</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Motion Granted will include a reminder of potential disclosure requirements in the
              Attorney Instruction Sheet delivered with your order.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.2 Competence in Technology</h3>
            <p className="text-gray-700 leading-relaxed">
              By using Motion Granted, you represent that you have complied with your duty of
              technological competence under applicable rules of professional conduct, including:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Understanding how Motion Granted uses AI technology</li>
              <li>Understanding the limitations of AI-assisted document preparation</li>
              <li>Reviewing all deliverables before filing</li>
              <li>Independently verifying all citations and legal conclusions</li>
            </ul>
          </section>

          {/* Payment Terms */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Payment Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              Payment is due at the time of order submission. Prices are as displayed on the platform
              at the time of order. Refunds may be issued at Motion Granted&apos;s discretion for orders
              that cannot be fulfilled or that fail to meet quality standards after revision attempts.
            </p>
          </section>

          {/* Disclaimer */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Disclaimer of Legal Services</h2>
            <p className="text-gray-700 leading-relaxed">
              MOTION GRANTED IS NOT A LAW FIRM AND DOES NOT PROVIDE LEGAL ADVICE. All documents are
              prepared under your direction and supervision. You, as the licensed attorney, bear full
              responsibility for reviewing, approving, and filing all documents. Motion Granted makes
              no representations about the legal sufficiency or accuracy of any documents.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, MOTION GRANTED SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT
              LIMITED TO LOSS OF PROFITS, LOSS OF CLIENTS, LEGAL MALPRACTICE CLAIMS, OR BAR DISCIPLINE,
              ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              Motion Granted&apos;s total liability for any claim arising from the Services shall not exceed
              the amount you paid for the specific order giving rise to the claim.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              Motion Granted shall not be liable for any claim arising from:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li>Your failure to verify citations or legal conclusions before filing</li>
              <li>Your failure to comply with court rules or filing requirements</li>
              <li>Your failure to make required AI disclosures</li>
              <li>Any conflict of interest in your use of the Service</li>
              <li>Any waiver of privilege resulting from your actions</li>
              <li>Any third-party claim against you related to documents prepared using the Service</li>
            </ul>
          </section>

          {/* Indemnification */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Indemnification</h2>
            <p className="text-gray-700 leading-relaxed">
              You agree to indemnify, defend, and hold harmless Motion Granted, its officers, directors,
              employees, and agents from any claims, damages, losses, or expenses (including reasonable
              attorneys&apos; fees) arising from your use of the Services, your violation of these Terms,
              or your violation of any rights of a third party.
            </p>
          </section>

          {/* Governing Law */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Governing Law and Dispute Resolution</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms shall be governed by the laws of the State of Delaware, without regard to
              conflict of law principles. Any dispute arising from these Terms shall be resolved through
              binding arbitration in accordance with the rules of the American Arbitration Association,
              conducted in Wilmington, Delaware.
            </p>
          </section>

          {/* Termination */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">14. Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              Either party may terminate the use of Services at any time. Motion Granted reserves the
              right to suspend or terminate your account for violation of these Terms or for any other
              reason at our sole discretion. Upon termination, your access to deliverables will be
              subject to our data retention policy.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">15. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed">
              For questions about these Terms, contact us at:
            </p>
            <div className="mt-4 text-gray-700">
              <p><strong>Motion Granted, LLC</strong></p>
              <p>Email: <a href="mailto:support@motiongranted.com" className="text-blue-600 hover:underline">support@motiongranted.com</a></p>
              <p>Legal Inquiries: <a href="mailto:legal@motiongranted.com" className="text-blue-600 hover:underline">legal@motiongranted.com</a></p>
            </div>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              {' · '}
              <Link href="/security" className="hover:underline">Security</Link>
              {' · '}
              <Link href="/dpa" className="hover:underline">Data Processing Agreement</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
