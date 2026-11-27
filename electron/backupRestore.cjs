/**
 * SQLite backup inspection / restore helpers.
 *
 * Used by the main process so that restoring a backup never has to send the
 * whole database through IPC to the renderer: the file is validated and
 * copied natively, and only progress updates cross the process boundary.
 *
 * A backup can be any SQLite file produced by the app (.bak, .db, ...),
 * including multi-hundred-megabyte files.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'latin1');
const MIN_SQLITE_BYTES = 512;

/** Tables that prove the file is a PharmacyPOS database (any one is enough). */
const SIGNATURE_TABLES = ['medicines', 'invoices', 'app_users', 'suppliers', 'settings'];

/** Above this size the deep (sql.js) scan is skipped to protect memory. */
const DEEP_SCAN_LIMIT = 384 * 1024 * 1024;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function readHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(100);
    const read = fs.readSync(fd, buf, 0, 100, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Cheap structural checks that work for files of any size. */
function checkSqliteStructure(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('المسار المحدد ليس ملفاً.');
  if (stat.size < MIN_SQLITE_BYTES) {
    throw new Error(`الملف صغير جداً (${formatBytes(stat.size)}) — ليس قاعدة بيانات SQLite صالحة.`);
  }

  const header = readHeader(filePath);
  if (header.length < 100 || !header.subarray(0, 16).equals(SQLITE_HEADER)) {
    throw new Error('الملف ليس قاعدة بيانات SQLite — تأكد أنه ملف .db أو .bak أُخذ من البرنامج.');
  }

  // Bytes 16-17: page size (big-endian, 1 means 65536).
  let pageSize = header.readUInt16BE(16);
  if (pageSize === 1) pageSize = 65536;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    throw new Error('حجم صفحات قاعدة البيانات غير صالح — الملف تالف.');
  }

  // Bytes 28-31: number of pages. A healthy app copy has size = pages * pageSize.
  const pageCount = header.readUInt32BE(28);
  if (pageCount > 0) {
    const expected = pageCount * pageSize;
    const drift = Math.abs(expected - stat.size);
    // A few trailing bytes can exist in old copies; a large drift means truncation.
    if (drift > pageSize * 2) {
      throw new Error(
        `الملف يبدو ناقصاً أو تالفاً (الحجم ${formatBytes(stat.size)} والمتوقع ${formatBytes(expected)}).`
      );
    }
  }

  return { size: stat.size, pageSize, pageCount };
}

let sqlJsPromise = null;

/**
 * Loads sql.js in the main process.
 *
 * The packaged app does not bundle sql.js inside app.asar (the renderer gets
 * its own copy from the vite build), so it is shipped as an extra resource at
 * resources/sql.js. In development the node_modules copy is used.
 */
function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const candidates = [];
      // Packaged: shipped as a resource, renamed to .cjs because the project
      // package.json uses "type": "module" and a plain .js there is ESM.
      if (process.resourcesPath) {
        const resDir = path.join(process.resourcesPath, 'sql.js');
        candidates.push({ js: path.join(resDir, 'sql-wasm.cjs'), dir: resDir });
        candidates.push({ js: path.join(resDir, 'sql-wasm.js'), dir: resDir });
      }
      try {
        const dir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
        candidates.push({ js: path.join(dir, 'sql-wasm.js'), dir });
      } catch (e) {}
      candidates.push({
        js: path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'),
        dir: path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist')
      });

      let lastError = null;
      for (const { js, dir } of candidates) {
        if (!fs.existsSync(js)) continue;
        try {
          const factory = require(js);
          return await factory({ locateFile: (f) => path.join(dir, f) });
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError || new Error('sql.js غير متاح لهذه النسخة.');
    })();
    sqlJsPromise.catch(() => { sqlJsPromise = null; });
  }
  return sqlJsPromise;
}

/**
 * Full inspection: structure + table list + row counts + integrity check.
 * Uses sql.js (already a production dependency) inside the main process.
 */
