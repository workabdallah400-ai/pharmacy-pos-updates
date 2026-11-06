import { sqliteService } from '../db/sqliteService.js';
import {
  MASTER_SECRET,
  sha256Hex,
  generateActivationKey,
  generateResetCode,
  generateRevokeCode
} from './licenseKeys.js';

export { MASTER_SECRET, sha256Hex, generateActivationKey, generateResetCode, generateRevokeCode };

const LICENSE_STORAGE_KEY = 'PHARMACY_LICENSE_DATA';
const MACHINE_ID_STORAGE_KEY = 'PHARMACY_MACHINE_ID';
const LAST_TIME_STORAGE_KEY = 'PHARMACY_SYS_CLOCK_TIMESTAMP';

// Keys issued by the developer that are valid regardless of the machine ID.
const MASTER_LIFETIME_KEYS = [
  'LIC-LIFE-7729-9941-EGYP',
  'LIC-LIFE-0120-1395-2430', // Developer Eng. Abdullah Gamil
  'LIC-LIFE-2026-PHAR-EGYP'
];

/**
 * Verify that a stored license key really belongs to this machine.
 * Prevents copying a license record from another computer.
 */
export async function isLicenseKeyValidForMachine(key, machineId) {
  const cleanKey = String(key || '').trim().toUpperCase();
  if (!cleanKey) return false;
  if (MASTER_LIFETIME_KEYS.includes(cleanKey)) return true;

  const expectedLife = await generateActivationKey(machineId, 'LIFETIME');
  if (cleanKey === expectedLife) return true;
  if (
    cleanKey === expectedLife.replace('LIC-LIFE-', 'LIC-ANNUAL-') ||
    cleanKey === expectedLife.replace('LIC-LIFE-', 'LIC-YEAR-')
  ) {
    return true;
  }

  if (cleanKey.startsWith('LIC-EXP-')) {
    const parts = cleanKey.split('-');
    if (parts.length < 5) return false;
    const ymd = parts[2];
    const providedSig = parts[3] + '-' + parts[4];
    const cleanMid = String(machineId || '').replace(/[^A-Z0-9]/g, '');
    const expHash = await sha256Hex(cleanMid + '-EXP-' + ymd + '-' + MASTER_SECRET);
    return providedSig === expHash.substring(0, 4) + '-' + expHash.substring(4, 8);
  }

  return false;
}

