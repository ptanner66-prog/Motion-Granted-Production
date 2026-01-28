// /app/(public)/security/page.tsx
// Public security page per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 9
// VERSION: 1.0 — January 28, 2026

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Security | Motion Granted',
  description: 'Learn how Motion Granted protects your data with enterprise-grade security.',
};

export default function SecurityPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-8">Security at Motion Granted</h1>

      <p className="text-lg text-gray-600 mb-12">
        We understand that legal documents contain sensitive, privileged information.
        Security isn't just a feature — it's foundational to everything we build.
      </p>

      <div className="space-y-12">
        {/* Data Protection */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Is my data secure?</h2>
          <p className="text-gray-600">
            Yes. We employ multiple layers of security to protect your data. All data is
            encrypted both in transit (TLS 1.3) and at rest (AES-256). Our infrastructure
            is hosted on SOC 2 Type II certified cloud providers with 24/7 monitoring.
          </p>
        </section>

        {/* Data Storage */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Where is my data stored?</h2>
          <p className="text-gray-600">
            Your data is stored in secure, SOC 2 compliant data centers located in the
            United States. We use Supabase (built on AWS) for our database and Vercel
            for application hosting — both industry leaders in cloud security.
          </p>
        </section>

        {/* Access Control */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Who can access my data?</h2>
          <p className="text-gray-600 mb-4">
            Access to your data is strictly limited:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Only you can access your orders and documents through your authenticated account</li>
            <li>Our operations team accesses data only when necessary to fulfill your order</li>
            <li>All admin access is logged and auditable</li>
            <li>We never sell or share your data with third parties for marketing purposes</li>
          </ul>
        </section>

        {/* AI Processing */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">How does AI processing work?</h2>
          <p className="text-gray-600 mb-4">
            We use AI (Claude by Anthropic) to assist in drafting legal documents:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Your data is processed through Anthropic's API with enterprise security</li>
            <li>Anthropic does not use your data to train their models</li>
            <li>All AI outputs are reviewed by qualified legal professionals</li>
            <li>We maintain audit trails of all AI-generated content</li>
          </ul>
        </section>

        {/* Third-Party Services */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Third-party services</h2>
          <p className="text-gray-600 mb-4">
            We carefully vet all third-party services we use:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li><strong>Supabase</strong> — Database and authentication (SOC 2 Type II)</li>
            <li><strong>Vercel</strong> — Application hosting (SOC 2 Type II)</li>
            <li><strong>Stripe</strong> — Payment processing (PCI DSS Level 1)</li>
            <li><strong>Anthropic</strong> — AI processing (Enterprise security)</li>
            <li><strong>Resend</strong> — Email delivery (SOC 2 Type II)</li>
          </ul>
        </section>

        {/* Data Retention */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Data retention</h2>
          <p className="text-gray-600">
            By default, we retain your order data for 180 days after delivery. You can
            request extended retention (up to 2 years) or early deletion at any time.
            Before any scheduled deletion, we'll send you a reminder email with the
            option to extend or export your data.
          </p>
        </section>

        {/* Breach Notification */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Breach notification</h2>
          <p className="text-gray-600">
            In the unlikely event of a data breach affecting your information, we commit
            to notifying you within 24 hours of discovery. We maintain cyber liability
            insurance and have documented incident response procedures to minimize impact.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Security questions?</h2>
          <p className="text-gray-600">
            For security inquiries, vulnerability reports, or to request our security
            documentation, contact us at{' '}
            <a href="mailto:security@motiongranted.com" className="text-blue-600 hover:underline">
              security@motiongranted.com
            </a>
          </p>
        </section>

        {/* Certifications */}
        <section className="bg-gray-50 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Our commitment</h2>
          <p className="text-gray-600 mb-4">
            Motion Granted is actively working toward SOC 2 Type II certification.
            We maintain comprehensive security controls and undergo regular security assessments.
          </p>
          <p className="text-sm text-gray-500">
            Last security review: January 2026
          </p>
        </section>
      </div>
    </div>
  );
}
