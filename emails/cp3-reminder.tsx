/**
 * CP3 Reminder Email Template — SP-21 Group 5
 *
 * Multi-purpose reminder template for CP3 checkpoint.
 * Supports 48h gentle nudge and 14d urgent final notice.
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

type ReminderType = '48h' | '14d'

interface CP3ReminderEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  dashboardUrl: string
  reminderType: ReminderType
  autoCancelDate?: string
}

const REMINDER_CONFIG: Record<ReminderType, {
  previewPrefix: string
  bannerBg: string
  bannerBorder: string
  bannerTitle: string
  bannerTitleColor: string
  buttonBg: string
  buttonColor: string
  buttonText: string
}> = {
  '48h': {
    previewPrefix: 'Reminder',
    bannerBg: '#fef3c7',
    bannerBorder: '#fcd34d',
    bannerTitle: 'Friendly Reminder',
    bannerTitleColor: '#92400e',
    buttonBg: '#00d4aa',
    buttonColor: '#0f172a',
    buttonText: 'Review Your Documents',
  },
  '14d': {
    previewPrefix: 'URGENT',
    bannerBg: '#fef2f2',
    bannerBorder: '#dc3545',
    bannerTitle: 'Final Notice — Action Required Within 7 Days',
    bannerTitleColor: '#991b1b',
    buttonBg: '#dc3545',
    buttonColor: '#ffffff',
    buttonText: 'Take Action Now',
  },
}

export function CP3ReminderEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  dashboardUrl = 'https://motiongranted.com/dashboard/orders/123',
  reminderType = '48h',
  autoCancelDate,
}: CP3ReminderEmailProps) {
  const config = REMINDER_CONFIG[reminderType]
  const isUrgent = reminderType === '14d'

  return (
    <Html>
      <Head />
      <Preview>
        {config.previewPrefix}: Your {motionType} is awaiting review — {orderNumber}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Banner */}
          <Section style={{
            ...banner,
            backgroundColor: config.bannerBg,
            borderBottom: `2px solid ${config.bannerBorder}`,
          }}>
            <Heading style={{
              ...bannerTitle,
              color: config.bannerTitleColor,
            }}>
              {config.bannerTitle}
            </Heading>
            <Text style={bannerSubtitle}>
              Order {orderNumber} requires your attention
            </Text>
          </Section>

          {/* Order Details */}
          <Section style={detailsSection}>
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

          {/* 48h content */}
          {!isUrgent && (
            <Section style={contentSection}>
              <Text style={paragraph}>
                Just a reminder that your documents for order{' '}
                <strong>{orderNumber}</strong> ({motionType}) are ready for your
                review. Your completed filing package is waiting in your dashboard.
              </Text>
              <Text style={paragraph}>
                Please take a moment to review and approve your documents, request
                any changes, or contact us with questions.
              </Text>
            </Section>
          )}

          {/* 14d urgent content */}
          {isUrgent && (
            <Section style={contentSection}>
              <Text style={paragraph}>
                Your order <strong>{orderNumber}</strong> ({motionType}) has been
                awaiting your review for 14 days. This is your final notice
                before automatic cancellation.
              </Text>
              {autoCancelDate && (
                <div style={criticalWarning}>
                  <Text style={criticalText}>
                    If no action is taken by <strong>{autoCancelDate}</strong>,
                    your order will be automatically cancelled and a 50% refund
                    will be issued to your original payment method.
                  </Text>
                </div>
              )}
              <Heading as="h2" style={sectionTitle}>Your Options</Heading>
              <Text style={paragraph}>
                1. <strong>Approve</strong> — Accept the documents for delivery{'\n'}
                2. <strong>Request Changes</strong> — Submit revision notes for rework{'\n'}
                3. <strong>Cancel</strong> — Cancel the order and receive a 50% refund
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={{
              ...buttonBase,
              backgroundColor: config.buttonBg,
              color: config.buttonColor,
            }} href={dashboardUrl}>
              {config.buttonText}
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
              Motion Granted is not a law firm. All work product requires attorney
              review before filing.
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

export default CP3ReminderEmail

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
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const bannerTitle = {
  fontSize: '22px',
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
  margin: '0 0 16px 0',
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
  margin: '0 0 12px 0',
}

const criticalWarning = {
  backgroundColor: '#fff3cd',
  border: '2px solid #ffc107',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
}

const criticalText = {
  color: '#856404',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0',
}

const ctaSection = {
  padding: '0 24px 32px 24px',
  textAlign: 'center' as const,
}

const buttonBase = {
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

const footerDisclaimer = {
  color: '#94a3b8',
  fontSize: '12px',
  margin: '0 0 16px 0',
  lineHeight: '1.5',
}

const footerCopyright = { color: '#94a3b8', fontSize: '12px', margin: '0' }
