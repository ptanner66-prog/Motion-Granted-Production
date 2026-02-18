/**
 * CP3 Delivery Email Template — D5 W5-3
 * Sent after admin APPROVE decision. Contains signed download URLs.
 * Attorney receives completed documents with expiry notice.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP3DeliveryProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  downloadUrls: Array<{ key: string; url: string }>;
  urlExpiryDays: number;
  dashboardUrl: string;
}

export default function CP3Delivery({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  downloadUrls = [],
  urlExpiryDays = 7,
  dashboardUrl = '#',
}: CP3DeliveryProps) {
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
              Your order <strong>{orderNumber}</strong> ({motionType}) has been
              approved and your documents are ready for download.
            </Text>
            <Text style={subheading}>Your Documents:</Text>
            {downloadUrls.map((file, i) => (
              <Text key={i} style={fileLink}>
                <Link href={file.url} style={downloadLink}>
                  {file.key.split('/').pop()}
                </Link>
              </Text>
            ))}
            <Text style={warningBox}>
              These download links expire in {urlExpiryDays} days. You can
              always re-download from your <Link href={dashboardUrl}>dashboard</Link>.
            </Text>
            <Text style={subheading}>Important Reminders:</Text>
            <Text style={paragraph}>
              All documents are prepared under your direction and supervision.
              Please review all work product before filing. Motion Granted
              provides drafting support only — final review responsibility
              rests with the filing attorney.
            </Text>
          </Section>
          <Hr style={divider} />
          <Section style={footerSection}>
            <Text style={footer}>Motion Granted | Legal Process Outsourcing</Text>
            <Text style={footer}>Questions? Reply to this email or contact support@motion-granted.com</Text>
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
const fileLink = { fontSize: '14px', margin: '4px 0', padding: '8px 12px', backgroundColor: '#f8f8f8', borderRadius: '4px' };
const downloadLink = { color: '#b8860b', textDecoration: 'underline' };
const warningBox = { backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#856404', margin: '12px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
