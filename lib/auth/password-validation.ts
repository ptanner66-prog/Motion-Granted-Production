// /lib/auth/password-validation.ts
// Password validation per SECURITY_IMPLEMENTATION_CHECKLIST_v1 Section 2.1
// VERSION: 1.0 — January 28, 2026

/**
 * Password requirements:
 * - Minimum 12 characters
 * - Mix of character types OR high entropy
 * - Not in common password list
 */

// Top 1000 common passwords (abbreviated - expand in production)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'abc123', 'monkey', 'master', 'dragon', 'letmein', 'login',
  'welcome', 'admin', 'passw0rd', 'shadow', 'sunshine', 'princess',
  'football', 'baseball', 'iloveyou', 'trustno1', 'superman', 'batman',
  'starwars', 'whatever', 'cheese', 'computer', 'pepper', 'ginger',
  // Add more in production
]);

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4
  errors: string[];
  suggestions: string[];
}

export interface PasswordStrength {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isCommon: boolean;
  score: number;
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // Check minimum length
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  // Check character types
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const typeCount = [hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;

  if (typeCount < 3) {
    errors.push('Password must contain at least 3 of: uppercase, lowercase, numbers, special characters');
    if (!hasUppercase) suggestions.push('Add uppercase letters');
    if (!hasLowercase) suggestions.push('Add lowercase letters');
    if (!hasNumber) suggestions.push('Add numbers');
    if (!hasSpecial) suggestions.push('Add special characters (!@#$%^&*)');
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common');
    suggestions.push('Choose a more unique password');
  }

  // Check for sequential characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password contains repeated characters');
    suggestions.push('Avoid repeating characters (e.g., "aaa")');
  }

  // Check for sequential numbers or letters
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
    suggestions.push('Avoid sequential characters (e.g., "abc", "123")');
  }

  // Calculate score (0-4)
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (typeCount >= 3) score++;
  if (typeCount >= 4 && password.length >= 14) score++;

  return {
    valid: errors.length === 0,
    score,
    errors,
    suggestions,
  };
}

/**
 * Get password strength details
 */
export function getPasswordStrength(password: string): PasswordStrength {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const isCommon = COMMON_PASSWORDS.has(password.toLowerCase());

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (hasUppercase && hasLowercase) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;
  if (!isCommon) score++;

  // Normalize to 0-4
  score = Math.min(4, Math.floor(score / 2));

  return {
    hasMinLength: password.length >= 12,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    isCommon,
    score,
  };
}

/**
 * Get human-readable strength label
 */
export function getStrengthLabel(score: number): string {
  switch (score) {
    case 0: return 'Very Weak';
    case 1: return 'Weak';
    case 2: return 'Fair';
    case 3: return 'Strong';
    case 4: return 'Very Strong';
    default: return 'Unknown';
  }
}
