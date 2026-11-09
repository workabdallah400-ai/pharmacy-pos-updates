const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let reportServer = null;
let reportServerPromise = null;
let reportServerModule = null;

// --- Embedded report / sync server (LAN + optional cloud) --------------
// Runs inside Electron so the shift QR code can open a styled Arabic report
// on any phone connected to the same Wi-Fi, with zero internet required.
async function startEmbeddedReportServer() {
  if (reportServer) return reportServer;
  if (reportServerPromise) return reportServerPromise;

  reportServerPromise = (async () => {
    try {
      reportServerModule = require(path.join(__dirname, '../server/index.cjs'));
      const { startReportServer } = reportServerModule;
      const dataDir = path.join(app.getPath('userData'), 'report-data');
      const basePort = Number(process.env.PHARMACY_REPORT_PORT || 4100);
      let lastError = null;
      for (let offset = 0; offset < 10; offset += 1) {
        try {
          reportServer = await startReportServer({ port: basePort + offset, dataDir });
          return reportServer;
        } catch (err) {
          lastError = err;
          if (err && err.code !== 'EADDRINUSE') break;
        }
      }
      console.warn('Embedded report server could not start:', lastError && lastError.message);
    } catch (err) {
      console.warn('Embedded report server failed to load:', err && err.message);
    }
    return null;
  })();

  try {
    return await reportServerPromise;
  } finally {
    reportServerPromise = null;
  }
}

function reportServerInfo() {
  if (!reportServer) {
    return { running: false, port: null, lanUrl: '', localUrl: '' };
  }
  // Recompute the LAN address on every call so the QR stays valid even if the
  // router handed the machine a new IP while the app was running.
  let lanUrl = reportServer.lanUrl;
  try {
    if (reportServerModule && reportServerModule.getLanIp) {
      const ip = reportServerModule.getLanIp();
      if (ip) lanUrl = `http://${ip}:${reportServer.port}`;
    }
  } catch (e) {}
  return {
    running: true,
    port: reportServer.port,
    lanUrl,
    localUrl: reportServer.localUrl
  };
}

ipcMain.handle('report:info', async () => {
  await startEmbeddedReportServer();
  return reportServerInfo();
});

ipcMain.handle('report:restart', async () => {
  try {
    if (reportServer && reportServer.close) await reportServer.close();
  } catch (e) {}
  reportServer = null;
  await startEmbeddedReportServer();
  return reportServerInfo();
});

// --- CLOUDFLARE QUICK TUNNEL (free public URL, no account) ----------------
// The pharmacy PC stays the source of truth; the tunnel simply exposes the
// embedded report server on a temporary public HTTPS address so the manager
// can open a shift report from any phone, anywhere.
let tunnelModule = null;
let tunnelUrl = '';

function tunnelDataDir() {
  return path.join(app.getPath('userData'), 'report-data');
}

function loadTunnelModule() {
  if (tunnelModule) return tunnelModule;
  try {
    tunnelModule = require(path.join(__dirname, '../scripts/cloudflare-tunnel.cjs'));
  } catch (err) {
    console.warn('Could not load the tunnel helper:', err && err.message);
  }
  return tunnelModule;
}

function broadcastTunnelUrl(url) {
  tunnelUrl = url || '';
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('report:tunnel-url', { url: tunnelUrl });
  } catch (e) {}
}

ipcMain.handle('report:tunnelUrl', async () => {
  const mod = loadTunnelModule();
  if (!mod) return { url: '', running: false, available: false };
  const saved = mod.readTunnelUrl(tunnelDataDir());
  const running = mod.isTunnelRunning();
  tunnelUrl = running ? (saved || tunnelUrl) : '';
  return {
    url: tunnelUrl,
    running,
    available: !!mod.findCloudflared(tunnelDataDir())
  };
});

ipcMain.handle('report:startTunnel', async () => {
  const mod = loadTunnelModule();
  if (!mod) return { ok: false, error: 'مساعد النفق غير متاح' };
  const server = await startEmbeddedReportServer();
  const port = server ? server.port : 4100;
  const result = await mod.startTunnel({
    port,
    userDataDir: tunnelDataDir(),
    onUrl: (url) => broadcastTunnelUrl(url)
  });
  if (result.ok) broadcastTunnelUrl(result.url);
  return result;
});

ipcMain.handle('report:stopTunnel', async () => {
  const mod = loadTunnelModule();
  if (mod) mod.stopTunnel(tunnelDataDir());
  broadcastTunnelUrl('');
  return { ok: true };
});

