/**
 * Reader for legacy e-Stock backups.
 *
 * e-Stock stored its data in Microsoft SQL Server, so its backups are TAPE
 * archives (first four bytes "TAPE"), not SQLite files. The app cannot simply
 * swap such a file in, but it can read the table rows straight out of the
 * uncompressed backup pages — no SQL Server, no Python, no extra tools.
 *
 * This module is a direct port of scripts/extract_estock_to_excel.py (which
 * was validated against the real F:\e-Stock_Backup.bak) and produces the same
 * import payload the eStock PowerShell converter used to produce.
 */

const fs = require('node:fs');

const TAPE_HEADER = Buffer.from('TAPE', 'latin1');

/** Tables we need: products & stock, plus lookup tables for names. */
const TARGET_TABLES = new Set([
  'Products',
  'Product_Amount',
  'Product_units',
  'Product_groups',
  'Companys',
  'Product_description',
  'Customer',
  'Vendor'
]);

const PAGE_SIZE = 8192;
const BLOCK_SIZE = 8 * 1024 * 1024;

function isEStockBackup(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(4);
      const read = fs.readSync(fd, buf, 0, 4, 0);
      return read === 4 && buf.equals(TAPE_HEADER);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return false;
  }
}

/**
 * Small block cache so the page scanner reads 8 MB at a time instead of doing
 * one syscall per 8 KB page (a 250 MB backup has ~30k pages).
 */
function createReader(fd, fileSize) {
  let cachedStart = -1;
  let cached = null;
  function readBlock(start) {
    const len = Math.min(BLOCK_SIZE, fileSize - start);
    if (len <= 0) return Buffer.alloc(0);
    const buf = Buffer.allocUnsafe(len);
    let read = 0;
    while (read < len) {
      const n = fs.readSync(fd, buf, read, len - read, start + read);
      if (!n) break;
      read += n;
    }
    return read === len ? buf : buf.subarray(0, read);
  }
  return {
    readAt(offset, length) {
      if (offset < 0 || length <= 0 || offset >= fileSize) return Buffer.alloc(0);
      const start = Math.floor(offset / BLOCK_SIZE) * BLOCK_SIZE;
      if (start !== cachedStart) {
        cachedStart = start;
        cached = readBlock(start);
      }
      const rel = offset - start;
      if (rel >= cached.length) return Buffer.alloc(0);
      return cached.subarray(rel, Math.min(cached.length, rel + length));
    }
  };
}

/** Finds the offset of SQL Server page 0 (file 1) inside the TAPE archive. */
function findFirstPage(reader, fileSize) {
  const headLen = Math.min(fileSize, 2 * 1024 * 1024);
  const head = reader.readAt(0, headLen);
  for (let off = 0; off + 96 <= head.length; off += 512) {
    if (head[off] === 1 && head[off + 1] === 15 && head[off + 3] === 0) {
      const pid = head.readUInt32LE(off + 32);
      const fid = head.readUInt16LE(off + 36);
      if (pid === 0 && fid === 1) return off;
    }
  }
  return -1;
}

const VALID_PAGE_TYPES = new Set([1, 2, 3, 4, 8, 9, 10, 11, 13, 15, 16, 17]);

/**
 * Yields data pages (m_type === 1): { pageId, fileId, objId, idxId, data }.
 * `onPage` is called for progress reporting.
 */
