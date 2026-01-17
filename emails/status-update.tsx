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

interface StatusUpdateEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  previousStatus: string
  newStatus: string
  statusMessage: string
  portalUrl?: string
  orderUrl?: string
}

export function StatusUpdateEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  previousStatus = 'Pending',
  newStatus = 'In Progress',
  statusMessage = 'Your order has been assigned to a law clerk and work has begun.',
  portalUrl = 'https://motiongranted.com/dashboard',
  orderUrl = 'https://motiongranted.com/orders/123',
}: StatusUpdateEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Status update for order {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Status Banner */}
          <Section style={statusBanner}>
            <Text style={statusIcon}>&#x1F504;</Text>
            <Heading style={statusTitle}>Order Status Updated</Heading>
            <Text style={statusSubtitle}>
              Your order status has changed
            </Text>
          </Section>

          {/* Status Change */}
          <Section style={statusChangeSection}>
            <div style={statusFlow}>
              <div style={statusBox}>
                <Text style={statusLabel}>Previous</Text>
                <Text style={statusValueOld}>{previousStatus}</Text>
              </div>
              <Text style={statusArrow}>&#x2192;</Text>
              <div style={statusBox}>
                <Text style={statusLabel}>Current</Text>
                <Text style={statusValueNew}>{newStatus}</Text>
              </div>
            </div>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>
              Order Details
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
              </tbody>
            </table>
          </Section>

          {/* Message */}
          <Section style={messageSection}>
            <Text style={messageText}>{statusMessage}</Text>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              View Order Details
            </Button>
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
            <Text style={footerDisclaimer}>
              Motion Granted is not a law firm and does not provide legal advice or representation.
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

export default StatusUpdateEmail

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

const statusBanner = {
  backgroundColor: '#eff6ff',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '1px solid #bfdbfe',
}

const statusIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
}

const statusTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const statusSubtitle = {
  color: '#64748b',
  fontSize: '16px',
  margin: '0',
  lineHeight: '1.5',
}

const statusChangeSection = {
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const statusFlow = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '20px',
}

const statusBox = {
  textAlign: 'center' as const,
}

const statusLabel = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0 0 4px 0',
  textTransform: 'uppercase' as const,
}

const statusValueOld = {
  color: '#94a3b8',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
  padding: '8px 16px',
  backgroundColor: '#f1f5f9',
  borderRadius: '6px',
  display: 'inline-block',
}

const statusValueNew = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
  padding: '8px 16px',
  backgroundColor: '#d1fae5',
  borderRadius: '6px',
  display: 'inline-block',
}

const statusArrow = {
  fontSize: '24px',
  color: '#00d4aa',
  margin: '0',
}

const detailsSection = {
  padding: '0 24px 32px 24px',
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

const messageSection = {
  padding: '0 24px 32px 24px',
}

const messageText = {
  color: '#475569',
  fontSize: '14px',
  margin: '0',
  lineHeight: '1.6',
  backgroundColor: '#f8fafc',
  padding: '16px',
  borderRadius: '8px',
  borderLeft: '4px solid #00d4aa',
}

const divider = {
  borderColor: '#e2e8f0',
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

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const link = {
  color: '#00d4aa',
  textDecoration: 'underline',
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
