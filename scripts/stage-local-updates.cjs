/**
 * Stages the update package inside the LOCAL report server, so the program
 * can update itself over the pharmacy Wi-Fi — with no internet and without
 * any hosting account (the installer is 135 MB, too big for the free tiers).
 *
 *   node scripts/stage-local-updates.cjs
 *   node scripts/stage-local-updates.cjs --target "D:\PharmacyUpdates"
 *
 * It copies `server/updates/*` into:
 *   %APPDATA%\PharmacyPOS\report-data\updates       (the installed program)
 *   %APPDATA%\pharmacy-pos-ui\report-data\updates   (the development build)
 *
 * The local report server already exposes that folder at `/updates/`, and the
 * program automatically falls back to `http://<lan-ip>:4100/updates/` when no
 * cloud feed URL is configured.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'server', 'updates');

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const explicitTarget = targetIndex >= 0 ? String(args[targetIndex + 1] || '').trim() : '';

if (!fs.existsSync(source)) {
  console.error('❌ مفيش حزمة تحديث في server/updates — شغّل npm run dist الأول.');
  process.exit(1);
}

const files = fs.readdirSync(source).filter((name) => {
  try { return fs.statSync(path.join(source, name)).isFile(); } catch (e) { return false; }
});

if (!files.length) {
  console.error('❌ مجلد server/updates فاضي — شغّل npm run dist الأول.');
  process.exit(1);
}

const targets = [];
if (explicitTarget) {
  targets.push(path.resolve(explicitTarget));
} else {
  const appData = process.env.APPDATA || '';
  if (appData) {
    targets.push(path.join(appData, 'PharmacyPOS', 'report-data', 'updates'));
    targets.push(path.join(appData, 'pharmacy-pos-ui', 'report-data', 'updates'));
  }
}

if (!targets.length) {
  console.error('❌ مفيش APPDATA — استخدم --target <المجلد>.');
  process.exit(1);
}

for (const target of targets) {
  try {
    fs.mkdirSync(target, { recursive: true });
    for (const name of files) {
      fs.copyFileSync(path.join(source, name), path.join(target, name));
    }
    // Remove installers of older versions — they are never used by the feed
    // and each one costs ~135 MB of disk on the pharmacy computer.
    const keep = new Set(files);
    for (const name of fs.readdirSync(target)) {
      if (!/^PharmacyPOS-Setup-v.*\.(exe|exe\.blockmap)$/i.test(name)) continue;
      if (keep.has(name)) continue;
      try {
        fs.unlinkSync(path.join(target, name));
        console.log(`🧹 حُذف الإصدار القديم: ${name}`);
      } catch (e) {}
    }
    console.log(`✅ ${target}`);
  } catch (err) {
    console.error(`⚠️  تعذّر النسخ إلى ${target}: ${err.message}`);
  }
}

// Read the version straight from the feed so the operator sees what is staged.
let version = '';
try {
  const yml = fs.readFileSync(path.join(source, 'latest.yml'), 'utf8');
  version = (yml.match(/version:\s*([^\s]+)/) || [])[1] || '';
} catch (e) {}

// The LAN address of this machine (the phones of the pharmacy use it).
function lanIp() {
  try {
    const nets = os.networkInterfaces();
    const list = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) list.push(net.address);
      }
    }
    return list.find((ip) => /^192\.168\./.test(ip))
      || list.find((ip) => /^10\./.test(ip))
      || list.find((ip) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip))
      || list[0] || '127.0.0.1';
  } catch (e) {
    return '127.0.0.1';
  }
}

console.log('');
console.log(`📦 الإصدار جاهز للتحديث: ${version || '—'}`);
console.log(`   رابط التغذية على الشبكة المحلية: http://${lanIp()}:4100/updates/`);
console.log('   من داخل البرنامج: الإعدادات ← تحديثات البرنامج ← «تحقق من التحديثات»');
console.log('   (لو البرنامج مش شغّال، افتحه أولاً عشان السيرفر المحلي يركب).');
console.log('');
