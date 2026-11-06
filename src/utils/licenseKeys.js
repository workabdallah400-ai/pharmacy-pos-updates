/**
 * License key primitives — kept free of heavy imports so they can run in
 * plain Node (scripts/generate-license-key.mjs) as well as in the app.
 */

// LEGACY VERIFICATION ONLY — Do not use for any new licenses
export const MASTER_SECRET = 'PHARMACY_POS_MASTER_SECRET_2026';

/**
 * Deterministic SHA-256 Hex Generator using standard Web Crypto API
 */
export async function sha256Hex(str) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
  } catch (e) {}

  // Fallback simple hash
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase();
  return (combined + 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6').slice(0, 64);
}

function cleanMachineId(machineId) {
  return String(machineId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Generate legacy Activation Key matching Machine ID & Duration (LEGACY ONLY)
 */
export async function generateActivationKey(machineId, daysOrDate = 'LIFETIME') {
  const cleanMid = cleanMachineId(machineId);

  if (daysOrDate === 'LIFETIME') {
    const lifeHash = await sha256Hex(cleanMid + '-LIFETIME-' + MASTER_SECRET);
    return 'LIC-LIFE-' + lifeHash.substring(0, 4) + '-' + lifeHash.substring(4, 8) + '-' + (cleanMid.slice(-4) || 'EGYP');
  }

  let targetDate;
  if (typeof daysOrDate === 'number' || !isNaN(Number(daysOrDate))) {
    targetDate = new Date(Date.now() + Number(daysOrDate) * 24 * 60 * 60 * 1000);
  } else {
    targetDate = new Date(daysOrDate);
  }

  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const ymd = '' + y + m + d;

  const expHash = await sha256Hex(cleanMid + '-EXP-' + ymd + '-' + MASTER_SECRET);
  return 'LIC-EXP-' + ymd + '-' + expHash.substring(0, 4) + '-' + expHash.substring(4, 8);
}
