/**
 * CP3 Review Email Template — MB-02
 * React Email template for Phase X completion / CP3 checkpoint.
 */

import * as React from 'react';

interface CP3ReviewProps {
  orderNumber: string;
  reviewLink: string;
  documents: string[];
}

export function CP3ReviewEmail({ orderNumber, reviewLink, documents }: CP3ReviewProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#00aa00' }}>Filing Package Ready for Review</h1>
      <p>Your filing package for order <strong>{orderNumber}</strong> is ready for your review.</p>

      <div style={{ background: '#e8f8e8', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
        <h3 style={{ marginTop: 0, color: '#00aa00' }}>Documents in Package</h3>
        <ul>
          {documents.map((doc, i) => (
            <li key={i}>{doc}</li>
          ))}
        </ul>
      </div>

      <p>
        <a href={reviewLink} style={{ display: 'inline-block', background: '#00aa00', color: 'white', padding: '16px 32px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold' }}>
          Review &amp; Approve
        </a>
      </p>

      <div style={{ background: '#fffde7', padding: '15px', borderRadius: '8px', margin: '20px 0', border: '1px solid #ffd54f' }}>
        <p style={{ margin: 0, color: '#856404' }}>
          <strong>Important:</strong> Documents will not be delivered until you explicitly approve them.
        </p>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '30px 0' }} />
      <p style={{ fontSize: '12px', color: '#666' }}>
        This document was generated with AI assistance. Attorney review is required before filing.
      </p>
    </div>
  );
}

export default CP3ReviewEmail;
