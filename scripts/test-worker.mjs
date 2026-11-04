/**
 * Local test for the Cloudflare Worker (no account needed).
 *
 *   node scripts/test-worker.mjs
 *
 * The Worker module is loaded directly and called with a fake KV binding and
 * a fake `Request`, so every route can be verified before deploying.
 */
import worker from '../worker/src/index.js';

const BASE = 'https://pharmacy-reports.test.workers.dev';
const PHARMACY = 'PH-WORKER-01';
const TOKEN = 'WORKER-TOKEN';

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

// --- a tiny in-memory KV ----------------------------------------------------
function createKv() {
  const map = new Map();
  return {
    async get(key, type) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      if (type === 'json') return JSON.parse(value);
      if (type === 'text') return value;
      return value;
    },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list() { return { keys: Array.from(map.keys()) }; },
    _map: map
  };
}

const env = { REPORTS: createKv(), REPORT_TOKEN: '' };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function call(path, options = {}) {
  const req = new Request(`${BASE}${path}`, options);
  return worker.fetch(req, env, ctx);
}

async function postJson(path, payload, headers = {}) {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
}

const SHIFT = {
  id: 'SH-WORKER-01',
  shift_number: 1,
  cashier_name: 'د. سارة أحمد',
  status: 'CLOSED',
  opening_cash: 100,
  cash_sales: 1184,
  visa_sales: 200,
  credit_sales: 50,
  total_sales: 1434,
  petty_expenses: 20,
  expected_cash: 1264,
  actual_cash: 1264,
  discrepancy: 0,
  opened_at: '2026-11-04T13:02:13.062Z',
  closed_at: '2026-11-04T15:30:00.000Z'
};

const INVOICE = {
  id: 'INV-WORKER-01',
  shift_id: 'SH-WORKER-01',
  date_time: '2026-11-04T14:10:00.000Z',
  customer_name: 'عميل نقدي',
  payment_method: 'كاش',
  total_retail: 1184,
  items: [{
    trade_name_ar: 'أبسترال',
    trade_name: 'Abstral',
    is_strip: true,
    quantity: 100,
    unit_price: 11.84,
    total_price: 1184
  }]
};

console.log('\n— write —');
const claim = await postJson('/api/pharmacy/claim', {
  pharmacyId: PHARMACY, pharmacyName: 'صيدلية الاختبار', token: TOKEN
});
check('POST /api/pharmacy/claim', claim.status === 200, `status ${claim.status}`);

const snap = await postJson('/api/pharmacy/snapshot', {
  pharmacyId: PHARMACY,
  pharmacyName: 'صيدلية الاختبار',
  snapshot: { shifts: [SHIFT], invoices: [INVOICE], purchases: [], expenses: [], returns: [] }
}, { 'X-Report-Token': TOKEN });
const snapJson = await snap.json();
check('POST /api/pharmacy/snapshot', snap.status === 200, `status ${snap.status}`);
check('snapshot stored', snapJson.shifts === 1 && snapJson.invoices === 1);

const sync = await postJson('/api/pharmacy/sync', {
  pharmacyId: PHARMACY,
  operations: [{
    entityType: 'invoice', entityId: 'INV-WORKER-01', action: 'CREATE',
    shiftId: 'SH-WORKER-01', createdAt: INVOICE.date_time, data: INVOICE
  }]
}, { 'X-Report-Token': TOKEN });
const syncJson = await sync.json();
check('POST /api/pharmacy/sync', sync.status === 200, `status ${sync.status}`);
check('operation accepted', syncJson.added === 1);

console.log('\n— read —');
const health = await call('/health');
check('GET /health', health.status === 200);
const healthJson = await health.json();
check('health knows the worker', healthJson.service === 'pharmacy-reports-worker');

