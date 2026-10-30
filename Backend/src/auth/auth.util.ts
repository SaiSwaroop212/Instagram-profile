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

export interface DeviceInfo {
  deviceType: string;
  browser: string;
  os: string;
  ipAddress: string | null;
  userAgent: string | null;
}

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
  /**
   * Extracts or detects client device information from headers, body, or User-Agent string.
   */
  static extractDeviceInfo(req?: any, body?: any): DeviceInfo {
    const rawHeaders = req?.headers || {};
    const ua = (rawHeaders['user-agent'] || '').trim();

    // 1. Explicit headers or body override defaults
    let deviceType =
      rawHeaders['x-device-type'] ||
      body?.deviceType ||
      null;

    let browser =
      rawHeaders['x-device-browser'] ||
      body?.browser ||
      null;

    let os =
      rawHeaders['x-device-os'] ||
      body?.os ||
      null;

    // 2. Parse from User-Agent if not explicitly specified
    if (!deviceType && ua) {
      if (/ipad|tablet/i.test(ua)) {
        deviceType = 'tablet';
      } else if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
        deviceType = 'mobile';
      } else if (/windows|macintosh|linux|cros|x11/i.test(ua)) {
        deviceType = 'desktop';
      } else {
        deviceType = 'desktop';
      }
    }

    if (!browser && ua) {
      if (/edg/i.test(ua)) {
        browser = 'Edge';
      } else if (/opr|opera/i.test(ua)) {
        browser = 'Opera';
      } else if (/chrome|crios/i.test(ua)) {
        browser = 'Chrome';
      } else if (/firefox|fxios/i.test(ua)) {
        browser = 'Firefox';
      } else if (/safari/i.test(ua)) {
        browser = 'Safari';
      } else if (/msie|trident/i.test(ua)) {
        browser = 'Internet Explorer';
      } else {
        browser = 'Other';
      }
    }

    if (!os && ua) {
      if (/windows nt 10/i.test(ua)) {
        os = 'Windows 10/11';
      } else if (/windows/i.test(ua)) {
        os = 'Windows';
      } else if (/iphone|ipad|ipod/i.test(ua)) {
        os = 'iOS';
      } else if (/mac os x|macintosh/i.test(ua)) {
        os = 'macOS';
      } else if (/android/i.test(ua)) {
        os = 'Android';
      } else if (/linux/i.test(ua)) {
        os = 'Linux';
      } else {
        os = 'Other';
      }
    }

    const ipAddress =
      (rawHeaders['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      null;

    return {
      deviceType: String(deviceType || 'desktop'),
      browser: String(browser || 'unknown'),
      os: String(os || 'unknown'),
      ipAddress: ipAddress ? String(ipAddress) : null,
      userAgent: ua || null,
    };
  }
}
