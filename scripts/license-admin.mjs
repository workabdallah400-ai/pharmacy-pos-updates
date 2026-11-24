/**
 * Local licence admin panel.
 *
 *   npm run license:admin
 *
 * Starts a small server on 127.0.0.1 (never exposed to the network) that uses
 * the private key from `private/` to:
 *   - issue LIFETIME / TIMED licences for a machine ID,
 *   - issue signed REVOKE codes (instant cancellation),
 *   - maintain the revocation list bundled into the next release,
 *   - show everything that was issued and revoked.
 *
 * The private key stays in this process; the browser never sees it.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import {
  loadPrivateKey,
  issueLicense,
  revokeLicense,
  listRevocations,
  removeRevocation,
  writeBundledRevocations,
  readIssuedLog,
  inspectToken,
  isValidMachineId,
  normalizeMachineId,
  MAX_LICENSE_DAYS,
  ROOT_DIR
} from './license-core.mjs';
import { CURRENT_KID } from '../src/utils/licensePublicKey.js';

const PORT = Number(process.env.PHARMACY_LICENSE_ADMIN_PORT || 4310);
const HOST = '127.0.0.1';
const SESSION_KEY = crypto.randomBytes(24).toString('hex');

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('الطلب أكبر من المسموح.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('صيغة الطلب غير صحيحة.'));
      }
    });
    req.on('error', reject);
  });
}

function requireSession(req, res) {
  if (req.headers['x-admin-key'] !== SESSION_KEY) {
    json(res, 403, { ok: false, error: 'جلسة غير صالحة — أعد فتح الصفحة من الرابط الذي ظهر في الطرفية.' });
    return false;
  }
  return true;
}

async function buildState() {
  const log = readIssuedLog();
  const issued = log
    .filter((row) => String(row.typ || '').toUpperCase() !== 'REVOKE')
    .slice(-200)
    .reverse();
  const revoked = listRevocations();
  return {
    ok: true,
    kid: CURRENT_KID,
    maxDays: MAX_LICENSE_DAYS,
    issued,
    revoked,
    issuedCount: log.filter((row) => String(row.typ || '').toUpperCase() !== 'REVOKE').length,
    revokedCount: revoked.length,
    root: ROOT_DIR
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:"
      });
      res.end(renderPage());
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      json(res, 404, { ok: false, error: 'غير موجود.' });
      return;
    }
    if (req.method !== 'POST' && url.pathname !== '/api/state') {
      json(res, 405, { ok: false, error: 'طريقة غير مسموحة.' });
      return;
    }
    if (!requireSession(req, res)) return;

    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, await buildState());
      return;
    }

    const body = await readBody(req);

    if (url.pathname === '/api/issue') {
      const mid = normalizeMachineId(body.mid);
      if (!isValidMachineId(mid)) {
        json(res, 400, { ok: false, error: `كود الجهاز غير صالح: ${mid || '(فاضي)'} — الصيغة: EGYP-XXXX-YYYY-ZZZZ` });
        return;
      }
      const privateKey = await loadPrivateKey();
      const result = issueLicense(privateKey, {
        mid,
        type: body.type === 'TIMED' ? 'TIMED' : 'LIFETIME',
        days: body.days,
        until: body.until
      });
      const check = await inspectToken(result.token);
      json(res, 200, {
        ok: true,
        token: result.token,
        payload: result.payload,
        expiresAt: result.expiresAt,
        signatureValid: check.signatureValid
      });
      return;
    }

    if (url.pathname === '/api/revoke') {
      const mid = normalizeMachineId(body.mid);
      if (!isValidMachineId(mid)) {
        json(res, 400, { ok: false, error: `كود الجهاز غير صالح: ${mid || '(فاضي)'}` });
        return;
      }
      const privateKey = await loadPrivateKey();
      const result = revokeLicense(privateKey, { mid, reason: body.reason || '' });
      json(res, 200, {
        ok: true,
        token: result.token,
        payload: result.payload,
        entry: result.entry
      });
      return;
    }

    if (url.pathname === '/api/remove-revocation') {
      const removed = removeRevocation(body.mid);
      json(res, 200, { ok: true, removed });
      return;
    }

    if (url.pathname === '/api/build') {
      const list = writeBundledRevocations();
      json(res, 200, { ok: true, count: list.length });
      return;
    }

    json(res, 404, { ok: false, error: 'مسار غير معروف.' });
  } catch (err) {
    json(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
  }
});

function renderPage() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>لوحة تراخيص صيدليتي</title>
<style>
  :root { color-scheme: dark; --bg:#070d18; --card:#0b1220; --line:#23324d; --teal:#2dd4bf; --muted:#94a3b8; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 60px; background:radial-gradient(circle at 50% 0%, #16233a 0%, var(--bg) 55%); color:#e2e8f0;
         font-family:"Segoe UI", Tahoma, Arial, sans-serif; line-height:1.7; }
  .wrap { max-width:1050px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 4px; color:var(--teal); }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:820px) { .grid { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px 20px; margin-bottom:16px; }
  .card h2 { font-size:15px; margin:0 0 12px; color:#f8fafc; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input, select, textarea { width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line);
         background:#0f1a2c; color:#e2e8f0; font-size:13px; font-family:inherit; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--teal); }
  button { cursor:pointer; border:none; border-radius:10px; padding:10px 16px; font-size:13px; font-weight:700; font-family:inherit; }
  .primary { background:var(--teal); color:#04211d; }
  .danger { background:#7f1d1d; color:#fee2e2; }
  .ghost { background:#17233a; color:#cbd5e1; border:1px solid var(--line); }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; }
  .out { margin-top:12px; display:none; }
  .out.show { display:block; }
  .token { width:100%; min-height:86px; direction:ltr; text-align:left; font-family:Consolas, monospace; font-size:12px;
           background:#050a13; border:1px solid #1e2d45; color:#a7f3d0; border-radius:10px; padding:10px; resize:vertical; }
  .ok { color:#5eead4; font-size:12px; margin-top:6px; }
  .err { color:#fca5a5; font-size:12px; margin-top:6px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:7px 8px; border-bottom:1px solid #1b2941; text-align:right; vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:11px; }
  td.mono { direction:ltr; text-align:left; font-family:Consolas, monospace; font-size:11px; }
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:10px; font-weight:700; }
  .pill.life { background:#0f766e; color:#ccfbf1; }
  .pill.timed { background:#78350f; color:#fed7aa; }
  .warn { background:#2a1005; border-color:#b45309; }
  .warn h2 { color:#fb923c; }
  .hint { color:var(--muted); font-size:11px; margin-top:6px; }
  .kpi { display:flex; gap:8px; flex-wrap:wrap; }
  .kpi span { background:#111c2f; border:1px solid var(--line); border-radius:999px; padding:3px 12px; font-size:11px; color:#cbd5e1; }
  .scroll { max-height:300px; overflow:auto; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🔐 لوحة تراخيص صيدليتي</h1>
  <div class="sub">محلية فقط (127.0.0.1) — المفتاح الخاص لا يغادر هذا الجهاز. مفتاح التوقيع: <b id="kid">—</b></div>
  <div class="kpi"><span id="kpiIssued">—</span><span id="kpiRevoked">—</span><span>الرموز تبدأ بـ LIC2.</span></div>

  <div class="grid">
    <div class="card">
      <h2>① إصدار ترخيص</h2>
      <label>كود الجهاز (من شاشة التفعيل)</label>
      <input id="issueMid" placeholder="EGYP-XXXX-YYYY-ZZZZ" autocomplete="off" />
      <label>نوع الترخيص</label>
      <select id="issueType">
        <option value="LIFETIME">مدى الحياة</option>
        <option value="TIMED">مدة محددة</option>
      </select>
      <div id="timedBox" style="display:none">
        <label>المدة بالأيام (أو تاريخ انتهاء)</label>
        <input id="issueDays" type="number" value="365" min="1" max="3650" />
        <input id="issueUntil" style="margin-top:8px" placeholder="اختياري: 2027-12-31" autocomplete="off" />
      </div>
      <div class="row"><button class="primary" id="btnIssue">إصدار المفتاح</button></div>
      <div class="out" id="issueOut">
        <textarea class="token" id="issueToken" readonly></textarea>
        <div class="row">
          <button class="ghost" data-copy="issueToken">نسخ المفتاح</button>
          <button class="ghost" id="btnIssueAgain">إصدار لجهاز آخر</button>
        </div>
        <div class="ok" id="issueMsg"></div>
      </div>
    </div>

    <div class="card warn">
      <h2>② إلغاء ترخيص (فوري)</h2>
      <label>كود الجهاز</label>
      <input id="revokeMid" placeholder="EGYP-XXXX-YYYY-ZZZZ" autocomplete="off" />
      <label>السبب (اختياري)</label>
      <input id="revokeReason" placeholder="عدم سداد — إساءة استخدام..." autocomplete="off" />
      <div class="row"><button class="danger" id="btnRevoke">إلغاء وإصدار رمز REVOKE</button></div>
      <div class="out" id="revokeOut">
        <textarea class="token" id="revokeToken" readonly></textarea>
        <div class="row"><button class="ghost" data-copy="revokeToken">نسخ رمز الإلغاء</button></div>
        <div class="ok" id="revokeMsg"></div>
      </div>
      <div class="hint">الإلغاء يُطبَّق فوراً إذا أدخل العميل الرمز في شاشة التفعيل. ولإيقافه حتى بدون تعاون العميل: اضغط «تحديث قائمة الإلغاء» ثم ابنِ إصداراً جديداً.</div>
    </div>
  </div>

  <div class="card">
    <h2>③ قائمة الإلغاء المدمجة في البرنامج</h2>
    <div class="row">
      <button class="primary" id="btnBuild">تحديث قائمة الإلغاء (license:revocations)</button>
      <span class="hint" id="buildMsg"></span>
    </div>
    <div class="scroll" style="margin-top:12px">
      <table><thead><tr><th>كود الجهاز</th><th>السبب</th><th>وقت الإلغاء</th><th></th></tr></thead>
      <tbody id="revokedBody"><tr><td colspan="4" class="hint">لا توجد أجهزة ملغاة.</td></tr></tbody></table>
    </div>
    <div class="hint">القائمة تُدمج داخل البرنامج عند البناء. الأجهزة الملغاة تُرفض حتى بدون إنترنت.</div>
  </div>

  <div class="card">
    <h2>④ آخر التراخيص الصادرة</h2>
    <div class="scroll">
      <table><thead><tr><th>كود الجهاز</th><th>النوع</th><th>رقم الترخيص</th><th>صدر في</th><th>ينتهي</th></tr></thead>
      <tbody id="issuedBody"><tr><td colspan="5" class="hint">لا توجد تراخيص.</td></tr></tbody></table>
    </div>
  </div>
</div>

<script>
const KEY = ${JSON.stringify(SESSION_KEY)};
const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': KEY },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'رد غير صالح من الخادم.' }));
  if (!res.ok && !data.error) data.error = 'فشل الطلب.';
  return data;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toISOString().slice(0, 10);
}

async function loadState() {
  const res = await fetch('/api/state', { headers: { 'x-admin-key': KEY } });
  const data = await res.json();
  if (!data.ok) return;
  $('kid').textContent = data.kid;
  $('kpiIssued').textContent = 'تراخيص صادرة: ' + data.issuedCount;
  $('kpiRevoked').textContent = 'أجهزة ملغاة: ' + data.revokedCount;

  const rb = $('revokedBody');
  rb.innerHTML = '';
  if (!data.revoked.length) {
    rb.innerHTML = '<tr><td colspan="4" class="hint">لا توجد أجهزة ملغاة.</td></tr>';
  } else {
    for (const row of data.revoked) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="mono"></td><td></td><td></td><td></td>';
      tr.children[0].textContent = row.mid;
      tr.children[1].textContent = row.reason || '';
      tr.children[2].textContent = fmtDate(row.revokedAt);
      const btn = document.createElement('button');
      btn.className = 'ghost';
      btn.textContent = 'إزالة';
      btn.onclick = async () => {
        if (!confirm('إزالة ' + row.mid + ' من قائمة الإلغاء؟')) return;
        await api('/api/remove-revocation', { mid: row.mid });
        loadState();
      };
      tr.children[3].appendChild(btn);
      rb.appendChild(tr);
    }
  }

  const ib = $('issuedBody');
  ib.innerHTML = '';
  if (!data.issued.length) {
    ib.innerHTML = '<tr><td colspan="5" class="hint">لا توجد تراخيص.</td></tr>';
  } else {
    for (const row of data.issued) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="mono"></td><td><span class="pill"></span></td><td class="mono"></td><td></td><td></td>';
      tr.children[0].textContent = row.mid || '';
      const pill = tr.children[1].firstChild;
      const typ = String(row.typ || '').toUpperCase();
      pill.textContent = typ === 'TIMED' ? 'مؤقت' : 'دائم';
      pill.className = 'pill ' + (typ === 'TIMED' ? 'timed' : 'life');
      tr.children[2].textContent = row.lid || '';
      tr.children[3].textContent = fmtDate(row.issuedAt);
      tr.children[4].textContent = row.expDate ? fmtDate(row.expDate) : 'مدى الحياة';
      ib.appendChild(tr);
    }
  }
}

$('issueType').addEventListener('change', () => {
  $('timedBox').style.display = $('issueType').value === 'TIMED' ? 'block' : 'none';
});

$('btnIssue').addEventListener('click', async () => {
  $('issueOut').classList.remove('show');
  $('issueMsg').textContent = '';
  const type = $('issueType').value;
  const res = await api('/api/issue', {
    mid: $('issueMid').value,
    type,
    days: $('issueDays').value,
    until: $('issueUntil').value || undefined
  });
  if (!res.ok) { $('issueMsg').className = 'err'; $('issueMsg').textContent = res.error; return; }
  $('issueToken').value = res.token;
  $('issueOut').classList.add('show');
  $('issueMsg').className = 'ok';
  $('issueMsg').textContent = res.signatureValid
    ? 'تم التوقيع والتحقق ✓ — ' + (res.expiresAt ? 'ينتهي ' + fmtDate(res.expiresAt) : 'تفعيل دائم')
    : 'تم الإصدار لكن التحقق فشل!';
  loadState();
});

$('btnIssueAgain').addEventListener('click', () => {
  $('issueOut').classList.remove('show');
  $('issueMid').value = '';
  $('issueMid').focus();
});

$('btnRevoke').addEventListener('click', async () => {
  $('revokeOut').classList.remove('show');
  $('revokeMsg').textContent = '';
  if (!confirm('تأكيد إلغاء ترخيص ' + $('revokeMid').value.trim() + '؟')) return;
  const res = await api('/api/revoke', { mid: $('revokeMid').value, reason: $('revokeReason').value });
  if (!res.ok) { $('revokeMsg').className = 'err'; $('revokeMsg').textContent = res.error; return; }
  $('revokeToken').value = res.token;
  $('revokeOut').classList.add('show');
  $('revokeMsg').className = 'ok';
  $('revokeMsg').textContent = 'تم الإلغاء وتسجيله في القائمة.';
  loadState();
});

$('btnBuild').addEventListener('click', async () => {
  const res = await api('/api/build');
  $('buildMsg').className = res.ok ? 'ok' : 'err';
  $('buildMsg').textContent = res.ok
    ? 'تم تحديث القائمة المدمجة (' + res.count + ' جهاز) — ابنِ إصداراً جديداً لنشره.'
    : res.error;
});

document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const el = $(btn.dataset.copy);
    try { await navigator.clipboard.writeText(el.value); btn.textContent = 'تم النسخ ✓'; }
    catch (e) { el.select(); document.execCommand('copy'); btn.textContent = 'تم النسخ ✓'; }
    setTimeout(() => { btn.textContent = btn.dataset.copy === 'issueToken' ? 'نسخ المفتاح' : 'نسخ رمز الإلغاء'; }, 1500);
  });
});

loadState();
</script>
</body>
</html>`;
}

server.listen(PORT, HOST, async () => {
  // Fail fast if the private key is missing or encrypted without a passphrase.
  try {
    await loadPrivateKey();
    const url = `http://${HOST}:${PORT}/`;
    console.log('');
    console.log('🔐 لوحة التراخيص جاهزة:');
    console.log(`   ${url}`);
    console.log('   (محلية فقط — لإيقافها اضغط Ctrl+C)');
    console.log('');

    // Double-click convenience: open the panel in the default browser.
    if (process.platform === 'win32' && !process.env.PHARMACY_LICENSE_ADMIN_NO_OPEN) {
      try {
        const { spawn } = await import('node:child_process');
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      } catch (e) {}
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}\n`);
    server.close();
    process.exitCode = 1;
  }
});
