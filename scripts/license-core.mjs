/**
 * Shared licensing core used by every developer tool:
 *
 *   scripts/license-tool.mjs     CLI (issue / revoke / inspect)
 *   scripts/license-admin.mjs    local admin web panel
 *   scripts/build-revocations.mjs  bundles the revocation list into the app
 *
 * The private key never leaves `private/` and is never written into the app,
 * an installer or Git. Tokens are Ed25519-signed and verified by the shipped
 * public key only.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPayload,
  encodeToken,
  verifyLicenseToken
} from '../src/utils/licenseToken.js';
import { CURRENT_KID, LICENSE_PUBLIC_KEYS } from '../src/utils/licensePublicKey.js';
import { normalizeMachineId, canonicalMid, mergeRevocations } from '../src/utils/licenseRevocation.js';

// Re-export what the CLI/admin panel need so they share one implementation.
export { normalizeMachineId, canonicalMid, mergeRevocations };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const PRIVATE_DIR = path.join(ROOT_DIR, 'private');
export const RAW_KEY_PATH = path.join(PRIVATE_DIR, 'license-private-key.jwk.json');
export const ENC_KEY_PATH = path.join(PRIVATE_DIR, 'license-private-key.enc.json');
export const ISSUED_LOG_PATH = path.join(PRIVATE_DIR, 'issued-licenses.log');
export const REVOCATION_STORE_PATH = path.join(PRIVATE_DIR, 'revocations.json');
export const BUNDLED_REVOCATIONS_PATH = path.join(ROOT_DIR, 'src', 'utils', 'licenseRevocations.js');

export const MAX_LICENSE_DAYS = 3650; // ten years — a sanity limit, not a policy

export function isValidMachineId(mid) {
  return /^EGYP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(mid || ''));
}

export function ensurePrivateDir() {
  if (!fs.existsSync(PRIVATE_DIR)) fs.mkdirSync(PRIVATE_DIR, { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Private key                                                        */
/* ------------------------------------------------------------------ */

function decryptPrivateKey(enc, passphrase) {
  if (!passphrase) throw new Error('كلمة المرور مطلوبة لفك تشفير المفتاح الخاص.');
  const derived = crypto.pbkdf2Sync(
    passphrase,
    Buffer.from(enc.salt, 'base64'),
    enc.iterations,
    32,
    'sha256'
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  const der = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final()
  ]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/**
 * Loads the private key from (in order):
 *   1. PHARMACY_LICENSE_PRIVATE_KEY_JWK  (JSON string, for CI)
 *   2. private/license-private-key.jwk.json
 *   3. private/license-private-key.enc.json  (needs a passphrase)
 *
 * @param {{ passphrase?: string }} [options]
 */
export async function loadPrivateKey(options = {}) {
  const passphrase = options.passphrase || process.env.PHARMACY_LICENSE_KEY_PASSPHRASE || '';

  if (process.env.PHARMACY_LICENSE_PRIVATE_KEY_JWK) {
    const jwk = JSON.parse(process.env.PHARMACY_LICENSE_PRIVATE_KEY_JWK);
    return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  }
  if (fs.existsSync(RAW_KEY_PATH)) {
    const jwk = JSON.parse(fs.readFileSync(RAW_KEY_PATH, 'utf8'));
    return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  }
  if (fs.existsSync(ENC_KEY_PATH)) {
    const enc = JSON.parse(fs.readFileSync(ENC_KEY_PATH, 'utf8'));
    return decryptPrivateKey(enc, passphrase);
  }
  throw new Error('لا يوجد مفتاح خاص. شغّل أولاً: npm run license:keygen');
}

/* ------------------------------------------------------------------ */
/* Signing                                                             */
/* ------------------------------------------------------------------ */

export function signPayload(privateKey, payload) {
  const { payloadBase64Url } = buildPayload(payload);
  const message = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');
  const signature = crypto.sign(null, message, privateKey);
  return { token: encodeToken(payloadBase64Url, signature), payloadBase64Url };
}

export function issueLicense(privateKey, { mid, type = 'LIFETIME', days, until, kid = CURRENT_KID, lid, note } = {}) {
  const machineId = normalizeMachineId(mid);
  if (!isValidMachineId(machineId)) {
    throw new Error(`كود الجهاز غير صالح: ${machineId} — الصيغة الصحيحة: EGYP-XXXX-YYYY-ZZZZ`);
  }

  const typ = String(type || 'LIFETIME').toUpperCase();
  if (!['LIFETIME', 'TIMED'].includes(typ)) {
    throw new Error('--type يقبل LIFETIME أو TIMED فقط.');
  }

  let exp = null;
  if (typ === 'TIMED') {
    if (until) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(until))) {
        throw new Error('تاريخ --until يجب أن يكون بصيغة YYYY-MM-DD.');
      }
      exp = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
      if (!Number.isFinite(exp)) throw new Error('تاريخ --until غير صالح.');
    } else {
      const n = Number(days || 365);
      if (!Number.isFinite(n) || n <= 0) throw new Error('عدد الأيام يجب أن يكون رقماً موجباً.');
      if (n > MAX_LICENSE_DAYS) throw new Error(`أقصى مدة مسموحة هي ${MAX_LICENSE_DAYS} يوماً.`);
      exp = Math.floor(Date.now() / 1000) + Math.floor(n * 86400);
    }
    if (exp * 1000 <= Date.now()) throw new Error('تاريخ الانتهاء في الماضي.');
  }

  const payload = {
    kid: String(kid),
    lid: lid ? String(lid) : crypto.randomUUID(),
    mid: machineId,
    typ,
    iat: Math.floor(Date.now() / 1000),
    exp
  };
  const { token } = signPayload(privateKey, payload);

  appendIssuedLog({
    issuedAt: new Date().toISOString(),
    mid: machineId,
    typ,
    lid: payload.lid,
    kid: payload.kid,
    exp,
    expDate: exp ? new Date(exp * 1000).toISOString() : null
  });

  return { token, payload, expiresAt: exp ? new Date(exp * 1000).toISOString() : null, note };
}

