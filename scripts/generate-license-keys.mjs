/**
 * Generates an Ed25519 signing keypair for offline pharmacy licenses.
 * 
 * - Public key (JWK) is written to src/utils/licensePublicKey.js
 * - Private key (PKCS8) is encrypted with PBKDF2-SHA256 (600,000 iterations) + AES-256-GCM
 *   and saved to private/license-private-key.enc.json.
 * - Prompts for passphrase or reads from PHARMACY_LICENSE_KEY_PASSPHRASE env var.
 * - NEVER prints or logs private key bytes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const CURRENT_KID = '2026-01';

async function askPassphrase() {
  if (process.env.PHARMACY_LICENSE_KEY_PASSPHRASE) {
    return process.env.PHARMACY_LICENSE_KEY_PASSPHRASE;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question('ادخل كلمة مرور قوية لتشفير المفتاح الخاص للترخيص: ', (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function main() {
  console.log('🔐 توليد زوج مفاتيح التوقيع الرقمي Ed25519 لنظام الترخيص...');
  const passphrase = await askPassphrase();
  if (!passphrase || passphrase.length < 8) {
    console.error('❌ كلمة المرور يجب ألا تقل عن 8 أحرف.');
    process.exit(1);
  }

  // 1. Generate Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // Export public key as JWK
  const pubJwk = publicKey.export({ format: 'jwk' });
  const pubFileContent = `/**
 * Official Public Keys for Ed25519 License Verification.
 * Safe to distribute inside offline client application.
 */
export const CURRENT_KID = '${CURRENT_KID}';

export const LICENSE_PUBLIC_KEYS = {
  '${CURRENT_KID}': ${JSON.stringify({ kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x }, null, 2)}
};
`;

  const pubFilePath = path.join(rootDir, 'src', 'utils', 'licensePublicKey.js');
  fs.writeFileSync(pubFilePath, pubFileContent, 'utf8');
  console.log('✅ تم حفظ المفتاح العام في:', pubFilePath);

  // 2. Encrypt Private Key (PKCS8 Der) with PBKDF2 + AES-256-GCM
  const privPkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12); // standard 96-bit IV for AES-GCM
  const iterations = 600000;

  const derivedKey = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(privPkcs8), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encPayload = {
    v: 1,
    kid: CURRENT_KID,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };

  const privDir = path.join(rootDir, 'private');
  if (!fs.existsSync(privDir)) {
    fs.mkdirSync(privDir, { recursive: true });
  }

  const encFilePath = path.join(privDir, 'license-private-key.enc.json');
  fs.writeFileSync(encFilePath, JSON.stringify(encPayload, null, 2), 'utf8');
  console.log('✅ تم تشفير وحفظ المفتاح الخاص في:', encFilePath);
  console.log('⚠️  تنبيه هام: احتفظ بنسخة احتياطية من الملف المشفر وكلمة المرور في مكان آمن خارج الجهاز.');
}

main().catch((err) => {
  console.error('❌ خطأ أثناء توليد المفاتيح:', err);
  process.exit(1);
});
