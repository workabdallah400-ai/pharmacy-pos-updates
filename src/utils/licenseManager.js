import { sqliteService } from '../db/sqliteService.js';
import {
  MASTER_SECRET,
  sha256Hex,
  generateActivationKey
} from './licenseKeys.js';
import { CURRENT_KID, LICENSE_PUBLIC_KEYS } from './licensePublicKey.js';
import { verifyLicenseToken, decodeToken } from './licenseToken.js';
import {
  normalizeMacList,
  parseWindowsMachineGuid,
  buildMachineId,
  resolveMachineIdentity
} from './machineId.js';

export { MASTER_SECRET, sha256Hex, generateActivationKey };

const LICENSE_STORAGE_KEY = 'PHARMACY_LICENSE_DATA';
const MACHINE_ID_STORAGE_KEY = 'PHARMACY_MACHINE_ID';
const LAST_TIME_STORAGE_KEY = 'PHARMACY_SYS_CLOCK_TIMESTAMP';

/**
 * Computes hardware-bound Machine ID without storing a static default.
 * In Electron, network interfaces are read from Node 'os' and MachineGuid from Windows Registry.
 */
export function getMachineId() {
  let hardwareMid = '';
  let source = 'WEB';

  // Check Electron environment
  if (typeof window !== 'undefined' && window.require) {
    try {
      const os = window.require('os');
      const interfaces = os.networkInterfaces();
      const macs = normalizeMacList(interfaces);

      let guid = '';
      if (!macs.length) {
        try {
          const cp = window.require('child_process');
          const rawReg = cp.execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8' });
          guid = parseWindowsMachineGuid(rawReg);
        } catch (e) {}
      }

      hardwareMid = buildMachineId(macs, guid);
      source = macs.length ? 'MAC' : 'GUID';
    } catch (e) {
      console.warn('Hardware identification error in Electron:', e);
    }
  }

  // Web Browser Fallback
  if (!hardwareMid) {
    try {
      const stored = localStorage.getItem(MACHINE_ID_STORAGE_KEY);
      if (stored && stored.startsWith('EGYP-')) {
        return stored;
      }
      // Generate synthetic ID for browser development session
      const rand = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
      hardwareMid = `EGYP-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 12)}`;
      localStorage.setItem(MACHINE_ID_STORAGE_KEY, hardwareMid);
      return hardwareMid;
    } catch (e) {
      throw new Error('تعذر تحديد هوية العتاد للجهاز. لا توجد بيئة تخزين صالحة.');
    }
  }

  return hardwareMid;
}

/**
 * Checks if a stored legacy v1 key is valid for this machine.
 * LEGACY MIGRATION USE ONLY.
 */
