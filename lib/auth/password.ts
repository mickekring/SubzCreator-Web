/**
 * Password hashing and validation utilities using bcrypt
 * Separate file to avoid Edge runtime issues (bcrypt requires Node.js)
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Password requirements for strong password policy
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

/**
 * Validate password strength
 * Returns null if valid, or an error message if invalid
 */
export function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    return `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`;
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  if (PASSWORD_REQUIREMENTS.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)';
  }

  return null;
}

/**
 * Get password requirements as a user-friendly string
 */
export function getPasswordRequirementsText(): string {
  const requirements = [
    `At least ${PASSWORD_REQUIREMENTS.minLength} characters`,
  ];

  if (PASSWORD_REQUIREMENTS.requireUppercase) {
    requirements.push('At least one uppercase letter');
  }
  if (PASSWORD_REQUIREMENTS.requireLowercase) {
    requirements.push('At least one lowercase letter');
  }
  if (PASSWORD_REQUIREMENTS.requireNumber) {
    requirements.push('At least one number');
  }
  if (PASSWORD_REQUIREMENTS.requireSpecial) {
    requirements.push('At least one special character');
  }

  return requirements.join(', ');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
