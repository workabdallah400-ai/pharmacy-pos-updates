/**
 * Licence primitives for the standalone studio.
 *
 * Produces exactly the same LIC2 token format as the application:
 *   payload = JSON with fixed key order (v,kid,lid,mid,typ,iat,exp)
 *   token   = "LIC2." + base64url(payload) + "." + base64url(Ed25519 signature)
 */

const crypto = require('node:crypto');

/** Public key shipped inside PharmacyPOS (src/utils/licensePublicKey.js). */
const APP_PUBLIC_KEY = {
  kid: '2026-11',
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'y_6EkEsotuhI0TTzIwcrUzOteCkcrv2sOTfZUPcMUxA'
};

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildPayload({ kid, lid, mid, typ, iat, exp = null }) {
  const canonicalObj = {
    v: 2,
    kid: String(kid || '').trim(),
    lid: String(lid || '').trim(),
    mid: String(mid || '').trim().toUpperCase(),
    typ: String(typ || '').trim().toUpperCase(),
    iat: Math.floor(Number(iat) || (Date.now() / 1000)),
    exp: exp === null || exp === undefined ? null : Math.floor(Number(exp))
  };
  const canonicalStr = JSON.stringify(canonicalObj, ['v', 'kid', 'lid', 'mid', 'typ', 'iat', 'exp']);
  return { payloadObj: canonicalObj, canonicalStr, payloadBase64Url: base64UrlEncode(canonicalStr) };
}

function signToken(privateKey, payload) {
  const { payloadBase64Url } = buildPayload(payload);
  const message = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');
  const signature = crypto.sign(null, message, privateKey);
  return `LIC2.${payloadBase64Url}.${base64UrlEncode(signature)}`;
}

function normalizeMachineId(value) {
  return String(value || '').trim().toUpperCase();
}

function canonicalMid(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isValidMachineId(mid) {
  return /^EGYP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(mid || ''));
}

/* ---------------------------- private key ---------------------------- */

/** Parse a JWK (raw object or JSON string) into a Node private key object. */
function parsePrivateKey(jwkOrString) {
  const jwk = typeof jwkOrString === 'string' ? JSON.parse(jwkOrString) : jwkOrString;
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d) {
    throw new Error('الملف ليس مفتاح Ed25519 خاصاً صالحاً (يجب أن يحتوي kty=OKP, crv=Ed25519, d).');
  }
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

function publicJwkOf(privateKey) {
  return crypto.createPublicKey(privateKey).export({ format: 'jwk' });
}

/** True when this private key is the one that signs for the shipped app. */
function keyMatchesApp(privateKey) {
  try {
    const pub = publicJwkOf(privateKey);
    return pub.x === APP_PUBLIC_KEY.x && pub.crv === APP_PUBLIC_KEY.crv;
  } catch (e) {
    return false;
  }
}

/* ------------------------------ tokens ------------------------------- */

function issueLicense(privateKey, { mid, type = 'LIFETIME', days, until, note } = {}) {
  const machineId = normalizeMachineId(mid);
  if (!isValidMachineId(machineId)) {
    throw new Error('كود الجهاز غير صالح — الصيغة الصحيحة: EGYP-XXXX-YYYY-ZZZZ');
  }

  const typ = String(type || 'LIFETIME').toUpperCase();
  if (!['LIFETIME', 'TIMED'].includes(typ)) throw new Error('نوع الترخيص غير معروف.');

  let exp = null;
  if (typ === 'TIMED') {
    if (until) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(until))) throw new Error('تاريخ الانتهاء يجب أن يكون YYYY-MM-DD.');
      exp = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
      if (!Number.isFinite(exp)) throw new Error('تاريخ الانتهاء غير صالح.');
    } else {
      const n = Number(days || 365);
      if (!Number.isFinite(n) || n <= 0) throw new Error('عدد الأيام غير صالح.');
      if (n > 3650) throw new Error('أقصى مدة 3650 يوماً.');
      exp = Math.floor(Date.now() / 1000) + Math.floor(n * 86400);
    }
    if (exp * 1000 <= Date.now()) throw new Error('تاريخ الانتهاء في الماضي.');
  }

  const payload = {
    kid: APP_PUBLIC_KEY.kid,
    lid: crypto.randomUUID(),
    mid: machineId,
    typ,
    iat: Math.floor(Date.now() / 1000),
    exp
  };
  const token = signToken(privateKey, payload);

  return {
    token,
    payload,
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
    note: note || (typ === 'TIMED' ? 'ترخيص مؤقت' : 'ترخيص دائم')
  };
}

