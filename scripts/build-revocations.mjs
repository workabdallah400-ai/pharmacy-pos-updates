/**
 * Bundles the revocation list into the application source.
 *
 *   npm run license:revocations
 *
 * Writes `src/utils/licenseRevocations.js`. Every copy of the app built after
 * this command blocks the listed machines, even offline.
 */

import fs from 'node:fs';
import {
  PRIVATE_DIR,
  listRevocations,
  writeBundledRevocations,
  BUNDLED_REVOCATIONS_PATH
} from './license-core.mjs';

console.log('');
console.log('🔒 تحديث قائمة الإلغاء المدمجة في البرنامج...');

// A build machine without the developer folder must not wipe the list that is
// already bundled in the repository.
if (!fs.existsSync(PRIVATE_DIR)) {
  console.log('   ⚠️  لا يوجد مجلد private على هذا الجهاز — تم الإبقاء على القائمة الحالية كما هي.');
  console.log('');
  process.exit(0);
}

const list = writeBundledRevocations();

if (list.length === 0) {
  console.log('   لا توجد أجهزة ملغاة حتى الآن — القائمة فاضية.');
} else {
  console.log(`   ✅ ${list.length} جهاز ملغى:`);
  for (const row of list) {
    const date = row.revokedAt ? new Date(row.revokedAt).toISOString().slice(0, 10) : '-';
    console.log(`      ${row.mid}   (${date})${row.reason ? ' — ' + row.reason : ''}`);
  }
}

console.log('');
console.log(`   الملف: ${BUNDLED_REVOCATIONS_PATH}`);
console.log('   ⚠️  لن يصل الإلغاء للعملاء إلا بعد بناء إصدار جديد (npm run dist) ونشره.');
console.log('');
