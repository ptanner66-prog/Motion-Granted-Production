/**
 * CP3 Cancellation (Attorney-Initiated) Email Template — D5 W5-3
 * Sent when attorney cancels at CP3. Confirms 50% refund.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface CP3CancellationProps {
  attorneyName: string;
  orderNumber: string;
  motionType: string;
  refundAmountCents: number;
  dashboardUrl: string;
}

export default function CP3CancellationCP3Cancel({
  attorneyName = 'Counselor',
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  refundAmountCents = 0,
  dashboardUrl = '#',
}: CP3CancellationProps) {
  const refundFormatted = (refundAmountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

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
              cancelled per your request.
            </Text>
            <Text style={subheading}>Refund Details:</Text>
            <Text style={detailBox}>
              A 50% refund of <strong>{refundFormatted}</strong> will be processed
              to your original payment method. Please allow 5–10 business days
              for the refund to appear on your statement.
            </Text>
            <Text style={paragraph}>
              If you have any questions about your refund or would like to
              resubmit your order in the future, please don&apos;t hesitate to
              contact us.
            </Text>
            <Link href={dashboardUrl} style={button}>
              View Order History
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
const subheading = { fontSize: '15px', fontWeight: 'bold', color: '#333', margin: '16px 0 8px 0' };
const detailBox = { backgroundColor: '#f8f8f8', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', color: '#444', margin: '8px 0 16px 0', lineHeight: '1.8' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
