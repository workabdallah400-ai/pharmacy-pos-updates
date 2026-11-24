/**
 * End-to-end smoke test for PharmacyPOS License Studio.
 * Drives the real Electron window through the DevTools protocol.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./core.cjs');

const EXE = path.join(__dirname, 'release', 'win-unpacked', 'PharmacyPOS License Studio.exe');
const KEY_FILE = path.join(__dirname, '..', 'private', 'license-private-key.jwk.json');
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('DevTools target not found');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('page error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result.value;
  };
  return { ready, evaluate, close: () => ws.close() };
}

(async () => {
  const jwk = fs.readFileSync(KEY_FILE, 'utf8');
  const proc = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' });

  let failures = 0;
  const check = (label, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' - ' + extra : ''}`);
    if (!ok) failures++;
  };

  try {
    const target = await waitForTarget();
    const cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;
    await sleep(1200);

    check('window title', (await cdp.evaluate('return document.title;')) === 'PharmacyPOS License Studio');

    // Reset to a clean first-run state so the test is repeatable.
    await cdp.evaluate('await window.studio.forgetKey(); location.reload(); return true;');
    await sleep(2500);

    check('setup overlay visible on first run', await cdp.evaluate(
      'return !document.querySelector("#setup").classList.contains("hidden");'
    ));
    check('no horizontal overflow', await cdp.evaluate(
      'return document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1;'
    ), await cdp.evaluate('return document.documentElement.scrollWidth + "/" + window.innerWidth;'));

    // 1) import the private key through the paste box (same IPC as the file picker)
    await cdp.evaluate(`
      document.querySelector('#setupPaste').click();
      document.querySelector('#pasteKey').value = ${JSON.stringify(jwk)};
      document.querySelector('#setupSavePaste').click();
      return true;
    `);
    await sleep(1500);
    check('key chip shows ready state', await cdp.evaluate(
      'return document.querySelector("#keyChip").classList.contains("ok");'
    ));
    check('setup overlay closed', await cdp.evaluate(
      'return document.querySelector("#setup").classList.contains("hidden");'
    ));

    // 2) issue a lifetime licence
    const mid = 'EGYP-1111-2222-3333';
    await cdp.evaluate(`
      document.querySelector('#issueMid').value = '${mid}';
      document.querySelector('#btnIssue').click();
      return true;
    `);
    await sleep(1200);
    const token = await cdp.evaluate('return document.querySelector("#issueToken").value;');
    let payload = null;
    try {
      payload = core.inspectToken(core.parsePrivateKey(jwk), token).payload;
    } catch (e) {}
    check('lifetime token issued', !!payload && payload.typ === 'LIFETIME' && payload.mid === mid,
      payload ? `${payload.typ} ${payload.mid}` : 'no token');
    check('issued token signature valid', !!payload && core.inspectToken(core.parsePrivateKey(jwk), token).signatureValid);

    // 3) timed licence with explicit expiry date
    await cdp.evaluate(`
      document.querySelector('#issueMid').value = '${mid}';
      document.querySelector('[data-type="TIMED"]').click();
      document.querySelector('#issueUntil').value = '2027-06-30';
      document.querySelector('#btnIssue').click();
      return true;
    `);
    await sleep(1200);
    const timedToken = await cdp.evaluate('return document.querySelector("#issueToken").value;');
    const timedPayload = core.inspectToken(core.parsePrivateKey(jwk), timedToken).payload;
    check('timed token expires 2027-06-30', timedPayload.typ === 'TIMED' &&
      new Date(timedPayload.exp * 1000).toISOString().startsWith('2027-06-30'), new Date(timedPayload.exp * 1000).toISOString());

    // 4) revoke the same machine
    await cdp.evaluate('window.confirm = () => true; return true;');
    await cdp.evaluate(`
      document.querySelector('#revokeMid').value = '${mid}';
      document.querySelector('#revokeReason').value = 'automated test';
      document.querySelector('#btnRevoke').click();
      return true;
    `);
    await sleep(1500);
    const revokeToken = await cdp.evaluate('return document.querySelector("#revokeToken").value;');
    const revPayload = core.inspectToken(core.parsePrivateKey(jwk), revokeToken).payload;
    check('revoke token issued', revPayload.typ === 'REVOKE' && revPayload.mid === mid);
    check('revoked device listed', (await cdp.evaluate(`return document.querySelectorAll('#revokedBody [data-remove-revocation]').length;`)) >= 1);
    const counters = (await cdp.evaluate('return document.querySelector("#countChip").textContent;')).match(/\d+/g).map(Number);
    check('counters show issued licences and one revoked', counters[0] >= 2 && counters[1] >= 1, counters.join(' / '));

    // 5) log tab renders rows and filtering works
    await cdp.evaluate(`document.querySelector('.tab[data-view="log"]').click(); return true;`);
    await sleep(300);
    const rows = await cdp.evaluate('return document.querySelectorAll("#logBody tr").length;');
    check('log shows issued licences', rows >= 2, `${rows} rows`);
    await cdp.evaluate(`document.querySelector('#logFilter').value = 'ZZZZ'; document.querySelector('#logFilter').dispatchEvent(new Event('input')); return true;`);
    await sleep(200);
    check('log filter empties the table', (await cdp.evaluate('return document.querySelectorAll("#logBody td.empty").length;')) === 1);

    // 6) key page shows match + encryption info
    await cdp.evaluate(`document.querySelector('.tab[data-view="key"]').click(); return true;`);
    await sleep(200);
    check('key page shows app-key match tick', (await cdp.evaluate('return document.querySelector("#infoMatch").textContent;')).includes('✓'));
    check('key page reports DPAPI protection', (await cdp.evaluate('return document.querySelector("#infoProtected").textContent;')).includes('DPAPI'));

    // 7) switching tabs toggles views
    await cdp.evaluate(`document.querySelector('.tab[data-view="export"]').click(); return true;`);
    await sleep(200);
    check('export view active', await cdp.evaluate(
      'return document.querySelector(".view[data-view=\\"export\\"]").classList.contains("active");'
    ));

    // 8) secrets never exposed to the page
    check('no node integration in the page', await cdp.evaluate(
      'return typeof window.require === "undefined" && typeof window.process === "undefined";'
    ));
    check('no private key material in DOM', await cdp.evaluate(
      `return !document.documentElement.outerHTML.includes(${JSON.stringify(JSON.parse(jwk).d)});`
    ));

    cdp.close();
  } catch (e) {
    console.log('ERROR', e.message);
    failures++;
  } finally {
    proc.kill();
    await sleep(800);
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