ipcMain.handle('report:downloadCloudflared', async (event, options = {}) => {
  const mod = loadTunnelModule();
  if (!mod) return { ok: false, error: 'مساعد النفق غير متاح' };
  try {
    const destination = await mod.downloadCloudflared(
      tunnelDataDir(),
      (received, total) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.webContents.send('report:tunnel-download', {
              received,
              total,
              percent: total ? Math.round((received / total) * 100) : 0
            });
          } catch (e) {}
        }
      }
    );
    return { ok: true, path: destination };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --- 4. AUTO UPDATER -----------------------------------------------------
// The app can update itself from any static host that exposes an
// `latest.yml` feed (the bundled report server serves `/updates`).
let autoUpdater = null;
let updateCheckInFlight = false;
const GITHUB_UPDATE_PROVIDER = {
  provider: 'github',
  owner: 'workabdallah400-ai',
  repo: 'pharmacy-pos-updates',
  private: false
};
let updateState = {
  status: 'idle', // idle | checking | available | not-available | downloading | downloaded | error
  version: null,
  currentVersion: '',
  progress: 0,
  message: '',
  feedUrl: 'github:workabdallah400-ai/pharmacy-pos-updates'
};

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    const { autoUpdater: updater } = require('electron-updater');
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableWebInstaller = true;
    updater.logger = null;

    updater.on('checking-for-update', () => {
      updateState = { ...updateState, status: 'checking', message: 'جاري البحث عن تحديث...' };
      broadcastUpdateState();
    });
    updater.on('update-available', (info) => {
      updateState = {
        ...updateState,
        status: 'available',
        version: info && info.version ? info.version : null,
        message: `يتوفر إصدار ${info && info.version ? info.version : ''}`
      };
      broadcastUpdateState();
    });
    updater.on('update-not-available', () => {
      updateState = { ...updateState, status: 'not-available', message: 'أنت على آخر إصدار' };
      broadcastUpdateState();
    });
    updater.on('download-progress', (progress) => {
      updateState = {
        ...updateState,
        status: 'downloading',
        progress: Math.round((progress && progress.percent) || 0),
        message: `جاري تحميل التحديث ${Math.round((progress && progress.percent) || 0)}%`
      };
      broadcastUpdateState();
    });
    updater.on('update-downloaded', (info) => {
      updateState = {
        ...updateState,
        status: 'downloaded',
        version: info && info.version ? info.version : updateState.version,
        progress: 100,
        message: 'التحديث جاهز — سيُثبَّت عند إغلاق البرنامج'
      };
      broadcastUpdateState();
      mirrorUpdatePackage(info);
    });
    updater.on('error', (err) => {
      updateState = {
        ...updateState,
        status: 'error',
        message: (err && err.message) || 'تعذر التحقق من التحديثات'
      };
      broadcastUpdateState();
    });

    autoUpdater = updater;
    return autoUpdater;
  } catch (err) {
    console.warn('electron-updater is not available:', err && err.message);
    return null;
  }
}

function broadcastUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('app:update-status', updateState);
  } catch (e) {}
}

function normalizeFeedUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

// Copy the downloaded package into the local report server so every other
// device on the pharmacy Wi-Fi can update from it as well.
function mirrorUpdatePackage(info) {
  try {
    if (!info || !info.downloadedFile) return;
    const updater = getAutoUpdater();
    const targetDir = path.join(app.getPath('userData'), 'report-data', 'updates');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const targetName = `PharmacyPOS-Setup-v${info.version || app.getVersion()}.exe`;
    fs.copyFileSync(info.downloadedFile, path.join(targetDir, targetName));

    const buffer = fs.readFileSync(info.downloadedFile);
    const sha512 = require('crypto').createHash('sha512').update(buffer).digest('base64');
    const releaseDate = new Date().toISOString();
    const yml = [
      `version: ${info.version || app.getVersion()}`,
      `files:`,
      `  - url: ${targetName}`,
      `    sha512: ${sha512}`,
      `    size: ${buffer.length}`,
      `path: ${targetName}`,
      `sha512: ${sha512}`,
      `releaseDate: '${releaseDate}'`,
      ''
    ].join('\n');
    fs.writeFileSync(path.join(targetDir, 'latest.yml'), yml, 'utf8');
    fs.writeFileSync(path.join(targetDir, 'latest.json'), JSON.stringify({
      version: info.version || app.getVersion(),
      url: targetName,
      sha512,
      size: buffer.length,
      releaseDate
    }, null, 2), 'utf8');
    console.log(`📦 Update mirrored to the local report server: ${targetDir}`);
  } catch (err) {
    console.warn('Could not mirror the update package:', err && err.message);
  }
}

ipcMain.handle('app:version', async () => {
  updateState.currentVersion = app.getVersion();
  return { version: app.getVersion(), packaged: app.isPackaged, state: updateState };
});

