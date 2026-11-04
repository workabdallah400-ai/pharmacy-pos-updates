/**
 * Builds the update feed used by the in-app auto-updater.
 *
 * It takes the freshly built installer from `dist-installer` and produces:
 *   server/updates/latest.yml        (electron-updater generic provider format)
 *   server/updates/latest.json       (simple JSON for manual/browser checks)
 *   server/updates/<installer>.exe   (the package itself)
 *
 * Upload the content of `server/updates` to the `updates` folder of the report
 * server (or any static host) and point the app to it from
 * Settings → Cloud Sync → Update feed URL.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';
const artifactName = (pkg.build && pkg.build.nsis && pkg.build.nsis.artifactName) || 'PharmacyPOS-Setup-v${version}.exe';
const installerName = artifactName.replace(/\$\{version\}/g, version);
const installerPath = path.join(root, 'dist-installer', installerName);
const outDir = path.join(root, 'server', 'updates');

if (!fs.existsSync(installerPath)) {
  console.error(`❌ Installer not found: ${installerPath}`);
  console.error('   Run "npm run dist" first.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const buffer = fs.readFileSync(installerPath);
const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');
const releaseDate = new Date().toISOString();
const publishedName = `PharmacyPOS-Setup-v${version}.exe`;

const publishedPath = path.join(outDir, publishedName);
if (fs.existsSync(publishedPath)) fs.unlinkSync(publishedPath);
fs.copyFileSync(installerPath, publishedPath);

// Keep only the current package in the feed folder (each one is ~135 MB).
for (const name of fs.readdirSync(outDir)) {
  if (name.startsWith('PharmacyPOS-Setup-v') && name !== publishedName && !name.startsWith(publishedName)) {
    try { fs.unlinkSync(path.join(outDir, name)); } catch (e) {}
  }
}

// The blockmap enables differential downloads (much faster updates).
const blockmapSource = `${installerPath}.blockmap`;
if (fs.existsSync(blockmapSource)) {
  const blockmapTarget = path.join(outDir, `${publishedName}.blockmap`);
  if (fs.existsSync(blockmapTarget)) fs.unlinkSync(blockmapTarget);
  fs.copyFileSync(blockmapSource, blockmapTarget);
}

const yml = [
  `version: ${version}`,
  `files:`,
  `  - url: ${publishedName}`,
  `    sha512: ${sha512}`,
  `    size: ${buffer.length}`,
  `path: ${publishedName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  ''
].join('\n');
fs.writeFileSync(path.join(outDir, 'latest.yml'), yml, 'utf8');

const json = {
  version,
  url: publishedName,
  sha512,
  size: buffer.length,
  releaseDate,
  notes: `الإصدار ${version}`
};
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(json, null, 2), 'utf8');

console.log('✅ Update feed ready:');
console.log(`   folder : ${outDir}`);
console.log(`   version: ${version}`);
console.log(`   file   : ${publishedName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
console.log('   ارفع محتوى المجلد إلى مجلد updates في السيرفر أو أي استضافة ثابتة.');
