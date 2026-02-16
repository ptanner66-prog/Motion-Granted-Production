/**
 * Delivery Complete Email Template — SP-21 Group 5
 *
 * Sent after attorney APPROVE decision. Confirms delivery with
 * dashboard deep link for document download.
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

interface DeliveryCompleteEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  dashboardUrl: string
  retentionDays?: number
}

export function DeliveryCompleteEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  dashboardUrl = 'https://motiongranted.com/dashboard/orders/123',
  retentionDays = 365,
}: DeliveryCompleteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {motionType} has been delivered — {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Banner */}
          <Section style={banner}>
            <Heading style={bannerTitle}>Order Complete</Heading>
            <Text style={bannerSubtitle}>
              Your filing package is ready for download
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Delivery Confirmation</Heading>
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
                  <td style={detailLabel}>Status</td>
                  <td style={{ ...detailValue, color: '#059669', fontWeight: '600' }}>
                    Completed
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Content */}
          <Section style={contentSection}>
            <Text style={paragraph}>
              Your filing package has been finalized and is available for download
              in your dashboard. The package includes all generated documents for
              your {motionType}.
            </Text>

            <Heading as="h2" style={sectionTitle}>Package Contents</Heading>
            <ul style={packageList}>
              <li style={packageItem}>Complete motion document (.docx)</li>
              <li style={packageItem}>Proposed order</li>
              <li style={packageItem}>Certificate/proof of service</li>
              <li style={packageItem}>Supporting declarations (if applicable)</li>
              <li style={packageItem}>Separate statement (for MSJ/MSA)</li>
            </ul>
          </Section>

          {/* Retention Notice */}
          <Section style={contentSection}>
            <div style={infoBox}>
              <Text style={infoText}>
                Your documents will be retained for {retentionDays} days per our
                data retention policy. You can download them at any time from your
                dashboard during this period.
              </Text>
            </div>
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={button} href={dashboardUrl}>
              Download Your Documents
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Disclaimer */}
          <Section style={contentSection}>
            <Text style={disclaimerText}>
              All documents are prepared under your direction and supervision.
              Please review all work product before filing. Motion Granted
              provides drafting support only — final review responsibility
              rests with the filing attorney.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or contact us at{' '}
              <Link href="mailto:support@motiongranted.com" style={link}>
                support@motiongranted.com
              </Link>
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

export default DeliveryCompleteEmail

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
  margin: '0 0 16px 0',
}

const packageList = { margin: '0', paddingLeft: '20px' }

const packageItem = { color: '#475569', fontSize: '14px', lineHeight: '1.8' }

const infoBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '8px',
  padding: '16px',
}

const infoText = {
  color: '#1e40af',
  fontSize: '13px',
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

const divider = { borderColor: '#e2e8f0', margin: '0' }

const disclaimerText = {
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '16px 0 0 0',
  fontStyle: 'italic' as const,
}

const footer = { padding: '24px', textAlign: 'center' as const }

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const link = { color: '#00d4aa', textDecoration: 'underline' }

const footerCopyright = { color: '#94a3b8', fontSize: '12px', margin: '0' }
