/**
 * Generates a lifetime activation key for any machine.
 *
 *   node scripts/generate-license-key.mjs EGYP-B009-4237-53D2
 *   node scripts/generate-license-key.mjs            ← this machine
 *
 * Every computer has its own machine id, so every computer needs its own key.
 */
import { generateActivationKey } from '../src/utils/licenseKeys.js';

const target = String(process.argv[2] || '').trim();
if (!target) {
  console.error('❌ اكتب الـ Machine ID:  node scripts/generate-license-key.mjs EGYP-XXXX-YYYY-ZZZZ');
  process.exit(1);
}
const key = await generateActivationKey(target, 'LIFETIME');

console.log('');
console.log('  Machine ID :', target);
console.log('  Key        :', key);
console.log('');
console.log('  اكتب المفتاح في شاشة التفعيل على الجهاز ده.');
console.log('');
