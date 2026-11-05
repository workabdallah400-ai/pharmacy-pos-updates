/**
 * Pharmacy POS — Cloudflare Worker (permanent public report host)
 * ------------------------------------------------------------------
 * The very same report engine that runs inside the desktop app, but hosted on
 * Cloudflare's edge network:
 *
 *   • a permanent URL  → https://pharmacy-reports.<name>.workers.dev
 *   • real persistence → Cloudflare KV (the free tier keeps the data)
 *   • never sleeps     → the shift QR code always opens the report
 *
 * The data is pushed by the pharmacy PC (full database snapshot after every
 * shift close + a periodic heartbeat), so the Worker is only a mirror.
 *
 * Routes (identical to the local Node server):
 *   GET  /                      → reports index
 *   GET  /r/<shiftId>           → the styled Arabic shift report (QR target)
 *   GET  /d/YYYY-MM-DD          → daily summary
 *   GET  /m/YYYY-MM             → monthly summary
 *   GET  /health                → server status
 *   GET  /api/shift/<id>        → shift JSON
 *   GET  /api/day/<date>        → daily JSON
 *   GET  /api/month/<month>     → monthly JSON
 *   POST /api/pharmacy/snapshot → full database snapshot (authoritative)
 *   POST /api/pharmacy/sync     → offline outbox operations
 */

import {
  esc,
  money,
  safeId,
  emptySnapshot,
  snapshotOps,
  dataOf,
  buildShift,
  allShiftIds,
  dateKey,
  monthKey,
  collectRows,
  buildDaily,
  buildMonthly,
  pageShell,
  renderShiftPage,
  renderIndex,
  renderDailyPage,
  renderMonthlyPage
} from './report-core.cjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-pharmacy-id,x-report-token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS }
  });
}

function notFoundPage() {
  return pageShell(
    'غير موجود',
    `<div class="card"><h2>404 — الصفحة غير موجودة</h2>
       <p class="sub">تأكد من رابط التقرير أو ارفع الوردية أولاً من التطبيق.</p>
       <div class="actions"><a class="btn" href="/">الصفحة الرئيسية</a></div></div>`
  );
}

// --- KV storage ------------------------------------------------------------

function storeKey(pharmacyId) {
  return `store:${safeId(pharmacyId)}`;
}

async function loadStore(env, pharmacyId) {
  const raw = await env.REPORTS.get(storeKey(pharmacyId), 'json');
  if (raw && Array.isArray(raw.operations)) {
    if (!raw.snapshot) raw.snapshot = emptySnapshot();
    return raw;
  }
  return { pharmacyId, name: '', operations: [], snapshot: emptySnapshot(), updatedAt: null };
}

async function saveStore(env, pharmacyId, store) {
  store.updatedAt = new Date().toISOString();
  await env.REPORTS.put(storeKey(pharmacyId), JSON.stringify(store));

  // The pharmacy list is only used by /health — rewrite it when a new
  // pharmacy appears, otherwise every upload would waste a KV write
  // (the free tier allows 1 000 writes per day).
  const list = (await env.REPORTS.get('pharmacies', 'json')) || [];
  if (!list.some((p) => p.id === pharmacyId)) {
    list.push({ id: pharmacyId, name: store.name || '', updatedAt: store.updatedAt });
    await env.REPORTS.put('pharmacies', JSON.stringify(list));
  }
}

async function mergeSnapshot(env, pharmacyId, snapshot, pharmacyName) {
  const store = await loadStore(env, pharmacyId);
  if (pharmacyName) store.name = String(pharmacyName);
  store.snapshot = {
    shifts: Array.isArray(snapshot.shifts) ? snapshot.shifts : [],
    invoices: Array.isArray(snapshot.invoices) ? snapshot.invoices : [],
    purchases: Array.isArray(snapshot.purchases) ? snapshot.purchases : [],
    expenses: Array.isArray(snapshot.expenses) ? snapshot.expenses : [],
    returns: Array.isArray(snapshot.returns) ? snapshot.returns : [],
    capturedAt: new Date().toISOString()
  };
  await saveStore(env, pharmacyId, store);
  return {
    shifts: store.snapshot.shifts.length,
    invoices: store.snapshot.invoices.length,
    purchases: store.snapshot.purchases.length,
    expenses: store.snapshot.expenses.length,
    returns: store.snapshot.returns.length
  };
}

async function appendOperations(env, pharmacyId, operations, pharmacyName) {
  const store = await loadStore(env, pharmacyId);
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
  await saveStore(env, pharmacyId, store);
  return { added, total: store.operations.length };
}

// --- helpers ---------------------------------------------------------------

function pharmacyOf(url, request) {
  return (
    url.searchParams.get('pharmacyId') ||
    request.headers.get('x-pharmacy-id') ||
    'PHARMACY-LOCAL'
  );
}

function tokenOk(request, url, env, pharmacyId) {
  const expected = String(env.REPORT_TOKEN || '').trim();
  const provided = request.headers.get('x-report-token') || url.searchParams.get('token') || '';
  if (!provided) return false;
  // The master token (kept on the server only) opens everything.
  if (expected && provided === expected) return true;
  return false;
}

// Each pharmacy owns its own token. The token is registered once (see
// /api/pharmacy/claim) and then travels inside the QR links.
async function pharmacyTokenOk(env, pharmacyId, provided) {
  if (!provided) return false;
  const stored = await env.REPORTS.get(`token:${safeId(pharmacyId)}`);
  return !!stored && stored === provided;
}

