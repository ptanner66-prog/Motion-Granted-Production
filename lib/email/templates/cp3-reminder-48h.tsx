/**
 * CP3 48-Hour Reminder Email Template — D5 W5-4
 * T+48h gentle nudge. Documents awaiting attorney review.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP3Reminder48hProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  dashboardUrl: string;
}

export default function CP3Reminder48h({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  dashboardUrl = '#',
}: CP3Reminder48hProps) {
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
            <Text style={paragraph}>
              Just a reminder that your documents for order{' '}
              <strong>{orderNumber}</strong> ({motionType}) are ready for your
              review.
            </Text>
            <Text style={paragraph}>
              Your completed filing package is waiting in your dashboard.
              Please take a moment to review and approve your documents so
              we can finalize delivery.
            </Text>
            <Link href={dashboardUrl} style={button}>
              Review Your Documents
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
const paragraph = { fontSize: '14px', color: '#555', lineHeight: '1.6' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