export async function isLegacyKeyValid(key, machineId) {
  const cleanKey = String(key || '').trim().toUpperCase();
  if (!cleanKey) return false;

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
 * Check current license state from SQLite & LocalStorage.
 * Runs on every startup without bypass.
 */
export async function checkLicenseStatus() {
  const hardwareId = getMachineId();

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
      machineId: hardwareId,
      licenseKey: '',
      activatedAt: '',
      expiresAt: ''
    };
  }

  // 2. Fetch records from SQLite and localStorage
  let dbLicense = null;
  let revokedLids = new Set();
  try {
    dbLicense = await sqliteService.getLicenseInfo();
    const revs = await sqliteService.getRevocations();
    if (Array.isArray(revs)) {
      revs.forEach((r) => revokedLids.add(r.lid));
    }
  } catch (e) {
    console.warn('SQLite license fetch error, falling back to localStorage:', e);
  }

  let localLicense = null;
  try {
    const saved = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (saved) localLicense = JSON.parse(saved);
  } catch (e) {}

  const activeKey = String(dbLicense?.license_key || localLicense?.license_key || '').trim();
  const activatedAt = dbLicense?.activated_at || localLicense?.activated_at || '';
  const storedMachineId = dbLicense?.machine_id || localLicense?.machine_id || '';
  const activeStatus = dbLicense?.license_status || localLicense?.license_status || 'UNLICENSED';

  // 3. Status check: REVOKED
  if (activeStatus === 'REVOKED') {
    return {
      isLicensed: false,
      isTrial: false,
      isExpired: true,
      status: 'REVOKED',
      trialDaysRemaining: 0,
      machineId: hardwareId,
      licenseKey: '',
      activatedAt,
      expiresAt: ''
    };
  }

  // 4. Case: LIC2 Modern Token (Ed25519)
  if (activeKey.startsWith('LIC2.')) {
    try {
      const decoded = decodeToken(activeKey);

      // Check if this specific lid was revoked in DB
      if (decoded.payload.lid && revokedLids.has(decoded.payload.lid)) {
        await revokeLicense(hardwareId, 'REVOKED_BY_LIST');
        return {
          isLicensed: false,
          isExpired: true,
          status: 'REVOKED',
          machineId: hardwareId,
          licenseKey: activeKey,
          activatedAt
        };
      }

      const res = await verifyLicenseToken(activeKey, {
        machineId: hardwareId,
        publicKeys: LICENSE_PUBLIC_KEYS,
        now: nowMs,
        revokedLids
      });

      if (res.valid) {
        if (res.type === 'REVOKE') {
          await revokeLicense(hardwareId, 'SIGNED_REVOKE_TOKEN');
          return {
            isLicensed: false,
            isExpired: true,
            status: 'REVOKED',
            machineId: hardwareId,
            licenseKey: activeKey,
            activatedAt
          };
        }

        if (res.type === 'TIMED') {
          const expMs = new Date(res.expiresAt).getTime();
          const daysRemaining = Math.max(0, Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24)));
          if (daysRemaining <= 0) {
            return {
              isLicensed: false,
              isExpired: true,
              status: 'EXPIRED',
              machineId: hardwareId,
              licenseKey: activeKey,
              activatedAt,
              expiresAt: res.expiresAt,
              daysRemaining: 0
            };
          }

          return {
            isLicensed: true,
            isExpired: false,
            status: 'DURATION',
            machineId: hardwareId,
            licenseKey: activeKey,
            activatedAt: activatedAt ? activatedAt.slice(0, 10) : '',
            expiresAt: res.expiresAt.slice(0, 10),
            daysRemaining,
            lid: res.lid
          };
        }

        // LIFETIME
        return {
          isLicensed: true,
          isExpired: false,
          status: 'LIFETIME',
          machineId: hardwareId,
          licenseKey: activeKey,
          activatedAt: activatedAt ? activatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
          expiresAt: 'مدى الحياة (دائم)',
          daysRemaining: 'دائم (غير محدود)',
          lid: res.lid
        };
      }
    } catch (err) {
      console.warn('LIC2 verification failed:', err.message);
      return {
        isLicensed: false,
        isExpired: true,
        status: 'UNLICENSED',
        machineId: hardwareId,
        licenseKey: '',
        activatedAt: '',
        expiresAt: '',
        error: err.message
      };
    }
  }

  // 5. Case: Legacy grandfathered v1 license (Only tolerated if already stored and activated)
  if (activatedAt && (activeKey.startsWith('LIC-LIFE-') || activeKey.startsWith('LIC-EXP-') || activeKey.startsWith('LIC-ANNUAL-'))) {
    // Check if key is valid for hardwareId or storedMachineId
    const keyValidForHardware = await isLegacyKeyValid(activeKey, hardwareId);
    const keyValidForStored = storedMachineId ? await isLegacyKeyValid(activeKey, storedMachineId) : false;

    if (keyValidForHardware || keyValidForStored) {
      const resolved = resolveMachineIdentity({
        hardwareId,
        storedMachineId,
        storedStatus: activeStatus,
        keyValidForStoredId: keyValidForStored
      });

      if (activeKey.startsWith('LIC-LIFE-') || activeStatus === 'LIFETIME') {
        return {
          isLicensed: true,
          isExpired: false,
          status: 'LIFETIME',
          isLegacy: true,
          machineId: resolved.machineId,
          licenseKey: activeKey,
          activatedAt: activatedAt.slice(0, 10),
          expiresAt: 'مدى الحياة (توافق قديم)',
          daysRemaining: 'دائم'
        };
      }

      if (activeKey.startsWith('LIC-EXP-')) {
        const ymd = activeKey.substring(8, 16);
        if (ymd.length === 8) {
          const y = parseInt(ymd.substring(0, 4), 10);
          const m = parseInt(ymd.substring(4, 6), 10) - 1;
          const d = parseInt(ymd.substring(6, 8), 10);
          const expDate = new Date(y, m, d, 23, 59, 59);
          const diffMs = expDate.getTime() - nowMs;
          const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          if (daysRemaining > 0) {
            return {
              isLicensed: true,
              isExpired: false,
              status: 'DURATION',
              isLegacy: true,
              machineId: resolved.machineId,
              licenseKey: activeKey,
              activatedAt: activatedAt.slice(0, 10),
              expiresAt: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
              daysRemaining
            };
          }
        }
      }
    }
  }

  // 6. Unlicensed fresh install
  return {
    isLicensed: false,
    isTrial: false,
    isExpired: true,
    status: 'UNLICENSED',
    trialDaysRemaining: 0,
    machineId: hardwareId,
    licenseKey: '',
    activatedAt: '',
    expiresAt: ''
  };
}

