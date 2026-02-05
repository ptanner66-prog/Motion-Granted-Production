/**
 * Payment Confirmation Email Template — MB-02
 * React Email template for Stripe payment success.
 */

import * as React from 'react';

interface PaymentConfirmationProps {
  orderNumber: string;
  amountFormatted: string;
  receiptLink?: string;
  dashboardLink: string;
}

export function PaymentConfirmationEmail({
  orderNumber,
  amountFormatted,
  receiptLink,
  dashboardLink,
}: PaymentConfirmationProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#1a1a1a' }}>Payment Confirmed</h1>
      <p>We have received your payment for order <strong>{orderNumber}</strong>.</p>

      <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
        <h3 style={{ marginTop: 0 }}>Payment Details</h3>
        <p><strong>Amount:</strong> {amountFormatted}</p>
        <p><strong>Order ID:</strong> {orderNumber}</p>
        <p><strong>Status:</strong> Confirmed</p>
      </div>

      {receiptLink && <p><a href={receiptLink}>View Stripe Receipt</a></p>}

      <p>Your order is now being processed.</p>

      <p>
        <a href={dashboardLink} style={{ display: 'inline-block', background: '#0066cc', color: 'white', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none' }}>
          View Dashboard
        </a>
      </p>
    </div>
  );
}

export default PaymentConfirmationEmail;
