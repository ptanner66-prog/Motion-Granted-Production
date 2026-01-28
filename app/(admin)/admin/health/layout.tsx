import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Health | Admin',
  description: 'Monitor system health, queue status, and performance metrics',
};

export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
