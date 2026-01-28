/**
 * Form Section Component
 *
 * v6.3: Container for form sections with consistent styling.
 */

import React from 'react';

interface FormSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ children, className = '' }: FormSectionProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children}
    </div>
  );
}

export default FormSection;
