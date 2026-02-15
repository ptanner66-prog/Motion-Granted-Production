interface SectionHeaderProps {
  label?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}

export function SectionHeader({ label, title, subtitle, center = false }: SectionHeaderProps) {
  return (
    <div className={center ? 'section-header-center' : ''}>
      {label && <div className="section-label">{label}</div>}
      <h2 className="section-title" dangerouslySetInnerHTML={{ __html: title }} />
      {subtitle && <p className="section-subtitle">{subtitle}</p>}
    </div>
  );
}
