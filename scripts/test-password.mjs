import assert from 'node:assert';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  validatePasswordPolicy
} from '../src/utils/password.js';

console.log('--- Testing Password Security Module ---');

// 1. hashPassword produces pbkdf2_sha256 format
const pass = 'CorrectP@ssw0rd2026!';
const hash1 = await hashPassword(pass);
assert.ok(hash1.startsWith('pbkdf2_sha256$310000$'), 'Hash format must start with pbkdf2_sha256$310000$');
const parts = hash1.split('$');
assert.strictEqual(parts.length, 4, 'PBKDF2 hash must have 4 dollar-separated components');
console.log('✅ hashPassword produces pbkdf2_sha256 format');

// 2. Different salt each time
const hash2 = await hashPassword(pass);
assert.notStrictEqual(hash1, hash2, 'Salts must be randomly generated and unique per hash');
console.log('✅ Unique random salts per hash');

// 3. verifyPassword correct / incorrect
const checkOk = await verifyPassword(pass, hash1);
assert.strictEqual(checkOk.valid, true);
assert.strictEqual(checkOk.needsRehash, false);

const checkFail = await verifyPassword('WrongPassword123!', hash1);
assert.strictEqual(checkFail.valid, false);
console.log('✅ verifyPassword succeeds on correct and fails on incorrect password');

// 4. Legacy hash migration check
// Legacy hash calculation for 'admin123'
const secret = 'PHARMA_SEC_KEY_2026';
let h = 0;
const str = 'admin123' + secret;
for (let i = 0; i < str.length; i++) {
  const char = str.charCodeAt(i);
  h = ((h << 5) - h) + char;
  h = h & h;
}
const hex = Math.abs(h).toString(16).padStart(16, '0');
const lenComponent = (8 * 7919).toString(16).padStart(8, '0');
const b64Part = Buffer.from('adm' + 'PHARM').toString('base64').replace(/=/g, '');
const legacyAdminHash = hex + lenComponent + b64Part;

const legacyCheck = await verifyPassword('admin123', legacyAdminHash);
assert.strictEqual(legacyCheck.valid, true, 'Legacy hash must be recognized');
assert.strictEqual(legacyCheck.needsRehash, true, 'Legacy hash must flag needsRehash = true');
console.log('✅ Legacy hash accepted and triggers needsRehash');

// 5. validatePasswordPolicy checks
assert.strictEqual(validatePasswordPolicy('admin123', 'admin').valid, false);
assert.strictEqual(validatePasswordPolicy('password', 'user').valid, false);
assert.strictEqual(validatePasswordPolicy('short1!', 'user').valid, false); // < 10 chars
assert.strictEqual(validatePasswordPolicy('username12345', 'username12345').valid, false); // password === username
assert.strictEqual(validatePasswordPolicy('alllowercaseandnumbers12345', 'user').valid, false); // lacks uppercase or symbol
assert.strictEqual(validatePasswordPolicy('StrongPass123!', 'admin').valid, true);
console.log('✅ validatePasswordPolicy enforcement tested');

// 6. Golden Vector test with fixed salt (10,000 iterations for fast test vector)
const fixedSaltB64 = Buffer.from('0123456789ABCDEF', 'utf8').toString('base64');
const vectorHash = await hashPassword('VectorTestPass#2026', fixedSaltB64, 10000);
const vectorParts = vectorHash.split('$');
assert.strictEqual(vectorParts[2], fixedSaltB64);
const recheckVector = await verifyPassword('VectorTestPass#2026', vectorHash);
assert.strictEqual(recheckVector.valid, true);
console.log('✅ Golden Vector PBKDF2 test passed');

console.log('🎉 All test-password.mjs checks passed!\n');
