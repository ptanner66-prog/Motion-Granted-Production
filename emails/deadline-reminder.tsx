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

type UrgencyLevel = 'critical' | 'warning' | 'reminder'

interface DeadlineReminderEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  deadline: string
  daysRemaining: number
  urgency: UrgencyLevel
  portalUrl?: string
  orderUrl?: string
}

const urgencyConfig: Record<UrgencyLevel, {
  icon: string
  title: string
  bannerBg: string
  bannerBorder: string
  badgeBg: string
  badgeColor: string
}> = {
  critical: {
    icon: '\u26A0\uFE0F',
    title: 'Urgent: Deadline Approaching',
    bannerBg: '#fef2f2',
    bannerBorder: '#fecaca',
    badgeBg: '#fee2e2',
    badgeColor: '#dc2626',
  },
  warning: {
    icon: '\u23F0',
    title: 'Deadline Reminder',
    bannerBg: '#fffbeb',
    bannerBorder: '#fde68a',
    badgeBg: '#fef3c7',
    badgeColor: '#d97706',
  },
  reminder: {
    icon: '\u{1F4C5}',
    title: 'Upcoming Deadline',
    bannerBg: '#eff6ff',
    bannerBorder: '#bfdbfe',
    badgeBg: '#dbeafe',
    badgeColor: '#2563eb',
  },
}

export function DeadlineReminderEmail({
  orderNumber = 'MG-20240115-ABC1',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  deadline = 'January 25, 2024',
  daysRemaining = 3,
  urgency = 'warning',
  portalUrl = 'https://motion-granted.com/dashboard',
  orderUrl = 'https://motion-granted.com/orders/123',
}: DeadlineReminderEmailProps) {
  const config = urgencyConfig[urgency]

  return (
    <Html>
      <Head />
      <Preview>{`${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} until deadline for ${orderNumber}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Urgency Banner */}
          <Section style={{
            ...urgencyBanner,
            backgroundColor: config.bannerBg,
            borderBottom: `1px solid ${config.bannerBorder}`,
          }}>
            <Text style={urgencyIcon}>{config.icon}</Text>
            <Heading style={urgencyTitle}>{config.title}</Heading>
            <div style={{
              ...urgencyBadge,
              backgroundColor: config.badgeBg,
              color: config.badgeColor,
            }}>
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
            </div>
          </Section>

          {/* Deadline Highlight */}
          <Section style={deadlineSection}>
            <Text style={deadlineLabel}>Deadline Date</Text>
            <Text style={deadlineDate}>{deadline}</Text>
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

          {/* Action Required */}
          <Section style={actionSection}>
            <Heading as="h2" style={sectionTitle}>
              Action Required
            </Heading>
            <Text style={actionText}>
              {urgency === 'critical'
                ? 'This order requires immediate attention. Please prioritize to ensure on-time delivery.'
                : urgency === 'warning'
                ? 'Please review this order to ensure it stays on track for delivery.'
                : 'This is a friendly reminder about an upcoming deadline.'}
            </Text>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              View Order
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

export default DeadlineReminderEmail

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

const urgencyBanner = {
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const urgencyIcon = {
  fontSize: '48px',
  margin: '0 0 16px 0',
}

const urgencyTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px 0',
}

const urgencyBadge = {
  display: 'inline-block',
  padding: '8px 16px',
  borderRadius: '20px',
  fontSize: '14px',
  fontWeight: '600',
}

const deadlineSection = {
  padding: '32px 24px',
  textAlign: 'center' as const,
  backgroundColor: '#f8fafc',
}

const deadlineLabel = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}

const deadlineDate = {
  color: '#0f172a',
  fontSize: '28px',
  fontWeight: '700',
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

const actionSection = {
  padding: '0 24px 32px 24px',
}

const actionText = {
  color: '#475569',
  fontSize: '14px',
  margin: '0',
  lineHeight: '1.6',
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
