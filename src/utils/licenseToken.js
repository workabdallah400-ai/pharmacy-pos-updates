/**
 * Ed25519 License Token (v2) Parser, Encoder, and Cryptographic Verifier.
 * Pure JS / WebCrypto implementation with zero Vite-specific imports.
 * Runs in Node.js, Electron, and modern browsers offline.
 */

/**
 * Base64URL string helpers (RFC 4648).
 */
export function base64UrlEncode(bytesOrStr) {
  let base64 = '';
  if (typeof bytesOrStr === 'string') {
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(bytesOrStr, 'utf8').toString('base64');
    } else {
      base64 = btoa(unescape(encodeURIComponent(bytesOrStr)));
    }
  } else {
    // Uint8Array or Buffer
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(bytesOrStr).toString('base64');
    } else {
      let bin = '';
      const u8 = new Uint8Array(bytesOrStr);
      for (let i = 0; i < u8.length; i++) {
        bin += String.fromCharCode(u8[i]);
      }
      base64 = btoa(bin);
    }
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecodeToBytes(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlDecodeToStr(str) {
  const bytes = base64UrlDecodeToBytes(str);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Builds canonical JSON payload with fixed key ordering and no spaces.
 * Order: v, kid, lid, mid, typ, iat, exp
 */
export function buildPayload({ kid, lid, mid, typ, iat, exp = null }) {
  const cleanMid = String(mid || '').trim().toUpperCase();
  const canonicalObj = {
    v: 2,
    kid: String(kid || '').trim(),
    lid: String(lid || '').trim(),
    mid: cleanMid,
    typ: String(typ || '').trim().toUpperCase(),
    iat: Math.floor(Number(iat) || (Date.now() / 1000)),
    exp: exp === null || exp === undefined ? null : Math.floor(Number(exp))
  };

  // Fixed order stringify
  const canonicalStr = JSON.stringify(canonicalObj, ['v', 'kid', 'lid', 'mid', 'typ', 'iat', 'exp']);
  return {
    payloadObj: canonicalObj,
    canonicalStr,
    payloadBase64Url: base64UrlEncode(canonicalStr)
  };
}

/**
 * Encodes token string from payload and Ed25519 signature bytes.
 * Format: LIC2.<payload_base64url>.<signature_base64url>
 */
export function encodeToken(payloadBase64Url, signatureBytes) {
  const sigB64 = base64UrlEncode(signatureBytes);
  return `LIC2.${payloadBase64Url}.${sigB64}`;
}

/**
 * Decodes token into payload and signature without verification.
 */
export function decodeToken(token) {
  const str = String(token || '').trim();
  const parts = str.split('.');
  if (parts.length !== 3 || parts[0] !== 'LIC2') {
    throw new Error('صيغة رمز الترخيص غير صالحة. يجب أن تبدأ بـ LIC2 وتتكون من 3 أجزاء.');
  }

  const payloadStr = base64UrlDecodeToStr(parts[1]);
  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    throw new Error('تعذر قراءة بيانات رمز الترخيص المشفرة.');
  }

  const signatureBytes = base64UrlDecodeToBytes(parts[2]);
  const signedMessageBytes = (typeof TextEncoder !== 'undefined')
    ? new TextEncoder().encode(`LIC2.${parts[1]}`)
    : Buffer.from(`LIC2.${parts[1]}`, 'utf8');

  return {
    prefix: parts[0],
    payloadBase64Url: parts[1],
    signatureBase64Url: parts[2],
    payload,
    signatureBytes,
    signedMessageBytes
  };
}

/**
 * Verifies Ed25519 digital signature using WebCrypto or Node.js crypto fallback.
 */
async function verifyEd25519Signature(jwkPublicKey, signatureBytes, messageBytes) {
  // 1. Try standard WebCrypto API
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle)
    ? crypto.subtle
    : (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : null;

  if (subtle && subtle.importKey && subtle.verify) {
    try {
      const cryptoKey = await subtle.importKey(
        'jwk',
        jwkPublicKey,
        { name: 'Ed25519' },
        false,
        ['verify']
      );
      const ok = await subtle.verify(
        { name: 'Ed25519' },
        cryptoKey,
        signatureBytes,
        messageBytes
      );
      if (ok) return true;
    } catch (e) {
      // Fall through to node crypto / electron fallback if WebCrypto failed or unsupported
    }
  }

  // 2. Node.js or Electron require('crypto') fallback
  let nodeCrypto = null;
  if (typeof window !== 'undefined' && window.require) {
    try { nodeCrypto = window.require('crypto'); } catch (e) {}
  }
  if (!nodeCrypto && typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      nodeCrypto = req('crypto');
    } catch (e) {
      try {
        nodeCrypto = (await import('node:crypto')).default;
      } catch (err) {}
    }
  }

  if (nodeCrypto && nodeCrypto.createPublicKey && nodeCrypto.verify) {
    try {
      const pubKey = nodeCrypto.createPublicKey({
        key: jwkPublicKey,
        format: 'jwk'
      });
      return nodeCrypto.verify(null, messageBytes, pubKey, signatureBytes);
    } catch (e) {}
  }

  return false;
}

