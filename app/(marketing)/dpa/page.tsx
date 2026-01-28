import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Processing Agreement',
  description: 'Data Processing Agreement for Motion Granted enterprise clients.',
}

export default function DPAPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Data Processing Agreement
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
            <h2>1. Introduction</h2>
            <p>
              This Data Processing Agreement (&quot;DPA&quot;) forms part of the Terms of Service
              between Motion Granted, LLC (&quot;Processor&quot;) and you (&quot;Controller&quot;) and
              governs the processing of personal data in connection with our Services.
            </p>

            <h2>2. Definitions</h2>
            <ul>
              <li>
                <strong>&quot;Personal Data&quot;</strong> means any information relating to an
                identified or identifiable natural person.
              </li>
              <li>
                <strong>&quot;Processing&quot;</strong> means any operation performed on Personal
                Data, including collection, storage, use, and disclosure.
              </li>
              <li>
                <strong>&quot;Data Subject&quot;</strong> means the individual to whom Personal
                Data relates.
              </li>
              <li>
                <strong>&quot;Sub-processor&quot;</strong> means any third party engaged by the
                Processor to process Personal Data.
              </li>
            </ul>

            <h2>3. Scope and Purpose</h2>
            <p>
              The Processor will process Personal Data only for the purpose of providing
              the Services as described in our Terms of Service and as instructed by the
              Controller. The types of Personal Data processed include:
            </p>
            <ul>
              <li>Contact information (name, email, phone number, address)</li>
              <li>Professional information (bar number, firm name)</li>
              <li>Case information submitted with orders</li>
              <li>Documents and files uploaded to our platform</li>
              <li>Communications and messages</li>
              <li>Payment information (processed by Stripe)</li>
            </ul>

            <h2>4. Data Protection Obligations</h2>
            <h3>4.1 Processor Obligations</h3>
            <p>The Processor agrees to:</p>
            <ul>
              <li>Process Personal Data only on documented instructions from the Controller</li>
              <li>Ensure personnel authorized to process Personal Data are bound by confidentiality</li>
              <li>Implement appropriate technical and organizational security measures</li>
              <li>Assist the Controller in responding to Data Subject requests</li>
              <li>Delete or return Personal Data upon termination of Services</li>
              <li>Make available information necessary to demonstrate compliance</li>
            </ul>

            <h3>4.2 Controller Obligations</h3>
            <p>The Controller agrees to:</p>
            <ul>
              <li>Ensure lawful basis for processing Personal Data</li>
              <li>Provide necessary information for Data Subject requests</li>
              <li>Comply with applicable data protection laws</li>
              <li>Notify Processor of any changes to processing instructions</li>
            </ul>

            <h2>5. Security Measures</h2>
            <p>
              The Processor implements the following security measures:
            </p>
            <ul>
              <li>
                <strong>Encryption:</strong> TLS 1.3 for data in transit, AES-256 for data at rest
              </li>
              <li>
                <strong>Access Controls:</strong> Role-based access, multi-factor authentication
              </li>
              <li>
                <strong>Infrastructure:</strong> SOC 2 Type II compliant hosting (Vercel, Supabase)
              </li>
              <li>
                <strong>Monitoring:</strong> 24/7 security monitoring and alerting
              </li>
              <li>
                <strong>Backups:</strong> Daily encrypted backups with 30-day retention
              </li>
              <li>
                <strong>Testing:</strong> Regular security assessments and penetration testing
              </li>
            </ul>

            <h2>6. Sub-processors</h2>
            <p>
              The Controller authorizes the Processor to engage the following Sub-processors:
            </p>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="text-left">Sub-processor</th>
                  <th className="text-left">Purpose</th>
                  <th className="text-left">Location</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase</td>
                  <td>Database and authentication</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Vercel</td>
                  <td>Application hosting</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Stripe</td>
                  <td>Payment processing</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Resend</td>
                  <td>Email delivery</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Anthropic</td>
                  <td>AI processing (Claude)</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>OpenAI</td>
                  <td>AI processing (GPT)</td>
                  <td>United States</td>
                </tr>
              </tbody>
            </table>
            <p>
              The Processor will notify the Controller of any intended changes to
              Sub-processors, allowing 30 days to object.
            </p>

            <h2>7. Data Subject Rights</h2>
            <p>
              The Processor will assist the Controller in responding to Data Subject
              requests, including:
            </p>
            <ul>
              <li>Access to Personal Data</li>
              <li>Rectification of inaccurate data</li>
              <li>Erasure of Personal Data</li>
              <li>Restriction of processing</li>
              <li>Data portability</li>
              <li>Objection to processing</li>
            </ul>

            <h2>8. Data Breach Notification</h2>
            <p>
              In the event of a Personal Data breach, the Processor will:
            </p>
            <ul>
              <li>Notify the Controller within 72 hours of becoming aware</li>
              <li>Provide details of the breach and affected data</li>
              <li>Describe measures taken to mitigate the breach</li>
              <li>Cooperate with the Controller in any required notifications</li>
            </ul>

            <h2>9. Data Retention and Deletion</h2>
            <p>
              Personal Data will be retained in accordance with our Privacy Policy:
            </p>
            <ul>
              <li>Account data: Duration of account plus 90 days</li>
              <li>Order data: 7 years after order completion (legal retention)</li>
              <li>Communications: 3 years after last activity</li>
              <li>Payment records: As required by tax/financial regulations</li>
            </ul>
            <p>
              Upon termination, the Processor will delete or return Personal Data within
              90 days, unless retention is required by law.
            </p>

            <h2>10. International Transfers</h2>
            <p>
              Personal Data may be transferred to the United States. The Processor ensures
              appropriate safeguards for such transfers, including:
            </p>
            <ul>
              <li>Standard Contractual Clauses (where applicable)</li>
              <li>Sub-processors with adequate data protection commitments</li>
              <li>Technical measures to protect data during transfer</li>
            </ul>

            <h2>11. AI Processing Addendum</h2>
            <p>
              In addition to the above, the following applies to AI processing:
            </p>
            <ul>
              <li>
                <strong>Purpose Limitation:</strong> AI systems process data only to provide
                the requested drafting services
              </li>
              <li>
                <strong>No Training:</strong> Your data is not used to train AI models
              </li>
              <li>
                <strong>Human Review:</strong> All AI outputs are reviewed by qualified
                legal professionals before delivery
              </li>
              <li>
                <strong>Data Minimization:</strong> Only necessary data is sent to AI systems
              </li>
              <li>
                <strong>Logging:</strong> AI processing is logged for audit purposes
              </li>
            </ul>

            <h2>12. Audit Rights</h2>
            <p>
              Upon reasonable notice, the Controller may audit the Processor&apos;s compliance
              with this DPA. The Processor will:
            </p>
            <ul>
              <li>Provide access to relevant documentation</li>
              <li>Permit on-site inspections (with reasonable notice)</li>
              <li>Make personnel available for questions</li>
            </ul>
            <p>
              Alternatively, the Processor may provide third-party audit reports
              (SOC 2, ISO 27001) as evidence of compliance.
            </p>

            <h2>13. Liability</h2>
            <p>
              Each party&apos;s liability under this DPA is subject to the limitations set
              forth in the Terms of Service. The Processor will not be liable for
              damages arising from the Controller&apos;s failure to comply with data
              protection laws.
            </p>

            <h2>14. Term and Termination</h2>
            <p>
              This DPA is effective for the duration of the Services. It will automatically
              terminate when the Services end. Provisions relating to data deletion,
              liability, and confidentiality survive termination.
            </p>

            <h2>15. Contact</h2>
            <p>
              For questions about this DPA or to exercise your rights:
            </p>
            <p>
              Motion Granted, LLC<br />
              Data Protection Inquiries<br />
              123 Main Street, Suite 400<br />
              Baton Rouge, LA 70801<br />
              privacy@motiongranted.com
            </p>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-8 mt-12">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">
                Request a Custom DPA
              </h3>
              <p className="text-blue-800 mb-4">
                Enterprise clients may request a custom DPA tailored to their specific
                requirements. Contact our team to discuss your needs.
              </p>
              <a
                href="mailto:enterprise@motiongranted.com"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Contact Enterprise Sales
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
