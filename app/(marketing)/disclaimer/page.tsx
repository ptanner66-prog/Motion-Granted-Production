import { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: 'Important legal disclaimers about Motion Granted services.',
}

export default function DisclaimerPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-amber-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-amber-600" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
              Important Disclaimer
            </h1>
            <p className="mt-6 text-lg text-gray-600">
              Please read carefully before using Motion Granted services
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-gray max-w-none">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 mb-12">
              <h2 className="text-xl font-bold text-navy mt-0">
                Motion Granted Is Not a Law Firm
              </h2>
              <p className="text-gray-700 mb-0">
                Motion Granted, LLC is a legal process outsourcing company. We are <strong>not</strong> a
                law firm. We do <strong>not</strong> provide legal advice. We do <strong>not</strong> provide
                legal representation. We do <strong>not</strong> have attorney-client relationships with
                your clients.
              </p>
            </div>

            <h2>Nature of Services</h2>
            <p>
              Motion Granted provides drafting assistance to licensed attorneys. Our law clerks prepare
              draft documents based on the instructions, materials, and direction provided by the
              hiring attorney. The hiring attorney supervises all work product and retains sole
              responsibility for all legal judgment, strategy, and client relationships.
            </p>

            <h2>Attorney Supervision Required</h2>
            <p>
              All work product prepared by Motion Granted must be reviewed, revised as necessary, and
              approved by a licensed attorney before filing or use. The attorney who orders services
              from Motion Granted is responsible for:
            </p>
            <ul>
              <li>Providing accurate facts, documents, and instructions</li>
              <li>Supervising the drafting process</li>
              <li>Reviewing all work product for accuracy, completeness, and legal soundness</li>
              <li>Making all legal and strategic decisions</li>
              <li>Verifying all citations and factual assertions</li>
              <li>Ensuring compliance with applicable court rules and ethical obligations</li>
              <li>Filing all documents with the appropriate court</li>
              <li>Maintaining the attorney-client relationship with their client</li>
            </ul>

            <h2>No Attorney-Client Relationship</h2>
            <p>
              Use of Motion Granted services does not create an attorney-client relationship between
              Motion Granted (or its employees) and you or your clients. Motion Granted does not
              represent you or your clients in any legal matter. Your clients remain your clients;
              we are your drafting support service.
            </p>

            <h2>No Legal Advice</h2>
            <p>
              Nothing in our work product constitutes legal advice. We prepare drafts based on your
              instructions—we do not advise you on legal strategy, evaluate the merits of your
              case, or recommend courses of action. If our clerks ask clarifying questions, this
              is to better execute your instructions, not to provide legal guidance.
            </p>

            <h2>Professional Responsibility</h2>
            <p>
              You are responsible for compliance with all applicable rules of professional conduct,
              including but not limited to rules regarding:
            </p>
            <ul>
              <li>Competence and diligence</li>
              <li>Supervision of non-lawyer assistants</li>
              <li>Confidentiality</li>
              <li>Communication with clients</li>
              <li>Meritorious claims and contentions</li>
              <li>Candor toward the tribunal</li>
            </ul>

            <h2>No Guarantee of Outcome</h2>
            <p>
              Motion Granted makes no guarantees regarding the outcome of any motion, case, or
              legal proceeding. The quality of our drafts does not guarantee success before any
              court. Success depends on many factors beyond our control, including the underlying
              facts, applicable law, judicial discretion, and the actions of opposing parties.
            </p>

            <h2>Limitation of Liability</h2>
            <p>
              Motion Granted&apos;s liability is limited to the fees paid for the specific order giving
              rise to any claim. We are not liable for any indirect, consequential, special, or
              punitive damages. We are not liable for any malpractice claims arising from your
              use of our work product. You acknowledge that you, as the supervising attorney,
              bear professional responsibility for all work filed with the court.
            </p>

            <h2>Independent Verification Required</h2>
            <p>
              You must independently verify all facts, citations, and legal arguments in any work
              product we provide. While we strive for accuracy, errors may occur. You are
              responsible for catching and correcting any errors before filing.
            </p>

            <h2>Acceptance of Terms</h2>
            <p>
              By creating an account or placing an order with Motion Granted, you acknowledge that
              you have read, understood, and agree to this Disclaimer, our Terms of Service, and
              our Privacy Policy. If you do not agree to these terms, do not use our services.
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 mt-12">
              <p className="text-sm text-gray-600 mb-0">
                <strong>Last Updated:</strong> January 2025
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