async function inspectSqlite(filePath) {
  const structure = checkSqliteStructure(filePath);
  const name = path.basename(filePath);
  const stat = fs.statSync(filePath);

  const result = {
    ok: true,
    path: filePath,
    name,
    size: structure.size,
    sizeText: formatBytes(structure.size),
    modifiedAt: stat.mtime.toISOString(),
    deep: false,
    integrity: 'skipped',
    tables: {},
    counts: {},
    warnings: [],
    blocking: []
  };

  if (structure.size > DEEP_SCAN_LIMIT) {
    result.warnings.push(
      `الملف كبير جداً (${result.sizeText}) — تم التحقق من البنية فقط. الاستعادة ممكنة لكن التطبيق قد لا يستطيع فتح قاعدة بهذا الحجم.`
    );
    return result;
  }

  let db = null;
  try {
    const SQLSync = await loadSqlJs();

    const buffer = fs.readFileSync(filePath);
    db = new SQLSync.Database(buffer);

    const integrity = db.exec('PRAGMA integrity_check');
    result.integrity = integrity[0]?.values?.[0]?.[0] || 'unknown';
    if (String(result.integrity).toLowerCase() !== 'ok') {
      result.blocking.push(`فحص السلامة فشل: ${result.integrity}`);
    }

    const tablesRes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = tablesRes[0] ? tablesRes[0].values.map((r) => r[0]) : [];

    for (const table of tableNames) {
      try {
        const safe = String(table).replace(/"/g, '""');
        const count = db.exec(`SELECT COUNT(*) FROM "${safe}"`)[0].values[0][0];
        result.counts[table] = count;
        result.tables[table] = count;
      } catch (e) {
        result.counts[table] = null;
      }
    }

    result.deep = true;

    // A short, human summary shown in the restore preview: owners need to see
    // whether the file actually contains their sales, shifts and profit before
    // they replace the live database.
    try {
      const one = (sql) => db.exec(sql)[0]?.values?.[0]?.[0] ?? null;
      const has = (t) => tableNames.includes(t);
      result.summary = {
        invoices: Number(result.counts.invoices) || 0,
        shifts: Number(result.counts.shifts) || 0,
        purchases: Number(result.counts.purchases) || 0,
        expenses: Number(result.counts.expenses) || 0,
        profit: has('invoices') ? Number(one('SELECT COALESCE(SUM(total_profit), 0) FROM invoices')) || 0 : 0,
        lastInvoiceAt: has('invoices') ? one('SELECT MAX(date_time) FROM invoices') : null,
        lastShiftAt: has('shifts') ? one('SELECT MAX(opened_at) FROM shifts') : null
      };
    } catch (e) {
      result.summary = null;
    }

    const hasSignature = SIGNATURE_TABLES.some((t) => tableNames.includes(t));
    if (!hasSignature) {
      result.blocking.push('الملف لا يحتوي جداول برنامج صيدليتي — استعادة ملف قاعدة مختلف ستفقد بيانات المتجر.');
    }
    if (!tableNames.includes('medicines')) {
      result.warnings.push('لا يوجد جدول الأدوية (medicines) في هذا الملف — الكتالوج سيكون فارغاً بعد الاستعادة.');
    }
    if (tableNames.includes('medicines') && result.counts.medicines === 0) {
      result.warnings.push('جدول الأدوية موجود لكنه فارغ (0 صنف).');
    }
    if (structure.pageCount === 0) {
      result.warnings.push('الملف لا يحتوي صفحات بيانات — قد يكون قاعدة فارغة.');
    }
  } catch (e) {
    result.warnings.push(`تعذر فحص المحتويات (${e.message}) — تم التحقق من البنية الخارجية فقط.`);
  } finally {
    try { if (db) db.close(); } catch (e) {}
  }

  return result;
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}-${pad(now.getSeconds())}`;
}

function copyWithProgress(sourcePath, targetPath, totalBytes, onProgress) {
  return new Promise((resolve, reject) => {
    let copied = 0;
    let lastTick = 0;
    const rs = fs.createReadStream(sourcePath, { highWaterMark: 1024 * 1024 });
    const ws = fs.createWriteStream(targetPath);
    rs.on('data', (chunk) => {
      copied += chunk.length;
      const now = Date.now();
      if (onProgress && (now - lastTick > 120 || copied === totalBytes)) {
        lastTick = now;
        onProgress(copied, totalBytes);
      }
    });
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', () => resolve(copied));
    rs.pipe(ws);
  });
}

function removeSidecars(dbPath) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    } catch (e) {}
  }
}

/**
 * Restore `sourcePath` over `targetPath`.
 *
 * Steps: safety copy of the current DB, stream copy to a temp file next to the
 * target, verify size, swap atomically, remove stale SQLite sidecars.
 */
async function restoreSqlite({ sourcePath, targetPath, backupDir, onProgress }) {
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('ملف النسخة الاحتياطية غير موجود.');
  if (!targetPath) throw new Error('مسار قاعدة البيانات الحالية غير معروف.');

  const sourceAbs = path.resolve(sourcePath);
  const targetAbs = path.resolve(targetPath);
  if (sourceAbs.toLowerCase() === targetAbs.toLowerCase()) {
    throw new Error('الملف المختار هو نفس قاعدة البيانات الحالية — اختر نسخة احتياطية.');
  }

  const info = await inspectSqlite(sourceAbs);
  if (info.blocking.length) {
    throw new Error(info.blocking.join(' '));
  }

  const sourceSize = fs.statSync(sourceAbs).size;
  const dir = path.dirname(targetAbs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 1) Safety snapshot of what is about to be replaced.
  let safetyBackup = null;
  if (fs.existsSync(targetAbs)) {
    const snapshotDir = backupDir || path.join(dir, 'backups');
    if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
    safetyBackup = path.join(snapshotDir, `restore-safety_${timestamp()}.db`);
    await copyWithProgress(targetAbs, safetyBackup, fs.statSync(targetAbs).size, null);
    if (fs.statSync(safetyBackup).size !== fs.statSync(targetAbs).size) {
      throw new Error('فشل إنشاء نسخة أمان قبل الاستعادة — تم الإلغاء بدون تغيير أي بيانات.');
    }
  }

  // 2) Copy next to the target, then swap.
  const tempPath = path.join(dir, `.restore-${crypto.randomBytes(4).toString('hex')}.tmp`);
  const oldPath = path.join(dir, `.restore-old-${crypto.randomBytes(4).toString('hex')}.db`);
  try {
    const copied = await copyWithProgress(sourceAbs, tempPath, sourceSize, onProgress);
    if (copied !== sourceSize || fs.statSync(tempPath).size !== sourceSize) {
      throw new Error('لم تُنسخ كل البيانات (الملف كبير أو القرص ممتلئ).');
    }

    removeSidecars(targetAbs);

    if (fs.existsSync(targetAbs)) fs.renameSync(targetAbs, oldPath);
    try {
      fs.renameSync(tempPath, targetAbs);
    } catch (e) {
      if (fs.existsSync(oldPath)) fs.renameSync(oldPath, targetAbs);
      throw e;
    }
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}

    // 3) Post-restore sanity check on the live file.
    const after = fs.statSync(targetAbs);
    if (after.size !== sourceSize) {
      throw new Error('حجم قاعدة البيانات بعد الاستعادة غير مطابق — أعد المحاولة.');
    }
    checkSqliteStructure(targetAbs);

    return {
      ok: true,
      restoredFrom: sourceAbs,
      sourceName: path.basename(sourceAbs),
      bytes: sourceSize,
      sizeText: formatBytes(sourceSize),
      safetyBackup,
      tables: info.tables,
      counts: info.counts
    };
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
  }
}

/** Automatic snapshots created by the app (backups folder next to the DB). */
function listLocalBackups(targetPath, limit = 25) {
  const dir = path.join(path.dirname(targetPath), 'backups');
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.(db|bak|sqlite)$/i.test(f))
      .map((f) => {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        return {
          name: f,
          path: full,
          size: st.size,
          sizeText: formatBytes(st.size),
          modifiedAt: st.mtime.toISOString()
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      .slice(0, limit);
  } catch (e) {
    return [];
  }
}

module.exports = {
  SIGNATURE_TABLES,
  formatBytes,
  checkSqliteStructure,
  inspectSqlite,
  restoreSqlite,
  listLocalBackups
};
