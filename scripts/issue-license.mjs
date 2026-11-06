import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { buildPayload, encodeToken } from '../src/utils/licenseToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export async function decryptPrivateKeyFromFile(encPath, passphrase) {
  if (!fs.existsSync(encPath)) {
    throw new Error(`ملف المفتاح المشفر غير موجود: ${encPath}`);
  }
  const encObj = JSON.parse(fs.readFileSync(encPath, 'utf8'));
  const salt = Buffer.from(encObj.salt, 'base64');
  const iv = Buffer.from(encObj.iv, 'base64');
  const tag = Buffer.from(encObj.tag, 'base64');
  const ciphertext = Buffer.from(encObj.ciphertext, 'base64');
  const iterations = encObj.iterations || 600000;

  const derivedKey = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);
  const decryptedDer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const privateKey = crypto.createPrivateKey({
    key: decryptedDer,
    format: 'der',
    type: 'pkcs8'
  });

  return { privateKey, kid: encObj.kid || '2026-01' };
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

// If run directly as CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const filePath = fileIndex >= 0 ? String(args[fileIndex + 1] || '').trim() : '';
  const typeIndex = args.indexOf('--type');
  const licenseType = typeIndex >= 0 ? String(args[typeIndex + 1] || 'LIFETIME').trim().toUpperCase() : 'LIFETIME';

  let machineIds = args.filter((a, idx) => !a.startsWith('--') && a !== filePath && (typeIndex < 0 || idx !== typeIndex + 1));
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const fromFile = raw
        .split(/[\r\n,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^EGYP-/i.test(s));
      machineIds = machineIds.concat(fromFile);
    } catch (e) {
      console.error(`❌ تعذر قراءة الملف: ${filePath} (${e.message})`);
      process.exit(1);
    }
  }

  machineIds = Array.from(new Set(machineIds.map((s) => s.trim().toUpperCase())));

  if (!machineIds.length) {
    console.error('');
    console.error('❌ اكتب Machine ID واحد أو أكثر:');
    console.error('   node scripts/issue-license.mjs EGYP-B009-4237-53D2');
    console.error('   node scripts/issue-license.mjs --type TIMED EGYP-B009-4237-53D2');
    console.error('   node scripts/issue-license.mjs --file machine-ids.txt');
    console.error('');
    process.exit(1);
  }

  const encPath = path.join(rootDir, 'private', 'license-private-key.enc.json');
  const passphrase = await askPassphrase();

  let privData;
  try {
    privData = await decryptPrivateKeyFromFile(encPath, passphrase);
  } catch (e) {
    console.error('❌ فشل فك تشفير المفتاح الخاص. تأكد من صحة كلمة المرور.');
    process.exit(1);
  }

  console.log('');
  for (const mid of machineIds) {
    const { payloadBase64Url } = buildPayload({
      kid: privData.kid,
      mid,
      typ: licenseType,
      exp: licenseType === 'TIMED' ? Math.floor(Date.now() / 1000) + 365 * 86400 : null
    });
    const msgBytes = Buffer.from(`LIC2.${payloadBase64Url}`, 'utf8');
    const sigBytes = crypto.sign(null, msgBytes, privData.privateKey);
    const token = encodeToken(payloadBase64Url, sigBytes);
    console.log('  ┌─────────────────────────────────────────────────────────────');
    console.log(`  │ Machine ID : ${mid}`);
    console.log(`  │ النوع      : ${licenseType}`);
    console.log(`  │ التوكن     : ${token}`);
    console.log('  └─────────────────────────────────────────────────────────────');
  }
  console.log('');
}