ipcMain.handle('app:update-check', async () => {
  updateState.currentVersion = app.getVersion();
  if (!app.isPackaged) {
    return { available: false, reason: 'dev', version: app.getVersion() };
  }
  if (updateCheckInFlight) {
    return {
      available: updateState.status === 'available',
      version: updateState.version,
      currentVersion: app.getVersion(),
      reason: 'already-checking'
    };
  }

  const updater = getAutoUpdater();
  if (!updater) {
    return { available: false, reason: 'unavailable', version: app.getVersion() };
  }

  updateCheckInFlight = true;
  updateState = {
    ...updateState,
    currentVersion: app.getVersion(),
    feedUrl: 'github:workabdallah400-ai/pharmacy-pos-updates',
    status: 'checking',
    message: 'جاري البحث عن آخر إصدار على GitHub...'
  };
  broadcastUpdateState();

  try {
    // GitHub Releases is the only update source. Ignore old local/LAN feed
    // settings so a stale bundled feed can never surface an old version.
    updater.setFeedURL(GITHUB_UPDATE_PROVIDER);
    const result = await updater.checkForUpdates();
    const info = result && result.updateInfo ? result.updateInfo : null;
    const available = !!(info && info.version && info.version !== app.getVersion());
    updateState = {
      ...updateState,
      status: available ? 'available' : 'not-available',
      version: info ? info.version : null,
      message: available ? `يتوفر إصدار ${info.version}` : 'أنت على آخر إصدار من GitHub'
    };
    broadcastUpdateState();
    return { available, version: info ? info.version : null, currentVersion: app.getVersion() };
  } catch (err) {
    updateState = {
      ...updateState,
      status: 'error',
      message: (err && err.message) || 'فشل التحقق من تحديثات GitHub'
    };
    broadcastUpdateState();
    return { available: false, reason: 'error', error: err.message, version: app.getVersion() };
  } finally {
    updateCheckInFlight = false;
  }
});

