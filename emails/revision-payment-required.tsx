/**
 * Revision Payment Required Email Template
 *
 * v6.3: Sent when a customer requests a paid revision
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface RevisionPaymentRequiredEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  revisionNumber: number
  tier: 'A' | 'B' | 'C'
  amount: number
  paymentUrl: string
  portalUrl?: string
}

const TIER_NAMES = {
  A: 'Simple Motion',
  B: 'Moderate Motion',
  C: 'Complex Motion',
};

export function RevisionPaymentRequiredEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  revisionNumber = 2,
  tier = 'B',
  amount = 125,
  paymentUrl = 'https://motiongranted.com/checkout',
  portalUrl = 'https://motiongranted.com/dashboard',
}: RevisionPaymentRequiredEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Payment Required for Revision #${revisionNumber} - ${orderNumber}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Payment Banner */}
          <Section style={paymentBanner}>
            <Text style={paymentIcon}>💳</Text>
            <Heading style={paymentTitle}>Revision Payment Required</Heading>
            <Text style={paymentSubtitle}>
              Complete payment to proceed with your revision request
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>
              Revision Details
            </Heading>

            <table style={detailsTable}>
              <tbody>
                <tr>
                  <td style={detailLabel}>Order Number</td>
                  <td style={detailValue}>{orderNumber}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Motion Type</td>
                  <td style={detailValue}>{motionType}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Case</td>
                  <td style={detailValue}>{caseCaption}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Revision Number</td>
                  <td style={detailValue}>#{revisionNumber}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Motion Tier</td>
                  <td style={detailValue}>{TIER_NAMES[tier]} (Tier {tier})</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Pricing Box */}
          <Section style={pricingSection}>
            <div style={pricingBox}>
              <Text style={pricingLabel}>Revision Fee</Text>
              <Text style={pricingAmount}>${amount}</Text>
            </div>
          </Section>

          {/* Explanation */}
          <Section style={explanationSection}>
            <Text style={explanationText}>
              Your order included one free revision, which has been used. Additional revisions
              are priced based on motion complexity to ensure we can provide the same level
              of quality and attention to your requested changes.
            </Text>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={paymentUrl}>
              Complete Payment - ${amount}
            </Button>
          </Section>

          <Hr style={divider} />

          {/* What Happens Next */}
          <Section style={nextStepsSection}>
            <Heading as="h2" style={sectionTitle}>
              What Happens After Payment
            </Heading>
            <ol style={stepsList}>
              <li style={stepItem}>
                <strong>Immediate Processing:</strong> Your revision request will begin
                processing as soon as payment is confirmed.
              </li>
              <li style={stepItem}>
                <strong>Revision Work:</strong> Our team will implement your requested
                changes and run the draft through quality review.
              </li>
              <li style={stepItem}>
                <strong>Delivery:</strong> You&apos;ll receive an email when your revised
                draft is ready for review.
              </li>
            </ol>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about pricing? Contact us at{' '}
              <Link href="mailto:support@motiongranted.com" style={link}>
                support@motiongranted.com
              </Link>
            </Text>
            <Text style={pricingNote}>
              <strong>Revision Pricing:</strong> Tier A (Simple): $75 | Tier B (Moderate): $125 | Tier C (Complex): $200
            </Text>
            <Text style={footerDisclaimer}>
              Motion Granted is not a law firm. All work product requires attorney review
              before filing.
            </Text>
            <Text style={footerCopyright}>
              © {new Date().getFullYear()} Motion Granted. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default RevisionPaymentRequiredEmail

// Styles
const main = {
  backgroundColor: '#f8f7f4',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '600px',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
}

const header = {
  backgroundColor: '#0f172a',
  padding: '24px',
  textAlign: 'center' as const,
}

const logo = {
  color: '#00d4aa',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '-0.5px',
}

const paymentBanner = {
  backgroundColor: '#fff7ed',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '2px solid #fed7aa',
}

const paymentIcon = {
  fontSize: '48px',
  margin: '0 0 8px 0',
}

const paymentTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const paymentSubtitle = {
  color: '#64748b',
  fontSize: '16px',
  margin: '0',
  lineHeight: '1.5',
}

const detailsSection = {
  padding: '32px 24px',
}

const sectionTitle = {
  color: '#0f172a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 20px 0',
}

const detailsTable = {
  width: '100%',
  borderCollapse: 'collapse' as const,
}

const detailLabel = {
  color: '#64748b',
  fontSize: '14px',
  padding: '12px 0',
  borderBottom: '1px solid #f1f5f9',
  width: '40%',
}

const detailValue = {
  color: '#0f172a',
  fontSize: '14px',
  padding: '12px 0',
  borderBottom: '1px solid #f1f5f9',
  textAlign: 'right' as const,
}

const pricingSection = {
  padding: '0 24px 24px 24px',
}

const pricingBox = {
  backgroundColor: '#0f172a',
  borderRadius: '12px',
  padding: '24px',
  textAlign: 'center' as const,
}

const pricingLabel = {
  color: '#94a3b8',
  fontSize: '14px',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
}

const pricingAmount = {
  color: '#00d4aa',
  fontSize: '36px',
  fontWeight: '700',
  margin: '0',
}

const explanationSection = {
  padding: '0 24px 24px 24px',
}

const explanationText = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
}

const ctaSection = {
  padding: '0 24px 32px 24px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#00d4aa',
  color: '#0f172a',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  display: 'inline-block',
}

const divider = {
  borderColor: '#e2e8f0',
  margin: '0',
}

const nextStepsSection = {
  padding: '32px 24px',
}

const stepsList = {
  margin: '0',
  paddingLeft: '20px',
}

const stepItem = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.6',
  marginBottom: '12px',
}

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 12px 0',
  lineHeight: '1.5',
}

const link = {
  color: '#00d4aa',
  textDecoration: 'underline',
}

const pricingNote = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0 0 16px 0',
  backgroundColor: '#f8fafc',
  padding: '12px',
  borderRadius: '6px',
}

const footerDisclaimer = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const footerCopyright = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0',
}