/**
 * Validates and activates license key.
 * Only accepts LIC2 signed tokens for new activations.
 */
export async function activateLicenseKey(rawKey) {
  const cleanKey = String(rawKey || '').trim();
  const machineId = getMachineId();

  if (!cleanKey) {
    return { success: false, error: 'يرجى إدخال رمز الترخيص.' };
  }

  // Reject legacy v1 keys from being submitted as new activations
  if (
    cleanKey.startsWith('LIC-LIFE-') ||
    cleanKey.startsWith('LIC-EXP-') ||
    cleanKey.startsWith('LIC-ANNUAL-') ||
    cleanKey.startsWith('RST-') ||
    cleanKey.startsWith('REV-')
  ) {
    return {
      success: false,
      error: 'هذا مفتاح قديم غير مدعوم. يرجى طلب رمز ترخيص رسمي جديد (LIC2) من المطور.'
    };
  }

  // Modern LIC2 verification
  if (!cleanKey.startsWith('LIC2.')) {
    return {
      success: false,
      error: 'صيغة رمز الترخيص غير صحيحة. يجب أن يبدأ الرمز بـ LIC2.'
    };
  }

  let verified;
  try {
    let revokedLids = new Set();
    try {
      const revs = await sqliteService.getRevocations();
      if (Array.isArray(revs)) revs.forEach((r) => revokedLids.add(r.lid));
    } catch (e) {}

    verified = await verifyLicenseToken(cleanKey, {
      machineId,
      publicKeys: LICENSE_PUBLIC_KEYS,
      now: Date.now(),
      revokedLids
    });
  } catch (err) {
    return { success: false, error: err.message };
  }

  // Special Token Types
  if (verified.type === 'RESET_PIN') {
    try {
      const curSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
      localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify({ ...curSettings, adminPin: '1234' }));
    } catch (e) {}
    return {
      success: false,
      isResetPin: true,
      message: 'تم بنجاح التحقق من الرمز وإعادة تعيين رمز مدير الصيدلية (Admin PIN) إلى: 1234 🔑'
    };
  }

  if (verified.type === 'REVOKE') {
    await revokeLicense(machineId, 'SIGNED_REVOKE_TOKEN');
    return {
      success: false,
      isRevoked: true,
      status: 'REVOKED',
      error: 'تم إلغاء وسحب ترخيص هذا الجهاز بنجاح بناءً على رمز الإلغاء الأمني الموقع 🚫'
    };
  }

  // Activation of LIFETIME or TIMED
  const status = verified.type === 'LIFETIME' ? 'LIFETIME' : 'DURATION';
  const nowIso = new Date().toISOString();

  const licenseRecord = {
    machine_id: machineId,
    license_status: status,
    license_key: cleanKey,
    first_install_date: nowIso,
    trial_days: 0,
    activated_at: nowIso,
    lid: verified.lid
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
      ? 'مبروك! تم تفعيل ترخيص البرنامج بنجاح مدى الحياة (Ed25519 Verified) 🔑'
      : `مبروك! تم تفعيل الترخيص بنجاح حتى تاريخ (${verified.expiresAt?.slice(0, 10)}) 🔑`
  };
}

/**
 * Revoke and deactivate license for this machine
 */
export async function revokeLicense(machineId, reason = 'REVOKED_MANUAL') {
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
