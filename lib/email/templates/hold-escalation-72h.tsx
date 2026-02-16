/**
 * HOLD Escalation 72h Email Template — D5 W5-2
 * Sent 72 hours after initial HOLD notification.
 * More urgent tone — attorney has not responded in 3 days.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface HoldEscalation72hProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  holdReason: string;
  evidenceGapDetails: string;
  magicLinkUrl: string;
  dashboardUrl: string;
}

export default function HoldEscalation72h({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  holdReason = 'Additional information needed',
  evidenceGapDetails = 'Please provide the required documentation.',
  magicLinkUrl = '#',
  dashboardUrl = '#',
}: HoldEscalation72hProps) {
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
              ACTION REQUIRED — Your order has been on hold for 3 days
            </Text>
            <Text style={paragraph}>
              Your order <strong>{orderNumber}</strong> ({motionType}) has been on
              <strong> HOLD</strong> for 72 hours. If we don&apos;t hear from you soon,
              we may need to escalate this matter.
            </Text>
            <Text style={subheading}>Outstanding Request:</Text>
            <Text style={paragraph}>{holdReason}</Text>
            <Text style={detailBox}>{evidenceGapDetails}</Text>
            <Text style={paragraph}>
              Please respond as soon as possible to avoid further delays
              in processing your motion.
            </Text>
            <Link href={magicLinkUrl} style={button}>
              Respond Now
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
const urgentBanner = { backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: '#856404', margin: '8px 0 16px 0', textAlign: 'center' as const };
const paragraph = { fontSize: '14px', color: '#555', lineHeight: '1.6' };
const subheading = { fontSize: '15px', fontWeight: 'bold', color: '#333', margin: '16px 0 8px 0' };
const detailBox = { backgroundColor: '#fff8e7', border: '1px solid #f0d060', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', color: '#444', margin: '8px 0 16px 0' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const smallText = { fontSize: '12px', color: '#999' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
