import { compare, hash } from 'bcryptjs';

/** bcrypt cost factor (2^10 rounds ≈ 60–100 ms per hash on a dev laptop). */
export const PASSWORD_HASH_ROUNDS = 10;

/** Hash a plain-text password for users.password_hash. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, PASSWORD_HASH_ROUNDS);
}

/** Constant-time comparison of a plain-text password with a stored hash. */
export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}
