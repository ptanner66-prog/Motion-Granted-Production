// /app/(public)/dpa/page.tsx
// Data Processing Agreement page for enterprise customers
// Task 15 | Source: Security Spec

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Processing Agreement | Motion Granted',
  description: 'Data Processing Agreement for Motion Granted legal document services.',
};

export default function DPAPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-gray-900">
              Data Processing Agreement
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Motion Granted, LLC
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Last Updated: January 26, 2026 | Effective Date: January 26, 2026
            </p>
          </div>

          {/* Introduction */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed">
              This Data Processing Agreement (&quot;DPA&quot;) forms part of the Terms of Service
              between Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) and
              you (&quot;Customer,&quot; &quot;you,&quot; or &quot;your&quot;) and governs the processing of personal
              data by Motion Granted on behalf of the Customer in connection with the provision
              of legal document preparation services (the &quot;Services&quot;).
            </p>
          </section>

          {/* Definitions */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Definitions</h2>
            <ul className="space-y-3 text-gray-700">
              <li><strong>&quot;Personal Data&quot;</strong> means any information relating to an identified or identifiable natural person.</li>
              <li><strong>&quot;Processing&quot;</strong> means any operation performed on Personal Data, including collection, storage, use, disclosure, and deletion.</li>
              <li><strong>&quot;Data Controller&quot;</strong> means the entity that determines the purposes and means of Processing Personal Data (you, the Customer).</li>
              <li><strong>&quot;Data Processor&quot;</strong> means the entity that Processes Personal Data on behalf of the Data Controller (Motion Granted).</li>
              <li><strong>&quot;Sub-processor&quot;</strong> means any third party engaged by Motion Granted to Process Personal Data.</li>
            </ul>
          </section>

          {/* Roles and Responsibilities */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Roles and Responsibilities</h2>
            <div className="space-y-4 text-gray-700">
              <p>
                <strong>3.1 Customer as Data Controller:</strong> You are the Data Controller for all Personal Data
                you provide to Motion Granted. You are responsible for ensuring you have a lawful basis to share
                Personal Data with us and for providing any required notices to data subjects.
              </p>
              <p>
                <strong>3.2 Motion Granted as Data Processor:</strong> Motion Granted acts as a Data Processor,
                processing Personal Data only as necessary to provide the Services and in accordance with your
                documented instructions.
              </p>
              <p>
                <strong>3.3 Compliance:</strong> Each party will comply with its respective obligations under
                applicable data protection laws, including the California Consumer Privacy Act (CCPA),
                California Privacy Rights Act (CPRA), and other applicable state privacy laws.
              </p>
            </div>
          </section>

          {/* Data Processing Details */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Data Processing Details</h2>
            <div className="space-y-4 text-gray-700">
              <div>
                <strong>4.1 Subject Matter:</strong>
                <p className="mt-2">The processing of case information and related Personal Data necessary to prepare legal documents at your direction.</p>
              </div>
              <div>
                <strong>4.2 Duration:</strong>
                <p className="mt-2">Processing continues for the duration of the Services and the applicable retention period (see Section 6).</p>
              </div>
              <div>
                <strong>4.3 Nature and Purpose:</strong>
                <p className="mt-2">AI-assisted legal document preparation, citation verification, and document delivery.</p>
              </div>
              <div>
                <strong>4.4 Categories of Data Subjects:</strong>
                <ul className="mt-2 list-disc list-inside ml-4">
                  <li>Attorneys and legal professionals (account holders)</li>
                  <li>Parties to legal matters (plaintiffs, defendants, witnesses)</li>
                  <li>Other individuals referenced in case materials</li>
                </ul>
              </div>
              <div>
                <strong>4.5 Types of Personal Data:</strong>
                <ul className="mt-2 list-disc list-inside ml-4">
                  <li>Contact information (names, addresses, phone numbers, email addresses)</li>
                  <li>Case information (party names, case numbers, legal claims)</li>
                  <li>Document contents (as uploaded by Customer)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Security Measures */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Security Measures</h2>
            <p className="text-gray-700 mb-4">
              Motion Granted implements and maintains appropriate technical and organizational security measures, including:
            </p>
            <ul className="space-y-2 text-gray-700 list-disc list-inside ml-4">
              <li>Encryption in transit (TLS 1.3)</li>
              <li>Encryption at rest (AES-256)</li>
              <li>Access controls and authentication</li>
              <li>Regular security assessments</li>
              <li>Employee training and confidentiality obligations</li>
              <li>Incident detection and response procedures</li>
            </ul>
            <p className="mt-4 text-gray-700">
              For detailed security information, see our{' '}
              <Link href="/security" className="text-blue-600 hover:underline">Security page</Link>.
            </p>
          </section>

          {/* Data Retention */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention and Deletion</h2>
            <div className="space-y-4 text-gray-700">
              <p>
                <strong>6.1 Retention Period:</strong> Case materials and deliverables are retained for 180 days
                after delivery by default. You may extend retention up to 2 years or request earlier deletion.
              </p>
              <p>
                <strong>6.2 Deletion:</strong> Upon expiration of the retention period or your request, we will
                securely delete all Personal Data except as required by law.
              </p>
              <p>
                <strong>6.3 Anonymization:</strong> We may retain anonymized, aggregated data that cannot be used
                to identify individuals for analytics purposes.
              </p>
            </div>
          </section>

          {/* Sub-processors */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Sub-processors</h2>
            <div className="space-y-4 text-gray-700">
              <p>
                <strong>7.1 Authorized Sub-processors:</strong> You authorize Motion Granted to engage the
                following categories of Sub-processors:
              </p>
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Sub-processor</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Purpose</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 border-b">Anthropic</td>
                      <td className="px-4 py-2 border-b">AI processing</td>
                      <td className="px-4 py-2 border-b">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border-b">Supabase</td>
                      <td className="px-4 py-2 border-b">Database hosting</td>
                      <td className="px-4 py-2 border-b">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border-b">Vercel</td>
                      <td className="px-4 py-2 border-b">Application hosting</td>
                      <td className="px-4 py-2 border-b">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border-b">Stripe</td>
                      <td className="px-4 py-2 border-b">Payment processing</td>
                      <td className="px-4 py-2 border-b">United States</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Resend</td>
                      <td className="px-4 py-2">Email delivery</td>
                      <td className="px-4 py-2">United States</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4">
                <strong>7.2 Sub-processor Obligations:</strong> Motion Granted ensures that all Sub-processors are
                bound by data protection obligations at least as protective as those in this DPA.
              </p>
            </div>
          </section>

          {/* Data Subject Rights */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Data Subject Rights</h2>
            <p className="text-gray-700">
              Motion Granted will assist you in responding to data subject requests (access, correction,
              deletion, portability) to the extent legally required and technically feasible. Please contact
              us at <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">privacy@motiongranted.com</a> for assistance.
            </p>
          </section>

          {/* Data Breach */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Data Breach Notification</h2>
            <p className="text-gray-700">
              Motion Granted will notify you without undue delay (and in any event within 72 hours) upon
              becoming aware of a Personal Data breach affecting your data. Notification will include
              the nature of the breach, categories of data affected, and measures taken to address the breach.
            </p>
          </section>

          {/* Audits */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Audits and Assessments</h2>
            <p className="text-gray-700">
              Upon reasonable request and subject to confidentiality obligations, Motion Granted will provide
              information necessary to demonstrate compliance with this DPA. This may include security
              certifications, audit reports, or responses to security questionnaires.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Contact Information</h2>
            <p className="text-gray-700">
              For questions about this DPA or to exercise your rights, contact us at:
            </p>
            <div className="mt-4 text-gray-700">
              <p><strong>Motion Granted, LLC</strong></p>
              <p>Privacy Inquiries: <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">privacy@motiongranted.com</a></p>
              <p>Security Inquiries: <a href="mailto:security@motiongranted.com" className="text-blue-600 hover:underline">security@motiongranted.com</a></p>
            </div>
          </section>

          {/* Footer Links */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              <Link href="/terms" className="hover:underline">Terms of Service</Link>
              {' · '}
              <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
              {' · '}
              <Link href="/security" className="hover:underline">Security</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
