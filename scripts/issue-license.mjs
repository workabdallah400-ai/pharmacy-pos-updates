/**
 * Issues lifetime activation keys for one or more pharmacy computers.
 *
 *   node scripts/issue-license.mjs EGYP-B009-4237-53D2
 *   node scripts/issue-license.mjs EGYP-B009-4237-53D2 EGYP-A111-2222-3333
 *   node scripts/issue-license.mjs --file C:\pharmacies\machine-ids.txt
 *
 * Every computer has its own Machine ID (shown on the activation screen of
 * that machine), so every computer needs its own key. The key never expires.
 */
import fs from 'node:fs';
import { generateActivationKey } from '../src/utils/licenseKeys.js';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const filePath = fileIndex >= 0 ? String(args[fileIndex + 1] || '').trim() : '';

let machineIds = args.filter((a) => !a.startsWith('--') && a !== filePath);
if (filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fromFile = raw
      .split(/[\r\n,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^EGYP-/i.test(s));
    machineIds = machineIds.concat(fromFile);
  } catch (e) {
    console.error(`❌ مش قادر أقرأ الملف: ${filePath} (${e.message})`);
    process.exit(1);
  }
}

// de-duplicate, keep the order
machineIds = Array.from(new Set(machineIds.map((s) => s.trim().toUpperCase())));

if (!machineIds.length) {
  console.error('');
  console.error('❌ اكتب Machine ID واحد أو أكثر:');
  console.error('   node scripts/issue-license.mjs EGYP-B009-4237-53D2');
  console.error('   node scripts/issue-license.mjs --file machine-ids.txt');
  console.error('');
  console.error('   الـ Machine ID بيظهر على شاشة التفعيل في الجهاز نفسه.');
  console.error('');
  process.exit(1);
}

console.log('');
for (const mid of machineIds) {
  const key = await generateActivationKey(mid, 'LIFETIME');
  console.log('  ┌──────────────────────────────────────────────');
  console.log(`  │ Machine ID : ${mid}`);
  console.log(`  │ المفتاح    : ${key}`);
  console.log('  └──────────────────────────────────────────────');
}
console.log('');
console.log('  انسخ المفتاح والصقه في شاشة التفعيل على الجهاز (التفعيل مدى الحياة).');
console.log('');
