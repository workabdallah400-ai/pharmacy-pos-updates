import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload, encodeToken, verifyLicenseToken } from '../src/utils/licenseToken.js';
import { LICENSE_PUBLIC_KEYS, CURRENT_KID } from '../src/utils/licensePublicKey.js';

console.log('🧪 Starting License Token & Signature Parity Tests...');

// 1. Test Node vs WebCrypto Ed25519 signing parity
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });
const testKid = 'TEST-PARITY-1';
const customPublicKeys = {
  [testKid]: { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x }
};

const { payloadBase64Url } = buildPayload({
  kid: testKid,
  mid: 'EGYP-TEST-1111-2222',
  typ: 'LIFETIME'
});

const msgBytes = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');

// Sign with Node crypto
const nodeSig = crypto.sign(null, msgBytes, privateKey);
const nodeToken = encodeToken(payloadBase64Url, nodeSig);
console.log('Node Token generated:', nodeToken.slice(0, 45) + '...');

const verification = await verifyLicenseToken(nodeToken, {
  machineId: 'EGYP-TEST-1111-2222',
  publicKeys: customPublicKeys
});
assert.equal(verification.valid, true, 'Verification should succeed for matching machine');
assert.equal(verification.isLifetime, true);
console.log('✅ Signature generation and verification parity verified.');

// Sign with WebCrypto
const webCryptoPriv = await crypto.subtle.importKey(
  'jwk',
  privJwk,
  { name: 'Ed25519' },
  false,
  ['sign']
);

const webSigBuffer = await crypto.subtle.sign({ name: 'Ed25519' }, webCryptoPriv, msgBytes);
const webToken = encodeToken(payloadBase64Url, new Uint8Array(webSigBuffer));
const webVerification = await verifyLicenseToken(webToken, {
  machineId: 'EGYP-TEST-1111-2222',
  publicKeys: customPublicKeys
});
assert.equal(webVerification.valid, true, 'WebCrypto signed token verified');
assert.equal(webToken, nodeToken, 'Deterministic Ed25519 signatures must match between Node crypto and WebCrypto');
console.log('✅ Deterministic signature equivalence (Node crypto == WebCrypto) verified.');

console.log('🎉 All parity tests passed successfully.');
