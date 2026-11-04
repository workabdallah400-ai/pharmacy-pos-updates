/**
 * Copies the shared report engine into the Worker folder.
 *
 *   node scripts/sync-worker-core.cjs
 *
 * The Worker bundle must stay self-contained, and `server/report-core.cjs` is
 * the single source of truth for the Arabic report templates.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'server', 'report-core.cjs');
const target = path.join(root, 'worker', 'src', 'report-core.cjs');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('✅ worker/src/report-core.cjs synced with server/report-core.cjs');
