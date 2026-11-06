/**
 * Enterprise Password Security & Validation Utilities.
 * Uses PBKDF2-SHA256 with 310,000 iterations and 16-byte random salt.
 * Offline compatible, supporting both Node.js crypto and browser Web Crypto API.
 */

export const FORBIDDEN_PASSWORDS = [
  'admin123',
  'password',
  '12345678',
  '123456789',
  'qwerty',
  'pharmacy',
  'صيدلية',
  '111111',
  '000000'
];

/**
 * Validates password strength policy.
 * Requirements:
 *  - 10 to 128 characters
 *  - At least 3 of 4 character classes: uppercase, lowercase, numbers, special characters
 *  - Not in forbidden passwords list
 *  - Not equal to username (case-insensitive)
 */
export function validatePasswordPolicy(password, username = '') {
  const pwd = String(password || '');
  const user = String(username || '').trim().toLowerCase();

  if (pwd.length < 10) {
    return { valid: false, error: 'كلمة المرور يجب ألا تقل عن 10 أحرف.' };
  }
  if (pwd.length > 128) {
    return { valid: false, error: 'كلمة المرور طويلة جداً (الحد الأقصى 128 حرفاً).' };
  }

  if (user && pwd.toLowerCase() === user) {
    return { valid: false, error: 'لا يمكن أن تكون كلمة المرور مطابقة لاسم المستخدم.' };
  }

  const lowerPwd = pwd.toLowerCase();
  for (const forbidden of FORBIDDEN_PASSWORDS) {
    if (lowerPwd === forbidden.toLowerCase()) {
      return { valid: false, error: 'كلمة المرور سهلة وشائعة جداً، يرجى اختيار كلمة مرور أقوى.' };
    }
  }

  let classesCount = 0;
  if (/[a-z]/.test(pwd)) classesCount++;
  if (/[A-Z]/.test(pwd)) classesCount++;
  if (/[0-9]/.test(pwd)) classesCount++;
  if (/[^a-zA-Z0-9]/.test(pwd)) classesCount++;

  if (classesCount < 3) {
    return {
      valid: false,
      error: 'كلمة المرور يجب أن تحتوي على 3 عناصر على الأقل من: حروف كبيرة، حروف صغيرة، أرقام، رموز خاصة.'
    };
  }

  return { valid: true };
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i % b.length);
  }
  return diff === 0;
}

/**
 * Converts Uint8Array to Base64 string.
 */
function u8ToBase64(u8) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  let bin = '';
  for (let i = 0; i < u8.length; i++) {
    bin += String.fromCharCode(u8[i]);
  }
  return btoa(bin);
}

/**
 * Converts Base64 string to Uint8Array.
 */
function base64ToU8(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    u8[i] = bin.charCodeAt(i);
  }
  return u8;
}

/**
 * Derives PBKDF2-SHA256 key bytes.
 */
async function derivePbkdf2Bytes(password, saltU8, iterations = 310000, keyLen = 32) {
  // 1. WebCrypto
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle)
    ? crypto.subtle
    : (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : null;

  if (subtle) {
    try {
      const enc = new TextEncoder();
      const baseKey = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltU8,
          iterations,
          hash: 'SHA-256'
        },
        baseKey,
        keyLen * 8
      );
      return new Uint8Array(bits);
    } catch (e) {}
  }

  // 2. Node crypto
  let nodeCrypto = null;
  if (typeof window !== 'undefined' && window.require) {
    try { nodeCrypto = window.require('crypto'); } catch (e) {}
  }
  if (!nodeCrypto && typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      nodeCrypto = (await import('node:crypto')).default;
    } catch (e) {}
  }

  if (nodeCrypto && nodeCrypto.pbkdf2Sync) {
    const buf = nodeCrypto.pbkdf2Sync(password, saltU8, iterations, keyLen, 'sha256');
    return new Uint8Array(buf);
  }

  throw new Error('No cryptographic PBKDF2 provider available.');
}

/**
 * Generates secure PBKDF2 password hash.
 * Format: pbkdf2_sha256$310000$<salt_b64>$<hash_b64>
 */
export async function hashPassword(password, customSalt = null, iterations = 310000) {
  let saltU8;
  if (customSalt) {
    saltU8 = typeof customSalt === 'string' ? base64ToU8(customSalt) : customSalt;
  } else {
    saltU8 = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(saltU8);
    } else {
      const nodeCrypto = await import('node:crypto');
      const b = nodeCrypto.randomBytes(16);
      saltU8 = new Uint8Array(b);
    }
  }

  const derived = await derivePbkdf2Bytes(password, saltU8, iterations, 32);
  const saltB64 = u8ToBase64(saltU8);
  const hashB64 = u8ToBase64(derived);

  return `pbkdf2_sha256$${iterations}$${saltB64}$${hashB64}`;
}

/**
 * Checks if stored password hash needs upgrade to latest standard.
 */
export function needsRehash(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return true;
  if (!storedHash.startsWith('pbkdf2_sha256$')) return true;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return true;
  const iters = parseInt(parts[1], 10);
  return iters < 310000;
}

/**
 * Legacy XOR hash verification (for zero-friction migration of existing databases).
 */
function verifyLegacyHash(password, storedHash) {
  const secret = 'PHARMA_SEC_KEY_2026';
  let hash = 0;
  const str = password + secret;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(16, '0');
  const lenComponent = (password.length * 7919).toString(16).padStart(8, '0');
  let b64Part = '';
  if (typeof Buffer !== 'undefined') {
    b64Part = Buffer.from(password.slice(0, 3) + secret.slice(0, 5)).toString('base64');
  } else {
    b64Part = btoa(password.slice(0, 3) + secret.slice(0, 5));
  }
  const expectedLegacy = hex + lenComponent + b64Part.replace(/=/g, '');
  return constantTimeEquals(expectedLegacy, storedHash);
}

/**
 * Verifies password against stored hash.
 * Returns { valid: boolean, needsRehash: boolean }
 */
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  // 1. PBKDF2 Format
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const iters = parseInt(parts[1], 10) || 310000;
      const saltU8 = base64ToU8(parts[2]);
      const storedKeyB64 = parts[3];

      const derived = await derivePbkdf2Bytes(password, saltU8, iters, 32);
      const derivedB64 = u8ToBase64(derived);

      const isMatch = constantTimeEquals(storedKeyB64, derivedB64);
      return {
        valid: isMatch,
        needsRehash: iters < 310000
      };
    }
  }

  // 2. Legacy Migration Support
  if (verifyLegacyHash(password, storedHash)) {
    return {
      valid: true,
      needsRehash: true
    };
  }

  return { valid: false, needsRehash: false };
}
