import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  buildPayload,
  encodeToken,
  decodeToken,
  verifyLicenseToken
} from '../src/utils/licenseToken.js';

console.log('--- Testing Ed25519 License Token Module ---');

// 1. Generate in-memory Ed25519 test keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubJwk = publicKey.export({ format: 'jwk' });
const testKeys = {
  'test-2026': pubJwk
};

function signToken(payloadObj, privKey) {
  const { payloadBase64Url, canonicalStr } = buildPayload(payloadObj);
  const msgBytes = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');
  const sigBytes = crypto.sign(null, msgBytes, privKey);
  return encodeToken(payloadBase64Url, sigBytes);
}

// 2. Sign LIFETIME token then verify successfully
const machineId = 'EGYP-1A2B-3C4D-5E6F';
const lifetimePayload = {
  kid: 'test-2026',
  lid: 'lid-uuid-0001',
  mid: machineId,
  typ: 'LIFETIME',
  iat: Math.floor(Date.now() / 1000),
  exp: null
};

const validToken = signToken(lifetimePayload, privateKey);
assert.ok(validToken.startsWith('LIC2.'), 'Token must start with LIC2.');

const verified = await verifyLicenseToken(validToken, {
  machineId,
  publicKeys: testKeys,
  now: Date.now()
});
assert.strictEqual(verified.valid, true);
assert.strictEqual(verified.isLifetime, true);
assert.strictEqual(verified.lid, 'lid-uuid-0001');
console.log('✅ LIFETIME token signed and verified successfully');

// 3. Modifying valid JSON in payload fails verification
const parts = validToken.split('.');
const decodedOrig = decodeToken(validToken);
const modifiedPayload = { ...decodedOrig.payload, typ: 'TIMED', exp: Math.floor(Date.now() / 1000) + 100000 };
const modifiedPayloadB64 = buildPayload(modifiedPayload).payloadBase64Url;
const tamperedPayloadToken = `LIC2.${modifiedPayloadB64}.${parts[2]}`;

await assert.rejects(
  () => verifyLicenseToken(tamperedPayloadToken, { machineId, publicKeys: testKeys }),
  /التوقيع الرقمي للترخيص غير صحيح/,
  'Modifying payload bytes must invalidate signature'
);
console.log('✅ Tampered payload byte rejected');

// 4. Modifying 1 byte in signature fails verification
const tamperedSigB64 = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'X' ? 'Y' : 'X');
const tamperedSigToken = `LIC2.${parts[1]}.${tamperedSigB64}`;

await assert.rejects(
  () => verifyLicenseToken(tamperedSigToken, { machineId, publicKeys: testKeys }),
  /التوقيع الرقمي للترخيص غير صحيح/,
  'Modifying signature bytes must invalidate verification'
);
console.log('✅ Tampered signature byte rejected');

// 5. Different machine ID fails verification
const wrongMachineId = 'EGYP-9999-8888-7777';
await assert.rejects(
  () => verifyLicenseToken(validToken, { machineId: wrongMachineId, publicKeys: testKeys }),
  /رمز الترخيص صادر لجهاز آخر/,
  'Token issued for different machine must be rejected'
);
console.log('✅ Wrong Machine ID rejected');

// 6. Expired TIMED token fails verification
const expiredPayload = {
  kid: 'test-2026',
  lid: 'lid-uuid-timed-exp',
  mid: machineId,
  typ: 'TIMED',
  iat: Math.floor(Date.now() / 1000) - 100000,
  exp: Math.floor(Date.now() / 1000) - 10 // expired 10 seconds ago
};
const expiredToken = signToken(expiredPayload, privateKey);
await assert.rejects(
  () => verifyLicenseToken(expiredToken, { machineId, publicKeys: testKeys }),
  /انتهت صلاحية هذا الترخيص/,
  'Expired TIMED token must be rejected'
);
console.log('✅ Expired TIMED token rejected');

// Valid TIMED token succeeds
const validTimedPayload = {
  kid: 'test-2026',
  lid: 'lid-uuid-timed-ok',
  mid: machineId,
  typ: 'TIMED',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400 * 30 // 30 days
};
const validTimedToken = signToken(validTimedPayload, privateKey);
const timedVerified = await verifyLicenseToken(validTimedToken, { machineId, publicKeys: testKeys });
assert.strictEqual(timedVerified.valid, true);
assert.strictEqual(timedVerified.type, 'TIMED');
console.log('✅ Valid TIMED token accepted');

// 7. Unknown kid fails verification
const unknownKidPayload = {
  ...lifetimePayload,
  kid: 'unknown-key-id'
};
const unknownKidToken = signToken(unknownKidPayload, privateKey);
await assert.rejects(
  () => verifyLicenseToken(unknownKidToken, { machineId, publicKeys: testKeys }),
  /مفتاح التحقق.*غير مسجل/,
  'Unknown kid must be rejected'
);
console.log('✅ Unknown key ID (kid) rejected');

// 8. iat in the future by > 24 hours fails verification
const futurePayload = {
  ...lifetimePayload,
  iat: Math.floor(Date.now() / 1000) + (25 * 3600) // 25 hours future
};
const futureToken = signToken(futurePayload, privateKey);
await assert.rejects(
  () => verifyLicenseToken(futureToken, { machineId, publicKeys: testKeys }),
  /تاريخ إصدار الترخيص يقع في المستقبل/,
  'Future iat beyond tolerance must be rejected'
);
console.log('✅ Future iat (> 24h) rejected');

// 9. lid in revoked list fails verification
const revokedSet = new Set(['lid-uuid-0001']);
await assert.rejects(
  () => verifyLicenseToken(validToken, { machineId, publicKeys: testKeys, revokedLids: revokedSet }),
  /تم إيقاف وإلغاء هذا الترخيص/,
  'Revoked lid must be rejected'
);
console.log('✅ Revoked lid rejected');

// 10. v1 tokens are completely rejected as invalid LIC2 tokens
assert.throws(
  () => decodeToken('LIC-LIFE-7729-9941-EGYP'),
  /صيغة رمز الترخيص غير صالحة/,
  'v1 key must fail decodeToken'
);
console.log('✅ Legacy v1 format rejected as new license token');

console.log('🎉 All test-license-token.mjs checks passed!\n');
