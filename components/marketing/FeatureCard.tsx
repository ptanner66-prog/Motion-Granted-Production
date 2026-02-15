import { type LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="feature-card">
      <div className="feature-card-icon">
        <Icon className="w-[22px] h-[22px]" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
