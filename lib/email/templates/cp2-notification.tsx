/**
 * CP2 Notification Email Template — D5 W5-1
 * Non-blocking notification for Phase VII (Quality Review Passed).
 * Workflow continues without waiting for attorney response.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP2NotificationProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  tier: string;
  dashboardUrl: string;
}

export default function CP2Notification({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  tier = 'B',
  dashboardUrl = '#',
}: CP2NotificationProps) {
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
              Great news — your order <strong>{orderNumber}</strong> ({motionType}) has
              passed our internal quality review, including judge simulation scoring.
              Final formatting and assembly are now underway.
            </Text>
            <Text style={paragraph}>
              <strong>Current Status:</strong> Quality Review Passed — Final Assembly
            </Text>
            <Text style={paragraph}>
              Your completed documents will be ready for your review shortly.
              You will receive a notification with download access once ready.
            </Text>
            <Link href={dashboardUrl} style={button}>
              View Order Status
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