const index = await call(`/?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const indexHtml = await index.text();
check('GET / (index)', index.status === 200);
check('index lists the shift', indexHtml.includes('SH-WORKER-01'));

const report = await call(`/r/SH-WORKER-01?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const reportHtml = await report.text();
check('GET /r/<shiftId> (QR target)', report.status === 200);
check('report is RTL Arabic', reportHtml.includes('dir="rtl"'));
check('report shows the cashier', reportHtml.includes('سارة'));
check('report shows the expected cash', reportHtml.includes('1,264'));
check('report lists the sold item', reportHtml.includes('أبسترال'));

const apiShift = await call(`/api/shift/SH-WORKER-01?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const apiShiftJson = await apiShift.json();
check('GET /api/shift/<id>', apiShift.status === 200);
check('api totals', Number(apiShiftJson.totals?.salesTotal) === 1434, String(apiShiftJson.totals?.salesTotal));

const apiDay = await call(`/api/day/2026-11-04?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const apiDayJson = await apiDay.json();
check('GET /api/day/<date>', apiDay.status === 200);
check('daily totals', Number(apiDayJson.totals?.salesTotal) === 1434, String(apiDayJson.totals?.salesTotal));

const day = await call(`/d/2026-11-04?pharmacyId=${PHARMACY}&token=${TOKEN}`);
check('GET /d/<date>', day.status === 200);
const dayHtml = await day.text();
check('a day with data still refreshes itself', dayHtml.includes('http-equiv="refresh"'));

const month = await call(`/m/2026-11?pharmacyId=${PHARMACY}&token=${TOKEN}`);
check('GET /m/<month>', month.status === 200);
const monthHtml = await month.text();
check('monthly page refreshes itself', monthHtml.includes('http-equiv="refresh"'));

const missing = await call(`/r/NOPE?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const missingHtml = await missing.text();
check('unknown shift still renders', missing.status === 200);
check('unknown shift shows the pending notice', missingHtml.includes('لم تصل بيانات هذه الوردية'));
check('unknown shift refreshes itself', missingHtml.includes('http-equiv="refresh"'));
check('page shows the last sync time', missingHtml.includes('آخر مزامنة'));

const emptyDay = await call(`/d/1999-01-01?pharmacyId=${PHARMACY}&token=${TOKEN}`);
const emptyDayHtml = await emptyDay.text();
check('a day without data still renders', emptyDay.status === 200);
check('empty day shows the pending notice', emptyDayHtml.includes('بيانات هذا اليوم لم تُرفع بعد'));
check('empty day refreshes itself', emptyDayHtml.includes('http-equiv="refresh"'));

const notFound = await call(`/nope?pharmacyId=${PHARMACY}&token=${TOKEN}`);
check('unknown route → 404', notFound.status === 404);

console.log('\n— token protection —');
env.REPORT_TOKEN = 'SEC-123';
const denied = await call(`/r/SH-WORKER-01?pharmacyId=${PHARMACY}`);
check('missing token → 401', denied.status === 401);
const allowed = await call(`/r/SH-WORKER-01?pharmacyId=${PHARMACY}&token=SEC-123`);
check('master token works', allowed.status === 200);
const deniedPost = await postJson('/api/pharmacy/snapshot', { pharmacyId: PHARMACY, snapshot: {} });
check('upload without the token → 401', deniedPost.status === 401);
const allowedPost = await postJson(
  '/api/pharmacy/snapshot',
  { pharmacyId: PHARMACY, snapshot: { shifts: [], invoices: [], purchases: [], expenses: [], returns: [] } },
  { 'X-Report-Token': 'SEC-123' }
);
check('upload with the master token works', allowedPost.status === 200);
env.REPORT_TOKEN = '';

console.log('\n— two pharmacies stay separate —');
const claimA = await postJson('/api/pharmacy/claim', {
  pharmacyId: 'PH-CLAIM-A', pharmacyName: 'صيدلية أ', token: 'TOKEN-A'
});
check('claim a free id', claimA.status === 200);
const claimAgain = await postJson('/api/pharmacy/claim', {
  pharmacyId: 'PH-CLAIM-A', pharmacyName: 'صيدلية أ', token: 'TOKEN-A'
});
check('claim the same id with the same token', claimAgain.status === 200);
const claimConflict = await postJson('/api/pharmacy/claim', {
  pharmacyId: 'PH-CLAIM-A', pharmacyName: 'صيدلية ب', token: 'TOKEN-B'
});
check('claim a taken id → 409', claimConflict.status === 409);
const readA = await call('/r/SH-WORKER-01?pharmacyId=PH-CLAIM-A&token=TOKEN-A');
check('own token opens the report', readA.status === 200);
const readB = await call('/r/SH-WORKER-01?pharmacyId=PH-CLAIM-A&token=TOKEN-B');
check('another pharmacy token is rejected', readB.status === 401);
const wrongOwner = await call('/r/SH-WORKER-01?pharmacyId=PH-CLAIM-B&token=TOKEN-A');
check('token of another pharmacy is rejected', wrongOwner.status === 401);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