/**
 * Creates a signed REVOKE token and records the revocation locally so that
 * the next `npm run license:revocations` bundles it into the app.
 */
export function revokeLicense(privateKey, { mid, reason = '', kid = CURRENT_KID } = {}) {
  const machineId = normalizeMachineId(mid);
  if (!isValidMachineId(machineId)) {
    throw new Error(`كود الجهاز غير صالح: ${machineId} — الصيغة الصحيحة: EGYP-XXXX-YYYY-ZZZZ`);
  }

  const payload = {
    kid: String(kid),
    lid: crypto.randomUUID(),
    mid: machineId,
    typ: 'REVOKE',
    iat: Math.floor(Date.now() / 1000),
    exp: null
  };
  const { token } = signPayload(privateKey, payload);

  appendIssuedLog({
    issuedAt: new Date().toISOString(),
    mid: machineId,
    typ: 'REVOKE',
    lid: payload.lid,
    kid: payload.kid,
    reason: String(reason || '')
  });

  const entry = upsertRevocation({
    mid: machineId,
    lid: payload.lid,
    reason: String(reason || 'إلغاء موقّع من المطور'),
    iat: payload.iat,
    revokedAt: new Date(payload.iat * 1000).toISOString()
  });

  return { token, payload, entry };
}

/* ------------------------------------------------------------------ */
/* Issued log                                                          */
/* ------------------------------------------------------------------ */