function* iterSqlDataPages(reader, fileSize, onProgress) {
  let cur = findFirstPage(reader, fileSize);
  if (cur < 0) throw new Error('لم يتم العثور على صفحات قاعدة بيانات داخل ملف النسخة.');

  let pagesRead = 0;
  while (cur + PAGE_SIZE <= fileSize) {
    const hdr = reader.readAt(cur, 96);
    if (hdr.length < 96) break;
    const ver = hdr[0];
    const ptype = hdr[1];
    const slotCnt = hdr.readUInt16LE(22);
    const objId = hdr.readUInt32LE(24);
    const freeData = hdr.readUInt16LE(30);
    const pageId = hdr.readUInt32LE(32);
    const fileId = hdr.readUInt16LE(36);

    if (
      ver === 1 &&
      VALID_PAGE_TYPES.has(ptype) &&
      (fileId === 1 || fileId === 2) &&
      freeData >= 96 &&
      freeData <= PAGE_SIZE &&
      slotCnt < 1000
    ) {
      if (ptype === 1) {
        const data = reader.readAt(cur, PAGE_SIZE);
        const idxId = hdr.readUInt16LE(6);
        pagesRead++;
        if (onProgress && pagesRead % 500 === 0) {
          onProgress({ pagesRead, bytes: cur, total: fileSize });
        }
        yield { pageId, fileId, objId, idxId, data };
      }
      cur += PAGE_SIZE;
    } else {
      cur += 512;
    }
  }
}

/** Yields each primary record (slot 0 rows) from one data page. */
function* parseRecordSlots(page) {
  if (!page || page.length < PAGE_SIZE) return;
  const slotCnt = page.readUInt16LE(22);
  for (let i = 0; i < slotCnt; i++) {
    const slotOff = page.readUInt16LE(PAGE_SIZE - 2 * (i + 1));
    if (slotOff < 96 || slotOff >= PAGE_SIZE - 2) continue;
    const tagA = page[slotOff];
    const recType = (tagA >> 1) & 0x07;
    if (recType !== 0) continue;
    yield page.subarray(slotOff);
  }
}

/** Splits one record into fixed part and variable columns. */
function parseRecordParts(rec) {
  if (!rec || rec.length < 6) return null;
  const tagA = rec[0];
  const hasNullBitmap = Boolean(tagA & 0x10);
  const hasVarCols = Boolean(tagA & 0x20);
  const fixedLen = rec.readUInt16LE(2);
  if (fixedLen < 4 || fixedLen > rec.length) return null;

  let pos = fixedLen;
  let nullBitmap = Buffer.alloc(0);
  if (hasNullBitmap && pos + 2 <= rec.length) {
    const numCols = rec.readUInt16LE(pos);
    pos += 2;
    const nbLen = (numCols + 7) >> 3;
    nullBitmap = rec.subarray(pos, pos + nbLen);
    pos += nbLen;
  }

  const varCols = [];
  if (hasVarCols && pos + 2 <= rec.length) {
    const numVar = rec.readUInt16LE(pos);
    pos += 2;
    if (pos + 2 * numVar <= rec.length) {
      let prev = pos + 2 * numVar;
      for (let i = 0; i < numVar; i++) {
        const rawEnd = rec.readUInt16LE(pos + 2 * i);
        const isComplex = Boolean(rawEnd & 0x8000);
        const end = rawEnd & 0x7fff;
        if (end >= prev && end <= rec.length) {
          varCols.push({ isComplex, raw: rec.subarray(prev, end) });
          prev = end;
        } else {
          varCols.push({ isComplex, raw: Buffer.alloc(0) });
        }
      }
    }
  }

  return { rec, fixedLen, nullBitmap, varCols };
}

function isNull(nullBitmap, nullbit) {
  if (!nullBitmap || !nullBitmap.length || nullbit <= 0) return false;
  const idx = (nullbit - 1) >> 3;
  const bit = (nullbit - 1) & 7;
  if (idx >= nullBitmap.length) return false;
  return Boolean(nullBitmap[idx] & (1 << bit));
}

let cp1256Decoder = null;
function decodeCp1256(buf) {
  try {
    if (!cp1256Decoder) cp1256Decoder = new TextDecoder('windows-1256');
    return cp1256Decoder.decode(buf);
  } catch (e) {
    return buf.toString('latin1');
  }
}

