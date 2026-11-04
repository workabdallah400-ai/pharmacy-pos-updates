/**
 * Cloudflare Quick Tunnel helper — a free public HTTPS URL with NO account.
 * -------------------------------------------------------------------------
 * The pharmacy PC keeps running the local report server on port 4100.
 * `cloudflared tunnel --url http://localhost:4100` opens a temporary tunnel
 * and prints a public URL such as:
 *
 *     https://random-words-1234.trycloudflare.com
 *
 * That URL is written to `<userData>/report-data/tunnel-url.txt` so the app
 * can embed it in the shift QR code — the manager then opens a complete,
 * styled Arabic report from any phone, anywhere in the world.
 *
 * Usage:
 *   node scripts/cloudflare-tunnel.cjs --port 4100
 *
 * The module is also required by `electron/main.cjs` (IPC `report:startTunnel`).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const TUNNEL_URL_FILE = 'tunnel-url.txt';
const CLOUDFLARED_FILE = 'cloudflared.exe';
const TUNNEL_URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

let activeChild = null;
let activeUrl = '';

// --- Locate the cloudflared binary -----------------------------------------

function isExecutable(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch (e) {
    return false;
  }
}

function findOnPath() {
  const pathVar = process.env.PATH || '';
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `cloudflared${ext}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return '';
}

function findCloudflared(userDataDir) {
  const candidates = [];
  if (userDataDir) candidates.push(path.join(userDataDir, CLOUDFLARED_FILE));
  // The Electron app stores it next to the report data.
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'pharmacy-pos-ui', 'report-data', CLOUDFLARED_FILE));
  }
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, '.pharmacy-pos', CLOUDFLARED_FILE));
  }
  candidates.push(path.join(__dirname, '..', 'resources', CLOUDFLARED_FILE));
  candidates.push(path.join(__dirname, '..', CLOUDFLARED_FILE));
  candidates.push(path.join(process.cwd(), CLOUDFLARED_FILE));
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  return findOnPath();
}

// --- Download cloudflared (one click, no admin rights) ---------------------

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'PharmacyPOS' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpsGetJson(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('انتهت مهلة الاتصال')));
  });
}

function downloadFile(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const request = (targetUrl, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error('Too many redirects'));
        return;
      }
      https.get(targetUrl, { headers: { 'User-Agent': 'PharmacyPOS' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        const temp = `${destination}.download`;
        const out = fs.createWriteStream(temp);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (typeof onProgress === 'function') onProgress(received, total);
        });
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            try {
              fs.renameSync(temp, destination);
              resolve(destination);
            } catch (e) {
              reject(e);
            }
          });
        });
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

async function downloadCloudflared(userDataDir, onProgress) {
  if (!userDataDir) throw new Error('مسار بيانات التطبيق غير متاح');
  fs.mkdirSync(userDataDir, { recursive: true });
  const destination = path.join(userDataDir, CLOUDFLARED_FILE);

  const existing = findCloudflared(userDataDir);
  if (existing && path.resolve(existing) === path.resolve(destination)) return destination;

  const release = await httpsGetJson('https://api.github.com/repos/cloudflare/cloudflared/releases/latest');
  const asset = (release.assets || []).find((a) => /windows-amd64\.exe$/i.test(a.name || ''));
  if (!asset) throw new Error('تعذر العثور على حزمة cloudflared لنظام Windows');
  await downloadFile(asset.browser_download_url, destination, onProgress);
  return destination;
}

// --- Tunnel state -----------------------------------------------------------

function tunnelFile(userDataDir) {
  return path.join(userDataDir, TUNNEL_URL_FILE);
}

function readTunnelUrl(userDataDir) {
  try {
    if (!userDataDir) return '';
    const file = tunnelFile(userDataDir);
    if (!fs.existsSync(file)) return '';
    return String(fs.readFileSync(file, 'utf8')).trim();
  } catch (e) {
    return '';
  }
}

function writeTunnelUrl(userDataDir, url) {
  try {
    if (!userDataDir) return;
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(tunnelFile(userDataDir), url || '', 'utf8');
  } catch (e) {}
}

function clearTunnelUrl(userDataDir) {
  try {
    if (userDataDir && fs.existsSync(tunnelFile(userDataDir))) {
      fs.unlinkSync(tunnelFile(userDataDir));
    }
  } catch (e) {}
}

/**
 * Start the quick tunnel.
 * @returns {Promise<{ok:boolean,url?:string,error?:string}>}
 */
