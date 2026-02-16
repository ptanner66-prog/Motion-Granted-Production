/**
 * HOLD Admin Escalation 7-Day Email Template — D5 W5-2
 * Sent to ADMIN (not attorney) after 7 days with no attorney response.
 * Internal alert requiring manual intervention.
 */

import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface HoldAdminEscalation7dProps {
  orderNumber: string;
  motionType: string;
  attorneyName: string;
  attorneyEmail: string;
  holdReason: string;
  holdCreatedAt: string;
  dashboardUrl: string;
}

export default function HoldAdminEscalation7d({
  orderNumber = 'MG-000000',
  motionType = 'Motion',
  attorneyName = 'Unknown',
  attorneyEmail = 'unknown@example.com',
  holdReason = 'Additional information needed',
  holdCreatedAt = new Date().toISOString(),
  dashboardUrl = '#',
}: HoldAdminEscalation7dProps) {
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
            <Text style={adminBanner}>
              ADMIN ALERT — HOLD Unresolved After 7 Days
            </Text>
            <Text style={paragraph}>
              Order <strong>{orderNumber}</strong> ({motionType}) has been on
              <strong> HOLD</strong> for 7 days with no attorney response.
              Manual intervention required.
            </Text>
            <Text style={subheading}>Order Details:</Text>
            <Text style={detailBox}>
              <strong>Order:</strong> {orderNumber}<br />
              <strong>Motion Type:</strong> {motionType}<br />
              <strong>Attorney:</strong> {attorneyName} ({attorneyEmail})<br />
              <strong>Hold Reason:</strong> {holdReason}<br />
              <strong>Hold Since:</strong> {holdCreatedAt}
            </Text>
            <Text style={subheading}>Recommended Actions:</Text>
            <Text style={paragraph}>
              1. Contact the attorney directly via phone<br />
              2. If unreachable, consider cancelling the order with 50% refund<br />
              3. Document all contact attempts in the order notes
            </Text>
            <Link href={dashboardUrl} style={button}>
              View Order in Admin Dashboard
            </Link>
          </Section>
          <Hr style={divider} />
          <Section style={footerSection}>
            <Text style={footer}>Motion Granted | Internal Admin Notification</Text>
            <Text style={footer}>This is an automated alert. Do not forward to clients.</Text>
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
const adminBanner = { backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '12px 16px', fontSize: '15px', fontWeight: 'bold', color: '#721c24', margin: '8px 0 16px 0', textAlign: 'center' as const };
const paragraph = { fontSize: '14px', color: '#555', lineHeight: '1.6' };
const subheading = { fontSize: '15px', fontWeight: 'bold', color: '#333', margin: '16px 0 8px 0' };
const detailBox = { backgroundColor: '#f8f8f8', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '12px 16px', fontSize: '14px', color: '#444', margin: '8px 0 16px 0', lineHeight: '1.8' };
const button = { backgroundColor: '#b8860b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', display: 'inline-block', fontSize: '14px', fontWeight: 'bold', margin: '16px 0' };
const footerSection = { padding: '0 20px' };
const footer = { fontSize: '12px', color: '#999', textAlign: 'center' as const };
