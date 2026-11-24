import { sqliteService } from '../db/sqliteService.js';
import { verifyLicenseToken, decodeToken } from './licenseToken.js';
import { LICENSE_PUBLIC_KEYS } from './licensePublicKey.js';

const LICENSE_STORAGE_KEY = 'PHARMACY_LICENSE_DATA';
const MACHINE_ID_STORAGE_KEY = 'PHARMACY_MACHINE_ID';
const LAST_TIME_STORAGE_KEY = 'PHARMACY_SYS_CLOCK_TIMESTAMP';
const REVOCATION_STORAGE_KEY = 'PHARMACY_LICENSE_REVOCATIONS';

const TOKEN_PREFIX = 'LIC2.';

/**
 * Normalize an optional separator-less machine code for comparison.
 */
function normalizeMid(value) {
  return String(value || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
}

function emptyStatus(machineId, status = 'UNLICENSED') {
  return {
    isLicensed: false,
    isTrial: false,
    isExpired: true,
    status,
    trialDaysRemaining: 0,
    machineId,
    licenseKey: '',
    activatedAt: '',
    expiresAt: ''
  };
}

function isLicenseTokenFormat(value) {
  return typeof value === 'string' && value.trim().startsWith(TOKEN_PREFIX);
}

/**
 * Returns all revocations known on this device, keyed by normalized machine ID.
 * A revocation is stored locally the moment a signed REVOKE token is entered,
 * and can also arrive from the signed revocation table in the database.
 */
function loadLocalRevocations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REVOCATION_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveLocalRevocations(map) {
  try {
    localStorage.setItem(REVOCATION_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}

async function loadRevocations() {
  const map = loadLocalRevocations();
  try {
    const rows = await sqliteService.getRevocations();
    for (const row of rows || []) {
      const mid = normalizeMid(row.mid);
      if (!mid) continue;
      const iso = row.revoked_at || row.imported_at || '';
      const seconds = Number.isFinite(Date.parse(iso)) ? Math.floor(Date.parse(iso) / 1000) : 0;
      const existing = map[mid];
      if (!existing || Number(existing.iat || 0) < seconds) {
        map[mid] = { mid, lid: row.lid || '', reason: row.reason || '', iat: seconds };
      }
    }
  } catch (e) {}
  return map;
}

/**
 * True when a token was issued BEFORE this machine was revoked.
 * A token issued after the revocation moment is a deliberate re-activation.
 */
function isRevokedToken(payload, revocations) {
  const mid = normalizeMid(payload.mid);
  const revocation = revocations[mid];
  if (!revocation) return false;
  const revokedAt = Number(revocation.iat || 0);
  if (!revokedAt) return true;
  return Number(payload.iat || 0) <= revokedAt;
}

/**
 * Get or generate a persistent unique Machine ID for this computer
 * Format: EGYP-XXXX-YYYY-ZZZZ
 */
export function getMachineId() {
  try {
    const existing = localStorage.getItem(MACHINE_ID_STORAGE_KEY);
    if (existing && existing.startsWith('EGYP-')) return existing;

    let seed = 'POS-NODE-PRODUCTION';
    if (typeof window !== 'undefined' && window.require) {
      try {
        const os = window.require('os');
        seed = `${os.hostname()}-${os.platform()}-${os.arch()}`;
      } catch (e) {}
    }

    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    const str = seed + 'PHARMACY-PRO-NODE-2026';
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase();
    const part1 = (combined.substring(0, 4) || 'B009').toUpperCase();
    const part2 = (combined.substring(4, 8) || '4237').toUpperCase();
    const part3 = (combined.substring(8, 12) || '53D2').toUpperCase();
    const machineId = `EGYP-${part1}-${part2}-${part3}`;

    localStorage.setItem(MACHINE_ID_STORAGE_KEY, machineId);
    return machineId;
  } catch (e) {
    return 'EGYP-B009-4237-53D2';
  }
}

/**
 * Verify that a stored LIC2 token really belongs to this machine and carries a
 * valid Ed25519 signature. There is no shared secret in the client anymore:
 * only the developer's PUBLIC key ships with the app, so a pharmacy PC cannot
 * mint its own licence.
 */
export async function isLicenseKeyValidForMachine(key, machineId) {
  if (!isLicenseTokenFormat(key)) return false;
  try {
    await verifyLicenseToken(key.trim(), {
      machineId: machineId || getMachineId(),
      publicKeys: LICENSE_PUBLIC_KEYS
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check current license state from SQLite & LocalStorage.
 * Accepts ONLY signed LIC2 tokens. Legacy symmetric keys (LIC-LIFE-*,
 * LIC-EXP-*, REVOKE-MASTER-*, ...) are rejected by design.
 */
export async function checkLicenseStatus() {
  const machineId = getMachineId();

  // 1. Anti-Tamper Clock Check
  const nowMs = Date.now();
  let clockTampered = false;
  try {
    const lastRecorded = localStorage.getItem(LAST_TIME_STORAGE_KEY);
    if (lastRecorded) {
      const lastMs = parseInt(lastRecorded, 10);
      if (!isNaN(lastMs) && nowMs < lastMs - (15 * 60 * 1000)) {
        clockTampered = true;
      }
    }
    if (!clockTampered) {
      localStorage.setItem(LAST_TIME_STORAGE_KEY, String(nowMs));
    }
  } catch (e) {}

  if (clockTampered) {
    return emptyStatus(machineId, 'CLOCK_TAMPER');
  }

  // 2. Fetch records
  let dbLicense = null;
  try {
    dbLicense = await sqliteService.getLicenseInfo();
  } catch (e) {
    console.warn('SQLite license fetch error, falling back to localStorage:', e);
  }

  let localLicense = null;
  try {
    const saved = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (saved) localLicense = JSON.parse(saved);
  } catch (e) {}

  const activeStatus = dbLicense?.license_status || localLicense?.license_status || 'UNLICENSED';
  const activeKey = String(dbLicense?.license_key || localLicense?.license_key || '').trim();
  const activatedAt = dbLicense?.activated_at || localLicense?.activated_at || '';

  // 3. A legacy key or a previously revoked licence cannot unlock the app.
  if (activeStatus === 'REVOKED') {
    return emptyStatus(machineId, 'REVOKED');
  }
  if (!activeKey || !isLicenseTokenFormat(activeKey)) {
    return emptyStatus(machineId, 'UNLICENSED');
  }

  // 4. Cryptographic & machine-binding verification
  const revocations = await loadRevocations();
  let revokedLids = new Set();
  try {
    const rows = await sqliteService.getRevocations();
    revokedLids = new Set((rows || []).map((r) => r.lid).filter(Boolean));
  } catch (e) {}

  let verified;
  try {
    verified = await verifyLicenseToken(activeKey, {
      machineId,
      publicKeys: LICENSE_PUBLIC_KEYS,
      now: nowMs,
      revokedLids
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (message.includes('انتهت صلاحية')) {
      return {
        ...emptyStatus(machineId, 'EXPIRED'),
        licenseKey: activeKey,
        activatedAt: activatedAt ? activatedAt.slice(0, 10) : ''
      };
    }
    return emptyStatus(machineId, 'UNLICENSED');
  }

  // 5. Withdrawal of a licence issued before the revocation moment
  if (isRevokedToken(verified.payload, revocations)) {
    return emptyStatus(machineId, 'REVOKED');
  }

  // 6. Valid LIFETIME / TIMED licence
  const isTimed = verified.type === 'TIMED';
  const expiresAt = verified.expiresAt ? verified.expiresAt.slice(0, 10) : '';
  const daysRemaining = isTimed && verified.expiresAt
    ? Math.max(0, Math.ceil((new Date(verified.expiresAt).getTime() - nowMs) / 86400000))
    : null;

  return {
    isLicensed: true,
    isTrial: false,
    isExpired: false,
    status: isTimed ? 'TIMED' : 'LIFETIME',
    trialDaysRemaining: 0,
    machineId,
    licenseKey: activeKey,
    licenseId: verified.lid,
    activatedAt: activatedAt ? activatedAt.slice(0, 10) : new Date(verified.payload.iat * 1000).toISOString().slice(0, 10),
    expiresAt: isTimed ? expiresAt : 'مدى الحياة (غير محدد)',
    daysRemaining: isTimed ? daysRemaining : 'دائم (غير محدود)'
  };
}

/**
 * Persist an activated / revoked licence record in both storages.
 */
async function persistLicenseRecord(record) {
  try {
    await sqliteService.saveLicenseInfo(record);
  } catch (e) {
    console.warn('SQLite license save error:', e);
  }
  try {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record));
    const currentSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
    localStorage.setItem(
      'PHARMACY_SETTINGS',
      JSON.stringify({
        ...currentSettings,
        licenseStatus: record.license_status,
        licenseKey: record.license_key || ''
      })
    );
  } catch (e) {}
}

/**
 * Validate and activate a signed LIC2 licence token.
 *
 * Supports:
 *  1. LIFETIME tokens  — permanent licence for this machine.
 *  2. TIMED tokens     — licence with a signed expiry date.
 *  3. REVOKE tokens    — signed withdrawal; records the revocation moment and
 *                        blocks every licence issued before it.
 *
 * Legacy keys and unsigned revocation codes are rejected.
 */
export async function activateLicenseKey(rawKey) {
  const key = String(rawKey || '').trim();
  const machineId = getMachineId();

  if (!key) {
    return { success: false, error: 'يرجى إدخال مفتاح التفعيل أولاً.' };
  }

  // Legacy symmetric keys are no longer accepted (security migration).
  if (!isLicenseTokenFormat(key)) {
    if (/^(LIC-LIFE|LIC-EXP|LIC-ANNUAL|LIC-YEAR|REVOKE|REV-|RST-ADMIN)/i.test(key)) {
      return {
        success: false,
        legacyKey: true,
        error: 'هذا مفتاح من النظام القديم وتم إيقافه لأسباب أمنية. اطلب مفتاحاً جديداً يبدأ بـ LIC2 من المطور.'
      };
    }
    return {
      success: false,
      error: 'مفتاح التفعيل غير صحيح. المفتاح الرسمي يبدأ بـ LIC2. — انسخه كاملاً كما هو.'
    };
  }

  let decoded;
  try {
    decoded = decodeToken(key);
  } catch (e) {
    return { success: false, error: 'مفتاح التفعيل تالف أو غير مكتمل. انسخه كاملاً دون أي حروف ناقصة.' };
  }

  // 1. Signed REVOKE token: withdraw this machine's licence.
  if (decoded.payload?.typ === 'REVOKE') {
    try {
      await verifyLicenseToken(key, { machineId, publicKeys: LICENSE_PUBLIC_KEYS });
    } catch (err) {
      return { success: false, error: `رمز الإلغاء غير صالح: ${err.message}` };
    }

    const issuedAt = Number(decoded.payload.iat) || Math.floor(Date.now() / 1000);

    // Replaying an old REVOKE code must not cancel a licence that was issued
    // after it. Only a revocation newer than the active token can withdraw it.
    let activeToken = '';
    try {
      const dbLicense = await sqliteService.getLicenseInfo();
      const localLicense = JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY) || 'null');
      activeToken = String(dbLicense?.license_key || localLicense?.license_key || '').trim();
    } catch (e) {}
    if (isLicenseTokenFormat(activeToken)) {
      try {
        const activePayload = decodeToken(activeToken).payload;
        if (Number(activePayload.iat) > issuedAt) {
          return {
            success: false,
            error: 'رمز الإلغاء هذا أقدم من الترخيص الحالي المسجّل على الجهاز، لذلك لم يتم تطبيقه.'
          };
        }
      } catch (e) {}
    }

    const revocations = await loadRevocations();
    const mid = normalizeMid(machineId);
    const previous = revocations[mid];
    const revokedAt = Math.max(issuedAt, Number(previous?.iat || 0));
    revocations[mid] = {
      mid,
      lid: decoded.payload.lid || '',
      reason: decoded.payload.reason || 'إلغاء موقّع من المطور',
      iat: revokedAt
    };
    saveLocalRevocations(revocations);

    try {
      await sqliteService.importRevocations([{
        lid: decoded.payload.lid || `REVOKE-${mid}-${revokedAt}`,
        mid,
        reason: revocations[mid].reason,
        at: new Date(revokedAt * 1000).toISOString()
      }]);
    } catch (e) {}

    await persistLicenseRecord({
      machine_id: machineId,
      license_status: 'REVOKED',
      license_key: '',
      first_install_date: new Date().toISOString(),
      trial_days: 0,
      activated_at: ''
    });

    return {
      success: false,
      isRevoked: true,
      status: 'REVOKED',
      error: 'تم إلغاء وسحب ترخيص هذا الجهاز بنجاح (Revoked) 🚫'
    };
  }

  // 2. LIFETIME / TIMED token: verify signature + machine binding + expiry.
  let verified;
  try {
    verified = await verifyLicenseToken(key, {
      machineId,
      publicKeys: LICENSE_PUBLIC_KEYS
    });
  } catch (err) {
    return { success: false, error: err.message || 'مفتاح التفعيل غير صحيح أو لا يخص هذا الجهاز.' };
  }

  if (verified.type !== 'LIFETIME' && verified.type !== 'TIMED') {
    return { success: false, error: `نوع الترخيص (${verified.type}) لا يمكن استخدامه للتفعيل.` };
  }

  // 3. A withdrawn machine may only be re-activated by a NEWER token.
  const revocations = await loadRevocations();
  if (isRevokedToken(verified.payload, revocations)) {
    return {
      success: false,
      error: 'تم إلغاء ترخيص هذا الجهاز. يجب أن يصدر المطور مفتاحاً جديداً بتاريخ أحدث من لحظة الإلغاء.'
    };
  }

  const nowIso = new Date().toISOString();
  try {
    localStorage.setItem(LAST_TIME_STORAGE_KEY, String(Date.now()));
  } catch (e) {}

  await persistLicenseRecord({
    machine_id: machineId,
    license_status: verified.type,
    license_key: key,
    first_install_date: nowIso,
    trial_days: 0,
    activated_at: nowIso
  });

  const expDate = verified.expiresAt ? verified.expiresAt.slice(0, 10) : '';
  const days = verified.expiresAt
    ? Math.ceil((new Date(verified.expiresAt).getTime() - Date.now()) / 86400000)
    : null;

  return {
    success: true,
    status: verified.type,
    message: verified.type === 'LIFETIME'
      ? 'مبروك! تم تفعيل ترخيص البرنامج بنجاح مدى الحياة (LIFETIME) 🔑'
      : `مبروك! تم تفعيل الترخيص بنجاح حتى (${expDate}) — متبقي ${Math.max(0, days)} يوماً 🔑`
  };
}

/**
 * Revoke and deactivate the licence on this machine.
 * Used only for local state cleanup; the authoritative withdrawal is the
 * developer's signed REVOKE token.
 */
export async function revokeLicense(machineId) {
  const mid = machineId || getMachineId();
  await persistLicenseRecord({
    machine_id: mid,
    license_status: 'REVOKED',
    license_key: '',
    first_install_date: new Date().toISOString(),
    trial_days: 0,
    activated_at: ''
  });
  return { success: true, status: 'REVOKED' };
}
