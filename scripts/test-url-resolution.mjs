/**
 * Unit tests for the report-URL resolution logic.
 *
 *   npm run test:urls
 *
 * These cover the priority order that decides which address ends up in the
 * shift QR code and which address the sync engine talks to:
 *
 *   1. A configured cloud URL always wins.
 *   2. The free Cloudflare tunnel is used only when its checkbox is on.
 *   3. The sync outbox and the snapshot always prefer the fast local server
 *      (never the public tunnel) so the data never round-trips the internet.
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const m = await import('../src/utils/reportServer.js');

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${name} => ${actual}${ok ? '' : ` (expected ${expected})`}`);
}

function reset(settings, extra = {}) {
  store.clear();
  store.set('PHARMACY_SETTINGS', JSON.stringify(settings));
  for (const [k, v] of Object.entries(extra)) store.set(k, v);
}

const LAN = 'http://192.168.1.21:4100';
const TUNNEL = 'https://abc-def.trycloudflare.com';
const CLOUD = 'https://pharmacy-reports.onrender.com';
const PERMANENT = 'https://pharmacy-reports.pharmacypos-eg.workers.dev';

console.log('\n— configured cloud URL —');
reset({ reportBaseUrl: CLOUD, permanentReportUrl: PERMANENT });
check('report base', m.getReportBaseUrl(), CLOUD);
check('snapshot endpoint', m.getSnapshotEndpoint(), `${CLOUD}/api/pharmacy/snapshot`);
check('sync endpoint', m.getSyncEndpoint(), `${CLOUD}/api/pharmacy/sync`);

console.log('\n— cloudflare tunnel enabled —');
reset(
  { reportBaseUrl: '', permanentReportUrl: '', useCloudflareTunnel: true },
  { [m.TUNNEL_URL_KEY]: TUNNEL, [m.REPORT_AUTO_BASE_KEY]: LAN }
);
check('report base is the tunnel', m.getReportBaseUrl(), TUNNEL);
check('phone reachable', m.isPhoneReachable(m.getReportBaseUrl()), true);
check('sync stays local', m.getSyncEndpoint(), `${LAN}/api/pharmacy/sync`);
check('snapshot stays local', m.getSnapshotEndpoint(), `${LAN}/api/pharmacy/snapshot`);

console.log('\n— cloudflare tunnel disabled —');
reset(
  { reportBaseUrl: '', permanentReportUrl: '', useCloudflareTunnel: false },
  { [m.TUNNEL_URL_KEY]: TUNNEL, [m.REPORT_AUTO_BASE_KEY]: LAN }
);
check('tunnel ignored', m.getReportBaseUrl() === TUNNEL, false);
check('LAN base used', m.getReportBaseUrl(), LAN);

console.log('\n— permanent cloud host wins over the temporary tunnel —');
reset(
  { reportBaseUrl: '', permanentReportUrl: PERMANENT, useCloudflareTunnel: true },
  { [m.TUNNEL_URL_KEY]: TUNNEL, [m.REPORT_AUTO_BASE_KEY]: LAN }
);
check('report base is permanent', m.getReportBaseUrl(), PERMANENT);
check('snapshot goes to the permanent host', m.getSnapshotEndpoint(), `${PERMANENT}/api/pharmacy/snapshot`);
check('sync still stays local', m.getSyncEndpoint(), `${LAN}/api/pharmacy/sync`);
check('shift report uses permanent host', m.buildShiftReportUrl('SH-1', 'PH-1'),
  `${PERMANENT}/r/SH-1?pharmacyId=PH-1`);

console.log('\n— derived from the sync endpoint —');
reset({ reportBaseUrl: '', permanentReportUrl: '', syncEndpoint: `${CLOUD}/api/pharmacy/sync` });
check('base derived', m.getReportBaseUrl(), CLOUD);
check('sync endpoint kept', m.getSyncEndpoint(), `${CLOUD}/api/pharmacy/sync`);

console.log('\n— URL builders —');
reset({ reportBaseUrl: CLOUD, reportToken: 'SEC123' });
check('shift report', m.buildShiftReportUrl('SH 1', 'PH-1'), `${CLOUD}/r/SH%201?pharmacyId=PH-1&token=SEC123`);
check('daily summary', m.buildDailySummaryUrl('PH-1', '2026-11-04'), `${CLOUD}/d/2026-11-04?pharmacyId=PH-1&token=SEC123`);
check('monthly summary', m.buildMonthlySummaryUrl('PH-1', '2026-11'), `${CLOUD}/m/2026-11?pharmacyId=PH-1&token=SEC123`);
check('portal', m.buildLiveReportsUrl('PH-1'), `${CLOUD}/?pharmacyId=PH-1&token=SEC123`);

console.log('\n— normalisation —');
reset({ reportBaseUrl: 'my-server.com' });
check('bare domain', m.getReportBaseUrl(), 'https://my-server.com');

console.log('\n— settings saved by an older build —');
reset({ reportBaseUrl: '' }); // no cloud keys at all
const merged = m.readSettings();
check('default pharmacy id', merged.cloudPharmacyId, 'PH-EGYP-9102');
check('tunnel switch defaults to on', merged.useCloudflareTunnel, true);
check('auto start tunnel defaults to on', merged.autoStartTunnel, true);
check('permanent host configured', merged.permanentReportUrl, PERMANENT);
check('permanent host used by default', m.getReportBaseUrl(), PERMANENT);

console.log('\n— the QR address is always permanent —');
const realFetch = globalThis.fetch;
reset(
  { reportBaseUrl: '', permanentReportUrl: PERMANENT },
  { [m.REPORT_AUTO_BASE_KEY]: LAN }
);
globalThis.fetch = async () => { throw new Error('offline'); };
const offlineBase = await m.resolveQrBaseUrl();
check('offline → still the permanent host', offlineBase, PERMANENT);

globalThis.fetch = async () => ({ ok: true, status: 200 });
const onlineBase = await m.resolveQrBaseUrl();
check('online → permanent cloud host', onlineBase, PERMANENT);
globalThis.fetch = realFetch;

console.log('\n— the LAN address is offered as a second, on-site QR —');
reset(
  { reportBaseUrl: '', permanentReportUrl: PERMANENT },
  { [m.REPORT_AUTO_BASE_KEY]: LAN }
);
const localUrl = await m.resolveLocalReportUrl('SH-1', 'PH-1');
check('local QR uses the LAN address', localUrl.startsWith(`${LAN}/r/SH-1?pharmacyId=PH-1`), true);

console.log('\n— a LAN address configured by hand never becomes the cloud target —');
reset({ reportBaseUrl: LAN, permanentReportUrl: PERMANENT });
check('permanent base ignores the LAN address', m.getPermanentReportBaseUrl(), PERMANENT);
check('private host detected', m.isPrivateHost(LAN), true);
check('public host detected', m.isPrivateHost(PERMANENT), false);
check('cloud snapshot endpoint', m.getCloudSnapshotEndpoint(), `${PERMANENT}/api/pharmacy/snapshot`);

console.log('\n— the daily link the owner keeps is permanent —');
reset({ reportBaseUrl: LAN, permanentReportUrl: PERMANENT, reportToken: 'TOK' });
check('daily summary is permanent', m.buildDailySummaryUrl('PH-1', '2026-11-04'),
  `${PERMANENT}/d/2026-11-04?pharmacyId=PH-1&token=TOK`);
check('portal is permanent', m.buildLiveReportsUrl('PH-1'),
  `${PERMANENT}/?pharmacyId=PH-1&token=TOK`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