function decodeValue(raw, xtype, scale = 0) {
  if (!raw || raw.length === 0) return null;
  try {
    switch (xtype) {
      case 48: // tinyint
        return raw[0];
      case 52: // smallint
        return raw.readInt16LE(0);
      case 56: // int
        return raw.readInt32LE(0);
      case 127: // bigint
        return Number(raw.readBigInt64LE(0));
      case 104: // bit
        return Boolean(raw[0]);
      case 59: // real
        return Math.round(raw.readFloatLE(0) * 10000) / 10000;
      case 62: // float
        return Math.round(raw.readDoubleLE(0) * 10000) / 10000;
      case 60: { // money
        const v = Number(raw.readBigInt64LE(0)) / 10000;
        return Math.round(v * 100) / 100;
      }
      case 122: // smallmoney
        return Math.round((raw.readInt32LE(0) / 10000) * 100) / 100;
      case 106:
      case 108: { // decimal / numeric
        const sign = raw[0] === 1 ? 1 : -1;
        let mag = 0n;
        for (let i = raw.length - 1; i >= 1; i--) mag = (mag << 8n) | BigInt(raw[i]);
        const num = Number(mag);
        if (scale === 0) return sign * num;
        return Math.round((sign * num) / Math.pow(10, scale) * Math.pow(10, scale)) / Math.pow(10, scale);
      }
      case 61: { // datetime
        const ticks = raw.readInt32LE(0);
        const days = raw.readInt32LE(4);
        if (days < -50000 || days > 100000) return null;
        const ms = Date.UTC(1900, 0, 1) + (days * 86400 + ticks / 300) * 1000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }
      case 58: { // smalldatetime
        const mins = raw.readUInt16LE(0);
        const days = raw.readUInt16LE(2);
        const ms = Date.UTC(1900, 0, 1) + (days * 86400 + mins * 60) * 1000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }
      case 167:
      case 175: // varchar / char (Arabic ANSI code page)
        return decodeCp1256(raw).trim();
      case 231:
      case 239: // nvarchar / nchar
        return raw.toString('utf16le').trim();
      default:
        return raw.toString('hex');
    }
  } catch (e) {
    return null;
  }
}

function decodeRow(parsed, colDefs) {
  const { rec, fixedLen, nullBitmap, varCols } = parsed;
  const row = {};
  for (const col of colDefs) {
    if (isNull(nullBitmap, col.nullbit)) {
      row[col.name] = null;
      continue;
    }
    if (col.offset >= 0) {
      if (col.offset + col.length <= fixedLen) {
        row[col.name] = decodeValue(rec.subarray(col.offset, col.offset + col.length), col.xtype, col.scale);
      } else {
        row[col.name] = null;
      }
    } else {
      const vidx = -col.offset - 1;
      const vc = varCols[vidx];
      row[col.name] = vc && !vc.isComplex ? decodeValue(vc.raw, col.xtype, col.scale) : null;
    }
  }
  return row;
}

