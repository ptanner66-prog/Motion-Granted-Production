import { Metadata } from 'next'
import {
  Shield,
  Lock,
  Server,
  Eye,
  FileCheck,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Scale,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Security',
  description: 'Learn about Motion Granted security practices and data protection measures.',
}

const securityFeatures = [
  {
    icon: Lock,
    title: 'Encryption',
    description: 'TLS 1.3 for data in transit, AES-256 encryption for data at rest. Your documents and case information are always protected.',
  },
  {
    icon: Server,
    title: 'Infrastructure',
    description: 'Hosted on enterprise-grade infrastructure with SOC 2 Type II compliance. Our providers (Vercel, Supabase) maintain rigorous security standards.',
  },
  {
    icon: Eye,
    title: 'Access Controls',
    description: 'Role-based access control ensures only authorized personnel can access your data. Multi-factor authentication is enforced for all staff.',
  },
  {
    icon: FileCheck,
    title: 'Audit Logging',
    description: 'Comprehensive audit logs track all access to your data. We maintain detailed records for compliance and security monitoring.',
  },
  {
    icon: Users,
    title: 'Staff Training',
    description: 'All staff receive regular security awareness training. Confidentiality agreements are required for anyone who handles client data.',
  },
  {
    icon: Clock,
    title: 'Backups',
    description: 'Daily encrypted backups with 30-day retention. Point-in-time recovery ensures your data is never lost.',
  },
]

const complianceItems = [
  {
    title: 'SOC 2 Type II',
    description: 'Our infrastructure providers maintain SOC 2 Type II compliance, demonstrating rigorous security controls.',
    status: 'compliant',
  },
  {
    title: 'ABA Formal Opinion 512',
    description: 'We comply with ABA guidance on AI disclosure, ensuring transparency about AI-assisted drafting.',
    status: 'compliant',
  },
  {
    title: 'CCPA/CPRA',
    description: 'California Consumer Privacy Act compliance for California residents.',
    status: 'compliant',
  },
  {
    title: 'Attorney-Client Privilege',
    description: 'Our systems and processes are designed to protect the confidentiality of attorney work product.',
    status: 'compliant',
  },
]

const aiSecurityMeasures = [
  'AI prompts do not include identifying client information when possible',
  'AI API calls use encrypted connections',
  'AI-generated content is reviewed by human professionals before delivery',
  'Your data is NOT used to train AI models',
  'AI processing is logged for audit and compliance purposes',
  'Separate API keys and access controls for AI systems',
]

