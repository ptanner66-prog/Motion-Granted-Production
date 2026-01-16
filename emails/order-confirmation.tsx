import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface OrderConfirmationEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  turnaround: string
  expectedDelivery: string
  totalPrice: string
  portalUrl?: string
}

export function OrderConfirmationEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  turnaround = 'Standard (5-7 business days)',
  expectedDelivery = 'January 22, 2024',
  totalPrice = '$495.00',
  portalUrl = 'https://motiongranted.com/dashboard',
}: OrderConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Motion Granted order {orderNumber} has been received</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Success Banner */}
          <Section style={successBanner}>
            <Text style={successIcon}>✓</Text>
            <Heading style={successTitle}>Order Confirmed</Heading>
            <Text style={successSubtitle}>
              Thank you for your order. We&apos;ve received your request and our team is on it.
            </Text>
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
                <tr>
                  <td style={detailLabel}>Turnaround</td>
                  <td style={detailValue}>{turnaround}</td>
                </tr>
                <tr>
                  <td style={detailLabel}>Expected Delivery</td>
                  <td style={{ ...detailValue, color: '#00d4aa', fontWeight: '600' }}>
                    {expectedDelivery}
                  </td>
                </tr>
                <tr>
                  <td style={detailLabel}>Total</td>
                  <td style={{ ...detailValue, fontWeight: '700', fontSize: '18px' }}>
                    {totalPrice}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={divider} />

          {/* What Happens Next */}
          <Section style={stepsSection}>
            <Heading as="h2" style={sectionTitle}>
              What Happens Next
            </Heading>

            <div style={stepItem}>
              <Text style={stepNumber}>1</Text>
              <div>
                <Text style={stepTitle}>Conflict Check & Assignment</Text>
                <Text style={stepDescription}>
                  We review your documents for conflicts and assign your order to a qualified law clerk.
                </Text>
              </div>
            </div>

            <div style={stepItem}>
              <Text style={stepNumber}>2</Text>
              <div>
                <Text style={stepTitle}>Drafting in Progress</Text>
                <Text style={stepDescription}>
                  Your clerk drafts the motion according to your instructions. If we have questions, we&apos;ll reach out.
                </Text>
              </div>
            </div>

            <div style={stepItem}>
              <Text style={stepNumber}>3</Text>
              <div>
                <Text style={stepTitle}>Draft Delivered</Text>
                <Text style={stepDescription}>
                  You&apos;ll receive an email when your draft is ready for download and review.
                </Text>
              </div>
            </div>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={portalUrl}>
              View Order in Portal
            </Button>
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
              © {new Date().getFullYear()} Motion Granted. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default OrderConfirmationEmail

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

const successBanner = {
  backgroundColor: '#f0fdf9',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '1px solid #d1fae5',
}

const successIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
  color: '#00d4aa',
}

const successTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const successSubtitle = {
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

const stepsSection = {
  padding: '32px 24px',
}

const stepItem = {
  display: 'flex',
  gap: '16px',
  marginBottom: '20px',
}

const stepNumber = {
  backgroundColor: '#00d4aa',
  color: '#0f172a',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
  flexShrink: 0,
  textAlign: 'center' as const,
  lineHeight: '28px',
}

const stepTitle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px 0',
}

const stepDescription = {
  color: '#64748b',
  fontSize: '14px',
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
