// ============================================================================
// Auth Cryptographic Utilities (PRD Stage 1: JS-P0-01)
// Non-blocking scrypt password hashing + SHA-256 session token hashing
// Constant-time comparisons to defeat timing side-channel attacks
// ============================================================================

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Dummy hash used for constant-time comparisons when a user does not exist
// Pre-computed to match the scrypt format: scrypt:<salt>:<hash>
const DUMMY_SALT = '00000000000000000000000000000000';

export class AuthUtil {
  /**
   * Hashes a plain-text password using scrypt with a cryptographically secure random salt.
   * Format: `scrypt:<salt_hex>:<key_hex>`
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verifies a password against a stored scrypt hash in constant time.
   * If the stored hash is invalid or unset, performs a dummy scrypt operation to prevent timing attacks.
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (!storedHash || !storedHash.startsWith('scrypt:')) {
      // Execute dummy hashing to equalize response time and prevent timing side-channel attacks
      await scryptAsync(password, DUMMY_SALT, 64);
      return false;
    }

    const parts = storedHash.split(':');
    if (parts.length !== 3) {
      await scryptAsync(password, DUMMY_SALT, 64);
      return false;
    }

    const [, salt, expectedHashHex] = parts;
    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');

    const actualKey = (await scryptAsync(password, salt, 64)) as Buffer;

    if (actualKey.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualKey, expectedBuffer);
  }

  /**
   * Generates a high-entropy 256-bit unguessable raw session token.
   */
  static generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hashes the raw session token with SHA-256 for persistent database storage.
   * Storing hashes protects sessions against offline token extraction if DB is compromised.
   */
  static hashSessionToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Normalizes handles according to specification:
   * Strips leading '@', trims whitespace, converts to lowercase.
   */
  static normalizeHandle(handle: string): string {
    if (!handle) return '';
    let normalized = handle.trim().toLowerCase();
    if (normalized.startsWith('@')) {
      normalized = normalized.slice(1);
    }
    return normalized;
  }
}