export default function SecurityPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex justify-center mb-6">
              <Shield className="h-16 w-16 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Security at Motion Granted
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Your trust is our foundation. We employ industry-leading security practices
              to protect your confidential information.
            </p>
          </div>
        </div>
      </section>

      {/* Security Features Grid */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              How We Protect Your Data
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Multiple layers of security protect your confidential information
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {securityFeatures.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <feature.icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 text-lg font-semibold text-gray-900">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Security Section */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900">
                AI Security Measures
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                Special protections for AI-assisted drafting
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <ul className="space-y-4">
                {aiSecurityMeasures.map((measure, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{measure}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">Important Note</p>
                    <p className="mt-1 text-sm text-blue-800">
                      While we employ robust security measures, AI systems process data
                      through third-party APIs. We select AI providers with strong
                      security practices and ensure contractual protections for your data.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privilege Preservation Section (PRIV-03) */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex justify-center mb-4">
                <Scale className="h-10 w-10 text-blue-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">
                Privilege Preservation
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                Protecting attorney-client privilege and work product doctrine
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Legal Framework</h3>
                <p className="text-gray-700 leading-relaxed">
                  Motion Granted operates as a Legal Process Outsourcing (LPO) service under the
                  direct supervision of the hiring attorney. Under{' '}
                  <strong>ABA Formal Opinion 08-451</strong> and the{' '}
                  <strong>Restatement (Third) of the Law Governing Lawyers &sect;&sect; 70-73</strong>,
                  communications and work product shared with LPO providers acting under attorney
                  direction generally maintain their privileged status, consistent with the agency
                  principles recognized in{' '}
                  <em>Clark v. United States</em>, 289 U.S. 1 (1933).
                </p>
              </div>

              {/* Consumer AI vs Motion Granted Comparison Table (T-73) */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Consumer AI vs. Motion Granted API</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b border-gray-200">Feature</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b border-gray-200">Consumer AI (e.g., ChatGPT)</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b border-gray-200">Motion Granted API</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Access Model</td>
                        <td className="px-4 py-3 text-gray-700">Public web interface</td>
                        <td className="px-4 py-3 text-gray-700">Authenticated commercial API</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Data Handling</td>
                        <td className="px-4 py-3 text-gray-700">Conversations stored; may be used for model training</td>
                        <td className="px-4 py-3 text-gray-700">Encrypted; never used for training; auto-deleted per retention policy</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Attorney Direction</td>
                        <td className="px-4 py-3 text-gray-700">User types prompts directly</td>
                        <td className="px-4 py-3 text-gray-700">Attorney directs via structured intake; 14-phase supervised workflow</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Review Process</td>
                        <td className="px-4 py-3 text-gray-700">None required</td>
                        <td className="px-4 py-3 text-gray-700">Mandatory attorney review + Citation Integrity Verification pipeline</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Professional Responsibility</td>
                        <td className="px-4 py-3 text-gray-700">None</td>
                        <td className="px-4 py-3 text-gray-700">Attorney assumes full professional responsibility</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">Cross-Client Isolation</td>
                        <td className="px-4 py-3 text-gray-700">Shared conversation context</td>
                        <td className="px-4 py-3 text-gray-700">Complete isolation; no cross-client data sharing</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-gray-900">Data Retention</td>
                        <td className="px-4 py-3 text-gray-700">Indefinite; user must manually delete</td>
                        <td className="px-4 py-3 text-gray-700">365 days, then permanent deletion; earlier deletion on request</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Technical Safeguards</h3>
                <ul className="space-y-2">
                  {[
                    'All data encrypted in transit (TLS 1.3) and at rest (AES-256)',
                    'Strict role-based access controls limit data visibility to authorized personnel',
                    'All AI processing occurs in isolated environments with no cross-client data sharing',
                    'Comprehensive audit trails for all data access',
                    'Case materials permanently deleted after 365 days per retention policy',
                    'Your data is never used to train AI models',
                  ].map((item, index) => (
                    <li key={index} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommended Privilege Preservation Steps</h3>
                <ol className="space-y-3 list-decimal list-inside">
                  <li className="text-gray-700">
                    <strong>Privilege Log:</strong> Include Motion Granted in your privilege log as an LPO
                    vendor operating under attorney direction &mdash; consistent with how firms log other
                    litigation support vendors.
                  </li>
                  <li className="text-gray-700">
                    <strong>Work Product Doctrine:</strong> Filing packages constitute attorney work product
                    prepared in anticipation of litigation, reflecting mental impressions, conclusions,
                    opinions, and legal theories of counsel.
                  </li>
                  <li className="text-gray-700">
                    <strong>Attorney Supervision:</strong> Our workflow ensures mandatory attorney review
                    before delivery, maintaining the supervisory control courts examine when evaluating
                    privilege claims.
                  </li>
                  <li className="text-gray-700">
                    <strong>AI Disclosure:</strong> If your jurisdiction requires disclosure of AI-assisted
                    drafting, such disclosure does not waive privilege over the underlying work product or
                    attorney-client communications.
                  </li>
                  <li className="text-gray-700">
                    <strong>Data Retention:</strong> Maintain your own copies of all case materials. Our
                    365-day retention policy means materials are permanently deleted after that period.
                  </li>
                </ol>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  Every filing package includes an Attorney Instruction Sheet with detailed privilege
                  preservation guidance specific to your order. For questions about privilege
                  preservation, contact{' '}
                  <a href="mailto:security@motion-granted.com" className="font-medium underline">
                    security@motion-granted.com
                  </a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Section */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Compliance & Standards
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Meeting industry standards and legal requirements
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {complianceItems.map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {item.title}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Compliant
                  </span>
                </div>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Infrastructure Partners */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Trusted Infrastructure
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              We partner with industry-leading providers
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="font-semibold text-gray-900">Vercel</p>
                <p className="text-sm text-gray-500 mt-1">Application Hosting</p>
                <p className="text-xs text-green-600 mt-2">SOC 2 Type II</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="font-semibold text-gray-900">Supabase</p>
                <p className="text-sm text-gray-500 mt-1">Database</p>
                <p className="text-xs text-green-600 mt-2">SOC 2 Type II</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="font-semibold text-gray-900">Stripe</p>
                <p className="text-sm text-gray-500 mt-1">Payments</p>
                <p className="text-xs text-green-600 mt-2">PCI DSS Level 1</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="font-semibold text-gray-900">Anthropic</p>
                <p className="text-sm text-gray-500 mt-1">AI Processing</p>
                <p className="text-xs text-green-600 mt-2">SOC 2 Type II</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Contact */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900">
              Report a Security Issue
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              We take security seriously. If you discover a vulnerability, please
              report it responsibly.
            </p>
            <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-gray-700 mb-4">
                For security concerns or to report a vulnerability:
              </p>
              <a
                href="mailto:security@motion-granted.com"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                security@motion-granted.com
              </a>
              <p className="mt-4 text-sm text-gray-500">
                Please include as much detail as possible about the potential
                vulnerability. We will respond within 48 hours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation Links */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">
              Related Documentation
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <a
              href="/privacy"
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-semibold text-gray-900">Privacy Policy</h3>
              <p className="mt-2 text-sm text-gray-600">
                How we collect, use, and protect your personal information.
              </p>
            </a>
            <a
              href="/terms"
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-semibold text-gray-900">Terms of Service</h3>
              <p className="mt-2 text-sm text-gray-600">
                The agreement governing your use of our services.
              </p>
            </a>
            <a
              href="/dpa"
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-semibold text-gray-900">Data Processing Agreement</h3>
              <p className="mt-2 text-sm text-gray-600">
                Detailed data processing terms for enterprise clients.
              </p>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
