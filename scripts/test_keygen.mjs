/**
 * Checks the activation-key generator against the real implementation.
 *
 *   node scripts/test_keygen.cjs [machineId]
 */
import { generateActivationKey, sha256Hex } from '../src/utils/licenseKeys.js';

const mid = String(process.argv[2] || 'EGYP-B009-4237-53D2').trim().toUpperCase();
const key = await generateActivationKey(mid, 'LIFETIME');

const pattern = /^LIC-LIFE-[0-9A-F]{4}-[0-9A-F]{4}-[A-Z0-9]{4}$/;
const matches = pattern.test(key);

console.log('Machine ID       :', mid);
console.log('Generated Key    :', key);
console.log('Pattern valid    :', matches);
console.log('sha256 sample    :', (await sha256Hex('test')).slice(0, 16), '…');

if (!matches) {
  console.error('❌ المفتاح مش مطابقFormt المتوقع');
  process.exit(1);
}
console.log('✅ تنجح — استخدم نفس المفتاح في شاشة التفعيل');
