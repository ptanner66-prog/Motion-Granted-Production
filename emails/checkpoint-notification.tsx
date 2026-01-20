/**
 * Checkpoint Notification Email Template
 *
 * v6.3: Unified template for all three checkpoint notifications (CP1, CP2, CP3)
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

type CheckpointType = 'CP1' | 'CP2' | 'CP3';

interface CheckpointNotificationEmailProps {
  orderNumber: string
  motionType: string
  caseCaption: string
  checkpoint: CheckpointType
  grade?: string
  gradeNumeric?: number
  passed?: boolean
  portalUrl?: string
  orderUrl?: string
}

const CHECKPOINT_CONFIG = {
  CP1: {
    title: 'Research Review Required',
    subtitle: 'Please review the research strategy for your motion',
    description: 'We have completed the initial research phase for your motion. Before we proceed with drafting, please review the research direction to ensure it aligns with your case strategy.',
    buttonText: 'Review Research',
    icon: '📋',
    bannerColor: '#fef3c7', // yellow
    borderColor: '#fcd34d',
  },
  CP2: {
    title: 'Your Draft is Ready for Review',
    subtitle: 'Please approve or request revisions',
    description: 'Your motion draft has been completed and reviewed by our AI judge simulation. Please review the draft and either approve it for final assembly or request any revisions.',
    buttonText: 'Review Draft',
    icon: '📄',
    bannerColor: '#dbeafe', // blue
    borderColor: '#60a5fa',
  },
  CP3: {
    title: 'Your Filing Package is Ready',
    subtitle: 'Download your complete motion package',
    description: 'Great news! Your complete filing package is ready for download. This includes your motion, supporting documents, proposed order, and proof of service.',
    buttonText: 'Download Package',
    icon: '✅',
    bannerColor: '#d1fae5', // green
    borderColor: '#34d399',
  },
};

export function CheckpointNotificationEmail({
  orderNumber = 'MG-2026-00123',
  motionType = 'Motion for Summary Judgment',
  caseCaption = 'Smith v. Jones',
  checkpoint = 'CP1',
  grade,
  gradeNumeric,
  passed,
  portalUrl = 'https://motiongranted.com/dashboard',
  orderUrl = 'https://motiongranted.com/orders/123',
}: CheckpointNotificationEmailProps) {
  const config = CHECKPOINT_CONFIG[checkpoint];

  return (
    <Html>
      <Head />
      <Preview>Action Required: {config.title} - {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Motion Granted</Heading>
          </Section>

          {/* Checkpoint Banner */}
          <Section style={{
            ...checkpointBanner,
            backgroundColor: config.bannerColor,
            borderBottom: `2px solid ${config.borderColor}`,
          }}>
            <Text style={checkpointIcon}>{config.icon}</Text>
            <Text style={checkpointLabel}>
              Checkpoint {checkpoint.replace('CP', '')} of 3
            </Text>
            <Heading style={checkpointTitle}>{config.title}</Heading>
            <Text style={checkpointSubtitle}>{config.subtitle}</Text>
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
                {/* CP2: Show grade if available */}
                {checkpoint === 'CP2' && grade && (
                  <tr>
                    <td style={detailLabel}>Quality Grade</td>
                    <td style={{
                      ...detailValue,
                      color: passed ? '#059669' : '#d97706',
                      fontWeight: '600'
                    }}>
                      {grade} ({Math.round((gradeNumeric || 0) * 100)}%)
                      {passed ? ' - Passed' : ' - Needs Review'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Description */}
          <Section style={descriptionSection}>
            <Text style={descriptionText}>{config.description}</Text>
          </Section>

          {/* CTA Button */}
          <Section style={ctaSection}>
            <Button style={button} href={orderUrl}>
              {config.buttonText}
            </Button>
          </Section>

          {/* Checkpoint-specific info */}
          {checkpoint === 'CP2' && (
            <>
              <Hr style={divider} />
              <Section style={infoSection}>
                <Heading as="h2" style={sectionTitle}>Your Options</Heading>
                <div style={optionBox}>
                  <Text style={optionTitle}>Approve Draft</Text>
                  <Text style={optionDescription}>
                    If you're satisfied with the draft, approve it to proceed with final assembly
                    and supporting document generation.
                  </Text>
                </div>
                <div style={optionBox}>
                  <Text style={optionTitle}>Request Revisions</Text>
                  <Text style={optionDescription}>
                    Your first revision is free. Additional revisions may incur a fee based on
                    motion complexity.
                  </Text>
                </div>
              </Section>
            </>
          )}

          {checkpoint === 'CP3' && (
            <>
              <Hr style={divider} />
              <Section style={infoSection}>
                <Heading as="h2" style={sectionTitle}>Package Contents</Heading>
                <ul style={packageList}>
                  <li style={packageItem}>Complete motion document (.docx)</li>
                  <li style={packageItem}>Proposed order</li>
                  <li style={packageItem}>Certificate/proof of service</li>
                  <li style={packageItem}>Supporting declarations (if applicable)</li>
                  <li style={packageItem}>Separate statement (for MSJ)</li>
                </ul>
              </Section>
            </>
          )}

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
              Motion Granted is not a law firm. All work product requires attorney review
              before filing. As the supervising attorney, you are responsible for
              verifying all content.
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

export default CheckpointNotificationEmail

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

const checkpointBanner = {
  padding: '32px 24px',
  textAlign: 'center' as const,
}

const checkpointIcon = {
  fontSize: '48px',
  margin: '0 0 8px 0',
}

const checkpointLabel = {
  color: '#64748b',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 8px 0',
}

const checkpointTitle = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 8px 0',
}

const checkpointSubtitle = {
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

const descriptionSection = {
  padding: '0 24px 24px 24px',
}

const descriptionText = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.6',
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

const divider = {
  borderColor: '#e2e8f0',
  margin: '0',
}

const infoSection = {
  padding: '32px 24px',
}

const optionBox = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
}

const optionTitle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px 0',
}

const optionDescription = {
  color: '#64748b',
  fontSize: '13px',
  margin: '0',
  lineHeight: '1.5',
}

const packageList = {
  margin: '0',
  paddingLeft: '20px',
}

const packageItem = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '1.8',
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
