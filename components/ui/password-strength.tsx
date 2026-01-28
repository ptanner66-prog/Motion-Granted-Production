// /components/ui/password-strength.tsx
// Password strength indicator component
// VERSION: 1.0 — January 28, 2026

'use client';

import { useMemo } from 'react';
import { getPasswordStrength, getStrengthLabel } from '@/lib/auth/password-validation';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const label = getStrengthLabel(strength.score);

  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];
  const color = colors[strength.score] || colors[0];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= strength.score ? color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <p className={`text-sm ${strength.score < 2 ? 'text-red-600' : strength.score < 4 ? 'text-yellow-600' : 'text-green-600'}`}>
        {label}
      </p>

      {/* Requirements checklist */}
      <ul className="text-xs space-y-1 text-gray-500">
        <li className={strength.hasMinLength ? 'text-green-600' : ''}>
          {strength.hasMinLength ? '✓' : '○'} At least 12 characters
        </li>
        <li className={strength.hasUppercase ? 'text-green-600' : ''}>
          {strength.hasUppercase ? '✓' : '○'} Uppercase letter
        </li>
        <li className={strength.hasLowercase ? 'text-green-600' : ''}>
          {strength.hasLowercase ? '✓' : '○'} Lowercase letter
        </li>
        <li className={strength.hasNumber ? 'text-green-600' : ''}>
          {strength.hasNumber ? '✓' : '○'} Number
        </li>
        <li className={strength.hasSpecial ? 'text-green-600' : ''}>
          {strength.hasSpecial ? '✓' : '○'} Special character
        </li>
      </ul>
    </div>
  );
}
