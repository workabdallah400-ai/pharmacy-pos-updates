/**
 * PharmacyPOS License Studio — Electron main process.
 *
 * Everything runs locally. The private key is imported once by the developer,
 * stored encrypted with the OS keystore (Windows DPAPI via safeStorage) and
 * never written to the app, an installer or a log.
 */

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core.cjs');

app.setAppUserModelId('com.pharmacypos.licensestudio');

const USER_DIR = app.getPath('userData');
const KEY_FILE = path.join(USER_DIR, 'private-key.enc');
const LOG_FILE = path.join(USER_DIR, 'issued-licenses.jsonl');
const REVOCATIONS_FILE = path.join(USER_DIR, 'revocations.json');
const SETTINGS_FILE = path.join(USER_DIR, 'settings.json');

function ensureDir() {
  if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function readSettings() {
  return readJson(SETTINGS_FILE, { projectDir: '' });
}

function saveSettings(next) {
  writeJson(SETTINGS_FILE, { ...readSettings(), ...next });
}

/* ------------------------------ private key ------------------------------ */

function readStoredKey() {
  try {
    if (!fs.existsSync(KEY_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    if (!raw || !raw.payload) return null;
    let text;
    if (raw.protected) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      text = safeStorage.decryptString(Buffer.from(raw.payload, 'base64'));
    } else {
      text = Buffer.from(raw.payload, 'base64').toString('utf8');
    }
    return { text, protected: !!raw.protected, jwk: JSON.parse(text) };
  } catch (e) {
    return null;
  }
}

function storeKey(jwk) {
  ensureDir();
  const text = JSON.stringify(jwk);
  const canProtect = safeStorage.isEncryptionAvailable();
  const record = canProtect
    ? { protected: true, payload: safeStorage.encryptString(text).toString('base64') }
    : { protected: false, payload: Buffer.from(text, 'utf8').toString('base64') };
  fs.writeFileSync(KEY_FILE, JSON.stringify(record), 'utf8');
  return canProtect;
}

function loadPrivateKey() {
  const stored = readStoredKey();
  if (!stored) return null;
  try {
    return { key: core.parsePrivateKey(stored.jwk), protected: stored.protected, jwk: stored.jwk };
  } catch (e) {
    return null;
  }
}

/* --------------------------------- data ---------------------------------- */

function appendLog(record) {
  ensureDir();
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
}

function readLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs.readFileSync(LOG_FILE, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, i) => {
        try {
          return { ...JSON.parse(line), _line: i + 1 };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function readRevocations() {
  const raw = readJson(REVOCATIONS_FILE, []);
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return Object.values(core.mergeRevocations(
    Object.fromEntries(list.filter((r) => r && r.mid).map((r) => [r.mid, r]))
  ));
}

function saveRevocations(list) {
  writeJson(REVOCATIONS_FILE, list);
}

/* ------------------------------- state ----------------------------------- */

function getState() {
  const loaded = loadPrivateKey();
  const log = readLog();
  const issued = log
    .filter((row) => String(row.typ || '').toUpperCase() !== 'REVOKE')
    .slice(-300)
    .reverse();
  const revoked = readRevocations().sort((a, b) => Number(b.iat || 0) - Number(a.iat || 0));

  return {
    hasKey: !!loaded,
    keyProtected: loaded ? loaded.protected : false,
    keyMatchesApp: loaded ? core.keyMatchesApp(loaded.key) : false,
    publicKey: loaded ? core.publicJwkOf(loaded.key).x : null,
    expectedKey: core.APP_PUBLIC_KEY.x,
    kid: core.APP_PUBLIC_KEY.kid,
    projectDir: readSettings().projectDir || '',
    issued,
    revoked,
    counts: {
      issued: log.filter((row) => String(row.typ || '').toUpperCase() !== 'REVOKE').length,
      revoked: revoked.length
    }
  };
}

/* -------------------------------- window --------------------------------- */

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#070d18',
    title: 'PharmacyPOS License Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    ensureDir();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

/* --------------------------------- IPC ----------------------------------- */

ipcMain.handle('state:get', () => {
  try {
    return { ok: true, state: getState() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('key:import-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر ملف المفتاح الخاص',
    filters: [{ name: 'Private key', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  try {
    const text = fs.readFileSync(result.filePaths[0], 'utf8');
    const jwk = JSON.parse(text);
    const key = core.parsePrivateKey(jwk);
    const matches = core.keyMatchesApp(key);
    const protectedNow = storeKey(jwk);
    return {
      ok: true,
      protected: protectedNow,
      matchesApp: matches,
      publicKey: core.publicJwkOf(key).x
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('key:import-text', async (_event, text) => {
  try {
    const jwk = JSON.parse(String(text || ''));
    const key = core.parsePrivateKey(jwk);
    const matches = core.keyMatchesApp(key);
    const protectedNow = storeKey(jwk);
    return {
      ok: true,
      protected: protectedNow,
      matchesApp: matches,
      publicKey: core.publicJwkOf(key).x
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('key:forget', () => {
  try {
    if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('license:issue', async (_event, input) => {
  const loaded = loadPrivateKey();
  if (!loaded) return { ok: false, error: 'لم يتم استيراد المفتاح الخاص بعد.' };
  try {
    const result = core.issueLicense(loaded.key, input || {});
    appendLog({
      issuedAt: new Date().toISOString(),
      mid: result.payload.mid,
      typ: result.payload.typ,
      lid: result.payload.lid,
      kid: result.payload.kid,
      exp: result.payload.exp,
      expDate: result.expiresAt
    });
    const check = core.inspectToken(loaded.key, result.token);
    return {
      ok: true,
      token: result.token,
      payload: result.payload,
      expiresAt: result.expiresAt,
      signatureValid: check.signatureValid,
      matchesApp: check.matchesAppKey
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('license:revoke', async (_event, input) => {
  const loaded = loadPrivateKey();
  if (!loaded) return { ok: false, error: 'لم يتم استيراد المفتاح الخاص بعد.' };
  try {
    const result = core.revokeLicense(loaded.key, input || {});
    appendLog({
      issuedAt: new Date().toISOString(),
      mid: result.payload.mid,
      typ: 'REVOKE',
      lid: result.payload.lid,
      kid: result.payload.kid,
      reason: result.entry.reason
    });
    const list = readRevocations();
    const current = list.find((r) => core.canonicalMid(r.mid) === core.canonicalMid(result.entry.mid));
    if (!current || Number(current.iat || 0) < Number(result.entry.iat || 0)) {
      saveRevocations([
        result.entry,
        ...list.filter((r) => core.canonicalMid(r.mid) !== core.canonicalMid(result.entry.mid))
      ]);
    }
    return { ok: true, token: result.token, payload: result.payload, entry: result.entry };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('revocation:remove', (_event, mid) => {
  const key = core.canonicalMid(mid);
  const list = readRevocations();
  const next = list.filter((r) => core.canonicalMid(r.mid) !== key);
  saveRevocations(next);
  return { ok: true, removed: next.length !== list.length };
});

ipcMain.handle('project:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر مجلد مشروع PharmacyPOS',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  const dir = result.filePaths[0];
  const target = path.join(dir, 'src', 'utils');
  if (!fs.existsSync(target)) {
    return { ok: false, error: 'هذا المجلد لا يحتوي على src/utils — اختر مجلد المشروع نفسه (D:\\New folder مثلاً).' };
  }
  saveSettings({ projectDir: dir });
  return { ok: true, projectDir: dir };
});

ipcMain.handle('revocations:export', async () => {
  const settings = readSettings();
  const list = readRevocations();
  const code = core.renderRevocationsModule(list);

  let target = '';
  if (settings.projectDir) {
    target = path.join(settings.projectDir, 'src', 'utils', 'licenseRevocations.js');
  }

  if (target) {
    try {
      fs.writeFileSync(target, code, 'utf8');
      return { ok: true, path: target, count: list.length };
    } catch (e) {
      // fall through to "save as"
    }
  }

  const save = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ قائمة الإلغاء',
    defaultPath: 'licenseRevocations.js',
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  });
  if (save.canceled || !save.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(save.filePath, code, 'utf8');
  return { ok: true, path: save.filePath, count: list.length };
});

ipcMain.handle('shell:open-folder', async (_event, target) => {
  try {
    const settings = readSettings();
    const dir = target || settings.projectDir;
    if (!dir) return { ok: false, error: 'لا يوجد مجلد محدد.' };
    await shell.openPath(dir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('token:inspect', async (_event, token) => {
  const loaded = loadPrivateKey();
  if (!loaded) return { ok: false, error: 'لم يتم استيراد المفتاح الخاص بعد.' };
  try {
    return { ok: true, ...core.inspectToken(loaded.key, token) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