function revokeLicense(privateKey, { mid, reason } = {}) {
  const machineId = normalizeMachineId(mid);
  if (!isValidMachineId(machineId)) {
    throw new Error('كود الجهاز غير صالح — الصيغة الصحيحة: EGYP-XXXX-YYYY-ZZZZ');
  }

  const payload = {
    kid: APP_PUBLIC_KEY.kid,
    lid: crypto.randomUUID(),
    mid: machineId,
    typ: 'REVOKE',
    iat: Math.floor(Date.now() / 1000),
    exp: null
  };
  const token = signToken(privateKey, payload);

  return {
    token,
    payload,
    entry: {
      mid: machineId,
      lid: payload.lid,
      reason: String(reason || '').trim() || 'إلغاء موقّع من المطور',
      iat: payload.iat,
      revokedAt: new Date(payload.iat * 1000).toISOString()
    }
  };
}

/** Self-check a token against the private key (and therefore the app's public key). */
function inspectToken(privateKey, token) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'LIC2') {
    throw new Error('صيغة الرمز غير صحيحة.');
  }
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const publicKey = crypto.createPublicKey(privateKey);
  const valid = crypto.verify(null, Buffer.from(`LIC2.${parts[1]}`, 'utf8'), publicKey, signature);
  return { payload, signatureValid: valid, matchesAppKey: keyMatchesApp(privateKey) };
}

/* --------------------------- revocations ----------------------------- */

function mergeRevocations(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [rawMid, entry] of Object.entries(map)) {
      const key = canonicalMid(rawMid);
      if (!key) continue;
      const iat = Number((entry && entry.iat) || 0);
      if (!out[key] || Number(out[key].iat || 0) < iat) {
        out[key] = { ...(entry || {}), mid: normalizeMachineId((entry && entry.mid) || rawMid), iat };
      }
    }
  }
  return out;
}

function isRevokedPayload(payload, revocations) {
  if (!payload || !revocations) return false;
  const revocation = revocations[canonicalMid(payload.mid)];
  if (!revocation) return false;
  const revokedAt = Number(revocation.iat || 0);
  if (!revokedAt) return true;
  return Number(payload.iat || 0) <= revokedAt;
}

/** Render the JS module that the app imports (src/utils/licenseRevocations.js). */
function renderRevocationsModule(list) {
  const rows = [...list].sort((a, b) => Number(b.iat || 0) - Number(a.iat || 0));
  const body = rows.map((row) => {
    const mid = normalizeMachineId(row.mid);
    const key = canonicalMid(row.mid);
    return `  '${key}': { mid: '${mid}', lid: ${JSON.stringify(row.lid || '')}, ` +
      `reason: ${JSON.stringify(row.reason || '')}, iat: ${Number(row.iat || 0)} }`;
  }).join(',\n');

  return `/**
 * Revocation list bundled into the application at build time.
 *
 * Generated file — do not edit by hand.
 * Regenerate from PharmacyPOS License Studio (Export revocations).
 *
 * Every machine listed here is blocked in every copy of the app built from
 * this source tree, even if the customer never enters the REVOKE code and
 * never connects to the internet.
 */
export const BUNDLED_REVOCATIONS_VERSION = ${JSON.stringify(new Date().toISOString())};

/** @type {Record<string, { mid: string, lid?: string, reason?: string, iat: number }>} */
export const BUNDLED_REVOCATIONS = {
${body}
};
`;
}

module.exports = {
  APP_PUBLIC_KEY,
  buildPayload,
  signToken,
  normalizeMachineId,
  canonicalMid,
  isValidMachineId,
  parsePrivateKey,
  publicJwkOf,
  keyMatchesApp,
  issueLicense,
  revokeLicense,
  inspectToken,
  mergeRevocations,
  isRevokedPayload,
  renderRevocationsModule
};
