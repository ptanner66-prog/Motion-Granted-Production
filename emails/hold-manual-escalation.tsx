/**
 * Hold Manual Escalation Email Template — v7.2
 *
 * Sent to admin when a hold is manually escalated via hold-resolve.
 * Contains hold reason, escalation notes, and admin dashboard link.
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

interface HoldManualEscalationEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  holdReason: string
  notes: string
  adminDashboardUrl: string
}

export function HoldManualEscalationEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  holdReason = 'evidence_gap',
  notes = '',
  adminDashboardUrl = 'https://motion-granted.com/admin/orders/123',
}: HoldManualEscalationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`ESCALATION: Order ${orderNumber} hold requires manual intervention`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Banner */}
          <Section style={banner}>
            <Heading style={bannerTitle}>Hold Escalated</Heading>
            <Text style={bannerSubtitle}>
              Manual intervention required for order {orderNumber}
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Escalation Details</Heading>
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
                  <td style={detailLabel}>Hold Reason</td>
                  <td style={{ ...detailValue, color: '#dc2626', fontWeight: '600' }}>
                    {holdReason.replace(/_/g, ' ')}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Notes */}
          {notes && (
            <Section style={contentSection}>
              <Heading as="h2" style={sectionTitle}>Escalation Notes</Heading>
              <div style={notesBox}>
                <Text style={notesText}>{notes}</Text>
              </div>
            </Section>
          )}

          {/* Content */}
          <Section style={contentSection}>
            <Text style={paragraph}>
              This hold has been escalated and requires immediate admin attention.
              Please review the order and take appropriate action.
            </Text>
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={button} href={adminDashboardUrl}>
              Review Order Now
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an internal admin notification from{' '}
              <Link href="https://motion-granted.com" style={link}>
                Motion Granted
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

export default HoldManualEscalationEmail

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
  backgroundColor: '#fff7ed',
  borderBottom: '2px solid #fdba74',
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const bannerTitle = {
  color: '#9a3412',
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
  margin: '0',
}

const notesBox = {
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px',
}

const notesText = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}

const ctaSection = {
  padding: '0 24px 32px 24px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#dc2626',
  color: '#ffffff',
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

const footerCopyright = { color: '#94a3b8', fontSize: '12px', margin: '0' }
