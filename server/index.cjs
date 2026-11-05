/**
 * Pharmacy POS — Local / Cloud Report & Sync Server
 * -------------------------------------------------
 * Zero-dependency Node.js server that:
 *   1. Receives the offline outbox batch from the POS app.
 *   2. Stores every operation per pharmacy in a JSON file.
 *   3. Serves a beautiful, mobile-friendly Arabic shift report page at /r/<shiftId>.
 *
 * Run locally (LAN):            node server/index.cjs
 * Custom port / data folder:   PORT=8080 DATA_DIR=./data node server/index.cjs
 * Cloud (Render/Railway/VPS):   set PORT (usually provided) and mount a persistent disk.
 *
 * The same file is embedded in the Electron desktop app, so scanning a shift QR
 * on a phone connected to the same Wi-Fi opens the report without any internet.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// The report logic and the Arabic templates live in report-core.cjs so that
// the local server and the Cloudflare Worker render exactly the same pages.
const {
  esc, money, safeId, emptySnapshot, snapshotOps, dataOf, buildShift, allShiftIds,
  dateKey, monthKey, collectRows, buildDaily, buildMonthly, pageShell,
  renderShiftPage, renderIndex, renderDailyPage, renderMonthlyPage
} = require('./report-core.cjs');

const DEFAULT_PORT = Number(process.env.PORT || process.env.PHARMACY_REPORT_PORT || 4100);
const TOKEN = String(process.env.REPORT_TOKEN || '').trim();

function getLanIp() {
  try {
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
      }
    }
    const preferred = candidates.find((ip) => /^192\.168\./.test(ip)) ||
      candidates.find((ip) => /^10\./.test(ip)) ||
      candidates.find((ip) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip));
    return preferred || candidates[0] || '127.0.0.1';
  } catch (e) {
    return '127.0.0.1';
  }
}


function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Free cloud hosts (Render / Koyeb / Railway / Fly) use an ephemeral file
// system, and some of them mount the disk read-only. We try the preferred
// folder first and fall back to a writable temp folder so the server never
// crashes on start-up.
function isWritable(dir) {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

function resolveDataDir(preferred) {
  const candidates = [];
  if (preferred) candidates.push(preferred);
  if (process.env.DATA_DIR) candidates.push(process.env.DATA_DIR);
  // Linux containers (Render / Koyeb / Railway / Fly) expose a writable /tmp.
  if (process.platform !== 'win32') candidates.push('/tmp/data');
  candidates.push(path.join(os.tmpdir(), 'pharmacy-pos-data'));

  for (const candidate of candidates) {
    if (isWritable(candidate)) {
      if (preferred && path.resolve(candidate) !== path.resolve(preferred)) {
        console.warn(`⚠️  مجلد البيانات "${preferred}" غير قابل للكتابة — تم التحويل إلى "${candidate}"`);
      }
      return candidate;
    }
  }
  // Last resort: let it throw later with a clear error.
  return preferred || path.join(process.cwd(), 'data');
}

function storePath(dataDir, pharmacyId) {
  return path.join(dataDir, `${safeId(pharmacyId)}.json`);
}

function loadStore(dataDir, pharmacyId) {
  ensureDir(dataDir);
  const file = storePath(dataDir, pharmacyId);
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && Array.isArray(parsed.operations)) {
        if (!parsed.snapshot) parsed.snapshot = emptySnapshot();
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read store, starting a fresh one:', e.message);
  }
  return { pharmacyId, name: '', operations: [], snapshot: emptySnapshot(), updatedAt: null };
}


function mergeSnapshot(dataDir, pharmacyId, snapshot, pharmacyName) {
  const store = loadStore(dataDir, pharmacyId);
  if (pharmacyName) store.name = String(pharmacyName);
  store.snapshot = {
    shifts: Array.isArray(snapshot.shifts) ? snapshot.shifts : [],
    invoices: Array.isArray(snapshot.invoices) ? snapshot.invoices : [],
    purchases: Array.isArray(snapshot.purchases) ? snapshot.purchases : [],
    expenses: Array.isArray(snapshot.expenses) ? snapshot.expenses : [],
    returns: Array.isArray(snapshot.returns) ? snapshot.returns : [],
    outOfStock: Array.isArray(snapshot.outOfStock) ? snapshot.outOfStock : [],
    capturedAt: new Date().toISOString()
  };
  saveStore(dataDir, pharmacyId, store);
  return {
    shifts: store.snapshot.shifts.length,
    invoices: store.snapshot.invoices.length,
    purchases: store.snapshot.purchases.length,
    expenses: store.snapshot.expenses.length,
    returns: store.snapshot.returns.length
  };
}

function saveStore(dataDir, pharmacyId, store) {
  ensureDir(dataDir);
  store.updatedAt = new Date().toISOString();
  const file = storePath(dataDir, pharmacyId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, file);
}

function appendOperations(dataDir, pharmacyId, operations, pharmacyName) {
  const store = loadStore(dataDir, pharmacyId);
  if (pharmacyName) store.name = String(pharmacyName);
  const seen = new Set(
    store.operations.map((op) => `${op.entityType}|${op.entityId}|${op.action}|${op.createdAt}`)
  );
  let added = 0;
  for (const op of operations || []) {
    const key = `${op.entityType}|${op.entityId}|${op.action}|${op.createdAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    store.operations.push({ ...op, receivedAt: new Date().toISOString() });
    added += 1;
  }
  saveStore(dataDir, pharmacyId, store);
  return { added, total: store.operations.length, store };
}


function parseBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-pharmacy-id,x-report-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function startReportServer({ port = DEFAULT_PORT, dataDir, token = TOKEN, host = '0.0.0.0' } = {}) {
  const resolvedDataDir = resolveDataDir(dataDir);
  ensureDir(resolvedDataDir);
  const startedAt = Date.now();
  const logRequests = process.env.LOG_REQUESTS !== 'false';

  const server = http.createServer(async (req, res) => {
    const requestStarted = Date.now();
    if (logRequests) {
      res.on('finish', () => {
        const ms = Date.now() - requestStarted;
        console.log(`${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
      });
    }
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Malformed paths (e.g. "/%") must answer 400, never crash the process.
    let url;
    let pathname;
    try {
      url = new URL(req.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Bad request' }));
      return;
    }

    const providedToken = req.headers['x-report-token'] || url.searchParams.get('token') || '';
    if (token && providedToken !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
      return;
    }

    try {
      // --- Full database snapshot (backfill) --------------------------
      if (req.method === 'POST' && (pathname === '/api/pharmacy/snapshot' || pathname === '/api/pharmacy/backfill')) {
        const payload = await parseBody(req, 24 * 1024 * 1024);
        const pharmacyId = payload.pharmacyId || req.headers['x-pharmacy-id'] || 'PHARMACY-LOCAL';
        const snapshot = payload.snapshot || {};
        const counts = mergeSnapshot(resolvedDataDir, pharmacyId, snapshot, payload.pharmacyName);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, ...counts }));
        return;
      }

      // --- Sync ingest -------------------------------------------------
      if (req.method === 'POST' && (pathname === '/api/pharmacy/sync' || pathname === '/sync')) {
        const payload = await parseBody(req);
        const pharmacyId = payload.pharmacyId || req.headers['x-pharmacy-id'] || 'PHARMACY-LOCAL';
        const operations = Array.isArray(payload.operations) ? payload.operations : [];
        if (operations.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, added: 0 }));
          return;
        }
        const result = appendOperations(resolvedDataDir, pharmacyId, operations, payload.pharmacyName);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, added: result.added, total: result.total }));
        return;
      }

      if (req.method === 'GET' && pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          service: 'pharmacy-report-server',
          time: new Date().toISOString(),
          lanUrl: `http://${getLanIp()}:${port}`
        }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/shift/')) {
        const shiftId = pathname.slice('/api/shift/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildShift(store, shiftId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, pharmacyName: store.name || pharmacyId, ...data }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/day/')) {
        const date = pathname.slice('/api/day/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildDaily(store, date);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, pharmacyName: store.name || pharmacyId, ...data }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/month/')) {
        const month = pathname.slice('/api/month/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildMonthly(store, month);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, pharmacyName: store.name || pharmacyId, ...data }));
        return;
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/reports')) {
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderIndex(store.name || pharmacyId, store, {
          lastSyncAt: store.updatedAt || (store.snapshot && store.snapshot.capturedAt) || null,
          linkQuery: url.search
        }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/d/')) {
        const date = pathname.slice('/d/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildDaily(store, date);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderDailyPage(store.name || pharmacyId, data, {
          lastSyncAt: store.updatedAt || (store.snapshot && store.snapshot.capturedAt) || null,
          linkQuery: url.search
        }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/m/')) {
        const month = pathname.slice('/m/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildMonthly(store, month);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderMonthlyPage(store.name || pharmacyId, data, {
          lastSyncAt: store.updatedAt || (store.snapshot && store.snapshot.capturedAt) || null,
          linkQuery: url.search
        }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/r/')) {
        const shiftId = pathname.slice('/r/'.length);
        const pharmacyId = url.searchParams.get('pharmacyId') || 'PHARMACY-LOCAL';
        const store = loadStore(resolvedDataDir, pharmacyId);
        const data = buildShift(store, shiftId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderShiftPage(store.name || pharmacyId, shiftId, data, {
          lastSyncAt: store.updatedAt || (store.snapshot && store.snapshot.capturedAt) || null,
          linkQuery: url.search
        }));
        return;
      }

      // --- Update feed (installer packages for the auto-updater) ---------
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/updates/')) {
        const fileName = path.basename(decodeURIComponent(pathname.slice('/updates/'.length)));
        const filePath = path.join(resolvedDataDir, 'updates', fileName);
        if (!fileName || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Update file not found' }));
          return;
        }
        const stat = fs.statSync(filePath);
        const contentType = fileName.endsWith('.yml') || fileName.endsWith('.yaml')
          ? 'text/yaml; charset=utf-8'
          : fileName.endsWith('.json')
            ? 'application/json; charset=utf-8'
            : fileName.endsWith('.exe')
              ? 'application/vnd.microsoft.portable-executable'
              : 'application/octet-stream';
        const range = req.headers.range;
        const headers = {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        };
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          if (match) {
            const start = Number(match[1]);
            const end = match[2] ? Number(match[2]) : stat.size - 1;
            if (start >= stat.size) {
              res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
              res.end();
              return;
            }
            headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
            headers['Content-Length'] = end - start + 1;
            res.writeHead(206, headers);
            if (req.method === 'HEAD') { res.end(); return; }
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
          }
        }
        headers['Content-Length'] = stat.size;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageShell('غير موجود', '<div class="card"><h2>404 — الصفحة غير موجودة</h2><p class="sub">تأكد من رابط التقرير أو ارفع الوردية أولاً من التطبيق.</p><div class="actions"><a class="btn" href="/">الصفحة الرئيسية</a></div></div>'));
    } catch (err) {
      console.error('Report server error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const lanUrl = `http://${getLanIp()}:${port}`;
      console.log(`\n📱 Pharmacy report server ready`);
      console.log(`   Local:   http://localhost:${port}`);
      console.log(`   Network: ${lanUrl}   (افتح هذا الرابط من الموبايل على نفس الواي فاي)`);
      console.log(`   Reports: ${lanUrl}/r/<shiftId>`);
      console.log(`   Data:    ${resolvedDataDir}`);
      console.log(`   Token:   ${token ? 'مفعّل 🔒' : 'بدون رمز (استخدام محلي فقط)'}\n`);
      resolve({
        server,
        port,
        lanUrl,
        localUrl: `http://localhost:${port}`,
        dataDir: resolvedDataDir,
        startedAt,
        close: () => new Promise((r) => {
          // Force-close idle keep-alive sockets so the process can exit fast
          // on platforms that send SIGTERM before killing the container.
          if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
          if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
          server.close(() => r());
        })
      });
    });
  });
}

// Graceful shutdown: finish the in-flight request, flush the data folder and
// exit cleanly. Cloud hosts send SIGTERM when they restart or scale to zero.
function installSignalHandlers(instance) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n👋 جاري إيقاف السيرفر (${signal})…`);
    try {
      await instance.close();
    } catch (e) {
      console.warn('Shutdown error:', e && e.message);
    }
    console.log('✅ تم إيقاف السيرفر بأمان');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
  });
}

module.exports = {
  startReportServer,
  getLanIp,
  buildShift,
  buildDaily,
  buildMonthly,
  collectRows,
  loadStore,
  mergeSnapshot,
  snapshotOps,
  dateKey,
  monthKey,
  resolveDataDir,
  installSignalHandlers,
  DEFAULT_PORT
};

if (require.main === module) {
  startReportServer({
    port: DEFAULT_PORT,
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data')
  })
    .then((instance) => {
      installSignalHandlers(instance);
    })
    .catch((err) => {
      console.error('Failed to start report server:', err);
      process.exit(1);
    });
}
