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

interface DraftReadyEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  deliveredDate: string
  portalUrl?: string
  orderUrl?: string
}

export function DraftReadyEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  deliveredDate = 'January 18, 2024',
  portalUrl = 'https://motiongranted.com/dashboard',
  orderUrl = 'https://motiongranted.com/orders/123',
}: DraftReadyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your draft for {orderNumber} is ready for download</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Success Banner */}
          <Section style={successBanner}>
            <Text style={successIcon}>📄</Text>
            <Heading style={successTitle}>Your Draft is Ready!</Heading>
            <Text style={successSubtitle}>
              Great news! Your motion draft has been completed and is ready for your review.
            </Text>
          </Section>

          {/* Order Details */}
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
                  <td style={detailLabel}>Delivered</td>
                  <td style={{ ...detailValue, color: '#00d4aa', fontWeight: '600' }}>
                    {deliveredDate}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              View & Download Draft
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Revision Info */}
          <Section style={revisionSection}>
            <Heading as="h2" style={sectionTitle}>
              Need Changes?
            </Heading>

            <div style={revisionBox}>
              <Text style={revisionTitle}>✨ One Revision Included</Text>
              <Text style={revisionDescription}>
                Your order includes one complimentary revision. If the draft doesn&apos;t quite hit the mark,
                you can request changes at no additional cost.
              </Text>
            </div>

            <Heading as="h3" style={subSectionTitle}>
              What Qualifies as a Revision?
            </Heading>
            <ul style={list}>
              <li style={listItem}>Adjustments to arguments or legal theories</li>
              <li style={listItem}>Adding or removing citations</li>
              <li style={listItem}>Tone or style modifications</li>
              <li style={listItem}>Structural reorganization</li>
            </ul>

            <Heading as="h3" style={subSectionTitle}>
              What Counts as a New Order?
            </Heading>
            <ul style={list}>
              <li style={listItem}>Changing the type of motion (e.g., MSJ to MTD)</li>
              <li style={listItem}>Adding new claims or causes of action</li>
              <li style={listItem}>Substantially new facts not in original materials</li>
            </ul>

            <Heading as="h3" style={subSectionTitle}>
              How to Request a Revision
            </Heading>
            <ol style={list}>
              <li style={listItem}>Log in to your portal</li>
              <li style={listItem}>Navigate to this order</li>
              <li style={listItem}>Click &quot;Request Revision&quot;</li>
              <li style={listItem}>Describe the changes you need</li>
            </ol>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about your draft? Reply to this email or contact us at{' '}
              <Link href="mailto:support@motiongranted.com" style={link}>
                support@motiongranted.com
              </Link>
            </Text>
            <Text style={footerDisclaimer}>
              Motion Granted is not a law firm and does not provide legal advice or representation.
              All work product is prepared by law clerks under attorney supervision.
              Please review all documents carefully before filing.
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

export default DraftReadyEmail

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

const subSectionTitle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '20px 0 12px 0',
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

const revisionSection = {
  padding: '32px 24px',
}

const revisionBox = {
  backgroundColor: '#fefce8',
  border: '1px solid #fef08a',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
}

const revisionTitle = {
  color: '#854d0e',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 8px 0',
}

const revisionDescription = {
  color: '#a16207',
  fontSize: '14px',
  margin: '0',
  lineHeight: '1.5',
}

const list = {
  margin: '0 0 0 0',
  padding: '0 0 0 20px',
}

const listItem = {
  color: '#64748b',
  fontSize: '14px',
  marginBottom: '8px',
  lineHeight: '1.5',
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
