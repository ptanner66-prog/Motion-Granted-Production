/**
 * Cancellation Confirmation Email Template — SP-21 Group 5
 *
 * Sent when an order is cancelled (attorney-initiated or timeout).
 * Confirms 50% refund and provides dashboard link.
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

interface CancellationConfirmationEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  dashboardUrl: string
  refundPercentage?: number
  refundAmountFormatted?: string
  cancellationReason?: 'attorney_cancelled' | 'timeout_21d'
}

export function CancellationConfirmationEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  dashboardUrl = 'https://motion-granted.com/dashboard/orders/123',
  refundPercentage = 50,
  refundAmountFormatted = '$250.00',
  cancellationReason = 'attorney_cancelled',
}: CancellationConfirmationEmailProps) {
  const isTimeout = cancellationReason === 'timeout_21d'

  return (
    <Html>
      <Head />
      <Preview>
        {`Order ${orderNumber} has been cancelled — ${refundPercentage}% refund processing`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Banner */}
          <Section style={banner}>
            <Heading style={bannerTitle}>Order Cancelled</Heading>
            <Text style={bannerSubtitle}>
              {isTimeout
                ? 'Your order was automatically cancelled due to inactivity'
                : 'Your cancellation has been processed'}
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Cancellation Details</Heading>
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
                  <td style={{ ...detailValue, color: '#dc2626', fontWeight: '600' }}>
                    Cancelled
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Refund Info */}
          <Section style={contentSection}>
            <Heading as="h2" style={sectionTitle}>Refund Information</Heading>
            <div style={refundBox}>
              <Text style={refundAmount}>{refundAmountFormatted}</Text>
              <Text style={refundLabel}>
                {refundPercentage}% refund to your original payment method
              </Text>
              <Text style={refundNote}>
                Please allow 5&ndash;10 business days for the refund to appear
                on your statement.
              </Text>
            </div>
          </Section>

          {/* Explanation for timeout */}
          {isTimeout && (
            <Section style={contentSection}>
              <div style={warningBox}>
                <Text style={warningText}>
                  This order was automatically cancelled because no action was
                  taken within the 21-day review period. A {refundPercentage}%
                  refund has been issued per our cancellation policy.
                </Text>
              </div>
            </Section>
          )}

          {/* Content */}
          <Section style={contentSection}>
            <Text style={paragraph}>
              If you have any questions about your refund or would like to
              resubmit your order in the future, please don&apos;t hesitate to
              contact us. We&apos;re here to help.
            </Text>
          </Section>

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={button} href={dashboardUrl}>
              View Order History
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
            <Text style={footerCopyright}>
              &copy; {new Date().getFullYear()} Motion Granted. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default CancellationConfirmationEmail

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
  backgroundColor: '#fef2f2',
  borderBottom: '2px solid #fca5a5',
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const bannerTitle = {
  color: '#991b1b',
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

const refundBox = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
}

const refundAmount = {
  color: '#059669',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 4px 0',
}

const refundLabel = {
  color: '#047857',
  fontSize: '14px',
  fontWeight: '500',
  margin: '0 0 8px 0',
}

const refundNote = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0',
}

const warningBox = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '8px',
  padding: '16px',
}

const warningText = {
  color: '#9a3412',
  fontSize: '13px',
  lineHeight: '1.6',
  margin: '0',
}

const ctaSection = {
  padding: '0 24px 32px 24px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#64748b',
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
