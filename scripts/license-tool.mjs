/**
 * Offline licence issuer for PharmacyPOS (Ed25519 signed tokens).
 *
 *   node scripts/license-tool.mjs issue  EGYP-XXXX-XXXX-XXXX
 *   node scripts/license-tool.mjs issue  EGYP-XXXX-XXXX-XXXX --type=TIMED --days=365
 *   node scripts/license-tool.mjs issue  EGYP-XXXX-XXXX-XXXX --type=TIMED --until=2027-12-31
 *   node scripts/license-tool.mjs revoke EGYP-XXXX-XXXX-XXXX --reason="عدم سداد"
 *   node scripts/license-tool.mjs inspect LIC2.xxxxx.yyyyy
 *
 * The private key is read from (in order):
 *   1. PHARMACY_LICENSE_PRIVATE_KEY_JWK  (JSON string, for CI)
 *   2. private/license-private-key.jwk.json
 *   3. private/license-private-key.enc.json  (asks for the passphrase)
 *
 * Tokens are verified by the app with the PUBLIC key only, so a pharmacy PC can
 * never mint its own licence. Keep private/ out of Git and out of installers.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import {
  loadPrivateKey,
  issueLicense,
  revokeLicense,
  inspectToken,
  normalizeMachineId,
  RAW_KEY_PATH,
  ENC_KEY_PATH
} from './license-core.mjs';

const args = process.argv.slice(2);
const command = (args[0] || 'help').toLowerCase();
const flags = {};
const positional = [];
for (const arg of args.slice(1)) {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq > 0) flags[arg.slice(2, eq).toLowerCase()] = arg.slice(eq + 1);
    else flags[arg.slice(2).toLowerCase()] = true;
  } else {
    positional.push(arg);
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function printToken({ mid, typ, lid, exp, token, note }) {
  const expText = exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'مدى الحياة (غير محدد)';
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────');
  console.log(`  │ كود الجهاز : ${mid}`);
  console.log(`  │ النوع      : ${typ}`);
  console.log(`  │ رقم الترخيص: ${lid}`);
  console.log(`  │ ينتهي في   : ${expText}`);
  console.log('  ├──────────────────────────────────────────────────────────────');
  console.log('  │ المفتاح (انسخه كاملاً كما هو، حساس لحالة الأحرف):');
  console.log('  │');
  console.log(`  │ ${token}`);
  console.log('  │');
  console.log('  └──────────────────────────────────────────────────────────────');
  if (note) console.log(`  ℹ️  ${note}`);
  console.log('');
}

async function cmdIssue() {
  const mid = normalizeMachineId(positional[0]);
  if (!mid) {
    console.error('❌ اكتب كود الجهاز، مثال:');
    console.error('   npm run license:issue -- EGYP-9B4C-D478-B27C');
    process.exit(1);
  }

  const privateKey = await loadPrivateKey({ passphrase: await maybePassphrase() });
  let result;
  try {
    result = issueLicense(privateKey, {
      mid,
      type: flags.type || 'LIFETIME',
      days: flags.days,
      until: flags.until,
      kid: flags.kid,
      lid: flags.lid
    });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  printToken({
    mid: result.payload.mid,
    typ: result.payload.typ,
    lid: result.payload.lid,
    exp: result.payload.exp,
    token: result.token,
    note: result.payload.typ === 'TIMED'
      ? 'أدخل هذا الرمز في شاشة التفعيل قبل تاريخ الانتهاء.'
      : 'تفعيل دائم لهذا الجهاز.'
  });

  if (flags.out) {
    fs.writeFileSync(String(flags.out), result.token, 'utf8');
    console.log(`  ✅ تم حفظ المفتاح في: ${flags.out}`);
    console.log('');
  }
}

async function cmdRevoke() {
  const mid = normalizeMachineId(positional[0]);
  if (!mid) {
    console.error('❌ اكتب كود الجهاز الصحيح لإصدار رمز إلغاء، مثال:');
    console.error('   npm run license:revoke -- EGYP-9B4C-D478-B27C --reason="عدم سداد"');
    process.exit(1);
  }

  const privateKey = await loadPrivateKey({ passphrase: await maybePassphrase() });
  let result;
  try {
    result = revokeLicense(privateKey, { mid, reason: flags.reason || '' });
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  printToken({
    mid: result.payload.mid,
    typ: 'REVOKE',
    lid: result.payload.lid,
    exp: null,
    token: result.token,
    note: 'أدخل هذا الرمز في شاشة التفعيل على جهاز العميل لإيقاف الترخيص فوراً. ' +
      'ولإيقافه حتى بدون إدخال الرمز: شغّل npm run license:revocations ثم ابنِ إصداراً جديداً.'
  });

  if (flags.out) {
    fs.writeFileSync(String(flags.out), result.token, 'utf8');
    console.log(`  ✅ تم حفظ المفتاح في: ${flags.out}`);
    console.log('');
  }
}

async function cmdInspect() {
  const token = positional[0];
  if (!token) {
    console.error('❌ اكتب الرمز بعد الأمر، مثال: npm run license:inspect -- LIC2.xxx.yyy');
    process.exit(1);
  }
  const info = await inspectToken(token, { machineId: flags.mid });
  console.log('');
  console.log('🔎 بيانات الرمز:');
  console.log(JSON.stringify(info.payload, null, 2));
  console.log('');
  if (!info.signatureValid) {
    console.log(`❌ التوقيع غير صحيح أو الرمز غير مقبول: ${info.error}`);
    process.exitCode = 2;
    return;
  }
  console.log('✅ التوقيع صحيح ومطابق للمفتاح العام.');
  const exp = Number(info.payload.exp || 0);
  console.log(`   ينتهي: ${exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'مدى الحياة'}`);
  console.log('');
}

function cmdHelp() {
  console.log('');
  console.log('أداة تراخيص صيدليتي — مفاتيح موقّعة رقمياً (Ed25519)');
  console.log('');
  console.log('  npm run license:keygen                      توليد زوج مفاتيح جديد (مرة واحدة فقط)');
  console.log('  npm run license:issue -- <كود الجهاز>        إصدار ترخيص مدى الحياة');
  console.log('  npm run license:issue -- <كود الجهاز> --type=TIMED --days=365');
  console.log('  npm run license:issue -- <كود الجهاز> --type=TIMED --until=2027-12-31');
  console.log('  npm run license:revoke -- <كود الجهاز> --reason="عدم سداد"');
  console.log('  npm run license:revocations                 تحديث قائمة الإلغاء المدمجة في البرنامج');
  console.log('  npm run license:admin                       لوحة إدارة محلية (واجهة رسومية)');
  console.log('  npm run license:inspect -- <الرمز>');
  console.log('');
  console.log('  إضافات: --out=license.txt  --kid=2026-11  --lid=معرف-مخصص');
  console.log('');
  console.log('  كود الجهاز يظهر على شاشة التفعيل بصيغة EGYP-XXXX-YYYY-ZZZZ.');
  console.log('  الرمز الناتج يبدأ بـ LIC2. وهو حساس لحالة الأحرف — انسخه كاملاً.');
  console.log('');
}

async function maybePassphrase() {
  if (process.env.PHARMACY_LICENSE_KEY_PASSPHRASE) return process.env.PHARMACY_LICENSE_KEY_PASSPHRASE;
  if (process.env.PHARMACY_LICENSE_PRIVATE_KEY_JWK) return '';
  if (fs.existsSync(RAW_KEY_PATH)) return '';
  if (fs.existsSync(ENC_KEY_PATH)) return ask('كلمة مرور المفتاح الخاص: ');
  return '';
}

async function main() {
  switch (command) {
    case 'issue': return cmdIssue();
    case 'revoke': return cmdRevoke();
    case 'inspect': return cmdInspect();
    case 'help':
    case '--help':
    case '-h': return cmdHelp();
    default:
      console.error(`❌ أمر غير معروف: ${command}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
