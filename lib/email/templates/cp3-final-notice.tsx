/**
 * CP3 Final Notice Email Template — D5 W5-4
 * T+14d URGENT final notice. Bold/highlighted warning text.
 * Explicitly states auto-cancel date and 50% refund.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP3FinalNoticeProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  autoCancelDate: string;
  dashboardUrl: string;
}

export default function CP3FinalNotice({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  autoCancelDate = '',
  dashboardUrl = '#',
}: CP3FinalNoticeProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Text style={headerText}>MG</Text>
            <Text style={headerSubtext}>MOTION GRANTED</Text>
          </Section>
          <Hr style={divider} />
          <Section style={contentSection}>
            <Text style={greeting}>Dear {attorneyName},</Text>
            <Text style={urgentBanner}>
              FINAL NOTICE — Action Required Within 7 Days
            </Text>
            <Text style={paragraph}>
              Your order <strong>{orderNumber}</strong> ({motionType}) has been
              awaiting your review for 14 days. This is your final notice
              before automatic cancellation.
            </Text>
            <Text style={criticalWarning}>
              If no action is taken by <strong>{autoCancelDate}</strong>, your
              order will be automatically cancelled and a 50% refund will be
              issued to your original payment method.
            </Text>
            <Text style={subheading}>Your Options:</Text>
            <Text style={paragraph}>
              1. <strong>Approve</strong> — Accept the documents for delivery<br />
              2. <strong>Request Changes</strong> — Submit revision notes for rework<br />
              3. <strong>Cancel</strong> — Cancel the order and receive a 50% refund
            </Text>
            <Text style={paragraph}>
              Please take action before the deadline to avoid automatic
              cancellation.
            </Text>
            <Link href={dashboardUrl} style={urgentButton}>
              Take Action Now
            </Link>
          </Section>
          <Hr style={divider} />
          <Section style={footerSection}>
            <Text style={footer}>Motion Granted | Legal Process Outsourcing</Text>
            <Text style={footer}>Questions? Reply to this email or contact support@motiongranted.com</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '20px', maxWidth: '600px', borderRadius: '8px' };
const headerSection = { textAlign: 'center' as const, padding: '20px 0' };
const headerText = { fontSize: '28px', fontWeight: 'bold', color: '#b8860b', margin: '0' };
const headerSubtext = { fontSize: '12px', letterSpacing: '3px', color: '#666', margin: '4px 0 0 0' };
const divider = { borderColor: '#e6e6e6', margin: '20px 0' };
const contentSection = { padding: '0 20px' };
const greeting = { fontSize: '16px', color: '#333' };
const urgentBanner = { backgroundColor: '#f8d7da', border: '2px solid #dc3545', borderRadius: '6px', padding: '14px 16px', fontSize: '16px', fontWeight: 'bold', color: '#721c24', margin: '8px 0 16px 0', textAlign: 'center' as const };
const paragraph = { fontSize: '14px', color: '#555', lineHeight: '1.6' };
const subheading = { fontSize: '15px', fontWeight: 'bold', color: '#333', margin: '16px 0 8px 0' };
const criticalWarning = { backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: '6px', padding: '14px 16px', fontSize: '14px', color: '#856404', margin: '12px 0', lineHeight: '1.6' };
const urgentButton = { backgroundColor: '#dc3545', color: '#ffffff', padding: '14px 28px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '15px', fontWeight: 'bold', margin: '16px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
