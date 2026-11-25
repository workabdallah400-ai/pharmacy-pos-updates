/**
 * Extract data from the catalog backup (.bak, SQLite) into usable files.
 *
 * Outputs (in D:\New folder\exports):
 *   pharmacy_pos.backup-2026-11-09.db      - openable copy of the backup
 *   backup-catalog-29721.xlsx              - all medicines from the backup
 *   backup-catalog-29721.csv               - same data, UTF-8 BOM CSV
 *   backup-only-items.xlsx / .csv          - rows present in the backup but not in the live DB
 *   backup-summary.txt                     - counts and quality notes
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('D:/New folder/node_modules/sql.js/dist/sql-wasm.js');
const XLSX = require('D:/New folder/node_modules/xlsx');

const ROOT = 'D:/New folder';
const BAK = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'pharmacy_pos.db.before-catalog-v1423-2026-11-09T16-28-22-232Z.bak');
const LIVE = path.join(ROOT, 'pharmacy_pos.db');
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'exports');

const HEADERS = [
  ['id', 'id'],
  ['trade_name', 'الاسم التجاري'],
  ['trade_name_ar', 'الاسم العربي'],
  ['generic_name', 'المادة الفعالة'],
  ['barcode', 'الباركود'],
  ['price_box', 'سعر العلبة'],
  ['price_strip', 'سعر الشريط'],
  ['strips_per_box', 'شرائط/علبة'],
  ['stock_boxes', 'مخزون علب'],
  ['stock_strips', 'مخزون شرائط'],
  ['shelf', 'الرف'],
  ['category', 'التصنيف'],
  ['reorder_level', 'حد الطلب'],
  ['preferred_supplier', 'المورد المفضل'],
  ['unit_type', 'نوع الوحدة'],
  ['units_per_strip', 'وحدات/شريط'],
  ['price_unit', 'سعر الوحدة'],
  ['stock_units', 'مخزون وحدات'],
  ['expiry', 'الصلاحية']
];

function toRows(db, sql) {
  const res = db.exec(sql);
  if (!res[0]) return { columns: [], rows: [] };
  return { columns: res[0].columns, rows: res[0].values };
}

function readMedicines(db) {
  const { columns, rows } = toRows(db, 'SELECT * FROM medicines ORDER BY id');
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return rows.map((r) => {
    const obj = {};
    for (const [key] of HEADERS) obj[key] = r[idx[key]];
    return obj;
  });
}

function humanRows(list) {
  return list.map((m) => {
    const o = {};
    for (const [key, label] of HEADERS) o[label] = m[key] == null ? '' : m[key];
    return o;
  });
}

function normName(s) {
  return String(s || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function normBarcode(v) {
  const s = String(v == null ? '' : v).trim();
  return s && s !== '0' ? s : '';
}

function writeSheet(file, sheetName, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] || {});
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(46, Math.max(12, k.length + 2)) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, file);
}

function writeCsv(file, rows) {
  const keys = Object.keys(rows[0] || {});
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [keys.map(esc).join(',')];
  for (const r of rows) lines.push(keys.map((k) => esc(r[k])).join(','));
  fs.writeFileSync(file, '\uFEFF' + lines.join('\r\n'), 'utf8');
}

(async () => {
  const SQL = await initSqlJs({ locateFile: (f) => path.join(ROOT, 'node_modules/sql.js/dist', f) });
  fs.mkdirSync(OUT, { recursive: true });

  const bakDb = new SQL.Database(fs.readFileSync(BAK));
  const backup = readMedicines(bakDb);

  // 1) openable copy of the backup database
  const dbCopy = path.join(OUT, 'pharmacy_pos.backup-2026-11-09.db');
  fs.copyFileSync(BAK, dbCopy);

  // 2) full catalog
  const human = humanRows(backup);
  writeSheet(path.join(OUT, 'backup-catalog-29721.xlsx'), 'الكتالوج', human);
  writeCsv(path.join(OUT, 'backup-catalog-29721.csv'), human);

  // 3) diff against the live database
  let live = [];
  let liveExists = fs.existsSync(LIVE);
  if (liveExists) {
    try {
      const liveDb = new SQL.Database(fs.readFileSync(LIVE));
      live = readMedicines(liveDb);
      liveDb.close();
    } catch (e) {
      console.log('could not read live DB:', e.message);
    }
  }

  const liveBarcodes = new Set(live.map((m) => normBarcode(m.barcode)).filter(Boolean));
  const liveNames = new Set(live.map((m) => normName(m.trade_name_ar || m.trade_name)).filter(Boolean));

  const onlyInBackup = backup.filter((m) => {
    const bc = normBarcode(m.barcode);
    if (bc && liveBarcodes.has(bc)) return false;
    return !liveNames.has(normName(m.trade_name_ar || m.trade_name));
  });

  const backupBarcodes = new Set(backup.map((m) => normBarcode(m.barcode)).filter(Boolean));
  const backupNames = new Set(backup.map((m) => normName(m.trade_name_ar || m.trade_name)).filter(Boolean));
  const onlyInLive = live.filter((m) => {
    const bc = normBarcode(m.barcode);
    if (bc && backupBarcodes.has(bc)) return false;
    return !backupNames.has(normName(m.trade_name_ar || m.trade_name));
  });

  if (onlyInBackup.length) {
    const rowsOnly = humanRows(onlyInBackup);
    writeSheet(path.join(OUT, 'backup-only-items.xlsx'), 'في النسخة الاحتياطية فقط', rowsOnly);
    writeCsv(path.join(OUT, 'backup-only-items.csv'), rowsOnly);
  }

  // 4) summary
  const noBarcode = backup.filter((m) => !normBarcode(m.barcode)).length;
  const barcodeCounts = new Map();
  for (const m of backup) {
    const bc = normBarcode(m.barcode);
    if (bc) barcodeCounts.set(bc, (barcodeCounts.get(bc) || 0) + 1);
  }
  const dupBarcodes = [...barcodeCounts.values()].filter((n) => n > 1).length;
  const categories = new Map();
  for (const m of backup) categories.set(m.category || '(بدون تصنيف)', (categories.get(m.category || '(بدون تصنيف)') || 0) + 1);
  const topCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const withPrice = backup.filter((m) => Number(m.price_box) > 0).length;

  const summary = [
    'ملخص استخراج النسخة الاحتياطية',
    '===============================',
    'الملف: pharmacy_pos.db.before-catalog-v1423-2026-11-09T16-28-22-232Z.bak',
    '',
    `إجمالي الأصناف في النسخة الاحتياطية: ${backup.length.toLocaleString('en-US')}`,
    `إجمالي الأصناف في قاعدة البيانات الحالية: ${live.length.toLocaleString('en-US')}`,
    `أصناف موجودة في النسخة الاحتياطية فقط: ${onlyInBackup.length.toLocaleString('en-US')}`,
    `أصناف موجودة في القاعدة الحالية فقط: ${onlyInLive.length.toLocaleString('en-US')}`,
    '',
    `أصناف بدون باركود: ${noBarcode.toLocaleString('en-US')}`,
    `باركودات مكررة: ${dupBarcodes.toLocaleString('en-US')}`,
    `أصناف بسعر علبة > 0: ${withPrice.toLocaleString('en-US')}`,
    '',
    'عدد الأصناف حسب التصنيف (أعلى 15):',
    ...topCategories.map(([name, n]) => `  ${String(n).padStart(6)}  ${name}`),
    '',
    'ملاحظة: النسخة الاحتياطية تحتوي جدول الأدوية فقط (medicines) — كل الجداول الأخرى',
    '(الفواتير، العملاء، الموردين، الورديات، المستخدمين) فاضية داخلها.',
    '',
    'الملفات الناتجة:',
    '  pharmacy_pos.backup-2026-11-09.db  — نسخة قاعدة بيانات قابلة للفتح',
    '  backup-catalog-29721.xlsx          — كل الأصناف (Excel)',
    '  backup-catalog-29721.csv           — كل الأصناف (CSV بترميز عربي)',
    onlyInBackup.length ? '  backup-only-items.xlsx / .csv      — الأصناف الناقصة من القاعدة الحالية' : ''
  ].filter(Boolean).join('\r\n');

  fs.writeFileSync(path.join(OUT, 'backup-summary.txt'), summary, 'utf8');
  console.log(summary);
  bakDb.close();
})();
