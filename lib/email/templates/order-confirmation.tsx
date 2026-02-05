/**
 * Order Confirmation Email Template — MB-02
 * React Email template for order confirmation.
 * Used when Stripe payment succeeds.
 */

import * as React from 'react';

interface OrderConfirmationProps {
  orderNumber: string;
  motionType: string;
  jurisdiction: string;
  tier: string;
  estimatedTurnaround: string;
  dashboardLink: string;
}

export function OrderConfirmationEmail({
  orderNumber,
  motionType,
  jurisdiction,
  tier,
  estimatedTurnaround,
  dashboardLink,
}: OrderConfirmationProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#1a1a1a' }}>Order Confirmed</h1>
      <p>Thank you for your order with Motion Granted!</p>

      <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
        <h3 style={{ marginTop: 0 }}>Order Details</h3>
        <p><strong>Order Number:</strong> {orderNumber}</p>
        <p><strong>Motion Type:</strong> {motionType}</p>
        <p><strong>Jurisdiction:</strong> {jurisdiction}</p>
        <p><strong>Tier:</strong> {tier}</p>
        <p><strong>Estimated Turnaround:</strong> {estimatedTurnaround}</p>
      </div>

      <p>
        <a
          href={dashboardLink}
          style={{ display: 'inline-block', background: '#0066cc', color: 'white', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none' }}
        >
          View Dashboard
        </a>
      </p>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '30px 0' }} />
      <p style={{ fontSize: '12px', color: '#666' }}>
        Questions? Contact support@motiongranted.com
      </p>
    </div>
  );
}

export default OrderConfirmationEmail;
