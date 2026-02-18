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

type MilestoneType = 'conflict_cleared' | 'assigned' | 'work_started' | 'review' | 'qa_passed'

interface ProgressUpdateEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  milestone: MilestoneType
  clerkName?: string
  estimatedCompletion?: string
  portalUrl?: string
  orderUrl?: string
}

const milestoneConfig: Record<MilestoneType, {
  icon: string
  title: string
  message: string
  progress: number
}> = {
  conflict_cleared: {
    icon: '\u2705',
    title: 'Conflict Check Cleared',
    message: 'Your order has passed our conflict check and is ready for assignment.',
    progress: 20,
  },
  assigned: {
    icon: '\u{1F464}',
    title: 'Clerk Assigned',
    message: 'A qualified law clerk has been assigned to your order.',
    progress: 40,
  },
  work_started: {
    icon: '\u270D\uFE0F',
    title: 'Drafting in Progress',
    message: 'Work has begun on your motion draft.',
    progress: 60,
  },
  review: {
    icon: '\u{1F50D}',
    title: 'Under Review',
    message: 'Your draft is being reviewed for quality assurance.',
    progress: 80,
  },
  qa_passed: {
    icon: '\u{1F31F}',
    title: 'Quality Check Passed',
    message: 'Your draft has passed quality review and will be delivered shortly.',
    progress: 95,
  },
}

export function ProgressUpdateEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  milestone = 'assigned',
  clerkName,
  estimatedCompletion,
  portalUrl = 'https://motion-granted.com/dashboard',
  orderUrl = 'https://motion-granted.com/orders/123',
}: ProgressUpdateEmailProps) {
  const config = milestoneConfig[milestone]

  return (
    <Html>
      <Head />
      <Preview>{config.title} - Order {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Progress Banner */}
          <Section style={progressBanner}>
            <Text style={progressIcon}>{config.icon}</Text>
            <Heading style={progressTitle}>{config.title}</Heading>
            <Text style={progressSubtitle}>{config.message}</Text>
          </Section>

          {/* Progress Bar */}
          <Section style={progressBarSection}>
            <div style={progressBarContainer}>
              <div style={{
                ...progressBarFill,
                width: `${config.progress}%`,
              }} />
            </div>
            <Text style={progressText}>{config.progress}% Complete</Text>
          </Section>

          {/* Milestone Details */}
          {(clerkName || estimatedCompletion) && (
            <Section style={milestoneSection}>
              {clerkName && (
                <div style={milestoneItem}>
                  <Text style={milestoneLabel}>Assigned Clerk</Text>
                  <Text style={milestoneValue}>{clerkName}</Text>
                </div>
              )}
              {estimatedCompletion && (
                <div style={milestoneItem}>
                  <Text style={milestoneLabel}>Estimated Completion</Text>
                  <Text style={milestoneValue}>{estimatedCompletion}</Text>
                </div>
              )}
            </Section>
          )}

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

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              Track Order Progress
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

export default ProgressUpdateEmail

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

const progressBanner = {
  backgroundColor: '#f0fdf9',
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: '1px solid #d1fae5',
}

const progressIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
}

const progressTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const progressSubtitle = {
  color: '#64748b',
  fontSize: '16px',
  margin: '0',
  lineHeight: '1.5',
}

const progressBarSection = {
  padding: '24px',
  textAlign: 'center' as const,
}

const progressBarContainer = {
  width: '100%',
  height: '8px',
  backgroundColor: '#e2e8f0',
  borderRadius: '4px',
  overflow: 'hidden',
}

const progressBarFill = {
  height: '100%',
  backgroundColor: '#00d4aa',
  borderRadius: '4px',
  transition: 'width 0.3s ease',
}

const progressText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '12px 0 0 0',
}

const milestoneSection = {
  padding: '0 24px 24px 24px',
  display: 'flex',
  justifyContent: 'center',
  gap: '32px',
}

const milestoneItem = {
  textAlign: 'center' as const,
  padding: '16px 24px',
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  display: 'inline-block',
  margin: '0 8px',
}

const milestoneLabel = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0 0 4px 0',
  textTransform: 'uppercase' as const,
}

const milestoneValue = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
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
