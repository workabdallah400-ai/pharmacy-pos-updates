// Resolves the base URL of the shift report server.
//
// Priority:
//   1. A URL explicitly configured by the user (Settings → Cloud Sync).
//   2. The embedded LAN server started by the Electron desktop app.
//   3. The origin of a configured sync endpoint (when it is a report server).
//
// The same server accepts the offline sync outbox at `/api/pharmacy/sync`
// and renders the styled Arabic shift report at `/r/<shiftId>`.

import { DEFAULT_SETTINGS } from '../data/mockSettings.js';

export const REPORT_AUTO_BASE_KEY = 'PHARMACY_REPORT_AUTO_BASE';
export const REPORT_INFO_KEY = 'PHARMACY_REPORT_INFO';
export const TUNNEL_URL_KEY = 'PHARMACY_TUNNEL_URL';

let cachedInfo = null;
let initPromise = null;

// Always merge the saved settings with the defaults. A record saved by an
// older build may be missing newer keys (cloudPharmacyId, useCloudflareTunnel)
// and that would silently send the QR code and the uploaded data to two
// different pharmacy IDs.
export function readSettings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}') || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function cleanBase(value) {
  let raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) {
    // Accept "my-server.com/api/pharmacy/sync" and normalise it to https.
    if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(raw)) raw = `https://${raw}`;
    else return '';
  }
  return raw.replace(/\/+$/, '');
}

function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch (e) {
    return true;
  }
}

// A URL a phone camera can actually reach over Wi-Fi.
export function isPhoneReachable(url) {
  const base = cleanBase(url);
  return !!base && !isLoopback(base);
}

// Private / local addresses: they only work inside the pharmacy's own
// network, so they can never be the "cloud" copy the owner sees from
// another city.
export function isPrivateHost(url) {
  const base = cleanBase(url);
  if (!base) return true;
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
    if (/^127\./.test(host) || /^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch (e) {
    return true;
  }
}

// Derive the report server origin from a sync endpoint such as
// `https://server.example.com/api/pharmacy/sync`.
export function baseUrlFromSyncEndpoint(endpoint) {
  const raw = cleanBase(endpoint);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (e) {
    return raw;
  }
}

function getElectronIpc() {
  try {
    if (typeof window !== 'undefined' && window.require) {
      const electron = window.require('electron');
      if (electron && electron.ipcRenderer) return electron.ipcRenderer;
    }
  } catch (e) {}
  return null;
}

function persistInfo(info) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(REPORT_INFO_KEY, JSON.stringify(info));
    if (info && info.autoBase) {
      localStorage.setItem(REPORT_AUTO_BASE_KEY, info.autoBase);
    } else {
      localStorage.removeItem(REPORT_AUTO_BASE_KEY);
    }
  } catch (e) {}
}

export function getCachedReportInfo() {
  if (cachedInfo) return cachedInfo;
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(REPORT_INFO_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch (e) {}
  return null;
}

// The public Cloudflare tunnel URL (empty when no tunnel is running).
export function getTunnelUrl() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return cleanBase(localStorage.getItem(TUNNEL_URL_KEY));
  } catch (e) {
    return '';
  }
}

export function setTunnelUrl(url) {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = cleanBase(url);
    if (clean) localStorage.setItem(TUNNEL_URL_KEY, clean);
    else localStorage.removeItem(TUNNEL_URL_KEY);
  } catch (e) {}
}