export function appendIssuedLog(record) {
  try {
    ensurePrivateDir();
    fs.appendFileSync(ISSUED_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch (e) {
    // Logging must never block issuing a licence.
  }
}

export function readIssuedLog() {
  try {
    if (!fs.existsSync(ISSUED_LOG_PATH)) return [];
    return fs.readFileSync(ISSUED_LOG_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          const row = JSON.parse(line);
          return { ...row, _line: index + 1 };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Revocation store                                                    */
/* ------------------------------------------------------------------ */

export function readRevocationStore() {
  try {
    if (!fs.existsSync(REVOCATION_STORE_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(REVOCATION_STORE_PATH, 'utf8'));
    if (Array.isArray(parsed)) {
      return mergeRevocations(Object.fromEntries(
        parsed
          .filter((row) => row && row.mid)
          .map((row) => [normalizeMachineId(row.mid), row])
      ));
    }
    return mergeRevocations(parsed);
  } catch (e) {
    return {};
  }
}

/** Revocations issued through the CLI before the store existed live in the issued log. */
export function revocationsFromIssuedLog() {
  const map = {};
  for (const row of readIssuedLog()) {
    if (String(row.typ || '').toUpperCase() !== 'REVOKE' || !row.mid) continue;
    // Entries written by the automated tests must never cancel a real machine.
    if (/^TEST/i.test(String(row.reason || '').trim())) continue;
    const seconds = Number.isFinite(Date.parse(row.issuedAt)) ? Math.floor(Date.parse(row.issuedAt) / 1000) : 0;
    const mid = normalizeMachineId(row.mid);
    const existing = map[mid];
    if (!existing || Number(existing.iat || 0) < seconds) {
      map[mid] = {
        mid,
        lid: row.lid || '',
        reason: row.reason || 'إلغاء موقّع من المطور',
        iat: seconds,
        revokedAt: row.issuedAt || ''
      };
    }
  }
  return map;
}

/** All known revocations: the explicit store wins over the issued log. */
export function listRevocations() {
  return Object.values(mergeRevocations(revocationsFromIssuedLog(), readRevocationStore()))
    .sort((a, b) => Number(b.iat || 0) - Number(a.iat || 0));
}

export function upsertRevocation(entry) {
  const mid = normalizeMachineId(entry && entry.mid);
  if (!mid) throw new Error('كود الجهاز مطلوب لتسجيل الإلغاء.');
  const key = canonicalMid(mid);
  const current = readRevocationStore();
  const iat = Number(entry.iat || 0);
  const existing = current[key];
  if (existing && Number(existing.iat || 0) > iat) return existing;

  const record = {
    mid,
    lid: entry.lid ? String(entry.lid) : (existing?.lid || ''),
    reason: String(entry.reason || existing?.reason || 'إلغاء موقّع من المطور'),
    iat,
    revokedAt: entry.revokedAt || new Date(iat * 1000).toISOString()
  };
  current[key] = record;
  ensurePrivateDir();
  fs.writeFileSync(
    REVOCATION_STORE_PATH,
    JSON.stringify(Object.values(current).sort((a, b) => Number(b.iat) - Number(a.iat)), null, 2),
    'utf8'
  );
  return record;
}

export function removeRevocation(mid) {
  const key = canonicalMid(mid);
  const current = readRevocationStore();
  if (!current[key]) return false;
  delete current[key];
  ensurePrivateDir();
  fs.writeFileSync(
    REVOCATION_STORE_PATH,
    JSON.stringify(Object.values(current), null, 2),
    'utf8'
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Bundled revocation module                                           */
/* ------------------------------------------------------------------ */

export function renderRevocationsModule(list) {
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
 * Generated file — do not edit by hand. Regenerate with:
 *   npm run license:revocations
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

export function writeBundledRevocations() {
  const list = listRevocations();
  fs.writeFileSync(BUNDLED_REVOCATIONS_PATH, renderRevocationsModule(list), 'utf8');
  return list;
}

/* ------------------------------------------------------------------ */
/* Verification helpers (used by the admin panel)                      */
/* ------------------------------------------------------------------ */

export async function inspectToken(token, { machineId } = {}) {
  const { decodeToken } = await import('../src/utils/licenseToken.js');
  const decoded = decodeToken(token);
  const result = {
    payload: decoded.payload,
    signatureValid: false,
    error: null
  };
  try {
    await verifyLicenseToken(token, {
      machineId: machineId ? normalizeMachineId(machineId) : decoded.payload.mid,
      publicKeys: LICENSE_PUBLIC_KEYS
    });
    result.signatureValid = true;
  } catch (e) {
    result.error = e.message;
  }
  return result;
}
