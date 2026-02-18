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

interface RevisionRequestEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  requestedBy: string
  revisionDetails: string
  estimatedCompletion?: string
  portalUrl?: string
  orderUrl?: string
}

export function RevisionRequestEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  requestedBy = 'John Smith',
  revisionDetails = 'Please update the citation on page 3 and revise the argument in section II.B.',
  estimatedCompletion = 'January 20, 2024',
  portalUrl = 'https://motion-granted.com/dashboard',
  orderUrl = 'https://motion-granted.com/orders/123',
}: RevisionRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Revision requested for order {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Revision Banner */}
          <Section style={revisionBanner}>
            <Text style={revisionIcon}>&#x1F504;</Text>
            <Heading style={revisionTitle}>Revision Requested</Heading>
            <Text style={revisionSubtitle}>
              A revision has been requested for your order.
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
                  <td style={detailLabel}>Requested By</td>
                  <td style={detailValue}>{requestedBy}</td>
                </tr>
                {estimatedCompletion && (
                  <tr>
                    <td style={detailLabel}>Est. Completion</td>
                    <td style={{ ...detailValue, color: '#00d4aa', fontWeight: '600' }}>
                      {estimatedCompletion}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Revision Details */}
          <Section style={revisionDetailsSection}>
            <Heading as="h2" style={sectionTitle}>
              Revision Request
            </Heading>
            <div style={revisionBox}>
              <Text style={revisionText}>{revisionDetails}</Text>
            </div>
          </Section>

          {/* What Happens Next */}
          <Section style={nextStepsSection}>
            <Heading as="h2" style={sectionTitle}>
              What Happens Next
            </Heading>
            <div style={stepItem}>
              <Text style={stepNumber}>1</Text>
              <div>
                <Text style={stepTitle}>Review &amp; Assignment</Text>
                <Text style={stepDescription}>
                  We&apos;ll review the revision request and assign it to an available clerk.
                </Text>
              </div>
            </div>
            <div style={stepItem}>
              <Text style={stepNumber}>2</Text>
              <div>
                <Text style={stepTitle}>Revision in Progress</Text>
                <Text style={stepDescription}>
                  The assigned clerk will make the requested changes.
                </Text>
              </div>
            </div>
            <div style={stepItem}>
              <Text style={stepNumber}>3</Text>
              <div>
                <Text style={stepTitle}>Updated Draft Delivered</Text>
                <Text style={stepDescription}>
                  You&apos;ll receive an email when the revised draft is ready.
                </Text>
              </div>
            </div>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              View Order Status
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions about your revision? Reply to this email or contact us at{' '}
              <Link href="mailto:support@motion-granted.com" style={link}>
                support@motion-granted.com
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

export default RevisionRequestEmail

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

const revisionBanner = {
  backgroundColor: '#eff6ff',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '1px solid #bfdbfe',
}

const revisionIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
}

const revisionTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const revisionSubtitle = {
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

const revisionDetailsSection = {
  padding: '0 24px 32px 24px',
}

const revisionBox = {
  backgroundColor: '#f8fafc',
  padding: '16px',
  borderRadius: '8px',
  borderLeft: '4px solid #3b82f6',
}

const revisionText = {
  color: '#475569',
  fontSize: '14px',
  margin: '0',
  lineHeight: '1.6',
}

const nextStepsSection = {
  padding: '0 24px 32px 24px',
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
