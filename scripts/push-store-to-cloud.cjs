/**
 * Pushes the local report-server store to the permanent cloud host
 * (Cloudflare Worker) — the same payload the desktop app sends after every
 * shift close.
 *
 *   node scripts/push-store-to-cloud.cjs <baseUrl> [pharmacyId]
 *
 * Example:
 *   node scripts/push-store-to-cloud.cjs https://pharmacy-reports.abdallahhack0.workers.dev
 */
const fs = require('fs');
const path = require('path');

const base = String(process.argv[2] || '').trim().replace(/\/+$/, '');
const pharmacyId = String(process.argv[3] || process.env.PHARMACY_ID || 'PH-EGYP-9102');
const token = String(process.env.REPORT_TOKEN || '').trim();

if (!base) {
  console.error('❌ طريقة الاستخدام: node scripts/push-store-to-cloud.cjs <baseUrl> [pharmacyId]');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const candidates = [
  path.join(process.env.APPDATA || '', 'pharmacy-pos-ui', 'report-data', `${pharmacyId}.json`),
  path.join(process.env.APPDATA || '', 'PharmacyPOS', 'report-data', `${pharmacyId}.json`),
  path.join(root, 'server', 'data', `${pharmacyId}.json`)
];

const file = candidates.find((f) => fs.existsSync(f));
if (!file) {
  console.error('❌ ملف المخزن مش موجود. الأماكن اللي اتدورت فيها:');
  candidates.forEach((c) => console.error('   -', c));
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(file, 'utf8'));
const payload = {
  pharmacyId,
  pharmacyName: store.name || '',
  snapshot: store.snapshot || { shifts: [], invoices: [], purchases: [], expenses: [], returns: [] }
};

(async () => {
  console.log(`→ ${file}`);
  console.log(`→ ${base}/api/pharmacy/snapshot`);

  const res = await fetch(`${base}/api/pharmacy/snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pharmacy-Id': pharmacyId,
      ...(token ? { 'X-Report-Token': token } : {})
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  process.exit(res.ok ? 0 : 1);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