// Ask Electron for the embedded server address. Safe to call in a normal
// browser (returns a no-op result and leaves the configured URL untouched).
export async function initReportServer(force = false) {
  if (!force && initPromise) return initPromise;

  initPromise = (async () => {
    const ipc = getElectronIpc();
    let electronInfo = null;

    if (ipc) {
      try {
        const res = await ipc.invoke('report:info');
        if (res) electronInfo = res;
      } catch (e) {}
    }

    const lanUrl = cleanBase(electronInfo?.lanUrl);
    const localUrl = cleanBase(electronInfo?.localUrl);
    const autoBase = isPhoneReachable(lanUrl) ? lanUrl : '';

    // Ask Electron whether a public Cloudflare tunnel is currently open.
    let tunnel = { url: '', running: false, available: false };
    if (ipc) {
      try {
        const res = await ipc.invoke('report:tunnelUrl');
        if (res) tunnel = res;
      } catch (e) {}
    }
    setTunnelUrl(tunnel.url);

    const settings = readSettings();
    const configuredBase = cleanBase(settings.reportBaseUrl);
    const derivedBase = configuredBase || baseUrlFromSyncEndpoint(settings.syncEndpoint);
    const tunnelBase = cleanBase(tunnel.url);

    const info = {
      running: !!electronInfo?.running,
      port: electronInfo?.port || null,
      lanUrl,
      localUrl,
      // Public tunnel URL (free, no account) — used for the QR when enabled.
      tunnelUrl: tunnelBase,
      tunnelRunning: !!tunnel.running,
      tunnelAvailable: !!tunnel.available,
      // URL used inside the app for previews (can be localhost).
      previewBase: configuredBase || derivedBase || (isPhoneReachable(lanUrl) ? lanUrl : localUrl),
      // URL embedded in the QR code. Must be reachable from a phone.
      autoBase
    };

    cachedInfo = info;
    persistInfo(info);
    return info;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

// Synchronous resolver used by the sync engine and QR builders.
//
// Priority:
//   1. A user-configured report URL (Settings → Cloud Sync).
//   2. The permanent public host (Cloudflare Worker) — always reachable
//      from any phone, and it never changes.
//   3. The free Cloudflare quick-tunnel URL — when the tunnel is switched on.
//   4. The embedded LAN server address (auto-detected).
//   5. The origin of the configured sync endpoint.
export function getReportBaseUrl() {
  const settings = readSettings();
  const configured = cleanBase(settings.reportBaseUrl);
  if (configured) return configured;

  const permanent = cleanBase(settings.permanentReportUrl);
  if (permanent) return permanent;

  if (settings.useCloudflareTunnel) {
    const tunnel = getTunnelUrl();
    if (tunnel) return tunnel;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const auto = cleanBase(localStorage.getItem(REPORT_AUTO_BASE_KEY));
      if (auto) return auto;
    }
  } catch (e) {}
  return baseUrlFromSyncEndpoint(settings.syncEndpoint);
}

export function getReportPreviewBaseUrl() {
  const info = cachedInfo || getCachedReportInfo();
  if (info?.previewBase) return cleanBase(info.previewBase);
  return getReportBaseUrl();
}

// The permanent public host (Settings → Cloud Sync → رابط التقارير الدائم).
// This address never changes, so it is the one that goes into every QR code
// and every link the owner keeps (daily / monthly / portal). A local (LAN)
// address configured by the user is ignored here — it only works inside the
// pharmacy.
export function getPermanentReportBaseUrl() {
  const settings = readSettings();
  const configured = cleanBase(settings.reportBaseUrl);
  if (configured && !isPrivateHost(configured)) return configured;
  return cleanBase(settings.permanentReportUrl);
}

// The direct (fast) address of the report server running on this machine.
// Used for the sync outbox and the snapshot upload so the data never has to
// travel through the public tunnel.
export function getLocalReportBaseUrl() {
  const info = cachedInfo || getCachedReportInfo();
  const fromInfo = cleanBase(info?.lanUrl) || cleanBase(info?.localUrl);
  if (fromInfo) return fromInfo;
  // Fall back to the persisted LAN address (written by initReportServer).
  try {
    if (typeof localStorage !== 'undefined') {
      const auto = cleanBase(localStorage.getItem(REPORT_AUTO_BASE_KEY));
      if (auto) return auto;
    }
  } catch (e) {}
  return '';
}

export function getSyncEndpoint() {
  const settings = readSettings();
  const configured = cleanBase(settings.syncEndpoint);
  if (configured) return configured;
  // Prefer the local server: it is faster and keeps working offline.
  const local = getLocalReportBaseUrl();
  if (local) return `${local}/api/pharmacy/sync`;
  const base = getReportBaseUrl();
  return base ? `${base}/api/pharmacy/sync` : '';
}

// Where the full database snapshot is uploaded.
//
// Two destinations matter:
//   • the local LAN server  → keeps the on-site QR report complete,
//   • the permanent cloud host → what the owner sees from another city.
// The cloud one is preferred here, and `getLocalSnapshotEndpoint()` gives the
// LAN address.
export function getSnapshotEndpoint() {
  const cloud = getPermanentReportBaseUrl();
  if (cloud) return `${cloud}/api/pharmacy/snapshot`;
  const local = getLocalReportBaseUrl();
  if (local) return `${local}/api/pharmacy/snapshot`;
  const base = getReportBaseUrl();
  return base ? `${base}/api/pharmacy/snapshot` : '';
}

// The LAN copy of the snapshot (same network, works without internet).
export function getLocalSnapshotEndpoint() {
  const local = getLocalReportBaseUrl();
  return local ? `${local}/api/pharmacy/snapshot` : '';
}

// The cloud copy of the snapshot (the owner's remote view).
export function getCloudSnapshotEndpoint() {
  const cloud = getPermanentReportBaseUrl();
  return cloud ? `${cloud}/api/pharmacy/snapshot` : '';
}
export function buildShiftReportUrl(shiftId, pharmacyId, baseOverride) {
  const base = baseOverride || getPermanentReportBaseUrl() || getReportBaseUrl();
  if (!base || !shiftId) return '';
  const id = encodeURIComponent(String(shiftId));
  const pid = encodeURIComponent(String(pharmacyId || 'PHARMACY-LOCAL'));
  const settings = readSettings();
  const token = String(settings.reportToken || '').trim();
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${base}/r/${id}?pharmacyId=${pid}${tokenPart}`;
}

// ---------------------------------------------------------------------------
// Cloud identity — every installation owns its pharmacy id and its token
// ---------------------------------------------------------------------------

const CLOUD_CLAIM_KEY = 'PHARMACY_CLOUD_CLAIMED';

function randomString(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  try {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
      for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
      return out;
    }
  } catch (e) {}
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function generateCloudToken() {
  return randomString(40);
}

export function generatePharmacyId() {
  return `PH-EGYP-${randomString(6).toUpperCase()}`;
}

// Every installation gets its own token. It travels inside the QR links, so
// only the pharmacy that owns a report can open it.
export function ensureCloudToken() {
  const settings = readSettings();
  const current = String(settings.reportToken || '').trim();
  if (current) return current;
  const token = generateCloudToken();
  try {
    localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify({ ...settings, reportToken: token }));
  } catch (e) {}
  return token;
}

// Registers this installation on the permanent cloud host. When the pharmacy
// id is already taken by another installation a fresh id is generated, so two
// pharmacies never share (or see) each other's reports.
export async function claimCloudIdentity() {
  const base = getReportBaseUrl();
  if (!base) return { ok: false, error: 'لا يوجد رابط سحابي' };

  let settings = readSettings();
  let pharmacyId = String(settings.cloudPharmacyId || '').trim();
  let token = String(settings.reportToken || '').trim();

  // First time on this machine: mint a fresh token (never reuse one that
  // could have been shared) and remember that this identity is claimed.
  let claimedId = '';
  try {
    claimedId = String(localStorage.getItem(CLOUD_CLAIM_KEY) || '');
  } catch (e) {}
  if (claimedId !== pharmacyId || !token) {
    token = generateCloudToken();
    try {
      localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify({ ...settings, reportToken: token }));
    } catch (e) {}
    settings = { ...settings, reportToken: token };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!pharmacyId) pharmacyId = generatePharmacyId();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${base}/api/pharmacy/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacyId,
          pharmacyName: settings.pharmacyName || '',
          token
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        try {
          localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify({ ...settings, cloudPharmacyId: pharmacyId, reportToken: token }));
          localStorage.setItem(CLOUD_CLAIM_KEY, pharmacyId);
        } catch (e) {}
        return { ok: true, pharmacyId, claimed: !!body.claimed };
      }
      if (res.status === 409 || body.conflict) {
        pharmacyId = generatePharmacyId();
        continue;
      }
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'انتهت مهلة الاتصال' : e.message };
    }
  }
  return { ok: false, error: 'تعذر حجز معرّف الصيدلية' };
}

// Picks the address that goes into the QR code.
//
// The QR ALWAYS points at the permanent cloud host when one is configured:
//   • the link must never change (it may be printed on paper),
//   • the owner in Cairo must be able to open it even when the pharmacy
//     itself is offline,
//   • the report page itself shows a friendly "not uploaded yet" state and
//     refreshes itself as soon as the pharmacy reconnects.
//
// The LAN address is offered separately as a second, on-site QR code (see
// resolveLocalReportUrl) for phones inside the pharmacy.
export async function resolveQrBaseUrl() {
  const permanent = getPermanentReportBaseUrl();
  if (permanent) return permanent;
  return getLocalReportBaseUrl();
}

// The full QR target: the right base + the right pharmacy + the token.
export async function resolveShiftReportUrl(shiftId, pharmacyId) {
  const settings = readSettings();
  const pid = String(pharmacyId || settings.cloudPharmacyId || 'PHARMACY-LOCAL');
  ensureCloudToken();
  const base = await resolveQrBaseUrl();
  return buildShiftReportUrl(shiftId, pid, base);
}

// A second QR target for phones inside the pharmacy (same Wi-Fi, no
// internet needed). Falls back to the permanent host when the LAN server is
// not available.
export async function resolveLocalReportUrl(shiftId, pharmacyId) {
  const settings = readSettings();
  const pid = String(pharmacyId || settings.cloudPharmacyId || 'PHARMACY-LOCAL');
  ensureCloudToken();
  const local = getLocalReportBaseUrl();
  if (!local) return '';
  return buildShiftReportUrl(shiftId, pid, local);
}

export function buildLiveReportsUrl(pharmacyId) {
  const base = getPermanentReportBaseUrl() || getReportBaseUrl();
  if (!base) return '';
  const pid = encodeURIComponent(String(pharmacyId || 'PHARMACY-LOCAL'));
  const settings = readSettings();
  const token = String(settings.reportToken || '').trim();
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${base}/?pharmacyId=${pid}${tokenPart}`;
}

export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildDailySummaryUrl(pharmacyId, dateKey) {
  const base = getPermanentReportBaseUrl() || getReportBaseUrl();
  if (!base) return '';
  const pid = encodeURIComponent(String(pharmacyId || 'PHARMACY-LOCAL'));
  const settings = readSettings();
  const token = String(settings.reportToken || '').trim();
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : '';
  const d = dateKey || localDateKey();
  return `${base}/d/${encodeURIComponent(d)}?pharmacyId=${pid}${tokenPart}`;
}

export function buildMonthlySummaryUrl(pharmacyId, monthKey) {
  const base = getPermanentReportBaseUrl() || getReportBaseUrl();
  if (!base) return '';
  const pid = encodeURIComponent(String(pharmacyId || 'PHARMACY-LOCAL'));
  const settings = readSettings();
  const token = String(settings.reportToken || '').trim();
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : '';
  const m = monthKey || localDateKey().slice(0, 7);
  return `${base}/m/${encodeURIComponent(m)}?pharmacyId=${pid}${tokenPart}`;
}
