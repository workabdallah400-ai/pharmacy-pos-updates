/**
 * Smoke test for the *packaged* application.
 *
 *   node scripts/test-packaged-server.cjs
 *
 * It extracts `app.asar` from `dist-installer/win-unpacked`, boots the report
 * server exactly like the installer does, and checks every public route the
 * shift QR code can point at:
 *
 *   /health              → server status
 *   /                    → reports index
 *   /d/YYYY-MM-DD        → daily summary
 *   /m/YYYY-MM           → monthly summary
 *   /r/<shiftId>         → the styled shift report (the QR target)
 *   /updates/latest.yml  → the auto-update feed
 *
 * It also makes sure the renderer bundle inside the asar contains the
 * auto-start-tunnel code (v1.0.2+).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const asarPath = path.join(root, 'dist-installer', 'win-unpacked', 'resources', 'app.asar');
const PORT = Number(process.env.SMOKE_PORT || 4199);
const TOKEN = process.env.SMOKE_TOKEN || '';

let pass = 0;
let fail = 0;

function check(name, ok, extra = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: pathname, timeout: 20000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', (err) => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
  });
}

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      const res = await get('/health');
      if (res.status === 200) return resolve(true);
      if (Date.now() - started > timeoutMs) return reject(new Error('server did not start'));
      setTimeout(tick, 500);
    };
    tick();
  });
}

(async () => {
  if (!fs.existsSync(asarPath)) {
    console.error(`❌ app.asar not found: ${asarPath}`);
    console.error('   Run "npm run dist" first.');
    process.exit(1);
  }

  let asar;
  try {
    asar = require('@electron/asar');
  } catch (e) {
    console.error('❌ @electron/asar is not installed — run "npm install" first.');
    process.exit(1);
  }

  const tmp = path.join(os.tmpdir(), `pharmacy-smoke-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  asar.extractAll(asarPath, tmp);
  console.log(`\n— packaged asar extracted —\n${tmp}`);

  const serverEntry = path.join(tmp, 'server', 'index.cjs');
  if (!fs.existsSync(serverEntry)) {
    console.error('❌ server/index.cjs missing from the package');
    process.exit(1);
  }

  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // The packaged server serves /updates/* from <dataDir>/updates — the
  // Electron main process stages the feed there at start-up.
  const feedDir = path.join(dataDir, 'updates');
  fs.mkdirSync(feedDir, { recursive: true });
  const repoFeed = path.join(root, 'server', 'updates', 'latest.yml');
  if (fs.existsSync(repoFeed)) fs.copyFileSync(repoFeed, path.join(feedDir, 'latest.yml'));

  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      REPORT_TOKEN: TOKEN
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  try {
    await waitForServer();
    console.log('\n— routes —');
    const health = await get('/health');
    check('/health', health.status === 200, `status ${health.status}`);
    check('/health reports running', /"running"\s*:\s*true/.test(health.body) || /"ok"\s*:\s*true/.test(health.body));

    const index = await get('/');
    check('/ (reports index)', index.status === 200, `status ${index.status}`);

    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const month = day.slice(0, 7);

    const daily = await get(`/d/${day}`);
    check(`/d/${day}`, daily.status === 200, `status ${daily.status}`);
    const monthly = await get(`/m/${month}`);
    check(`/m/${month}`, monthly.status === 200, `status ${monthly.status}`);

    const feed = await get('/updates/latest.yml');
    check('/updates/latest.yml', feed.status === 200, `status ${feed.status}`);
    check('feed has a version', /version:\s*\d+\.\d+\.\d+/.test(feed.body));

    // A shift report needs a shift id; use any id — the server renders an
    // "empty" report instead of crashing when the id is unknown.
    const report = await get('/r/SH-SMOKE-TEST');
    check('/r/<shiftId> (QR target)', report.status === 200, `status ${report.status}`);
    check('report is Arabic', report.body.includes('dir="rtl"') || report.body.includes('تقرير'));

    console.log('\n— renderer bundle —');
    const assets = path.join(tmp, 'dist', 'assets');
    const jsFiles = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith('.js')) : [];
    check('renderer bundle exists', jsFiles.length > 0, jsFiles.join(', '));
    const bundle = jsFiles.map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
    check('auto-start tunnel code shipped', bundle.includes('report:startTunnel'));
    check('settings merge shipped', bundle.includes('PHARMACY_SETTINGS'));

    console.log('\n— asar content —');
    check('cloudflare-tunnel helper bundled', fs.existsSync(path.join(tmp, 'scripts', 'cloudflare-tunnel.cjs')));
  } catch (err) {
    console.error(`❌ ${err.message}`);
    fail += 1;
  } finally {
    try { child.kill(); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
