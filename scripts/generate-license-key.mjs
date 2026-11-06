/**
 * Generates an Ed25519 license token (or legacy key with --legacy) for any machine.
 *
 *   node scripts/generate-license-key.mjs EGYP-B009-4237-53D2
 */
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { buildPayload, encodeToken } from '../src/utils/licenseToken.js';
import { generateActivationKey } from '../src/utils/licenseKeys.js';
import { decryptPrivateKeyFromFile } from './issue-license.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isLegacy = process.argv.includes('--legacy');
const target = String(process.argv.filter(a => !a.startsWith('--'))[2] || '').trim();

if (!target) {
  console.error('❌ اكتب الـ Machine ID:  node scripts/generate-license-key.mjs EGYP-XXXX-YYYY-ZZZZ [--legacy]');
  process.exit(1);
}

if (isLegacy) {
  const key = await generateActivationKey(target, 'LIFETIME');
  console.log('');
  console.log('  Machine ID (Legacy) :', target);
  console.log('  Key                 :', key);
  console.log('');
  process.exit(0);
}

async function askPassphrase() {
  if (process.env.PHARMACY_LICENSE_KEY_PASSPHRASE) {
    return process.env.PHARMACY_LICENSE_KEY_PASSPHRASE;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question('ادخل كلمة مرور المفتاح الخاص للترخيص: ', (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

const encPath = path.join(rootDir, 'private', 'license-private-key.enc.json');
const passphrase = await askPassphrase();

try {
  const { privateKey, kid } = await decryptPrivateKeyFromFile(encPath, passphrase);
  const { payloadBase64Url } = buildPayload({
    kid,
    mid: target,
    typ: 'LIFETIME'
  });
  const msgBytes = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');
  const sigBytes = crypto.sign(null, msgBytes, privateKey);
  const token = encodeToken(payloadBase64Url, sigBytes);
  console.log('');
  console.log('  Machine ID :', target);
  console.log('  Token (Ed25519) :');
  console.log(token);
  console.log('');
} catch (e) {
  console.error('❌ فشل إصدار الترخيص:', e.message);
  process.exit(1);
}
