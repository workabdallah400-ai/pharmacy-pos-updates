/**
 * Final protection checks for the licensing system:
 *   - legacy (old-style) keys are rejected for good,
 *   - a revoked machine is blocked for every token issued before the revocation,
 *   - a newer token (deliberate re-activation) still works,
 *   - bundled and local revocation lists merge correctly regardless of spelling.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  canonicalMid,
  normalizeMachineId,
  isRevokedPayload,
  mergeRevocations
} from '../src/utils/licenseRevocation.js';
import {
  buildPayload,
  encodeToken,
  verifyLicenseToken,
  isLegacyLicenseKeyFormat
} from '../src/utils/licenseToken.js';

console.log('--- حماية الترخيص: الإلغاء والأكواد القديمة ---');

/* 1) Machine-ID canonicalisation ------------------------------------ */
assert.equal(canonicalMid('egyp-9b4c-d478-b27c'), 'EGYP9B4CD478B27C');
assert.equal(canonicalMid('EGYP 9B4C D478 B27C'), 'EGYP9B4CD478B27C');
assert.equal(canonicalMid('EGYP-9B4C-D478-B27C'), canonicalMid('EGYP9B4CD478B27C'));
assert.equal(normalizeMachineId(' egyp-9b4c-d478-b27c '), 'EGYP-9B4C-D478-B27C');
console.log('✓ توحيد صيغة كود الجهاز');

/* 2) Legacy formats must never be accepted --------------------------- */
for (const legacy of [
  'LIC-LIFE-1234-5678-90AB-CDEF',
  'LIC-EXP-20261231-1234-5678-90AB',
  'LIC-ANNUAL-1111-2222-3333-4444',
  'REVOKE-MASTER-1111-2222',
  'REV-1234-5678',
  'RST-ADMIN-9999'
]) {
  assert.equal(isLegacyLicenseKeyFormat(legacy), true, `must reject legacy: ${legacy}`);
}
assert.equal(isLegacyLicenseKeyFormat('LIC2.abc.def'), false);
console.log('✓ رفض كل صيغ الأكواد القديمة');

/* 3) Revocation window ----------------------------------------------- */
const machine = 'EGYP-1A2B-3C4D-5E6F';
const nowSec = Math.floor(Date.now() / 1000);
const revokedAt = nowSec - 3600;
const revocations = {
  [canonicalMid(machine)]: { mid: machine, lid: 'rev-1', reason: 'اختبار', iat: revokedAt }
};

assert.equal(isRevokedPayload({ mid: machine, iat: revokedAt - 60 }, revocations), true, 'older token blocked');
assert.equal(isRevokedPayload({ mid: machine, iat: revokedAt }, revocations), true, 'same-second token blocked');
assert.equal(isRevokedPayload({ mid: machine, iat: revokedAt + 1 }, revocations), false, 'newer token allowed');
assert.equal(isRevokedPayload({ mid: 'EGYP-AAAA-BBBB-CCCC', iat: revokedAt - 60 }, revocations), false, 'other machine unaffected');
assert.equal(isRevokedPayload({ mid: machine, iat: revokedAt - 60 }, {}), false, 'no revocation means valid');
console.log('✓ نافذة الإلغاء: كل ما صدر قبل الإلغاء مرفوض، والجديد فقط يعمل');

/* 4) Merge rules (bundled vs local) ---------------------------------- */
const bundled = { EGYP111122223333: { mid: 'EGYP-1111-2222-3333', iat: revokedAt } };
const local = { 'EGYP-1111-2222-3333': { mid: 'EGYP-1111-2222-3333', iat: revokedAt + 500 } };
const merged = mergeRevocations(bundled, local);
assert.equal(Object.keys(merged).length, 1, 'same machine must collapse to one entry');
assert.equal(merged.EGYP111122223333.iat, revokedAt + 500, 'newest revocation wins');
assert.equal(merged.EGYP111122223333.mid, 'EGYP-1111-2222-3333', 'display keeps the dashed form');
console.log('✓ دمج قائمة الإلغاء المدمجة مع المحلية (الأحدث يفوز)');

/* 5) End-to-end: signed token + revocation ---------------------------- */
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubJwk = publicKey.export({ format: 'jwk' });
const keys = { 'test-2026': { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x } };

function sign(payload) {
  const { payloadBase64Url } = buildPayload(payload);
  const sig = crypto.sign(null, Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8'), privateKey);
  return encodeToken(payloadBase64Url, sig);
}

const oldTok = sign({ kid: 'test-2026', lid: 'old', mid: machine, typ: 'LIFETIME', iat: revokedAt - 600, exp: null });
const newTok = sign({ kid: 'test-2026', lid: 'new', mid: machine, typ: 'LIFETIME', iat: revokedAt + 60, exp: null });

const oldInfo = await verifyLicenseToken(oldTok, { machineId: machine, publicKeys: keys });
const newInfo = await verifyLicenseToken(newTok, { machineId: machine, publicKeys: keys });
assert.equal(oldInfo.valid, true);
assert.equal(newInfo.valid, true);
assert.equal(isRevokedPayload(oldInfo.payload, revocations), true, 'signed old token must still be revoked');
assert.equal(isRevokedPayload(newInfo.payload, revocations), false, 're-activation token must pass');
console.log('✓ رمز موقّع قديم يُلغى، ورمز إعادة التفعيل الجديد يعمل');

console.log('\n✅ كل اختبارات الإلغاء والحماية نجحت.');
