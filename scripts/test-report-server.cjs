/**
 * End-to-end test for the local report server (and the shared report core).
 *
 *   node scripts/test-report-server.cjs
 *
 * Boots server/index.cjs on a spare port with a temporary data folder, seeds
 * it with a known shift and checks every route the QR code can point at.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..');
const { startReportServer } = require(path.join(root, 'server', 'index.cjs'));

const PORT = Number(process.env.TEST_PORT || 4211);
const PHARMACY = 'PH-TEST-0001';

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: pathname, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
  });
}

function post(pathname, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.write(data);
    req.end();
  });
}

const SHIFT = {
  id: 'SH-TEST-01',
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
  id: 'INV-TEST-01',
  shift_id: 'SH-TEST-01',
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

(async () => {
  const dataDir = path.join(os.tmpdir(), `pharmacy-server-test-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const instance = await startReportServer({ port: PORT, dataDir, token: '' });
  console.log(`\n— server on port ${PORT} —`);

  try {
    // 1. Upload a full snapshot (exactly what the desktop app does).
    const snap = await post('/api/pharmacy/snapshot', {
      pharmacyId: PHARMACY,
      pharmacyName: 'صيدلية الاختبار',
      snapshot: { shifts: [SHIFT], invoices: [INVOICE], purchases: [], expenses: [], returns: [] }
    });
    check('POST /api/pharmacy/snapshot', snap.status === 200, `status ${snap.status}`);
    check('snapshot counts', JSON.parse(snap.body || '{}').shifts === 1);

    // 2. Sync ingest (the offline outbox).
    const sync = await post('/api/pharmacy/sync', {
      pharmacyId: PHARMACY,
      operations: [{
        entityType: 'shift', entityId: 'SH-TEST-01', action: 'CLOSE',
        shiftId: 'SH-TEST-01', createdAt: SHIFT.closed_at, data: SHIFT
      }]
    });
    check('POST /api/pharmacy/sync', sync.status === 200, `status ${sync.status}`);

    // 3. Read routes.
    const health = await get('/health');
    check('GET /health', health.status === 200);

    const index = await get(`/?pharmacyId=${PHARMACY}`);
    check('GET / (index)', index.status === 200);
    check('index lists the shift', index.body.includes('SH-TEST-01'));

    const report = await get(`/r/SH-TEST-01?pharmacyId=${PHARMACY}`);
    check('GET /r/<shiftId>', report.status === 200);
    check('report is RTL Arabic', report.body.includes('dir="rtl"'));
    check('report shows the cashier', report.body.includes('سارة'));
    check('report shows the expected cash', report.body.includes('1,264'));
    check('report shows the discrepancy', report.body.includes('الفرق'));
    check('report lists the sold item', report.body.includes('أبسترال'));

    const apiShift = await get(`/api/shift/SH-TEST-01?pharmacyId=${PHARMACY}`);
    check('GET /api/shift/<id>', apiShift.status === 200);
    const shiftJson = JSON.parse(apiShift.body || '{}');
    check('api totals', Number(shiftJson.totals && shiftJson.totals.salesTotal) === 1434,
      String(shiftJson.totals && shiftJson.totals.salesTotal));

    const apiDay = await get(`/api/day/2026-11-04?pharmacyId=${PHARMACY}`);
    check('GET /api/day/<date>', apiDay.status === 200);
    const dayJson = JSON.parse(apiDay.body || '{}');
    check('daily totals', Number(dayJson.totals && dayJson.totals.salesTotal) === 1434,
      String(dayJson.totals && dayJson.totals.salesTotal));

    const day = await get(`/d/2026-11-04?pharmacyId=${PHARMACY}`);
    check('GET /d/<date>', day.status === 200);
    check('daily page is Arabic', day.body.includes('ملخص اليوم'));
    check('a day with data still refreshes itself', day.body.includes('http-equiv="refresh"'));

    const month = await get(`/m/2026-11?pharmacyId=${PHARMACY}`);
    check('GET /m/<month>', month.status === 200);
    check('monthly page is Arabic', month.body.includes('إجمالي الشهر'));
    check('monthly page refreshes itself', month.body.includes('http-equiv="refresh"'));

    const missing = await get('/r/DOES-NOT-EXIST?pharmacyId=PHARMACY');
    check('unknown shift still renders', missing.status === 200);
    check('unknown shift shows the pending notice', missing.body.includes('لم تصل بيانات هذه الوردية'));
    check('unknown shift refreshes itself', missing.body.includes('http-equiv="refresh"'));
    check('page shows the last sync time', missing.body.includes('آخر مزامنة'));

    const emptyDay = await get('/d/1999-01-01?pharmacyId=PHARMACY');
    check('a day without data still renders', emptyDay.status === 200);
    check('empty day shows the pending notice', emptyDay.body.includes('بيانات هذا اليوم لم تُرفع بعد'));
    check('empty day refreshes itself', emptyDay.body.includes('http-equiv="refresh"'));

    const notFound = await get('/nope');
    check('unknown route → 404 page', notFound.status === 404);

    // An invoice issued without an open shift (return / disposal / one-off
    // invoice) must still show up in the daily summary the owner follows.
    const loose = await post('/api/pharmacy/snapshot', {
      pharmacyId: 'PH-LOOSE-01',
      pharmacyName: 'صيدلية بدون وردية',
      snapshot: {
        shifts: [],
        invoices: [{
          id: 'INV-LOOSE-01',
          shift_id: '',
          date_time: '2026-11-04T16:00:00.000Z',
          customer_name: 'عميل نقدي',
          payment_method: 'كاش',
          total_retail: 250,
          items: [{
            trade_name_ar: 'أبسترال', trade_name: 'Abstral', is_strip: true,
            quantity: 5, unit_price: 50, total_price: 250
          }]
        }],
        purchases: [], expenses: [], returns: []
      }
    });
    check('snapshot without a shift', loose.status === 200, `status ${loose.status}`);
    const looseDay = await get('/d/2026-11-04?pharmacyId=PH-LOOSE-01');
    const looseJson = JSON.parse((await get('/api/day/2026-11-04?pharmacyId=PH-LOOSE-01')).body || '{}');
    check('a shift-less invoice counts in the day', Number(looseJson.totals?.salesTotal) === 250,
      String(looseJson.totals?.salesTotal));
    check('the shift-less invoice is listed', looseDay.body.includes('أبسترال'));

    // A malformed path must answer 400 and must not kill the process.
    const malformed = await get('/%');
    check('malformed URL → 400', malformed.status === 400, `status ${malformed.status}`);
    const stillAlive = await get('/health');
    check('server survives a malformed URL', stillAlive.status === 200, `status ${stillAlive.status}`);

    // The daily page reads outOfStock from the uploaded snapshot.
    const withStock = await post('/api/pharmacy/snapshot', {
      pharmacyId: 'PH-STOCK-01',
      snapshot: {
        shifts: [],
        invoices: [],
        purchases: [],
        expenses: [],
        returns: [],
        outOfStock: [{ trade_name_ar: 'صنف ناقص للاختبار', barcode: '0001', price_box: 12 }]
      }
    });
    check('snapshot with outOfStock', withStock.status === 200, `status ${withStock.status}`);
    const stockDay = await get('/d/1999-01-01?pharmacyId=PH-STOCK-01');
    check('outOfStock reaches the daily report', stockDay.body.includes('صنف ناقص للاختبار'));
  } finally {
    try { instance.server.close(); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