/**
 * Deterministic SHA-256 Hex Generator using standard Web Crypto API
 */
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
 * Check current license state from SQLite & LocalStorage
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
    return {
      isLicensed: false,
      isTrial: false,
      isExpired: true,
      status: 'CLOCK_TAMPER',
      trialDaysRemaining: 0,
      machineId,
      licenseKey: '',
      activatedAt: '',
      expiresAt: ''
    };
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
  const activeKey = dbLicense?.license_key || localLicense?.license_key || '';
  const activatedAt = dbLicense?.activated_at || localLicense?.activated_at || '';

  // 3. Check if Revoked
  if (activeStatus === 'REVOKED') {
    return {
      isLicensed: false,
      isTrial: false,
      isExpired: true,
      status: 'REVOKED',
      trialDaysRemaining: 0,
      machineId,
      licenseKey: '',
      activatedAt,
      expiresAt: ''
    };
  }

  // 4. Check if Expired Key (LIC-EXP-YYYYMMDD-...) or ANNUAL
  if (activeKey.startsWith('LIC-EXP-') || activeStatus === 'ANNUAL' || activeStatus === 'DURATION') {
    // Reject a duration key copied from another machine
    if (activeKey.startsWith('LIC-EXP-') && !(await isLicenseKeyValidForMachine(activeKey, machineId))) {
      return {
        isLicensed: false,
        isTrial: false,
        isExpired: true,
        status: 'UNLICENSED',
        trialDaysRemaining: 0,
        machineId,
        licenseKey: '',
        activatedAt: '',
        expiresAt: ''
      };
    }

    let expiresAt = '';
    let daysRemaining = 0;

    if (activeKey.startsWith('LIC-EXP-')) {
      const ymd = activeKey.substring(8, 16);
      if (ymd.length === 8) {
        const y = parseInt(ymd.substring(0, 4), 10);
        const m = parseInt(ymd.substring(4, 6), 10) - 1;
        const d = parseInt(ymd.substring(6, 8), 10);
        const expDate = new Date(y, m, d, 23, 59, 59);
        expiresAt = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const diffMs = expDate.getTime() - nowMs;
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }
    } else if (activatedAt) {
      const actDate = new Date(activatedAt);
      const expDate = new Date(actDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      expiresAt = expDate.toISOString().slice(0, 10);
      const diffMs = expDate.getTime() - nowMs;
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    if (daysRemaining <= 0) {
      return {
        isLicensed: false,
        isTrial: false,
        isExpired: true,
        status: 'EXPIRED',
        trialDaysRemaining: 0,
        machineId,
        licenseKey: activeKey,
        activatedAt,
        expiresAt,
        daysRemaining: 0
      };
    }

    return {
      isLicensed: true,
      isTrial: false,
      isExpired: false,
      status: 'DURATION',
      trialDaysRemaining: 0,
      machineId,
      licenseKey: activeKey,
      activatedAt: activatedAt ? activatedAt.slice(0, 10) : '',
      expiresAt,
      daysRemaining
    };
  }

  // 5. Check if Lifetime
  if (activeStatus === 'LIFETIME' || activeKey.startsWith('LIC-LIFE-')) {
    // Verify the key was issued for this machine (empty legacy keys are tolerated)
    if (activeKey && !(await isLicenseKeyValidForMachine(activeKey, machineId))) {
      return {
        isLicensed: false,
        isTrial: false,
        isExpired: true,
        status: 'UNLICENSED',
        trialDaysRemaining: 0,
        machineId,
        licenseKey: '',
        activatedAt: '',
        expiresAt: ''
      };
    }
    return {
      isLicensed: true,
      isTrial: false,
      isExpired: false,
      status: 'LIFETIME',
      trialDaysRemaining: 0,
      machineId,
      licenseKey: activeKey || 'LIC-LIFE-7729-9941-EGYP',
      activatedAt: activatedAt ? activatedAt.slice(0, 10) : '2026-11-02',
      expiresAt: 'مدى الحياة (غير محدد)',
      daysRemaining: 'دائم (غير محدود)'
    };
  }

  // 6. Unlicensed fresh install
  return {
    isLicensed: false,
    isTrial: false,
    isExpired: true,
    status: 'UNLICENSED',
    trialDaysRemaining: 0,
    machineId,
    licenseKey: '',
    activatedAt: '',
    expiresAt: ''
  };
}

/**
 * Validate and Activate License Key
 * Full support for:
 * 1. LIFETIME keys
 * 2. DURATION / EXPIRY keys (LIC-EXP-YYYYMMDD-XXXX-YYYY)
 * 3. Master Admin Reset Code (RST-ADMIN-...)
 * 4. Revocation / Kill Code (REV-KILL-... or REVOKE-...)
 */
export async function activateLicenseKey(rawKey) {
  const cleanKey = (rawKey || '').trim().toUpperCase();
  const machineId = getMachineId();
  const cleanMid = machineId.replace(/[^A-Z0-9]/g, '');

  // 1. Support Master Admin PIN Reset Code (RST)
  const expectedResetCode = await generateResetCode(machineId);

  if (cleanKey.startsWith('RST')) {
    if (cleanKey === expectedResetCode || cleanKey === 'RST-0120-1395-2430' || cleanKey === 'RST-ADMIN-0120') {
      try {
        const curSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
        localStorage.setItem(
          'PHARMACY_SETTINGS',
          JSON.stringify({ ...curSettings, adminPin: '1234' })
        );
      } catch (e) {}

      return {
        success: false,
        isResetPin: true,
        message: 'تم بنجاح استعادة وإعادة تعيين رمز مدير الصيدلية (Admin PIN) إلى: 1234 🔑'
      };
    }
  }

  // 2. Support Revoke / Kill Code (REV / REVOKE)
  const expectedRevokeCode = await generateRevokeCode(machineId);
  if (cleanKey.startsWith('REV')) {
    const isRevokeMatch =
      cleanKey === expectedRevokeCode ||
      cleanKey === `REVOKE-${machineId}` ||
      cleanKey === `REVOKE-${cleanMid}` ||
      cleanKey === 'REV-KILL-0120-1395' ||
      cleanKey === 'REVOKE-0120-1395-2430' ||
      cleanKey === 'REVOKE-MASTER-2026' ||
      cleanKey === 'REVOKE-ALL';

    if (isRevokeMatch) {
      await revokeLicense(machineId);
      return {
        success: false,
        isRevoked: true,
        status: 'REVOKED',
        error: 'تم إلغاء وسحب ترخيص هذا الجهاز بنجاح بناءً على كود الإلغاء الأمني (Revoked) 🚫'
      };
    }
  }

  // 3. Support Expiry / Duration Keys (LIC-EXP-YYYYMMDD-XXXX-YYYY)
  if (cleanKey.startsWith('LIC-EXP-')) {
    const parts = cleanKey.split('-');
    if (parts.length >= 5) {
      const ymd = parts[2];
      const providedSig = parts[3] + '-' + parts[4];
      const expHash = await sha256Hex(cleanMid + '-EXP-' + ymd + '-' + MASTER_SECRET);
      const expectedSig = expHash.substring(0, 4) + '-' + expHash.substring(4, 8);

      if (providedSig === expectedSig) {
        const y = parseInt(ymd.substring(0, 4), 10);
        const m = parseInt(ymd.substring(4, 6), 10) - 1;
        const d = parseInt(ymd.substring(6, 8), 10);
        const expDate = new Date(y, m, d, 23, 59, 59);

        if (Date.now() > expDate.getTime()) {
          return {
            success: false,
            error: `مفتاح التفعيل منتهي الصلاحية بتاريخ (${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')})!`
          };
        }

        const status = 'DURATION';
        const nowIso = new Date().toISOString();

        try {
          localStorage.setItem(LAST_TIME_STORAGE_KEY, String(Date.now()));
        } catch (e) {}

        const licenseRecord = {
          machine_id: machineId,
          license_status: status,
          license_key: cleanKey,
          first_install_date: nowIso,
          trial_days: 0,
          activated_at: nowIso
        };

        try {
          await sqliteService.saveLicenseInfo(licenseRecord);
        } catch (e) {}

        try {
          localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenseRecord));
          const currentSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
          localStorage.setItem(
            'PHARMACY_SETTINGS',
            JSON.stringify({
              ...currentSettings,
              licenseStatus: status,
              licenseKey: cleanKey
            })
          );
        } catch (e) {}

        const days = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return {
          success: true,
          status,
          message: `مبروك! تم تفعيل ترخيص البرنامج بنجاح حتى (${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}) — متبقي ${days} يوماً 🔑`
        };
      }
    }
  }

  // 4. Support Lifetime Keys (LIC-LIFE-...)
  // IMPORTANT: a key is only valid when its signature matches THIS machine.
  // Previously any key matching the generic shape (e.g. LIC-LIFE-0000-0000-XXXX)
  // was accepted, which let anyone bypass activation.
  const expectedLifetimeKey = await generateActivationKey(machineId, 'LIFETIME');
  const isMasterLifetime = MASTER_LIFETIME_KEYS.includes(cleanKey);
  const isMachineLifetime = cleanKey === expectedLifetimeKey;

  // Legacy annual keys still need a signature tied to this machine.
  const isLegacyAnnual =
    (cleanKey.startsWith('LIC-ANNUAL-') || cleanKey.startsWith('LIC-YEAR-')) &&
    (cleanKey === expectedLifetimeKey.replace('LIC-LIFE-', 'LIC-ANNUAL-') ||
      cleanKey === expectedLifetimeKey.replace('LIC-LIFE-', 'LIC-YEAR-'));

  if (!isMasterLifetime && !isMachineLifetime && !isLegacyAnnual) {
    return {
      success: false,
      error: 'مفتاح التفعيل غير صحيح أو لا يخص هذا الجهاز! يرجى إدخال مفتاح صادر من أداة المطور.'
    };
  }

  const status = isLegacyAnnual ? 'ANNUAL' : 'LIFETIME';
  const nowIso = new Date().toISOString();

  try {
    localStorage.setItem(LAST_TIME_STORAGE_KEY, String(Date.now()));
  } catch (e) {}

  const licenseRecord = {
    machine_id: machineId,
    license_status: status,
    license_key: cleanKey,
    first_install_date: nowIso,
    trial_days: 0,
    activated_at: nowIso
  };

  try {
    await sqliteService.saveLicenseInfo(licenseRecord);
  } catch (e) {
    console.warn('SQLite license save error:', e);
  }

  try {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenseRecord));
    const currentSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
    localStorage.setItem(
      'PHARMACY_SETTINGS',
      JSON.stringify({
        ...currentSettings,
        licenseStatus: status,
        licenseKey: cleanKey
      })
    );
  } catch (e) {}

  return {
    success: true,
    status,
    message: status === 'LIFETIME'
      ? 'مبروك! تم تفعيل ترخيص البرنامج بنجاح مدى الحياة (LIFETIME) 🔑'
      : 'مبروك! تم تفعيل الترخيص السنوي للبرنامج بنجاح 🔑'
  };
}

/**
 * Revoke and deactivate license for this machine
 */
export async function revokeLicense(machineId) {
  const mid = machineId || getMachineId();
  const record = {
    machine_id: mid,
    license_status: 'REVOKED',
    license_key: '',
    first_install_date: new Date().toISOString(),
    trial_days: 0,
    activated_at: ''
  };

  try {
    await sqliteService.saveLicenseInfo(record);
  } catch (e) {
    console.warn('SQLite revoke error:', e);
  }

  try {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record));
    const currentSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
    localStorage.setItem(
      'PHARMACY_SETTINGS',
      JSON.stringify({
        ...currentSettings,
        licenseStatus: 'REVOKED',
        licenseKey: ''
      })
    );
  } catch (e) {}

  return { success: true, status: 'REVOKED' };
}
