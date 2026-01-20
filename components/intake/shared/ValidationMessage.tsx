/**
 * Validation Message Component
 *
 * v6.3: Display form validation errors.
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { FieldError } from 'react-hook-form';

interface ValidationMessageProps {
  error?: FieldError | { message?: string };
  message?: string;
}

export function ValidationMessage({ error, message }: ValidationMessageProps) {
  const errorMessage = message || error?.message;

  if (!errorMessage) return null;

  return (
    <p className="mt-1 text-sm text-red-600 flex items-center">
      <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
      {errorMessage}
    </p>
  );
}

export default ValidationMessage;
