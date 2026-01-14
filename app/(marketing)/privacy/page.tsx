import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Motion Granted legal drafting services.',
}

export default function PrivacyPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Privacy Policy
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
              Motion Granted, LLC (&quot;Motion Granted,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy
              and is committed to protecting your personal information. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you
              use our website and services.
            </p>

            <h2>2. Information We Collect</h2>
            <h3>2.1 Information You Provide</h3>
            <p>We collect information you voluntarily provide, including:</p>
            <ul>
              <li>Account information (name, email, phone, bar number, firm information)</li>
              <li>Case information submitted with orders</li>
              <li>Documents uploaded to our platform</li>
              <li>Communications through our messaging system</li>
              <li>Payment information (processed securely by Stripe)</li>
            </ul>

            <h3>2.2 Automatically Collected Information</h3>
            <p>When you access our Services, we automatically collect:</p>
            <ul>
              <li>Device information (type, operating system, browser)</li>
              <li>IP address and location data</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h2>3. How We Use Your Information</h2>
            <p>We use collected information to:</p>
            <ul>
              <li>Provide and improve our Services</li>
              <li>Process orders and payments</li>
              <li>Communicate with you about orders and services</li>
              <li>Conduct conflicts checks</li>
              <li>Respond to inquiries and provide support</li>
              <li>Send important notices and updates</li>
              <li>Analyze usage and improve user experience</li>
              <li>Comply with legal obligations</li>
              <li>Protect against fraud and unauthorized access</li>
            </ul>

            <h2>4. How We Share Your Information</h2>
            <p>We may share your information with:</p>
            <ul>
              <li>
                <strong>Service Providers:</strong> Third parties that help us operate our
                business (hosting, payment processing, email services)
              </li>
              <li>
                <strong>Law Clerks:</strong> Staff who work on your orders (subject to
                confidentiality obligations)
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, court order, or
                to protect our rights
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a merger, acquisition,
                or sale of assets
              </li>
            </ul>
            <p>
              We do not sell your personal information to third parties for marketing purposes.
            </p>

            <h2>5. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your
              information, including:
            </p>
            <ul>
              <li>SSL/TLS encryption for data in transit</li>
              <li>Encrypted storage for sensitive data</li>
              <li>Access controls and authentication</li>
              <li>Regular security assessments</li>
              <li>Employee training on data protection</li>
            </ul>
            <p>
              However, no method of transmission or storage is 100% secure. We cannot guarantee
              absolute security.
            </p>

            <h2>6. Data Retention</h2>
            <p>
              We retain your information for as long as necessary to provide our Services and
              fulfill the purposes described in this Privacy Policy. Specifically:
            </p>
            <ul>
              <li>Account information: Retained while your account is active</li>
              <li>Order information: Retained for 7 years after order completion</li>
              <li>Communications: Retained for 3 years after last activity</li>
              <li>Payment records: Retained as required by law</li>
            </ul>

            <h2>7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your information (subject to legal retention requirements)</li>
              <li>Object to certain processing of your information</li>
              <li>Export your information in a portable format</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
            <p>
              To exercise these rights, contact us at privacy@motiongranted.com.
            </p>

            <h2>8. Cookies and Tracking</h2>
            <p>
              We use cookies and similar technologies to enhance your experience. These include:
            </p>
            <ul>
              <li>
                <strong>Essential cookies:</strong> Required for the website to function
              </li>
              <li>
                <strong>Analytics cookies:</strong> Help us understand how users interact
                with our site
              </li>
              <li>
                <strong>Preference cookies:</strong> Remember your settings and preferences
              </li>
            </ul>
            <p>
              You can control cookies through your browser settings. Disabling cookies may
              affect functionality.
            </p>

            <h2>9. Third-Party Services</h2>
            <p>
              Our Services integrate with third-party services including:
            </p>
            <ul>
              <li>Stripe (payment processing)</li>
              <li>Supabase (database and authentication)</li>
              <li>Vercel (hosting)</li>
              <li>Resend (email delivery)</li>
            </ul>
            <p>
              These services have their own privacy policies. We encourage you to review them.
            </p>

            <h2>10. Children&apos;s Privacy</h2>
            <p>
              Our Services are not intended for individuals under 18. We do not knowingly
              collect information from children. If we learn we have collected information
              from a child, we will delete it.
            </p>

            <h2>11. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than
              your own. We ensure appropriate safeguards are in place for such transfers.
            </p>

            <h2>12. California Privacy Rights</h2>
            <p>
              California residents have additional rights under the CCPA, including the
              right to know what information we collect and how we use it, the right to
              delete personal information, and the right to opt out of sales (we do not
              sell personal information).
            </p>

            <h2>13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              material changes by email or by posting a notice on our website. Your continued
              use of our Services after changes constitutes acceptance of the updated policy.
            </p>

            <h2>14. Contact Us</h2>
            <p>
              For questions about this Privacy Policy or our data practices, contact:
            </p>
            <p>
              Motion Granted, LLC<br />
              Privacy Inquiries<br />
              123 Main Street, Suite 400<br />
              Baton Rouge, LA 70801<br />
              privacy@motiongranted.com
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 mt-12">
              <p className="text-sm text-gray-600 mb-0">
                By using Motion Granted, you acknowledge that you have read and understand
                this Privacy Policy.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
