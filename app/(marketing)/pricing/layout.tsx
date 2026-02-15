import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Motion Granted',
  description:
    'Flat-fee pricing for court-ready motions. Tier A from $299, Tier B from $599, Tier C from $999, Tier D from $1,499. Louisiana attorneys get 15% off every tier.',
  openGraph: {
    title: 'Pricing — Motion Granted',
    description:
      'Flat-fee motion pricing with no hourly billing. Every order includes citation verification and one revision.',
    type: 'website',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
