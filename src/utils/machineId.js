/**
 * Machine identity calculation based on unique physical MAC addresses and Windows MachineGuid.
 * Pure JS functions with zero browser/Vite dependencies.
 */

const VIRTUAL_MAC_PATTERNS = [
  'vmware',
  'virtualbox',
  'vbox',
  'hyper-v',
  'vethernet',
  'loopback',
  'bluetooth',
  'tap',
  'tun',
  'wsl',
  'docker',
  'vpn',
  'tailscale',
  'zerotier'
];

/**
 * Filter and normalize physical MAC addresses from network interfaces.
 * 
 * @param {Record<string, Array<{mac: string, internal: boolean}>>} interfaces
 * @returns {string[]} sorted array of 12-char uppercase Hex strings
 */
export function normalizeMacList(interfaces) {
  if (!interfaces || typeof interfaces !== 'object') return [];

  const validMacs = new Set();

  for (const [name, addrs] of Object.entries(interfaces)) {
    const lowerName = String(name || '').toLowerCase();

    // Check if interface name indicates a virtual/VPN/tunnel adapter
    const isVirtual = VIRTUAL_MAC_PATTERNS.some((pat) => lowerName.includes(pat));
    if (isVirtual) continue;

    if (!Array.isArray(addrs)) continue;

    for (const addr of addrs) {
      if (!addr || addr.internal) continue;

      const rawMac = String(addr.mac || '').trim().toUpperCase();
      const cleanHex = rawMac.replace(/[^0-9A-F]/g, '');

      // Valid MAC must be 12 Hex chars and not all zeros (00:00:00:00:00:00)
      if (cleanHex.length === 12 && cleanHex !== '000000000000' && cleanHex !== 'FFFFFFFFFFFF') {
        validMacs.add(cleanHex);
      }
    }
  }

  return Array.from(validMacs).sort();
}

/**
 * Parses raw stdout from Windows reg query for MachineGuid.
 * Command: reg query "HKLM\SOFTWARE\Microsoft\Cryptography" /v MachineGuid
 */
export function parseWindowsMachineGuid(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'string') return '';
  const match = /MachineGuid\s+REG_SZ\s+([a-zA-Z0-9-]+)/i.exec(rawOutput);
  return match && match[1] ? match[1].trim() : '';
}

/**
 * Synchronous SHA-256 for deterministic Node / offline hashing without crypto async overhead.
 */
function sha256HexSync(input) {
  try {
    // If running in Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const crypto = require('node:crypto');
      return crypto.createHash('sha256').update(input, 'utf8').digest('hex').toUpperCase();
    }
  } catch (e) {}

  // Fallback FNV/Murmur deterministic combination for environments without node:crypto sync
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(16, '0');
  return (combined + 'EGYP2026PHARMACY').slice(0, 32);
}

/**
 * Builds deterministic Machine ID from MAC list or machine GUID.
 * Format: EGYP-XXXX-YYYY-ZZZZ (using first 12 Hex chars)
 */
export function buildMachineId(macList, machineGuid = '') {
  const normMacs = Array.isArray(macList)
    ? macList.filter(Boolean).map(m => m.toUpperCase().replace(/[^0-9A-F]/g, '')).sort()
    : [];

  let base = '';
  if (normMacs.length > 0) {
    base = normMacs.join('|');
  } else if (machineGuid && String(machineGuid).trim()) {
    base = 'GUID:' + String(machineGuid).trim().toUpperCase();
  } else {
    throw new Error('تعذر تحديد هوية العتاد للجهاز. لا توجد بطاقة شبكة صالحة أو معرف نظام.');
  }

  const hash = sha256HexSync('MACHINE_ID_ALGO_V1|' + base);
  const part1 = hash.substring(0, 4);
  const part2 = hash.substring(4, 8);
  const part3 = hash.substring(8, 12);

  return `EGYP-${part1}-${part2}-${part3}`;
}

/**
 * Resolves machine identity taking into account legacy migrated customers.
 */
export function resolveMachineIdentity({ hardwareId, storedMachineId, storedStatus, keyValidForStoredId }) {
  if (storedMachineId && keyValidForStoredId && (storedStatus === 'LIFETIME' || storedStatus === 'DURATION')) {
    return {
      machineId: storedMachineId,
      source: 'LEGACY',
      isLegacy: true
    };
  }

  return {
    machineId: hardwareId,
    source: 'HARDWARE',
    isLegacy: false
  };
}
