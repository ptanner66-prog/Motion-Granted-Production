/**
 * HOLD Notification Email Template — MB-02
 * React Email template for Phase III HOLD.
 */

import * as React from 'react';

interface HoldNotificationProps {
  orderNumber: string;
  holdReason: string;
  missingItems: string[];
  provideLink: string;
  acknowledgeLink: string;
  cancelLink: string;
}

export function HoldNotificationEmail({
  orderNumber,
  holdReason,
  missingItems,
  provideLink,
  acknowledgeLink,
  cancelLink,
}: HoldNotificationProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#cc6600' }}>Action Required — Order On Hold</h1>
      <p>Your order <strong>{orderNumber}</strong> has been placed on hold pending your response.</p>

      <div style={{ background: '#fff3e0', padding: '20px', borderRadius: '8px', margin: '20px 0', borderLeft: '4px solid #cc6600' }}>
        <h3 style={{ marginTop: 0, color: '#cc6600' }}>Reason for Hold</h3>
        <p>{holdReason}</p>
      </div>

      {missingItems.length > 0 && (
        <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
          <h3 style={{ marginTop: 0 }}>Missing Items</h3>
          <ul>
            {missingItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Your Options:</h3>
      <div style={{ margin: '20px 0' }}>
        <a href={provideLink} style={{ display: 'inline-block', background: '#00aa00', color: 'white', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', marginRight: '10px' }}>
          Provide Evidence
        </a>
        <a href={acknowledgeLink} style={{ display: 'inline-block', background: '#0066cc', color: 'white', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', marginRight: '10px' }}>
          Acknowledge &amp; Proceed
        </a>
        <a href={cancelLink} style={{ display: 'inline-block', background: '#cc0000', color: 'white', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none' }}>
          Cancel Order
        </a>
      </div>

      <p style={{ color: '#666', fontSize: '14px' }}>
        If no response within 7 days, your order will be automatically cancelled and refunded.
      </p>
    </div>
  );
}

export default HoldNotificationEmail;
