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

interface OrderCompletedEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  completedDate: string
  turnaround: string
  feedbackUrl?: string
  portalUrl?: string
  orderUrl?: string
}

export function OrderCompletedEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  completedDate = 'January 18, 2024',
  turnaround = 'Standard (delivered in 4 days)',
  feedbackUrl = 'https://motiongranted.com/feedback/123',
  portalUrl = 'https://motiongranted.com/dashboard',
  orderUrl = 'https://motiongranted.com/orders/123',
}: OrderCompletedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Order {orderNumber} completed - Thank you for using Motion Granted</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Completion Banner */}
          <Section style={completionBanner}>
            <Text style={completionIcon}>&#x1F389;</Text>
            <Heading style={completionTitle}>Order Complete!</Heading>
            <Text style={completionSubtitle}>
              Your motion has been delivered successfully.
            </Text>
          </Section>

          {/* Order Summary */}
          <Section style={detailsSection}>
            <Heading as="h2" style={sectionTitle}>
              Order Summary
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
                  <td style={detailLabel}>Completed</td>
                  <td style={{ ...detailValue, color: '#00d4aa', fontWeight: '600' }}>
                    {completedDate}
                  </td>
                </tr>
                <tr>
                  <td style={detailLabel}>Turnaround</td>
                  <td style={detailValue}>{turnaround}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              View &amp; Download Files
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Feedback Request */}
          <Section style={feedbackSection}>
            <Heading as="h2" style={feedbackTitle}>
              How Did We Do?
            </Heading>
            <Text style={feedbackText}>
              Your feedback helps us improve. Please take a moment to rate your experience.
            </Text>
            <Button style={feedbackButton} href={feedbackUrl}>
              Leave Feedback
            </Button>
          </Section>

          <Hr style={divider} />

          {/* What's Next */}
          <Section style={nextSection}>
            <Heading as="h2" style={sectionTitle}>
              What&apos;s Next?
            </Heading>
            <Text style={nextText}>
              <strong>Review Your Draft:</strong> Please review the draft carefully before filing.
              As the supervising attorney, you are responsible for verifying all facts, citations,
              and legal arguments.
            </Text>
            <Text style={nextText}>
              <strong>Need Revisions?</strong> If you need any changes, you can request revisions
              through your dashboard within 14 days of delivery.
            </Text>
            <Text style={nextText}>
              <strong>Order Again:</strong> Need another motion? We&apos;re here to help.
              Start a new order anytime.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about your order? Reply to this email or contact us at{' '}
              <Link href="mailto:support@motiongranted.com" style={link}>
                support@motiongranted.com
              </Link>
            </Text>
            <Text style={footerDisclaimer}>
              Motion Granted is not a law firm and does not provide legal advice or representation.
              All work product is prepared by law clerks under attorney supervision.
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

export default OrderCompletedEmail

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

const completionBanner = {
  backgroundColor: '#f0fdf9',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '1px solid #d1fae5',
}

const completionIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
}

const completionTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const completionSubtitle = {
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

const feedbackSection = {
  padding: '32px 24px',
  textAlign: 'center' as const,
  backgroundColor: '#faf5ff',
}

const feedbackTitle = {
  color: '#0f172a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 12px 0',
}

const feedbackText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 20px 0',
  lineHeight: '1.5',
}

const feedbackButton = {
  backgroundColor: '#8b5cf6',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  display: 'inline-block',
}

const nextSection = {
  padding: '32px 24px',
}

const nextText = {
  color: '#475569',
  fontSize: '14px',
  margin: '0 0 16px 0',
  lineHeight: '1.6',
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
