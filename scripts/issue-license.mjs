/**
 * Batch licence issuer (backwards-compatible entry point).
 *
 *   node scripts/issue-license.mjs EGYP-9B4C-D478-B27C
 *   node scripts/issue-license.mjs EGYP-AAAA-BBBB-CCCC EGYP-DDDD-EEEE-FFFF
 *   node scripts/issue-license.mjs --file C:\pharmacies\machine-ids.txt
 *
 * Each machine needs its own signed LIC2 token. This wrapper simply runs the
 * official tool (scripts/license-tool.mjs) once per machine ID so existing
 * workflows keep working.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const filePath = fileIndex >= 0 ? String(args[fileIndex + 1] || '').trim() : '';

let machineIds = args.filter((a) => !a.startsWith('--') && a !== filePath && !a.startsWith('-'));
if (filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fromFile = raw
      .split(/[\r\n,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^EGYP-/i.test(s));
    machineIds = machineIds.concat(fromFile);
  } catch (e) {
    console.error(`❌ مش قادر أقرأ الملف: ${filePath}`);
    process.exit(1);
  }
}

machineIds = [...new Set(machineIds.map((s) => s.trim().toUpperCase()).filter(Boolean))];

if (machineIds.length === 0) {
  console.error('❌ اكتب كود الجهاز، مثال:');
  console.error('   node scripts/issue-license.mjs EGYP-9B4C-D478-B27C');
  process.exit(1);
}

const toolPath = path.join(__dirname, 'license-tool.mjs');
let failed = 0;
for (const mid of machineIds) {
  const res = spawnSync(process.execPath, [toolPath, 'issue', mid], { stdio: 'inherit' });
  if (res.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n⚠️ فشل إصدار ${failed} من ${machineIds.length} ترخيص.`);
  process.exit(1);
}
