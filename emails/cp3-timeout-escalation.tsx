/**
 * CP3 Timeout Escalation Email Template — SP-21 Group 5
 *
 * Sent to ADMIN when CP3 21-day timeout triggers auto-cancel.
 * Internal escalation — not sent to the attorney.
 */

import {
  Body,
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

interface CP3TimeoutEscalationEmailProps {
  orderNumber: string
  orderId: string
  motionType: string
  caseCaption: string
  attorneyEmail: string
  attorneyName: string
  adminDashboardUrl: string
  refundAmountFormatted?: string
  cp3EnteredAt?: string
  cancelledAt?: string
}

export function CP3TimeoutEscalationEmail({
  orderNumber = 'MG-2026-00123',
  orderId = '00000000-0000-0000-0000-000000000000',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  attorneyEmail = 'attorney@example.com',
  attorneyName = 'Counselor',
  adminDashboardUrl = 'https://motion-granted.com/admin/orders/123',
  refundAmountFormatted = '$250.00',
  cp3EnteredAt = '',
  cancelledAt = '',
}: CP3TimeoutEscalationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        ADMIN ALERT: CP3 Timeout Auto-Cancel — {orderNumber}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerLabel}>ADMIN ESCALATION</Text>
            <Heading style={headerTitle}>CP3 Timeout Auto-Cancel</Heading>
          </Section>

          {/* Alert Banner */}
          <Section style={alertBanner}>
            <Text style={alertText}>
              Order {orderNumber} was automatically cancelled after 21 days
              of inactivity at CP3. A 50% refund has been issued.
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
                  <td style={detailLabel}>Order ID</td>
                  <td style={{ ...detailValue, fontFamily: 'monospace', fontSize: '12px' }}>
                    {orderId}
                  </td>
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

          {/* Attorney Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Attorney Information</Heading>
            <table style={detailsTable}>
              <tbody>
                <tr>
                  <td style={detailLabel}>Name</td>
                  <td style={detailValue}>{attorneyName}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Email</td>
                  <td style={detailValue}>
                    <Link href={`mailto:${attorneyEmail}`} style={link}>
                      {attorneyEmail}
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Timeline */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>Timeline</Heading>
            <table style={detailsTable}>
              <tbody>
                {cp3EnteredAt && (
                  <tr>
                    <td style={detailLabel}>CP3 Entered</td>
                    <td style={detailValue}>{cp3EnteredAt}</td>
                  </tr>
                )}
                <tr>
                  <td style={detailLabel}>14-Day Reminder Sent</td>
                  <td style={detailValue}>Yes (automated)</td>
                </tr>
                {cancelledAt && (
                  <tr>
                    <td style={detailLabel}>Auto-Cancelled</td>
                    <td style={detailValue}>{cancelledAt}</td>
                  </tr>
                )}
                <tr>
                  <td style={detailLabel}>Refund Amount</td>
                  <td style={{ ...detailValue, color: '#059669', fontWeight: '600' }}>
                    {refundAmountFormatted}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Action Items */}
          <Section style={contentSection}>
            <Heading as="h2" style={sectionTitle}>Recommended Actions</Heading>
            <div style={actionBox}>
              <Text style={actionText}>
                1. Verify the Stripe refund was processed successfully
              </Text>
              <Text style={actionText}>
                2. Check if the attorney has any pending support tickets
              </Text>
              <Text style={actionText}>
                3. Review if this is part of a pattern (multiple timeouts from same client)
              </Text>
            </div>
          </Section>

          {/* Admin Link */}
          <Section style={contentSection}>
            <Link href={adminDashboardUrl} style={adminLink}>
              View Order in Admin Dashboard &rarr;
            </Link>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated internal escalation from Motion Granted.
              Do not forward to clients.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default CP3TimeoutEscalationEmail

// Styles
const main = {
  backgroundColor: '#f1f5f9',
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
  backgroundColor: '#7f1d1d',
  padding: '24px',
  textAlign: 'center' as const,
}

const headerLabel = {
  color: '#fca5a5',
  fontSize: '11px',
  fontWeight: '700',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px 0',
}

const headerTitle = {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0',
}

const alertBanner = {
  backgroundColor: '#fef2f2',
  borderBottom: '2px solid #fca5a5',
  padding: '20px 24px',
}

const alertText = {
  color: '#991b1b',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
}

const detailsSection = { padding: '24px 24px 8px 24px' }

const sectionTitle = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px 0',
}

const detailsTable = { width: '100%', borderCollapse: 'collapse' as const }

const detailLabel = {
  color: '#64748b',
  fontSize: '13px',
  padding: '10px 0',
  borderBottom: '1px solid #f1f5f9',
  width: '40%',
}

const detailValue = {
  color: '#0f172a',
  fontSize: '13px',
  padding: '10px 0',
  borderBottom: '1px solid #f1f5f9',
  textAlign: 'right' as const,
}

const contentSection = { padding: '16px 24px 24px 24px' }

const actionBox = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '8px',
  padding: '16px',
}

const actionText = {
  color: '#92400e',
  fontSize: '13px',
  lineHeight: '1.8',
  margin: '0',
}

const adminLink = {
  color: '#2563eb',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'underline',
}

const link = { color: '#2563eb', textDecoration: 'underline' }

const divider = { borderColor: '#e2e8f0', margin: '0' }

const footer = { padding: '24px', textAlign: 'center' as const }

const footerText = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0',
  lineHeight: '1.5',
}