async function readJson(request, limitBytes = 24 * 1024 * 1024) {
  const text = await request.text();
  if (text.length > limitBytes) throw new Error('Payload too large');
  return text ? JSON.parse(text) : {};
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      // --- write endpoints (need the token when one is configured) -------
      if (request.method === 'POST') {
        const payload = await readJson(request);

        // Register this installation: the pharmacy keeps its own token and
        // its own data. A taken id is reported back so the app can pick a
        // fresh one — two pharmacies never share a report.
        if (pathname === '/api/pharmacy/claim') {
          const pharmacyId = String(payload.pharmacyId || '').trim();
          const token = String(payload.token || '').trim();
          const pharmacyName = String(payload.pharmacyName || '').trim();
          if (!pharmacyId || !token) {
            return json({ ok: false, error: 'pharmacyId and token are required' }, 400);
          }
          const key = `token:${safeId(pharmacyId)}`;
          const existing = await env.REPORTS.get(key);
          if (existing && existing !== token) {
            return json({ ok: false, error: 'pharmacyId already in use', conflict: true }, 409);
          }
          if (!existing) {
            await env.REPORTS.put(key, token);
            const list = (await env.REPORTS.get('pharmacies', 'json')) || [];
            if (!list.some((p) => p.id === pharmacyId)) {
              list.push({ id: pharmacyId, name: pharmacyName, updatedAt: new Date().toISOString() });
              await env.REPORTS.put('pharmacies', JSON.stringify(list));
            }
          }
          return json({ ok: true, pharmacyId, claimed: !existing });
        }

        const pharmacyId = payload.pharmacyId || request.headers.get('x-pharmacy-id') || 'PHARMACY-LOCAL';
        const providedToken = request.headers.get('x-report-token') || '';
        const allowed = tokenOk(request, url, env) || await pharmacyTokenOk(env, pharmacyId, providedToken);
        if (!allowed) {
          return json({ ok: false, error: 'Unauthorized' }, 401);
        }

        if (pathname === '/api/pharmacy/snapshot' || pathname === '/api/pharmacy/backfill') {
          const counts = await mergeSnapshot(
            env,
            pharmacyId,
            payload.snapshot || {},
            payload.pharmacyName
          );
          return json({ ok: true, service: 'pharmacy-reports-worker', ...counts });
        }

        if (pathname === '/api/pharmacy/sync' || pathname === '/sync') {
          const operations = Array.isArray(payload.operations) ? payload.operations : [];
          if (operations.length === 0) return json({ ok: true, added: 0 });
          const result = await appendOperations(
            env,
            pharmacyId,
            operations,
            payload.pharmacyName
          );
          return json({ ok: true, added: result.added, total: result.total });
        }

        return json({ ok: false, error: 'Not found' }, 404);
      }

      // --- read endpoints ------------------------------------------------
      if (pathname === '/health') {
        const pharmacies = (await env.REPORTS.get('pharmacies', 'json')) || [];
        return json({
          ok: true,
          service: 'pharmacy-reports-worker',
          runtime: 'cloudflare-worker',
          time: new Date().toISOString(),
          pharmacies: pharmacies.map((p) => p.id)
        });
      }

      const pharmacyId = pharmacyOf(url, request);
      const providedToken = url.searchParams.get('token') || request.headers.get('x-report-token') || '';
      const allowed = tokenOk(request, url, env) || await pharmacyTokenOk(env, pharmacyId, providedToken);
      if (!allowed) {
        return json({ ok: false, error: 'Unauthorized' }, 401);
      }

      const store = await loadStore(env, pharmacyId);
      const name = store.name || pharmacyId;
      // The moment the pharmacy last pushed data — shown on every page so the
      // owner always knows how fresh the numbers are.
      const lastSyncAt = store.updatedAt || (store.snapshot && store.snapshot.capturedAt) || null;

      if (pathname.startsWith('/api/shift/')) {
        const shiftId = pathname.slice('/api/shift/'.length);
        const data = buildShift(store, shiftId);
        return json({ ok: true, pharmacyName: name, ...data });
      }

      if (pathname.startsWith('/api/day/')) {
        const date = pathname.slice('/api/day/'.length);
        const data = buildDaily(store, date);
        return json({ ok: true, pharmacyName: name, ...data });
      }

      if (pathname.startsWith('/api/month/')) {
        const month = pathname.slice('/api/month/'.length);
        const data = buildMonthly(store, month);
        return json({ ok: true, pharmacyName: name, ...data });
      }

      if (pathname.startsWith('/api/pharmacy/snapshot')) {
        return json({ ok: true, pharmacyId, name, ...store });
      }

      if (pathname === '/' || pathname === '/reports') {
        return html(renderIndex(name, store, { lastSyncAt }));
      }

      if (pathname.startsWith('/d/')) {
        const date = pathname.slice('/d/'.length);
        return html(renderDailyPage(name, buildDaily(store, date), { lastSyncAt }));
      }

      if (pathname.startsWith('/m/')) {
        const month = pathname.slice('/m/'.length);
        return html(renderMonthlyPage(name, buildMonthly(store, month), { lastSyncAt }));
      }

      if (pathname.startsWith('/r/')) {
        const shiftId = pathname.slice('/r/'.length);
        return html(renderShiftPage(name, shiftId, buildShift(store, shiftId), { lastSyncAt }));
      }

      return html(notFoundPage(), 404);
    } catch (err) {
      return json({ ok: false, error: err.message }, 500);
    }
  }
};