/** Reads the system catalog to learn the schema of the tables we need. */
function readSchema(reader, fileSize) {
  const tableIdByName = new Map();
  const tableNameById = new Map();
  const colsByTid = new Map();
  const rowsetsByTid = new Map();
  const rscolsByRsid = new Map();

  for (const page of iterSqlDataPages(reader, fileSize)) {
    const { objId, idxId, data } = page;

    if (objId === 34 && idxId === 1) {
      for (const rec of parseRecordSlots(data)) {
        const p = parseRecordParts(rec);
        if (!p) continue;
        const { rec: r, fixedLen, varCols } = p;
        if (fixedLen < 19 || varCols.length === 0) continue;
        const tid = r.readInt32LE(4);
        const ttype = r.subarray(17, 19).toString('latin1').trim();
        const name = varCols[0].raw.toString('utf16le');
        if (ttype === 'U' && TARGET_TABLES.has(name)) {
          tableIdByName.set(name, tid);
          tableNameById.set(tid, name);
        }
      }
    } else if (objId === 41 && idxId === 1) {
      for (const rec of parseRecordSlots(data)) {
        const p = parseRecordParts(rec);
        if (!p) continue;
        const { rec: r, fixedLen, varCols } = p;
        if (fixedLen < 24 || varCols.length === 0) continue;
        const tid = r.readInt32LE(4);
        const number = r.readInt16LE(8);
        const colid = r.readInt32LE(10);
        const xtype = r[14];
        const length = r.readInt16LE(19);
        const scale = r[22];
        const name = varCols[0].raw.toString('utf16le');
        if (number === 0) {
          if (!colsByTid.has(tid)) colsByTid.set(tid, []);
          colsByTid.get(tid).push({ colid, name, xtype, length, scale });
        }
      }
    } else if (objId === 5 && (idxId === 0 || idxId === 1)) {
      for (const rec of parseRecordSlots(data)) {
        const p = parseRecordParts(rec);
        if (!p) continue;
        const { rec: r, fixedLen } = p;
        if (fixedLen < 21) continue;
        const rsid = Number(r.readBigUInt64LE(4));
        const idmajor = r.readInt32LE(13);
        const idminor = r.readInt32LE(17);
        if (idminor === 0 || idminor === 1) rowsetsByTid.set(idmajor, { rsid, idminor });
      }
    } else if (objId === 3 && (idxId === 0 || idxId === 1)) {
      for (const rec of parseRecordSlots(data)) {
        const p = parseRecordParts(rec);
        if (!p) continue;
        const { rec: r, fixedLen } = p;
        if (fixedLen < 52) continue;
        const rsid = Number(r.readBigUInt64LE(4));
        const rscolid = r.readInt32LE(12);
        const offset = r.readInt16LE(44);
        const nullbit = r.readInt16LE(48);
        if (!rscolsByRsid.has(rsid)) rscolsByRsid.set(rsid, new Map());
        rscolsByRsid.get(rsid).set(rscolid, { offset, nullbit });
      }
    }
  }

  const schemas = new Map(); // objId -> { name, idminor, cols }
  for (const [name, tid] of tableIdByName) {
    const rs = rowsetsByTid.get(tid);
    if (!rs) continue;
    const rsMap = rscolsByRsid.get(rs.rsid) || new Map();
    const cdefs = [];
    const cols = (colsByTid.get(tid) || []).slice().sort((a, b) => a.colid - b.colid);
    for (const c of cols) {
      const pos = rsMap.get(c.colid);
      if (!pos) continue;
      cdefs.push({ ...c, offset: pos.offset, nullbit: pos.nullbit });
    }
    schemas.set(tid, { name, idminor: rs.idminor, cols: cdefs });
  }
  return schemas;
}

/** Loads every row of the requested tables. */
function readRows(reader, fileSize, schemas, onProgress) {
  const rowsByTable = new Map();
  for (const s of schemas.values()) rowsByTable.set(s.name, []);

  for (const page of iterSqlDataPages(reader, fileSize, onProgress)) {
    const schema = schemas.get(page.objId);
    if (!schema) continue;
    if (page.idxId !== 0 && page.idxId !== 1) continue;
    for (const rec of parseRecordSlots(page.data)) {
      const p = parseRecordParts(rec);
      if (!p) continue;
      rowsByTable.get(schema.name).push(decodeRow(p, schema.cols));
    }
  }
  return rowsByTable;
}

function unitTypeFrom(text) {
  const s = String(text || '').toLowerCase();
  if (/قطر|drop/.test(s)) return 'droppers';
  if (/بخاخ|spray|inhal/.test(s)) return 'sprays';
  if (/امبول|أمبول|ampoul|ampol|inject/.test(s)) return 'ampoules';
  if (/فيال|vial/.test(s)) return 'vials';
  if (/لبوس|اقماع|أقماع|suppos/.test(s)) return 'suppositories';
  if (/مرهم|كريم|جل|cream|ointment|gel|lotion|فازلين/.test(s)) return 'tubes';
  if (/شراب|معلق|سيرب|syrup|susp|solution|محلول|غسول|شامبو|sachet|اكياس|أكياس|كيس|فوار|effer/.test(s)) return 'sachets';
  if (/كبسول|caps/.test(s)) return 'capsules';
  if (/اقراص|أقراص|tab|قرص/.test(s)) return 'tablets';
  return 'units';
}

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toInt = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const normExpiry = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  return `${m[2]}/${m[1]}`;
};

