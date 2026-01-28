// /app/(public)/privacy/page.tsx
// Privacy Policy with comprehensive data handling sections
// Task 64 | Source: MOTION_GRANTED_PRIVACY_POLICY_UPDATED

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Motion Granted',
  description: 'Privacy Policy for Motion Granted legal document preparation services.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="mt-4 text-lg text-gray-600">Motion Granted, LLC</p>
            <p className="mt-2 text-sm text-gray-500">
              Last Updated: January 26, 2026 | Effective Date: January 26, 2026
            </p>
          </div>

          {/* Section 1: Introduction */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy
              and is committed to protecting your personal information. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our
              AI-assisted legal document preparation services (the &quot;Services&quot;).
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              By using our Services, you consent to the data practices described in this Privacy Policy.
              If you do not agree with the terms of this Privacy Policy, please do not access or use
              the Services.
            </p>
          </section>

          {/* Section 2: Information We Collect */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.1 Account Information</h3>
            <p className="text-gray-700 leading-relaxed">
              When you create an account, we collect:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Name and contact information</li>
              <li>Email address</li>
              <li>Bar number and licensing jurisdiction</li>
              <li>Law firm or organization name</li>
              <li>Billing address</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.2 Case Information</h3>
            <p className="text-gray-700 leading-relaxed">
              To provide our Services, we collect case-related information you provide, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Party names (plaintiffs, defendants, witnesses)</li>
              <li>Case numbers and court information</li>
              <li>Legal claims and defenses</li>
              <li>Factual allegations and supporting evidence</li>
              <li>Documents you upload</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.3 Payment Information</h3>
            <p className="text-gray-700 leading-relaxed">
              Payment processing is handled by Stripe. We do not store complete credit card numbers.
              We receive and store transaction records, including the last four digits of your card,
              card type, and billing address for record-keeping purposes.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.4 Usage Information</h3>
            <p className="text-gray-700 leading-relaxed">
              We automatically collect certain information when you use our Services:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>IP address and device information</li>
              <li>Browser type and settings</li>
              <li>Pages visited and features used</li>
              <li>Time and date of visits</li>
              <li>Referring website addresses</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.5 Communications</h3>
            <p className="text-gray-700 leading-relaxed">
              We collect information from your communications with us, including support requests,
              feedback, and order-related correspondence.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">2.6 Cookies and Tracking</h3>
            <p className="text-gray-700 leading-relaxed">
              We use cookies and similar technologies to maintain your session, remember your preferences,
              and analyze usage patterns. You can control cookies through your browser settings, but
              disabling cookies may affect functionality.
            </p>
          </section>

          {/* Section 3: How We Use Your Information */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed">We use the information we collect to:</p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li><strong>Provide Services:</strong> Process your orders and prepare legal documents</li>
              <li><strong>Communicate:</strong> Send order updates, respond to inquiries, and provide support</li>
              <li><strong>Process Payments:</strong> Complete transactions and manage billing</li>
              <li><strong>Improve Services:</strong> Analyze usage to enhance features and user experience</li>
              <li><strong>Security:</strong> Protect against fraud and unauthorized access</li>
              <li><strong>Legal Compliance:</strong> Comply with applicable laws and regulations</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We do NOT use your case information to train AI models or to provide services to other customers.
            </p>
          </section>

          {/* Section 4: How We Share Your Information */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. How We Share Your Information</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">4.1 Service Providers</h3>
            <p className="text-gray-700 leading-relaxed">
              We share information with third-party service providers who perform services on our behalf:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li><strong>Anthropic:</strong> AI processing (case information for document generation)</li>
              <li><strong>Supabase:</strong> Database hosting and authentication</li>
              <li><strong>Vercel:</strong> Application hosting</li>
              <li><strong>Stripe:</strong> Payment processing</li>
              <li><strong>Resend:</strong> Email delivery</li>
              <li><strong>CourtListener:</strong> Citation verification (citation text only, no PII)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">4.2 Legal Requirements</h3>
            <p className="text-gray-700 leading-relaxed">
              We may disclose your information if required by law, subpoena, court order, or government
              request. See our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link> for
              our subpoena notification and response procedures.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">4.3 Business Transfers</h3>
            <p className="text-gray-700 leading-relaxed">
              In the event of a merger, acquisition, or sale of assets, your information may be
              transferred. We will provide notice before your information is transferred and becomes
              subject to a different privacy policy.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">4.4 With Your Consent</h3>
            <p className="text-gray-700 leading-relaxed">
              We may share your information for other purposes with your explicit consent.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">4.5 What We Do NOT Share</h3>
            <p className="text-gray-700 leading-relaxed">We do NOT:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Sell your personal information</li>
              <li>Share case information with other customers</li>
              <li>Use your data for targeted advertising</li>
              <li>Share your information with data brokers</li>
            </ul>
          </section>

          {/* Section 5: AI Processing */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. AI Processing</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.1 How AI is Used</h3>
            <p className="text-gray-700 leading-relaxed">
              Motion Granted uses artificial intelligence (Anthropic&apos;s Claude) to assist in preparing
              legal documents based on the case information you provide.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.2 AI Data Handling</h3>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Your case information is sent to Anthropic&apos;s API for processing</li>
              <li>Anthropic does not use API inputs to train their models</li>
              <li>Data is processed in transit and not permanently retained by Anthropic</li>
              <li>We do not use your case information to train any AI models</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">5.3 Human Review</h3>
            <p className="text-gray-700 leading-relaxed">
              All AI-generated documents undergo quality review before delivery. You, as the attorney
              of record, are responsible for final review and approval before filing.
            </p>
          </section>

          {/* Section 6: Data Retention */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.1 Default Retention Period</h3>
            <p className="text-gray-700 leading-relaxed">
              Case materials and deliverables are retained for <strong>180 days</strong> after delivery by default.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.2 Extended Retention</h3>
            <p className="text-gray-700 leading-relaxed">
              You may extend retention up to 2 years for ongoing matters through your account settings.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.3 Early Deletion</h3>
            <p className="text-gray-700 leading-relaxed">
              You may request deletion of your case materials at any time through your account settings
              or by contacting us.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.4 Deletion Notification</h3>
            <p className="text-gray-700 leading-relaxed">
              We will send you a reminder <strong>14 days before</strong> scheduled deletion, giving you the
              opportunity to download your deliverables or extend retention.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.5 Account Information</h3>
            <p className="text-gray-700 leading-relaxed">
              Account information is retained while your account is active. Upon account deletion,
              we will delete your account information within 30 days, except as required by law.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">6.6 Legal Requirements</h3>
            <p className="text-gray-700 leading-relaxed">
              We may retain certain information as required by law (e.g., payment records for tax purposes).
            </p>
          </section>

          {/* Section 7: Data Security */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Data Security</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.1 Technical Measures</h3>
            <p className="text-gray-700 leading-relaxed">We implement industry-standard security measures:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Encryption in transit (TLS 1.3)</li>
              <li>Encryption at rest (AES-256)</li>
              <li>Secure authentication and access controls</li>
              <li>Regular security assessments</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.2 Organizational Measures</h3>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Employee background checks and confidentiality agreements</li>
              <li>Access limited to need-to-know basis</li>
              <li>Security awareness training</li>
              <li>Incident response procedures</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">7.3 Breach Notification</h3>
            <p className="text-gray-700 leading-relaxed">
              In the event of a data breach affecting your information, we will notify you within
              72 hours of discovery (or as required by applicable law).
            </p>
          </section>

          {/* Section 8: Your Rights and Choices */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Your Rights and Choices</h2>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.1 Access</h3>
            <p className="text-gray-700 leading-relaxed">
              You may access your account information and order history through your account dashboard.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.2 Correction</h3>
            <p className="text-gray-700 leading-relaxed">
              You may update your account information at any time through your account settings.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.3 Deletion</h3>
            <p className="text-gray-700 leading-relaxed">
              You may request deletion of your account and associated data by contacting us at{' '}
              <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">privacy@motiongranted.com</a>.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.4 Data Portability</h3>
            <p className="text-gray-700 leading-relaxed">
              You may download your deliverables at any time. For other data export requests, contact us.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.5 Communications Opt-Out</h3>
            <p className="text-gray-700 leading-relaxed">
              You may opt out of marketing communications using the unsubscribe link in our emails.
              You cannot opt out of transactional communications related to your orders.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mt-6 mb-3">8.6 Do Not Track</h3>
            <p className="text-gray-700 leading-relaxed">
              We do not currently respond to &quot;Do Not Track&quot; signals.
            </p>
          </section>

          {/* Section 9: California Residents (CCPA/CPRA) */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. California Residents (CCPA/CPRA)</h2>
            <p className="text-gray-700 leading-relaxed">
              If you are a California resident, you have additional rights under the California Consumer
              Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-gray-700">
              <li><strong>Right to Know:</strong> Request information about data collection and use</li>
              <li><strong>Right to Delete:</strong> Request deletion of your personal information</li>
              <li><strong>Right to Opt-Out:</strong> We do not sell personal information</li>
              <li><strong>Right to Correct:</strong> Request correction of inaccurate information</li>
              <li><strong>Right to Limit:</strong> Limit use of sensitive personal information</li>
              <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your rights</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">privacy@motiongranted.com</a>.
            </p>
          </section>

          {/* Section 10: Other State Privacy Laws */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Other State Privacy Laws</h2>
            <p className="text-gray-700 leading-relaxed">
              If you are a resident of Virginia, Colorado, Connecticut, Utah, or other states with
              comprehensive privacy laws, you may have similar rights to those described for California
              residents. Contact us to exercise your rights under applicable state law.
            </p>
          </section>

          {/* Section 11: Children&apos;s Privacy */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Children&apos;s Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our Services are not directed to individuals under 18. We do not knowingly collect
              personal information from children. If we learn we have collected information from a
              child, we will delete it promptly.
            </p>
          </section>

          {/* Section 12: International Users */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">12. International Users</h2>
            <p className="text-gray-700 leading-relaxed">
              Our Services are intended for use in the United States. If you access our Services from
              outside the U.S., your information will be transferred to and processed in the U.S.,
              which may have different data protection laws than your country.
            </p>
          </section>

          {/* Section 13: Third-Party Links */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Third-Party Links</h2>
            <p className="text-gray-700 leading-relaxed">
              Our Services may contain links to third-party websites. We are not responsible for the
              privacy practices of these websites. We encourage you to review their privacy policies.
            </p>
          </section>

          {/* Section 14: Changes to Privacy Policy */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">14. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by email or through a notice on our platform. Your continued use of the Services
              after changes become effective constitutes acceptance of the updated Privacy Policy.
            </p>
          </section>

          {/* Section 15: Contact Us */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">15. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <div className="mt-4 text-gray-700">
              <p><strong>Motion Granted, LLC</strong></p>
              <p>Privacy Inquiries: <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">privacy@motiongranted.com</a></p>
            </div>
          </section>

          {/* Section 16: Data Protection Officer */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">16. Data Protection Officer</h2>
            <p className="text-gray-700 leading-relaxed">
              For data protection matters, you may contact our Data Protection Officer at{' '}
              <a href="mailto:dpo@motiongranted.com" className="text-blue-600 hover:underline">dpo@motiongranted.com</a>.
            </p>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              <Link href="/terms" className="hover:underline">Terms of Service</Link>
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
