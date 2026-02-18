/**
 * Attorney Package Ready Email Template — SP-21 Group 5
 *
 * Sent when the filing package is ready for attorney review at CP3.
 * T+0 immediate notification. Professional tone with 14-day review window reminder.
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

interface AttorneyPackageReadyEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  dashboardUrl: string
  reviewDeadlineDays?: number
}

export function AttorneyPackageReadyEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  dashboardUrl = 'https://motion-granted.com/dashboard/orders/123',
  reviewDeadlineDays = 14,
}: AttorneyPackageReadyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {motionType} is ready for review — {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Banner */}
          <Section style={banner}>
            <Heading style={bannerTitle}>Your Filing Package is Ready</Heading>
            <Text style={bannerSubtitle}>
              Order {orderNumber} requires your review
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Order Details</Heading>
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
              </tbody>
            </table>
          </Section>

          {/* Description */}
          <Section style={contentSection}>
            <Text style={paragraph}>
              Your {motionType} has passed all quality checks and is now available
              for your review. The complete filing package includes the motion document,
              supporting declarations, proposed order, and proof of service.
            </Text>
            <Text style={paragraph}>
              Please review and take action within <strong>{reviewDeadlineDays} days</strong>.
              If no action is taken within 21 days, the order will be automatically
              cancelled with a 50% refund.
            </Text>
          </Section>

          {/* Your Options */}
          <Section style={contentSection}>
            <Heading as="h2" style={sectionTitle}>Your Options</Heading>
            <div style={optionBox}>
              <Text style={optionTitle}>Approve</Text>
              <Text style={optionDescription}>
                Accept the documents for final delivery and download.
              </Text>
            </div>
            <div style={optionBox}>
              <Text style={optionTitle}>Request Changes</Text>
              <Text style={optionDescription}>
                Submit revision notes. Up to 3 revision cycles are included.
              </Text>
            </div>
            <div style={optionBox}>
              <Text style={optionTitle}>Cancel</Text>
              <Text style={optionDescription}>
                Cancel the order and receive a 50% refund.
              </Text>
            </div>
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={button} href={dashboardUrl}>
              Review Your Documents
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or contact us at{' '}
              <Link href="mailto:support@motion-granted.com" style={link}>
                support@motion-granted.com
              </Link>
            </Text>
            <Text style={footerDisclaimer}>
              Motion Granted is not a law firm. All work product requires attorney review
              before filing. As the supervising attorney, you are responsible for
              verifying all content.
            </Text>
            <Text style={footerCopyright}>
              &copy; {new Date().getFullYear()} Motion Granted. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default AttorneyPackageReadyEmail

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

const banner = {
  backgroundColor: '#d1fae5',
  borderBottom: '2px solid #34d399',
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const bannerTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const bannerSubtitle = {
  color: '#64748b',
  fontSize: '16px',
  margin: '0',
  lineHeight: '1.5',
}

const detailsSection = { padding: '32px 24px' }

const sectionTitle = {
  color: '#0f172a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 20px 0',
}

const detailsTable = { width: '100%', borderCollapse: 'collapse' as const }

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

const contentSection = { padding: '0 24px 24px 24px' }

const paragraph = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 12px 0',
}

const optionBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
}

const optionTitle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px 0',
}

const optionDescription = {
  color: '#64748b',
  fontSize: '13px',
  margin: '0',
  lineHeight: '1.5',
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

const divider = { borderColor: '#e2e8f0', margin: '0' }

const footer = { padding: '24px', textAlign: 'center' as const }

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const link = { color: '#00d4aa', textDecoration: 'underline' }

const footerDisclaimer = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const footerCopyright = { color: '#94a3b8', fontSize: '12px', margin: '0' }