/**
 * Full verification sequence for LIC2 token.
 * 
 * Rules:
 *  1. 3-part format starting with LIC2.
 *  2. kid is known in publicKeys map.
 *  3. Signature is cryptographically valid Ed25519.
 *  4. mid matches this machine ID (case-insensitive, normalized).
 *  5. typ is one of allowed types (LIFETIME, TIMED, REVOKE, RESET_PIN).
 *  6. iat is not in the future by more than 24 hours (clock drift tolerance).
 *  7. If typ is TIMED: exp exists and now < exp.
 *  8. lid is not in revokedLids set.
 */
export async function verifyLicenseToken(token, {
  machineId,
  publicKeys = {},
  now = Date.now(),
  revokedLids = new Set()
}) {
  const decoded = decodeToken(token);
  const { payload, signatureBytes, signedMessageBytes } = decoded;

  // 1. Version check
  if (payload.v !== 2) {
    throw new Error('إصدار رمز الترخيص غير مدعوم.');
  }

  // 2. Key ID check
  const pubJwk = publicKeys[payload.kid];
  if (!pubJwk) {
    throw new Error(`مفتاح التحقق (${payload.kid}) غير مسجل في النظام.`);
  }

  // 3. Cryptographic Signature Verification
  const validSig = await verifyEd25519Signature(pubJwk, signatureBytes, signedMessageBytes);
  if (!validSig) {
    throw new Error('التوقيع الرقمي للترخيص غير صحيح أو تم التعديل عليه.');
  }

  // 4. Machine ID binding check
  const cleanExpectedMid = String(machineId || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
  const cleanPayloadMid = String(payload.mid || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
  if (!cleanPayloadMid || cleanPayloadMid !== cleanExpectedMid) {
    throw new Error(`رمز الترخيص صادر لجهاز آخر (${payload.mid}) ولا يطابق كود هذا الجهاز.`);
  }

  // 5. Allowed type check
  const ALLOWED_TYPES = ['LIFETIME', 'TIMED', 'REVOKE', 'RESET_PIN'];
  if (!ALLOWED_TYPES.includes(payload.typ)) {
    throw new Error(`نوع الترخيص (${payload.typ}) غير معروف.`);
  }

  // 6. Issued At (iat) clock check (max 24 hours into the future)
  const nowSec = Math.floor(now / 1000);
  const maxAllowedIat = nowSec + (24 * 60 * 60);
  if (payload.iat > maxAllowedIat) {
    throw new Error('تاريخ إصدار الترخيص يقع في المستقبل! تأكد من ضبط ساعة الجهاز.');
  }

  // 7. Expiry check for TIMED
  if (payload.typ === 'TIMED') {
    if (!payload.exp || typeof payload.exp !== 'number') {
      throw new Error('ترخيص المدة المحددة لا يحتوي على تاريخ انتهاء صالح.');
    }
    if (nowSec > payload.exp) {
      const expDate = new Date(payload.exp * 1000).toISOString().slice(0, 10);
      throw new Error(`انتهت صلاحية هذا الترخيص بتاريخ (${expDate}).`);
    }
  }

  // 8. Revocation check
  if (payload.lid) {
    const isRevoked = (revokedLids instanceof Set)
      ? revokedLids.has(payload.lid)
      : Array.isArray(revokedLids) && revokedLids.includes(payload.lid);
    if (isRevoked) {
      throw new Error('تم إيقاف وإلغاء هذا الترخيص أمنياً بناءً على قائمة الإلغاءات الرسمية.');
    }
  }

  return {
    valid: true,
    payload,
    type: payload.typ,
    lid: payload.lid,
    kid: payload.kid,
    machineId: payload.mid,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    isLifetime: payload.typ === 'LIFETIME'
  };
}