ipcMain.handle('app:update-download', async () => {
  const updater = getAutoUpdater();
  if (!updater) return { success: false, error: 'التحديث غير متاح' };
  try {
    await updater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:update-install', async () => {
  const updater = getAutoUpdater();
  if (!updater) return { success: false, error: 'التحديث غير متاح' };
  try {
    setTimeout(() => updater.quitAndInstall(false, true), 300);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// If the update feed is bundled with the app (development / manual builds),
// copy it into the local report server so LAN devices can update from it.
function stageBundledUpdateFeed() {
  try {
    const sourceDir = path.join(__dirname, '../server/updates');
    if (!fs.existsSync(sourceDir)) return;
    const targetDir = path.join(app.getPath('userData'), 'report-data', 'updates');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const bundled = [];
    for (const name of fs.readdirSync(sourceDir)) {
      const from = path.join(sourceDir, name);
      const to = path.join(targetDir, name);
      try {
        const stat = fs.statSync(from);
        if (!stat.isFile()) continue;
        bundled.push(name);
        // Copy when the staged file is missing or older than the bundled one.
        let copy = true;
        if (fs.existsSync(to)) {
          const staged = fs.statSync(to);
          copy = stat.mtimeMs > staged.mtimeMs || stat.size !== staged.size;
        }
        if (copy) fs.copyFileSync(from, to);
      } catch (e) {}
    }
    // Drop installers of older versions (~135 MB each) that the feed no
    // longer points to.
    for (const name of fs.readdirSync(targetDir)) {
      if (!/^PharmacyPOS-Setup-v.*\.(exe|exe\.blockmap)$/i.test(name)) continue;
      if (bundled.includes(name)) continue;
      try { fs.unlinkSync(path.join(targetDir, name)); } catch (e) {}
    }
    console.log(`📦 Update feed staged at ${targetDir}`);
  } catch (err) {
    console.warn('Could not stage the bundled update feed:', err && err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 720,
    title: 'صيدليتي - إدارة نقاط البيع والكاشير الذكي (قاعدة بيانات 30,000 دواء)',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.maximize();

  // Load production dist/index.html
  const distPath = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 1. Silent ESC/POS Thermal Printing IPC Handler
ipcMain.handle('print:silent', async (event, options = {}) => {
  try {
    if (!mainWindow) return { success: false, error: 'No main window' };

    const printOptions = {
      silent: true,
      printBackground: true,
      deviceName: options.deviceName || '',
      margins: {
        marginType: 'none'
      }
    };

    return new Promise((resolve) => {
      mainWindow.webContents.print(printOptions, (success, failureReason) => {
        if (!success) {
          console.warn('Silent print failed:', failureReason);
          resolve({ success: false, reason: failureReason });
        } else {
          console.log('Silent print completed successfully.');
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    console.error('Silent print exception:', err);
    return { success: false, error: err.message };
  }
});

// 2. Cash Drawer Kick IPC Handler
ipcMain.handle('hardware:kickDrawer', async () => {
  console.log('Electronic cash drawer kick pulse sent.');
  return { success: true };
});

function getDatabasePath() {
  try {
    const userDataDir = app.getPath('userData');
    const userDbPath = path.join(userDataDir, 'pharmacy_pos.db');

    // If user DB already exists and has valid size (> 1MB), use it
    if (fs.existsSync(userDbPath) && fs.statSync(userDbPath).size > 1000000) {
      return userDbPath;
    }

    // Otherwise, copy seed database to userData
    const possible = [
      path.join(process.resourcesPath || '', 'pharmacy_pos.db'),
      path.join(__dirname, '../dist/pharmacy_pos.db'),
      path.join(__dirname, '../pharmacy_pos.db'),
      path.join(process.cwd(), 'pharmacy_pos.db')
    ];

    for (const p of possible) {
      if (fs.existsSync(p) && fs.statSync(p).size > 1000000) {
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        fs.copyFileSync(p, userDbPath);
        console.log(`Copied seed DB from ${p} to ${userDbPath}`);
        return userDbPath;
      }
    }

    return userDbPath;
  } catch (err) {
    console.error('getDatabasePath error:', err);
    return path.join(process.cwd(), 'pharmacy_pos.db');
  }
}

// 2b. Window controls (minimize / maximize / close)
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window:set-zoom-factor', (event, factor) => {
  if (mainWindow && mainWindow.webContents) {
    try {
      mainWindow.webContents.setZoomFactor(Number(factor) || 1.0);
    } catch (e) {
      console.warn('Failed to set zoom factor:', e);
    }
  }
});

// 3. Database Binary IPC Handlers (Reliable Cross-Process Persistence)
ipcMain.handle('db:getPath', () => {
  return getDatabasePath();
});

ipcMain.handle('db:read', async () => {
  try {
    const targetPath = getDatabasePath();
    if (fs.existsSync(targetPath)) {
      console.log(`Loaded SQLite DB buffer from: ${targetPath}`);
      return fs.readFileSync(targetPath);
    }
  } catch (e) {
    console.error('db:read error:', e);
  }
  return null;
});

ipcMain.handle('catalog:read', async () => {
  const candidates = [
    path.join(process.resourcesPath || '', 'catalog-v1423.json'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'catalog-v1423.json'),
    path.join(__dirname, '../dist/catalog-v1423.json'),
    path.join(__dirname, '../public/catalog-v1423.json'),
    path.join(process.cwd(), 'catalog-v1423.json'),
    path.join(process.cwd(), 'public/catalog-v1423.json')
  ];
  try {
    const hit = candidates.find((p) => fs.existsSync(p));
    if (!hit) return null;
    return JSON.parse(fs.readFileSync(hit, 'utf8'));
  } catch (e) {
    console.error('catalog:read error:', e);
    return null;
  }
});

ipcMain.handle('db:write', async (event, buffer) => {
  try {
    const targetPath = getDatabasePath();
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(buffer));
    return { success: true };
  } catch (e) {
    console.error('db:write error:', e);
    return { success: false, error: e.message };
  }
});

// Automatic Offline Snapshot Backup on Shift Close or Manual Trigger
ipcMain.handle('db:backup', async (event, label = 'shift-close') => {
  try {
    const targetPath = getDatabasePath();
    if (!fs.existsSync(targetPath)) return { success: false, error: 'Database file not found' };

    const backupDir = path.join(path.dirname(targetPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const cleanLabel = String(label || 'shift').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const backupFileName = `pharmacy_backup_${dateStr}_${timeStr}_${cleanLabel}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);

    fs.copyFileSync(targetPath, backupFilePath);
    console.log(`🛡️ Automatic SQLite backup created: ${backupFilePath}`);

    // Keep the latest 60 backups, delete older ones to save disk space
    try {
      const files = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('pharmacy_backup_') && f.endsWith('.db'))
        .map((f) => ({
          name: f,
          path: path.join(backupDir, f),
          time: fs.statSync(path.join(backupDir, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 60) {
        files.slice(60).forEach((oldFile) => {
          try { fs.unlinkSync(oldFile.path); } catch (e) {}
        });
      }
    } catch (cleanErr) {}

    return { success: true, path: backupFilePath, fileName: backupFileName };
  } catch (e) {
    console.error('db:backup error:', e);
    return { success: false, error: e.message };
  }
});

app.whenReady().then(() => {
  startEmbeddedReportServer();
  stageBundledUpdateFeed();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Close the public tunnel together with the app.
  try {
    const mod = loadTunnelModule();
    if (mod) mod.stopTunnel(tunnelDataDir());
  } catch (e) {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
