/**
 * HOLD Notification Email Template — D5 W5-2
 * Initial HOLD notification with evidence gap details and magic link.
 * Sent when Phase III HOLD checkpoint triggers.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface HoldNotificationProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  holdReason: string;
  evidenceGapDetails: string;
  magicLinkUrl: string;
  dashboardUrl: string;
}

export default function HoldNotification({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  holdReason = 'Additional information needed',
  evidenceGapDetails = 'Please provide the required documentation.',
  magicLinkUrl = '#',
  dashboardUrl = '#',
}: HoldNotificationProps) {
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
              Your order <strong>{orderNumber}</strong> ({motionType}) has been placed
              on <strong>HOLD</strong> pending additional information from you.
            </Text>
            <Text style={subheading}>What We Need:</Text>
            <Text style={paragraph}>{holdReason}</Text>
            <Text style={detailBox}>{evidenceGapDetails}</Text>
            <Text style={paragraph}>
              Please respond at your earliest convenience so we can continue
              drafting your motion.
            </Text>
            <Link href={magicLinkUrl} style={button}>
              Respond to Hold Request
            </Link>
            <Text style={smallText}>
              Or view your order on the <Link href={dashboardUrl}>dashboard</Link>.
            </Text>
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
const subheading = { fontSize: '15px', fontWeight: 'bold', color: '#333', margin: '16px 0 8px 0' };
const detailBox = { backgroundColor: '#fff8e7', border: '1px solid #f0d060', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', color: '#444', margin: '8px 0 16px 0' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const smallText = { fontSize: '12px', color: '#999' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
