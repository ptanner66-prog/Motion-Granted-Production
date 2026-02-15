import { Shield, Clock, Lock, CheckCircle } from 'lucide-react';

const trustItems = [
  {
    icon: Shield,
    title: 'Every Citation Verified',
    subtitle: 'Against primary sources',
  },
  {
    icon: Clock,
    title: '3-Day Standard Delivery',
    subtitle: '24hr & 48hr rush available',
  },
  {
    icon: Lock,
    title: 'Data Isolated & Encrypted',
    subtitle: 'Attorney-client privilege preserved',
  },
  {
    icon: CheckCircle,
    title: 'ABA Opinion 512 Ready',
    subtitle: 'AI disclosure included',
  },
];

export function TrustBar() {
  return (
    <div className="trust-bar">
      <div className="trust-bar-inner">
        {trustItems.map((item) => (
          <div key={item.title} className="trust-item">
            <div className="trust-icon">
              <item.icon className="w-[22px] h-[22px]" />
            </div>
            <div className="trust-text">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