/** Turns raw table rows into the payload consumed by importExternalCatalog. */
function buildCatalog(rowsByTable) {
  const products = rowsByTable.get('Products') || [];
  const amounts = rowsByTable.get('Product_Amount') || [];
  const units = rowsByTable.get('Product_units') || [];
  const groups = rowsByTable.get('Product_groups') || [];
  const companies = rowsByTable.get('Companys') || [];
  const descriptions = rowsByTable.get('Product_description') || [];
  const customers = rowsByTable.get('Customer') || [];
  const vendors = rowsByTable.get('Vendor') || [];

  const unitsMap = new Map(units.map((u) => [u.unit_id, u.unit_name_ar || u.unit_name_en || '']));
  const groupsMap = new Map(groups.map((g) => [g.group_id, g.group_name_ar || g.group_name_en || '']));
  const companiesMap = new Map(companies.map((c) => [c.company_id, c.co_name_ar || c.co_name_en || '']));
  const descMap = new Map(descriptions.map((d) => [d.pd_id, d.pd_name_ar || d.pd_name_en || '']));

  const stockByPid = new Map();
  const expiryByPid = new Map();
  const vendorByPid = new Map();
  const batches = [];

  for (const pa of amounts) {
    const pid = toInt(pa.product_id);
    if (!pid) continue;
    const amount = toNum(pa.amount);
    stockByPid.set(pid, (stockByPid.get(pid) || 0) + amount);
    const exp = normExpiry(pa.exp_date);
    if (amount > 0 && exp) {
      const prev = expiryByPid.get(pid);
      if (!prev || exp.slice(3) + exp.slice(0, 2) < prev.slice(3) + prev.slice(0, 2)) expiryByPid.set(pid, exp);
      if (pa.vendor_id != null && !vendorByPid.has(pid)) vendorByPid.set(pid, toInt(pa.vendor_id));
      batches.push({
        mid: pid,
        qty: Math.round(amount * 1000) / 1000,
        cost: pa.buy_price != null ? toNum(pa.buy_price) : 0,
        exp,
        bn: `ESTOCK-${toInt(pa.pa_id) || batches.length + 1}`
      });
    }
  }

  const vendorNameById = new Map();
  for (const v of vendors) {
    const nm = String(v.vendor_name_ar || v.vendor_name_en || '').trim();
    if (nm) vendorNameById.set(toInt(v.vendor_id), nm);
  }

  const outProducts = [];
  for (const p of products) {
    if (String(p.deleted || '').trim().toUpperCase() === 'Y') continue;
    const pid = toInt(p.product_id);
    const ar = String(p.product_name_ar || '').trim();
    const en = String(p.product_name_en || '').trim();
    if (!pid || (!ar && !en)) continue;

    let spbD = Math.max(1, Math.round(toNum(p.product_unit1_2) || 1));
    let conv13 = toNum(p.product_unit1_3) || 1;
    if (spbD > 1000) spbD = 1;
    if (conv13 > 1000) conv13 = 1;
    const spb = spbD;
    const ups = spb <= 1 && conv13 <= 1 ? 1 : Math.max(1, Math.round(conv13 / Math.max(1, spb)));

    let pb = toNum(p.sell_price);
    let ps = toNum(p.unit2_sell_price);
    let pu = toNum(p.unit3_sell_price);
    if (ps <= 0 && spb > 1 && pb > 0) ps = pb / spb;
    if (pu <= 0 && ps > 0) pu = ps / Math.max(1, ups);
    if (spb === 1 && ups === 1) { ps = pb; pu = 0; }
    if (ups <= 1) pu = 0;

    const totalBoxes = stockByPid.get(pid) || 0;
    const bx = Math.floor(totalBoxes + 1e-9);
    let restUnits = Math.round((totalBoxes - bx) * spb * ups + 1e-9);
    if (restUnits < 0) restUnits = 0;
    const st = Math.floor(restUnits / Math.max(1, ups));
    const un = Math.max(0, restUnits - st * Math.max(1, ups));

    const pdName = descMap.get(toInt(p.pd_id)) || '';
    const vendorId = vendorByPid.get(pid);
    outProducts.push({
      id: pid,
      ar,
      en,
      sci: String(p.product_scientific_name || '').trim(),
      bc: String(p.product_int_code || '').trim(),
      cat: groupsMap.get(toInt(p.group_id)) || '',
      spb,
      ups,
      pb: Math.round(pb * 100) / 100,
      ps: Math.round(ps * 100) / 100,
      pu: Math.round(pu * 100) / 100,
      bx,
      st,
      un,
      exp: expiryByPid.get(pid) || '',
      sup: vendorId != null ? (vendorNameById.get(vendorId) || '') : '',
      ut: unitTypeFrom(`${pdName} ${ar} ${en}`),
      company: companiesMap.get(toInt(p.company_id)) || ''
    });
  }

  const outVendors = [];
  for (const v of vendors) {
    if (String(v.deleted || '').trim().toUpperCase() === 'Y') continue;
    const name = String(v.vendor_name_ar || v.vendor_name_en || '').trim();
    if (!name) continue;
    outVendors.push({
      id: toInt(v.vendor_id),
      name,
      phone: String(v.mobile || v.tel || '').trim(),
      addr: String(v.address || '').trim(),
      bal: toNum(v.vendor_current_money)
    });
  }

  const outCustomers = [];
  for (const c of customers) {
    if (String(c.deleted || '').trim().toUpperCase() === 'Y') continue;
    const name = String(c.customer_name_ar || c.customer_name_en || '').trim();
    if (!name) continue;
    outCustomers.push({
      id: toInt(c.customer_id),
      name,
      phone: String(c.mobile || c.tel || '').trim(),
      addr: String(c.address || '').trim(),
      limit: toNum(c.customer_max_money),
      bal: toNum(c.customer_current_money)
    });
  }

  return { products: outProducts, batches, vendors: outVendors, customers: outCustomers };
}

