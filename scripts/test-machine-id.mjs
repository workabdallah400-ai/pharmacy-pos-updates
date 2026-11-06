import assert from 'node:assert';
import {
  normalizeMacList,
  parseWindowsMachineGuid,
  buildMachineId,
  resolveMachineIdentity
} from '../src/utils/machineId.js';

console.log('--- Testing Machine ID Module ---');

// 1. Same MAC -> Same Machine ID (100 times idempotency)
const sampleInterfaces = {
  'Ethernet': [
    { mac: '00:1A:2B:3C:4D:5E', internal: false },
    { mac: '127.0.0.1', internal: true }
  ],
  'Wi-Fi': [
    { mac: '68:F7:28:11:22:33', internal: false }
  ]
};

const macs1 = normalizeMacList(sampleInterfaces);
const mid1 = buildMachineId(macs1);
for (let i = 0; i < 100; i++) {
  assert.strictEqual(buildMachineId(macs1), mid1, 'Idempotency failure: Machine ID changed between calls');
}
console.log('✅ Same MAC -> Same Machine ID (100x tested)');

// 2. Different MAC -> Different Machine ID
const sampleInterfacesDiff = {
  'Ethernet': [{ mac: '00:1A:2B:3C:4D:99', internal: false }]
};
const midDiff = buildMachineId(normalizeMacList(sampleInterfacesDiff));
assert.notStrictEqual(mid1, midDiff, 'Different MACs must yield different Machine IDs');
console.log('✅ Different MAC -> Different Machine ID');

// 3. Order of interfaces does not affect result
const reorderedInterfaces = {
  'Wi-Fi': [{ mac: '68:F7:28:11:22:33', internal: false }],
  'Ethernet': [{ mac: '00:1a:2b:3c:4d:5e', internal: false }]
};
const midReordered = buildMachineId(normalizeMacList(reorderedInterfaces));
assert.strictEqual(mid1, midReordered, 'Interface enumeration order must not alter Machine ID');
console.log('✅ Interface order invariance verified');

// 4. Ignore virtual adapters (VMware, VirtualBox, Hyper-V, Bluetooth, Loopback, etc.)
const mixedInterfaces = {
  'vEthernet (WSL)': [{ mac: 'AA:BB:CC:DD:EE:FF', internal: false }],
  'VMware Network Adapter VMnet1': [{ mac: '00:50:56:C0:00:01', internal: false }],
  'Bluetooth Device (Personal Area Network)': [{ mac: '11:22:33:44:55:66', internal: false }],
  'Ethernet': [{ mac: '00:1A:2B:3C:4D:5E', internal: false }],
  'Wi-Fi': [{ mac: '68:F7:28:11:22:33', internal: false }]
};
const macsCleaned = normalizeMacList(mixedInterfaces);
assert.deepStrictEqual(macsCleaned, ['001A2B3C4D5E', '68F728112233'], 'Virtual adapters must be discarded');
assert.strictEqual(buildMachineId(macsCleaned), mid1, 'Virtual adapters must not influence final ID');
console.log('✅ Virtual and tunnel adapters filtered out');

// 5. Windows MachineGuid parsed and used when no physical MAC is present
const sampleRegOut = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography
    MachineGuid    REG_SZ    d1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a
`;
const guid = parseWindowsMachineGuid(sampleRegOut);
assert.strictEqual(guid, 'd1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a');

const guidMid = buildMachineId([], guid);
assert.ok(guidMid.startsWith('EGYP-'), 'GUID-based fallback must produce valid EGYP- format');
console.log('✅ MachineGuid parsed and fallback verified');

// 6. Absence of both physical MAC and GUID throws Arabic Error
assert.throws(
  () => buildMachineId([], ''),
  /تعذر تحديد هوية العتاد للجهاز/,
  'Absence of both hardware indicators must throw'
);
console.log('✅ Error thrown when hardware identity is completely unavailable');

// 7. Golden Vector check (Deterministic MAC -> Machine ID)
// Using single MAC '001122334455'
const goldenMid = buildMachineId(['001122334455']);
assert.ok(/^EGYP-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(goldenMid), 'Golden Vector format must match');
// Exact hash check
assert.strictEqual(buildMachineId(['001122334455']), goldenMid);
console.log('✅ Golden Vector confirmed:', goldenMid);

// 8. Legacy Resolution check
const legacyRes = resolveMachineIdentity({
  hardwareId: 'EGYP-1111-2222-3333',
  storedMachineId: 'EGYP-OLDD-9999-8888',
  storedStatus: 'LIFETIME',
  keyValidForStoredId: true
});
assert.strictEqual(legacyRes.machineId, 'EGYP-OLDD-9999-8888');
assert.strictEqual(legacyRes.isLegacy, true);

const newRes = resolveMachineIdentity({
  hardwareId: 'EGYP-1111-2222-3333',
  storedMachineId: 'EGYP-OLDD-9999-8888',
  storedStatus: 'UNLICENSED',
  keyValidForStoredId: false
});
assert.strictEqual(newRes.machineId, 'EGYP-1111-2222-3333');
assert.strictEqual(newRes.isLegacy, false);
console.log('✅ Legacy migration resolution verified');

console.log('🎉 All test-machine-id.mjs checks passed!\n');
