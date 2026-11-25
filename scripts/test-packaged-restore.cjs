/**
 * E2E (packaged app): activation → owner setup → login → Settings → Backup tab
 * → inspect .bak → restore → reload → verify.
 *
 * Usage: node scripts/test-packaged-restore.cjs [backup.bak] [path\\to\\PharmacyPOS.exe]
 *
 * Activation is skipped when private/license-private-key.jwk.json is absent
 * (that key never ships with the repo), so the script then only works on a
 * profile that is already activated.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXE = process.argv[3] || path.join(ROOT, 'dist-installer', 'win-unpacked', 'PharmacyPOS.exe');
const PRIVATE_KEY = path.join(ROOT, 'private', 'license-private-key.jwk.json');
const CORE = path.join(ROOT, 'license-studio', 'core.cjs');

const BAK = process.argv[2] || (() => {
  const found = fs.readdirSync(ROOT).find((f) => /\.bak$/i.test(f));
  return found ? path.join(ROOT, found) : path.join(ROOT, 'pharmacy_pos.db');
})();

if (!fs.existsSync(EXE)) {
  console.error(`Packaged app not found: ${EXE}\nRun "npx electron-builder --win --dir" first.`);
  process.exit(2);
}
if (!fs.existsSync(BAK)) {
  console.error(`Backup file not found: ${BAK}\nPass it as the first argument.`);
  process.exit(2);
}

const PORT = 9365;
const USER_DATA = path.join(process.env.TEMP, 'pos-restore-e2e4');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (fs.existsSync(USER_DATA)) fs.rmSync(USER_DATA, { recursive: true, force: true });

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' - ' + extra : ''}`);
  if (!ok) failures++;
};

const fillByIndex = (index, value) => `(() => {
  const inputs = Array.from(document.querySelectorAll('form input'));
  const el = inputs[${index}];
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

class Session {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }
  async target() {
    const started = Date.now();
    while (Date.now() - started < 90000) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page;
      } catch (e) {}
      await sleep(400);
    }
    throw new Error('no devtools target');
  }
  async connect() {
    const page = await this.target();
    await this.close();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    });
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    return this;
  }
  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
  send(method, params) {
    return new Promise((resolve, reject) => {
      const mid = ++this.id;
      this.pending.set(mid, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id: mid, method, params }));
      } catch (e) {
        this.pending.delete(mid);
        reject(e);
      }
    });
  }
  /** Evaluate; on a dead context, reconnect once and retry. */
  async evaluate(expression, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await this.send('Runtime.evaluate', {
          expression: `(async () => { ${expression} })()`,
          awaitPromise: true,
          returnByValue: true
        });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      } catch (e) {
        if (attempt === retries) throw e;
        await sleep(700);
        await this.connect();
      }
    }
  }
  async text() {
    return String(await this.evaluate('return document.body.innerText || "";'));
  }
  async waitFor(expression, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await this.evaluate(`return !!(${expression});`)) return true;
      } catch (e) {}
      await sleep(500);
    }
    return false;
  }
}