/**
 * Reads an eStock SQL Server backup and returns { catalog, counts }.
 */
function extractEStock(filePath, { onProgress } = {}) {
  if (!isEStockBackup(filePath)) {
    throw new Error('الملف ليس نسخة eStock (SQL Server) صالحة.');
  }
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const reader = createReader(fd, stat.size);
    if (onProgress) onProgress({ phase: 'schema', bytes: 0, total: stat.size });
    const schemas = readSchema(reader, stat.size);
    if (schemas.size === 0) {
      throw new Error('لم يتم العثور على جداول eStock داخل الملف.');
    }
    if (onProgress) onProgress({ phase: 'rows', bytes: 0, total: stat.size });
    const rows = readRows(reader, stat.size, schemas, (p) => {
      if (onProgress) onProgress({ phase: 'rows', bytes: p.bytes, total: stat.size });
    });
    const catalog = buildCatalog(rows);
    return {
      catalog,
      counts: {
        products: catalog.products.length,
        batches: catalog.batches.length,
        vendors: catalog.vendors.length,
        customers: catalog.customers.length,
        productsInStock: catalog.products.filter((p) => p.bx || p.st || p.un).length
      }
    };
  } finally {
    try { fs.closeSync(fd); } catch (e) {}
  }
}

module.exports = {
  isEStockBackup,
  extractEStock,
  // exported for tests
  decodeValue,
  parseRecordParts,
  readSchema,
  readRows,
  createReader,
  findFirstPage
};
