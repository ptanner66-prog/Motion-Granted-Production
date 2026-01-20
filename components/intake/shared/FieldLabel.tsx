/**
 * Field Label Component
 *
 * v6.3: Label with optional required indicator and tooltip.
 */

'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';

interface FieldLabelProps {
  htmlFor?: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}

export function FieldLabel({
  htmlFor,
  required,
  tooltip,
  children,
}: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-gray-700"
    >
      <span className="flex items-center">
        {children}
        {required && <span className="text-red-500 ml-1">*</span>}
        {tooltip && (
          <span className="relative ml-1 group">
            <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
              {tooltip}
            </span>
          </span>
        )}
      </span>
    </label>
  );
}

export default FieldLabel;