function startTunnel(options = {}) {
  const {
    port = 4100,
    userDataDir = '',
    binaryPath = '',
    onUrl = null,
    onLog = null
  } = options;

  if (activeChild) {
    return Promise.resolve({ ok: true, url: activeUrl, alreadyRunning: true });
  }

  const exe = binaryPath || findCloudflared(userDataDir);
  if (!exe) {
    return Promise.resolve({
      ok: false,
      error: 'برنامج cloudflared غير موجود — اضغط «تنزيل وتثبيت النفق» مرة واحدة.'
    });
  }

  const args = ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'];
  let child;
  try {
    child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return Promise.resolve({ ok: false, error: e.message });
  }
  activeChild = child;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const scan = (chunk) => {
      const text = String(chunk || '');
      if (typeof onLog === 'function') onLog(text.trim());
      const match = TUNNEL_URL_RE.exec(text);
      if (match && !activeUrl) {
        activeUrl = match[0];
        writeTunnelUrl(userDataDir, activeUrl);
        if (typeof onUrl === 'function') onUrl(activeUrl);
        finish({ ok: true, url: activeUrl });
      }
    };

    child.stdout.on('data', scan);
    child.stderr.on('data', scan);

    child.on('error', (err) => {
      activeChild = null;
      activeUrl = '';
      finish({ ok: false, error: err.message });
    });

    child.on('exit', (code) => {
      const wasRunning = !!activeUrl;
      activeChild = null;
      activeUrl = '';
      clearTunnelUrl(userDataDir);
      if (!settled) {
        finish({
          ok: false,
          error: code === 0
            ? 'توقف نفق Cloudflare'
            : `توقف نفق Cloudflare (رمز ${code}) — تأكد من الاتصال بالإنترنت`
        });
      }
      if (wasRunning && typeof onUrl === 'function') onUrl('');
    });

    // Safety net: if cloudflared prints nothing within 45s, report failure.
    setTimeout(() => {
      if (!settled) {
        finish({ ok: false, error: 'انتهت مهلة إنشاء النفق — تأكد من الاتصال بالإنترنت' });
      }
    }, 45000);
  });
}

function stopTunnel(userDataDir = '') {
  try {
    if (activeChild) {
      activeChild.kill();
      activeChild = null;
    }
  } catch (e) {}
  activeUrl = '';
  clearTunnelUrl(userDataDir);
  return { ok: true };
}

function isTunnelRunning() {
  return !!activeChild;
}

module.exports = {
  startTunnel,
  stopTunnel,
  isTunnelRunning,
  findCloudflared,
  downloadCloudflared,
  readTunnelUrl,
  writeTunnelUrl,
  clearTunnelUrl,
  TUNNEL_URL_FILE,
  CLOUDFLARED_FILE
};

// --- Standalone mode -------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const port = Number(getArg('port', process.env.PORT || 4100));
  const dataDir = getArg('data-dir', path.join(process.cwd(), 'data'));
  const autoDownload = args.includes('--download');

  console.log('🌐 جاري فتح نفق Cloudflare المجاني…');

  const run = async () => {
    if (!findCloudflared(dataDir) && autoDownload) {
      console.log('⬇️  جاري تنزيل cloudflared (مرة واحدة)…');
      const exe = await downloadCloudflared(dataDir, (received, total) => {
        if (total) process.stdout.write(`\r   ${Math.round((received / total) * 100)}%   `);
      });
      console.log(`\n✅ تم التنزيل: ${exe}`);
    }
    const result = await startTunnel({
      port,
      userDataDir: dataDir,
      onLog: (text) => console.log(text),
      onUrl: (url) => {
        if (url) console.log(`\n✅ رابط التقارير العام:\n   ${url}\n   (اضغط Ctrl+C للإيقاف)\n`);
        else console.log('⛔ تم إيقاف النفق');
      }
    });
    if (!result.ok) {
      console.error(`❌ ${result.error}`);
      console.error('   شغّل مرة أخرى مع --download لتنزيل البرنامج تلقائياً.');
      process.exit(1);
    }
  };

  run().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    stopTunnel(dataDir);
    process.exit(0);
  });
}
