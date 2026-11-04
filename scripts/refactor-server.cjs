/**
 * One-time refactor: makes `server/index.cjs` use `server/report-core.cjs`
 * instead of carrying its own copy of the pure report logic.
 *
 *   node scripts/refactor-server.cjs
 *
 * (The split itself is produced by scripts/split-server-core.cjs.)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'server', 'index.cjs');

let lines = fs.readFileSync(serverPath, 'utf8').split(/\r?\n/);

if (lines.some((l) => l.includes("require('./report-core.cjs')"))) {
  console.log('ℹ️  server/index.cjs already uses report-core.cjs — nothing to do.');
  process.exit(0);
}

// Remove the pure blocks (bottom-up so the line numbers stay valid).
const RANGES = [[235, 907], [124, 185], [43, 61]];
for (const [from, to] of RANGES) {
  lines.splice(from - 1, to - from + 1);
}

const anchor = lines.findIndex((l) => l.startsWith("const crypto = require('crypto')"));
if (anchor < 0) throw new Error('Could not find the require block in server/index.cjs');

const inject = [
  '',
  '// The report logic and the Arabic templates live in report-core.cjs so that',
  '// the local server and the Cloudflare Worker render exactly the same pages.',
  'const {',
  '  esc, money, safeId, emptySnapshot, snapshotOps, dataOf, buildShift, allShiftIds,',
  '  dateKey, monthKey, collectRows, buildDaily, buildMonthly, pageShell,',
  '  renderShiftPage, renderIndex, renderDailyPage, renderMonthlyPage',
  "} = require('./report-core.cjs');"
];
lines.splice(anchor + 1, 0, ...inject);

fs.writeFileSync(serverPath, lines.join('\n'), 'utf8');
console.log(`✅ server/index.cjs now delegates to report-core.cjs (${lines.length} lines)`);