(async () => {
  const proc = spawn(EXE, [`--user-data-dir=${USER_DATA}`, `--remote-debugging-port=${PORT}`], { stdio: 'ignore' });
  const cdp = new Session(PORT);
  try {
    await cdp.connect();
    await sleep(3500);

    // ---------- activation (wait: app shows a licence check screen first) ----------
    const activationAppeared = await cdp.waitFor('/تفعيل ترخيص|كود الجهاز/.test(document.body.innerText)', 45000);
    console.log('activation screen appeared:', activationAppeared);
    let body = await cdp.text();
    if (/تفعيل ترخيص|كود الجهاز/.test(body)) {
      const machine = (body.match(/EGYP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
      check('activation screen shows machine id', !!machine, machine);
      if (machine && fs.existsSync(PRIVATE_KEY) && fs.existsSync(CORE)) {
        const core = require(CORE);
        const key = core.parsePrivateKey(fs.readFileSync(PRIVATE_KEY, 'utf8'));
        const token = core.issueLicense(key, { mid: machine, type: 'LIFETIME' }).token;
        console.log('token fill result:', await cdp.evaluate(fillByIndex(0, token)));
        await sleep(300);
        await cdp.evaluate('document.querySelector("form")?.requestSubmit(); return true;');
        await sleep(4000);
        if (/تفعيل ترخيص/.test(await cdp.text())) {
          // fall back to clicking the submit button
          await cdp.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('form button')).pop();
            if (btn) { btn.click(); return true; }
            return false;
          })()`);
          await sleep(4000);
        }
        const activated = await cdp.waitFor('!/تفعيل ترخيص/.test(document.body.innerText)', 30000);
        check('activation accepted', activated, (await cdp.text()).slice(0, 70).replace(/\n/g, ' '));
      } else if (!fs.existsSync(PRIVATE_KEY)) {
        console.log('private key missing — activation step skipped (profile must already be licensed)');
      }
    }

    // ---------- owner first-run setup ----------
    const setupReady = await cdp.waitFor('/إعداد حساب المالك|إنشاء حساب/.test(document.body.innerText)', 25000);
    if (setupReady) {
      console.log('first-run setup screen detected');
      await cdp.evaluate(fillByIndex(0, 'المالك'));
      await cdp.evaluate(fillByIndex(1, 'admin'));
      await cdp.evaluate(fillByIndex(2, '1234'));
      await cdp.evaluate(fillByIndex(3, '1234'));
      await sleep(300);
      await cdp.evaluate(`(() => {
        const form = document.querySelector('form');
        if (form) { form.requestSubmit(); return true; }
        return false;
      })()`);
      await sleep(6000);
    }

    // ---------- login ----------
    if (await cdp.evaluate('return !!document.querySelector("input[type=password]");')) {
      await cdp.evaluate(fillByIndex(0, 'admin'));
      await cdp.evaluate(fillByIndex(1, '1234'));
      await sleep(200);
      await cdp.evaluate('document.querySelector("form")?.requestSubmit(); return true;');
      await sleep(5000);
    }
    const loginGone = await cdp.waitFor('!document.querySelector("input[type=password]")', 20000);
    check('logged in', loginGone, (await cdp.text()).slice(0, 70).replace(/\n/g, ' '));

    // ---------- shell ready, dismiss modals ----------
    await cdp.waitFor('document.body.innerText.length > 150', 25000);
    await cdp.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /^(لاحقاً|تخطي|إغلاق|×)$/.test((b.innerText || '').trim()));
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(1200);

    // ---------- settings → backup ----------
    const navReady = await cdp.waitFor('Array.from(document.querySelectorAll("button, a, div[role=button]")).some(e => /الإعدادات/.test((e.innerText || "").trim()))', 30000);
    const navInfo = await cdp.evaluate(`(() => {
      const all = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      const matches = all.filter(e => /الإعدادات/.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 30);
      if (matches[0]) { matches[0].click(); return 'clicked'; }
      return 'none: ' + all.map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 25).join(' / ');
    })()`);
    // Clicking these tabs changes the router hash, which can drop the CDP
    // result; the rendered-text checks below are the real assertion.
    console.log('settings nav:', String(navInfo).slice(0, 160), `navReady=${navReady}`);
    await sleep(2500);

    await cdp.waitFor('Array.from(document.querySelectorAll("button")).some(e => /النسخ الاحتياطي/.test((e.innerText || "").trim()))', 30000);
    const tabInfo = await cdp.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('button')).find(e => /النسخ الاحتياطي/.test((e.innerText || '').trim().slice(0, 40)));
      if (el) { el.click(); return 'clicked'; }
      return 'none: ' + Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 30).join(' / ');
    })()`);
    console.log('backup tab:', String(tabInfo).slice(0, 160));
    await sleep(2000);

    const text = await cdp.text();
    check('UI shows .bak restore section', /استعادة من نسخة SQLite/.test(text));
    check('UI explains safety snapshot', /نسخة أمان/.test(text));
    check('UI has the .bak file button', /اختيار ملف/.test(text));

    try {
      const shot = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png' }), sleep(8000).then(() => null)]);
      if (shot && shot.data) {
        fs.writeFileSync('C:/Users/abdal/AppData/Local/Temp/opencode/backup-tab.png', Buffer.from(shot.data, 'base64'));
        console.log('screenshot saved');
      } else console.log('screenshot timeout');
    } catch (e) {
      console.log('screenshot failed:', e.message);
    }

    // ---------- inspect + restore via real IPC ----------
    const info = await cdp.evaluate(`return await window.require('electron').ipcRenderer.invoke('backup:inspect-sqlite', ${JSON.stringify(BAK)});`);
    check('packaged inspect (sql.js resource)', info?.ok && info.info?.counts?.medicines === 29721,
      info?.ok ? `medicines=${info.info.counts.medicines} deep=${info.info.deep}` : info?.error);

    const dbPath = await cdp.evaluate(`return await window.require('electron').ipcRenderer.invoke('db:getPath');`);
    const beforeSize = fs.statSync(dbPath).size;

    const res = await cdp.evaluate(`return await window.require('electron').ipcRenderer.invoke('backup:restore-sqlite', ${JSON.stringify(BAK)});`);
    check('restore succeeded', !!res?.ok, res?.ok ? `${res.sizeText}, safety=${path.basename(res.safetyBackup || '')}` : res?.error);
    check('safety snapshot exists', !!res?.safetyBackup && fs.existsSync(res.safetyBackup) && fs.statSync(res.safetyBackup).size === beforeSize);
    check('live DB replaced', fs.statSync(dbPath).size === fs.statSync(BAK).size);

    // ---------- reload on restored DB ----------
    await cdp.evaluate('setTimeout(() => location.reload(), 100); return true;');
    await sleep(9000);
    await cdp.connect();

    const after = await cdp.evaluate(`return await window.require('electron').ipcRenderer.invoke('backup:inspect-sqlite', ${JSON.stringify(dbPath)});`);
    let afterCount = after?.ok ? Number(after.info?.counts?.medicines || 0) : 0;
    if (!afterCount) {
      // The app may still be merging the bundled catalogue on first boot.
      await sleep(6000);
      const retry = await cdp.evaluate(`return await window.require('electron').ipcRenderer.invoke('backup:inspect-sqlite', ${JSON.stringify(dbPath)});`);
      afterCount = retry?.ok ? Number(retry.info?.counts?.medicines || 0) : 0;
    }
    check('restored DB readable after reload (backup items kept)', after?.ok && afterCount >= 29721,
      after?.ok ? `medicines=${afterCount}, integrity=${after.info.integrity}` : after?.error);

    const header = await cdp.evaluate(`return (async () => {
      const b = await window.require('electron').ipcRenderer.invoke('db:read');
      const u = new Uint8Array(b.slice(0, 16));
      return String.fromCharCode.apply(null, u);
    })();`);
    check('db:read returns restored SQLite', String(header).startsWith('SQLite format 3'), JSON.stringify(header));

    const body2 = await cdp.text();
    check('app still boots after restore', body2.length > 50, body2.slice(0, 70).replace(/\n/g, ' '));

    await cdp.close();
  } catch (e) {
    console.log('ERROR', e.message);
    failures++;
  } finally {
    await cdp.close();
    proc.kill();
    await sleep(1200);
  }
  console.log(failures === 0 ? '\nRESTORE E2E PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures ? 1 : 0);
})();
