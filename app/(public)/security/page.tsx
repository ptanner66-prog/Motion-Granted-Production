// /app/(public)/security/page.tsx
// Security information page - 8 required sections
// Task 16 | Source: SECURITY_FAQ_v1.md

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security | Motion Granted',
  description: 'Learn how Motion Granted protects your confidential legal information with enterprise-grade security.',
};

interface SecuritySectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function SecuritySection({ icon, title, children }: SecuritySectionProps) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
          {icon}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="text-gray-700 space-y-4 pl-12">
        {children}
      </div>
    </section>
  );
}

// Simple SVG icons to avoid dependency issues
const ShieldIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const ServerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CpuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);

const DatabaseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);

const AlertIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const MailIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="bg-white shadow-sm rounded-lg p-8 md:p-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 text-blue-700">
              <ShieldIcon />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              Security at Motion Granted
            </h1>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              As attorneys ourselves, we understand that attorney-client privilege and data security
              are non-negotiable requirements. Here&apos;s how we protect your data.
            </p>
          </div>

          {/* Section 1: Is my data secure? */}
          <SecuritySection
            icon={<LockIcon />}
            title="1. Is my data secure?"
          >
            <p>
              Yes. Motion Granted implements enterprise-grade security measures to protect your
              confidential information:
            </p>
            <ul className="list-disc list-inside space-y-2 mt-4">
              <li>
                <strong>Encryption in Transit:</strong> All data transmitted between your browser and
                Motion Granted is encrypted using TLS 1.3 — the same encryption standard used by banks
                and healthcare providers.
              </li>
              <li>
                <strong>Encryption at Rest:</strong> All data stored in our systems is encrypted using
                AES-256 encryption, including uploaded documents, case information, and deliverables.
              </li>
              <li>
                <strong>Access Controls:</strong> Access to customer data is strictly limited to
                authorized personnel on a need-to-know basis. All access is logged and audited.
              </li>
            </ul>
          </SecuritySection>

          {/* Section 2: Where is my data stored? */}
          <SecuritySection
            icon={<ServerIcon />}
            title="2. Where is my data stored?"
          >
            <p>
              All customer data is stored in the United States on infrastructure provided by:
            </p>
            <ul className="list-disc list-inside space-y-2 mt-4">
              <li><strong>Supabase</strong> (Database) — SOC 2 Type II certified</li>
              <li><strong>Vercel</strong> (Application Hosting) — SOC 2 Type II certified</li>
              <li><strong>Stripe</strong> (Payment Processing) — PCI-DSS Level 1 certified</li>
            </ul>
            <p className="mt-4">
              We do not store data outside the United States.
            </p>
          </SecuritySection>

          {/* Section 3: Who can access my data? */}
          <SecuritySection
            icon={<UsersIcon />}
            title="3. Who can access my data?"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 mt-2">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Role</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Access Level</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border-b">You (the subscribing attorney)</td>
                    <td className="px-4 py-2 border-b">Full access to your orders and deliverables</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Motion Granted principals</td>
                    <td className="px-4 py-2 border-b">Access for order fulfillment and support</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">AI processing (Anthropic)</td>
                    <td className="px-4 py-2 border-b">Temporary processing access only; not retained</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Third-party vendors</td>
                    <td className="px-4 py-2">Limited to their specific function</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-900">We do NOT:</p>
              <ul className="list-disc list-inside mt-2 text-blue-800">
                <li>Share your data with other customers</li>
                <li>Use your data to serve other clients</li>
                <li>Sell or rent your personal information</li>
                <li>Allow employee access beyond what&apos;s necessary for service delivery</li>
              </ul>
            </div>
          </SecuritySection>

          {/* Section 4: How does AI processing work? */}
          <SecuritySection
            icon={<CpuIcon />}
            title="4. How does AI processing work?"
          >
            <p>
              Motion Granted uses Anthropic&apos;s Claude AI to assist with legal research and document drafting.
            </p>
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="font-medium text-green-900">Important protections:</p>
              <ul className="list-disc list-inside mt-2 text-green-800">
                <li>Anthropic does not use API inputs to train models</li>
                <li>Your data is processed in transit and not permanently stored by Anthropic</li>
                <li>We do not use your case information to train any AI models</li>
                <li>All AI outputs are reviewed through our quality control process</li>
              </ul>
            </div>
          </SecuritySection>

          {/* Section 5: Third-party services */}
          <SecuritySection
            icon={<DatabaseIcon />}
            title="5. Third-party services disclosure"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Provider</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Purpose</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Data Shared</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Certification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border-b">Anthropic</td>
                    <td className="px-4 py-2 border-b">AI processing</td>
                    <td className="px-4 py-2 border-b">Case information (temporary)</td>
                    <td className="px-4 py-2 border-b">SOC 2 Type II</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Supabase</td>
                    <td className="px-4 py-2 border-b">Database</td>
                    <td className="px-4 py-2 border-b">All stored data</td>
                    <td className="px-4 py-2 border-b">SOC 2 Type II</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Vercel</td>
                    <td className="px-4 py-2 border-b">Hosting</td>
                    <td className="px-4 py-2 border-b">Application data</td>
                    <td className="px-4 py-2 border-b">SOC 2 Type II</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Stripe</td>
                    <td className="px-4 py-2 border-b">Payments</td>
                    <td className="px-4 py-2 border-b">Payment info only</td>
                    <td className="px-4 py-2 border-b">PCI-DSS Level 1</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">CourtListener</td>
                    <td className="px-4 py-2 border-b">Citation verification</td>
                    <td className="px-4 py-2 border-b">Citation text only (no PII)</td>
                    <td className="px-4 py-2 border-b">N/A (public data)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Resend</td>
                    <td className="px-4 py-2">Email delivery</td>
                    <td className="px-4 py-2">Email addresses, order metadata</td>
                    <td className="px-4 py-2">SOC 2 Type II</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SecuritySection>

          {/* Section 6: Data retention */}
          <SecuritySection
            icon={<DatabaseIcon />}
            title="6. Data retention policy"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Data Type</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border-b">Case materials and deliverables</td>
                    <td className="px-4 py-2 border-b">180 days by default; extendable to 2 years</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Account information</td>
                    <td className="px-4 py-2 border-b">While your account is active</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b">Payment records</td>
                    <td className="px-4 py-2 border-b">As required by law (typically 7 years)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Anonymized analytics</td>
                    <td className="px-4 py-2">Indefinitely (no identifying information)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">You can:</p>
              <ul className="list-disc list-inside mt-2 text-gray-700">
                <li>Download your deliverables at any time</li>
                <li>Request earlier deletion through your account settings</li>
                <li>Extend retention up to 2 years for ongoing matters</li>
                <li>Request complete account deletion</li>
              </ul>
              <p className="mt-2 text-gray-600">
                We send a reminder 14 days before scheduled data deletion.
              </p>
            </div>
          </SecuritySection>

          {/* Section 7: Data breach */}
          <SecuritySection
            icon={<AlertIcon />}
            title="7. Breach notification procedures"
          >
            <p>
              Motion Granted maintains an incident response plan. In the event of a data breach:
            </p>
            <ol className="list-decimal list-inside space-y-2 mt-4">
              <li>We will investigate immediately</li>
              <li>We will notify affected customers within 72 hours (or as required by law)</li>
              <li>We will notify relevant regulatory authorities as required</li>
              <li>We will provide information about what data was affected</li>
              <li>We will take steps to prevent future incidents</li>
            </ol>
            <div className="mt-4 p-4 bg-amber-50 rounded-lg">
              <p className="font-medium text-amber-900">Subpoena Response:</p>
              <p className="mt-2 text-amber-800">
                If we receive a subpoena or other legal process seeking your data, we will notify you
                within 24 hours (unless prohibited by law), assert attorney-client privilege on your
                behalf, and give you 10 business days to file a motion to quash before producing any
                materials. See our{' '}
                <Link href="/terms" className="underline">Terms of Service</Link> for complete details.
              </p>
            </div>
          </SecuritySection>

          {/* Section 8: Contact */}
          <SecuritySection
            icon={<MailIcon />}
            title="8. Contact information"
          >
            <p>
              If you discover a security vulnerability or have a security concern, please contact us immediately:
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p><strong>Security Team:</strong>{' '}
                <a href="mailto:security@motiongranted.com" className="text-blue-600 hover:underline">
                  security@motiongranted.com
                </a>
              </p>
              <p className="mt-2"><strong>Privacy Team:</strong>{' '}
                <a href="mailto:privacy@motiongranted.com" className="text-blue-600 hover:underline">
                  privacy@motiongranted.com
                </a>
              </p>
            </div>
            <p className="mt-4">
              We take all security reports seriously and will respond promptly.
            </p>
          </SecuritySection>

          {/* Additional Information */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Resources</h3>
            <ul className="space-y-2 text-gray-700">
              <li>
                <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                {' — '}How we collect, use, and protect your information
              </li>
              <li>
                <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
                {' — '}Including subpoena response and conflict procedures
              </li>
              <li>
                <Link href="/dpa" className="text-blue-600 hover:underline">Data Processing Agreement</Link>
                {' — '}For enterprise compliance requirements
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              Questions? Contact{' '}
              <a href="mailto:security@motiongranted.com" className="text-blue-600 hover:underline">
                security@motiongranted.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
