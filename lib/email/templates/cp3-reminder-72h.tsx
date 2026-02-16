/**
 * CP3 72-Hour Reminder Email Template — D5 W5-4
 * T+72h slightly more urgent. Documents awaiting review for 3 days.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP3Reminder72hProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  dashboardUrl: string;
}

export default function CP3Reminder72h({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  dashboardUrl = '#',
}: CP3Reminder72hProps) {
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
            <Text style={noticeBanner}>
              Your documents have been awaiting review for 3 days
            </Text>
            <Text style={paragraph}>
              Your order <strong>{orderNumber}</strong> ({motionType}) is still
              pending your review. Your completed documents have been ready since
              3 days ago.
            </Text>
            <Text style={paragraph}>
              Please log in to your dashboard to review and approve your
              documents, request changes, or contact us if you have any
              questions.
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
const noticeBanner = { backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: '#856404', margin: '8px 0 16px 0', textAlign: 'center' as const };
const paragraph = { fontSize: '14px', color: '#555', lineHeight: '1.6' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
