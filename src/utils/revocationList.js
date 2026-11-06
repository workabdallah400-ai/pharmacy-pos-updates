/**
 * Signed Revocation List parser, builder, and Ed25519 verifier.
 * Zero external browser/Vite dependencies.
 */

import { base64UrlEncode, base64UrlDecodeToBytes } from './licenseToken.js';

/**
 * Builds canonical Revocation List payload.
 */
export function buildRevocationPayload({ kid, items = [] }) {
  const normItems = items.map((item) => ({
    lid: String(item.lid || '').trim(),
    mid: String(item.mid || '').trim().toUpperCase(),
    reason: String(item.reason || '').trim(),
    at: String(item.at || new Date().toISOString())
  })).sort((a, b) => a.lid.localeCompare(b.lid));

  const payload = {
    v: 1,
    kid: String(kid || '2026-01').trim(),
    generatedAt: new Date().toISOString(),
    count: normItems.length,
    items: normItems
  };

  const canonicalJson = JSON.stringify(payload);
  return {
    payload,
    canonicalJson,
    signedMessageBytes: (typeof TextEncoder !== 'undefined')
      ? new TextEncoder().encode(canonicalJson)
      : Buffer.from(canonicalJson, 'utf8')
  };
}

/**
 * Signs revocation payload with private key (used by developer tool).
 */
export async function signRevocationList(payloadObj, privateKey) {
  const canonicalJson = JSON.stringify(payloadObj);
  const msgBytes = (typeof TextEncoder !== 'undefined')
    ? new TextEncoder().encode(canonicalJson)
    : Buffer.from(canonicalJson, 'utf8');

  let signatureBase64Url = '';

  // Node crypto or WebCrypto
  if (typeof crypto !== 'undefined' && crypto.subtle && privateKey.type === 'private') {
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, msgBytes);
    signatureBase64Url = base64UrlEncode(new Uint8Array(sig));
  } else {
    const nodeCrypto = await import('node:crypto');
    const sig = nodeCrypto.sign(null, msgBytes, privateKey);
    signatureBase64Url = base64UrlEncode(sig);
  }

  return {
    ...payloadObj,
    sig: signatureBase64Url
  };
}

/**
 * Verifies signed revocation list JSON against trusted public keys.
 */
export async function verifyRevocationList(listJsonOrObj, publicKeys = {}) {
  let listObj = listJsonOrObj;
  if (typeof listJsonOrObj === 'string') {
    try {
      listObj = JSON.parse(listJsonOrObj);
    } catch (e) {
      throw new Error('ملف الإلغاءات تالف أو لا يحتوي على تنسيق JSON صحيح.');
    }
  }

  if (!listObj || typeof listObj !== 'object' || !listObj.sig || !listObj.kid) {
    throw new Error('ملف قائمة الإلغاءات غير موقع أو يفتقر إلى بيانات التوقيع.');
  }

  const pubJwk = publicKeys[listObj.kid];
  if (!pubJwk) {
    throw new Error(`مفتاح توقيع قائمة الإلغاءات (${listObj.kid}) غير معتمد.`);
  }

  const { sig, ...contentToVerify } = listObj;
  const canonicalJson = JSON.stringify(contentToVerify);
  const msgBytes = (typeof TextEncoder !== 'undefined')
    ? new TextEncoder().encode(canonicalJson)
    : Buffer.from(canonicalJson, 'utf8');
  const sigBytes = base64UrlDecodeToBytes(sig);

  // Verification via WebCrypto or Node crypto
  let valid = false;
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle)
    ? crypto.subtle
    : (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
    ? window.crypto.subtle
    : null;

  if (subtle) {
    try {
      const cryptoKey = await subtle.importKey('jwk', pubJwk, { name: 'Ed25519' }, false, ['verify']);
      valid = await subtle.verify({ name: 'Ed25519' }, cryptoKey, sigBytes, msgBytes);
    } catch (e) {}
  }

  if (!valid && typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const nodeCrypto = (await import('node:crypto')).default;
      const keyObj = nodeCrypto.createPublicKey({ key: pubJwk, format: 'jwk' });
      valid = nodeCrypto.verify(null, msgBytes, keyObj, sigBytes);
    } catch (e) {}
  }

  if (!valid) {
    throw new Error('التوقيع الرقمي لقائمة الإلغاءات غير مطابق! الملف قد يكون معدلاً أو غير رسمي.');
  }

  return {
    valid: true,
    kid: listObj.kid,
    generatedAt: listObj.generatedAt,
    items: listObj.items || []
  };
}
