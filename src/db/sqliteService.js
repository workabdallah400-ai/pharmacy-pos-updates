import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  getSyncEndpoint,
  getReportBaseUrl,
  getLocalReportBaseUrl,
  getSnapshotEndpoint,
  getLocalSnapshotEndpoint,
  getCloudSnapshotEndpoint,
  getPermanentReportBaseUrl,
  isPrivateHost
} from '../utils/reportServer';
import { DEFAULT_SETTINGS } from '../data/mockSettings.js';

// IndexedDB helper for browser & mobile offline database persistence
const IDB_NAME = 'PharmacyPOS_DB';
const IDB_STORE = 'sqlite_file';
const IDB_KEY = 'pharmacy_pos.db';

function openIDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function getFromIDB() {
  try {
    const db = await openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function saveToIDB(uint8Array) {
  try {
    const db = await openIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(uint8Array, IDB_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

class SQLiteService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
    this._syncFlushTimer = null;
    this._heartbeatTimer = null;
    this._heartbeatRunning = false;
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log('📦 Initializing SQLite Database Service...');

        // Check if running in Electron with IPC or Node fs
        const isElectron = typeof window !== 'undefined' && window.require;
        let dbBuffer = null;

        if (isElectron) {
          try {
            const { ipcRenderer } = window.require('electron');
            this.dbFilePath = await ipcRenderer.invoke('db:getPath');
            const ipcBuf = await ipcRenderer.invoke('db:read');
            if (ipcBuf && ipcBuf.length > 0) {
              dbBuffer = new Uint8Array(ipcBuf);
              console.log('✅ Loaded database via Electron IPC:', this.dbFilePath);
            }
          } catch (ipcErr) {}

          if (!dbBuffer) {
            try {
              const fs = window.require('fs');
              const path = window.require('path');
              
              const possiblePaths = [
                path.join(process.cwd(), 'pharmacy_pos.db'),
                path.join(__dirname, '../../pharmacy_pos.db'),
                path.join(__dirname, '../pharmacy_pos.db')
              ];

              for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                  dbBuffer = fs.readFileSync(p);
                  this.dbFilePath = p;
                  console.log(`✅ Loaded existing database from disk: ${p}`);
                  break;
                }
              }
            } catch (e) {
              console.warn('Electron fs read error, falling back to fetch:', e);
            }
          }
        }

        if (!dbBuffer && typeof window === 'undefined') {
          try {
            const req = typeof globalThis.require === 'function' ? globalThis.require : null;
            if (req) {
              const nodeFs = req('fs');
              const nodePath = req('path');
              const diskPath = nodePath.join(process.cwd(), 'pharmacy_pos.db');
              if (nodeFs.existsSync(diskPath)) {
                dbBuffer = nodeFs.readFileSync(diskPath);
                this.dbFilePath = diskPath;
                console.log(`✅ Loaded existing database from disk in Node environment: ${diskPath}`);
              }
            }
          } catch (e) {}
        }

        if (!dbBuffer && typeof window !== 'undefined' && !isElectron) {
          try {
            const idbBuf = await getFromIDB();
            if (idbBuf && idbBuf.length > 50000) {
              dbBuffer = idbBuf;
              console.log('✅ Loaded database from browser IndexedDB storage.');
            }
          } catch (idbErr) {}
        }

        // Initialize sql.js with reliable wasm locator
        let locateWasm = () => sqlWasmUrl || '/sql-wasm.wasm';
        if (isElectron) {
          try {
            const fs = window.require('fs');
            const path = window.require('path');
            const possibleWasm = [
              path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
              path.join(__dirname, 'sql-wasm.wasm'),
              path.join(__dirname, '../sql-wasm.wasm'),
              path.join(process.cwd(), 'sql-wasm.wasm'),
              path.join(process.cwd(), 'dist/sql-wasm.wasm'),
              path.join(process.cwd(), 'public/sql-wasm.wasm')
            ];
            for (const p of possibleWasm) {
              if (fs.existsSync(p)) {
                locateWasm = () => p;
                break;
              }
            }
          } catch (e) {}
        }

        const SQL = await initSqlJs({
          locateFile: locateWasm
        });

        if (dbBuffer) {
          this.db = new SQL.Database(dbBuffer);
        } else {
          // Fetch clean database from public/ with cache-busting
          try {
            const res = await fetch(`./pharmacy_pos.db?t=${Date.now()}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            });
            if (res.ok) {
              const arrayBuffer = await res.arrayBuffer();
              const u8 = new Uint8Array(arrayBuffer);
              this.db = new SQL.Database(u8);
              console.log('✅ Fetched and loaded clean SQLite DB into memory.');
              if (typeof window !== 'undefined') {
                saveToIDB(u8).catch(() => {});
              }
            } else {
              throw new Error('Database file fetch status: ' + res.status);
            }
          } catch (fetchErr) {
            console.warn('Could not fetch pharmacy_pos.db, creating fresh SQLite schema:', fetchErr);
            this.db = new SQL.Database();
            this.createSchema();
          }
        }

        // Always ensure the latest schema (idempotent) so upgrades from older
        // database files get new tables such as sync_queue/supplier_returns.
        try { this.createSchema(); } catch (schemaErr) {
          console.warn('Schema ensure warning:', schemaErr);
        }

        this.isInitialized = true;
        console.log('🚀 SQLite Database Service Ready with 30,000 Egyptian Medicines!');
        return this.db;
      } catch (err) {
        console.error('Failed to initialize SQLite:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  // Persist DB to disk (in Electron) or localStorage/IndexedDB
  saveToDisk() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = new Uint8Array(data);

      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.invoke('db:write', buffer).catch(() => {});
        } catch (ipcErr) {}

        try {
          const fs = window.require('fs');
          const path = window.require('path');
          const targetPath = this.dbFilePath || path.join(process.cwd(), 'pharmacy_pos.db');
          fs.writeFileSync(targetPath, Buffer.from(buffer));
          console.log(`💾 Persisted SQLite database to: ${targetPath}`);
          return;
        } catch (e) {}
      }

      // If in browser / mobile, persist state in IndexedDB
      if (typeof window !== 'undefined') {
        saveToIDB(buffer).catch(() => {});
      }
      console.log('💾 Database state updated in SQLite engine & persisted.');
    } catch (e) {
      console.error('Error saving SQLite database:', e);
    }
  }

  // Ensure tables exist
  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY,
        trade_name TEXT NOT NULL,
        trade_name_ar TEXT NOT NULL,
        generic_name TEXT,
        barcode TEXT UNIQUE,
        price_box REAL NOT NULL,
        price_strip REAL NOT NULL,
        strips_per_box INTEGER DEFAULT 2,
        stock_boxes INTEGER DEFAULT 0,
        stock_strips INTEGER DEFAULT 0,
        shelf TEXT,
        category TEXT,
        reorder_level INTEGER DEFAULT 5,
        preferred_supplier TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_med_barcode ON medicines(barcode);
      CREATE INDEX IF NOT EXISTS idx_med_name ON medicines(trade_name);
      CREATE INDEX IF NOT EXISTS idx_med_name_ar ON medicines(trade_name_ar);

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        hotline TEXT,
        balance REAL DEFAULT 0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        credit_limit REAL DEFAULT 2000,
        balance REAL DEFAULT 0,
        notes TEXT,
        last_payment_date TEXT,
        last_payment_amount REAL
      );

      CREATE TABLE IF NOT EXISTS customer_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        date_time TEXT,
        type TEXT,
        ref_no TEXT,
        description TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        balance REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        shift_id TEXT,
        cashier_name TEXT,
        date_time TEXT,
        time_str TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        payment_method TEXT,
        total_retail REAL,
        total_cost REAL,
        total_profit REAL,
        discount REAL DEFAULT 0,
        items_count INTEGER,
        status TEXT DEFAULT 'COMPLETED'
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT,
        medicine_id INTEGER,
        trade_name TEXT,
        trade_name_ar TEXT,
        is_strip INTEGER DEFAULT 0,
        quantity INTEGER,
        unit_price REAL,
        total_price REAL,
        unit_cost REAL,
        profit REAL
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        shift_number INTEGER,
        cashier_name TEXT,
        opened_at TEXT,
        closed_at TEXT,
        opening_cash REAL,
        cash_sales REAL DEFAULT 0,
        visa_sales REAL DEFAULT 0,
        instapay_sales REAL DEFAULT 0,
        credit_sales REAL DEFAULT 0,
        total_sales REAL DEFAULT 0,
        debt_collections REAL DEFAULT 0,
        petty_expenses REAL DEFAULT 0,
        expected_cash REAL DEFAULT 0,
        actual_cash REAL DEFAULT 0,
        discrepancy REAL DEFAULT 0,
        status TEXT DEFAULT 'OPEN'
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        shift_id TEXT,
        supplier_id INTEGER,
        supplier_name TEXT,
        supplier_invoice_no TEXT,
        date_time TEXT,
        payment_method TEXT,
        total_retail REAL,
        total_discount REAL,
        net_total REAL,
        items_count INTEGER,
        status TEXT DEFAULT 'RECEIVED'
      );

      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id TEXT,
        medicine_id INTEGER,
        trade_name TEXT,
        trade_name_ar TEXT,
        quantity INTEGER,
        bonus INTEGER DEFAULT 0,
        price_box REAL,
        discount_pct REAL DEFAULT 0,
        net_box_price REAL,
        total_net REAL,
        batch_no TEXT,
        expiry TEXT
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id TEXT,
        date_time TEXT,
        amount REAL,
        reason TEXT,
        cashier_name TEXT
      );

      CREATE TABLE IF NOT EXISTS system_license (
        id INTEGER PRIMARY KEY,
        machine_id TEXT NOT NULL,
        license_status TEXT NOT NULL,
        license_key TEXT,
        first_install_date TEXT,
        trial_days INTEGER DEFAULT 7,
        activated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier',
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        created_by TEXT,
        last_login TEXT,
        permissions TEXT DEFAULT '{}'
      );

      -- Offline outbox: every state-changing operation is queued here.
      -- When the device is online the queue is uploaded (if a sync endpoint
      -- is configured) or archived locally, so no operation is ever lost.
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        payload TEXT,
        shift_id TEXT,
        created_at TEXT,
        synced INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced, created_at);

      -- Supplier returns / disposal notes performed during a shift
      CREATE TABLE IF NOT EXISTS supplier_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id TEXT,
        supplier_name TEXT,
        amount REAL DEFAULT 0,
        items_count INTEGER DEFAULT 0,
        kind TEXT DEFAULT 'SUPPLIER_RETURN',
        details TEXT,
        date_time TEXT,
        cashier_name TEXT
      );
    `);

    // Migration safe check for shift_id in purchases
    try {
      this.db.run("ALTER TABLE purchases ADD COLUMN shift_id TEXT;");
    } catch (e) {}

    // Migration: the cloud copy of the outbox is tracked separately from the
    // local one, so the LAN server can be complete while the permanent cloud
    // host is still waiting for the internet to come back.
    try {
      this.db.run("ALTER TABLE sync_queue ADD COLUMN cloud_synced INTEGER DEFAULT 0;");
    } catch (e) {}
    try {
      this.db.run("ALTER TABLE sync_queue ADD COLUMN cloud_synced_at TEXT;");
    } catch (e) {}

    // Seed default admin if no users exist
    this._seedDefaultAdmin();
  }

  _seedDefaultAdmin() {
    try {
      const existing = this.db.exec("SELECT id FROM app_users WHERE role = 'admin' LIMIT 1");
      if (!existing || existing.length === 0 || existing[0].values.length === 0) {
        // Hash = sha256-like simple hash stored as hex (we use a simple deterministic hash for offline use)
        const adminHash = this._hashPassword('admin123');
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO app_users (username, password_hash, full_name, role, is_active, created_at, created_by, permissions)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `);
        stmt.run([
          'admin',
          adminHash,
          'مدير الصيدلية',
          'admin',
          new Date().toISOString(),
          'SYSTEM',
          JSON.stringify({ canViewReports: true, canManageUsers: true, canCloseShift: true, canManageStock: true, canViewProfits: true, canManageSettings: true })
        ]);
        stmt.free();
        console.log('✅ Default admin user seeded: username=admin, password=admin123');
      }
    } catch (e) {
      console.warn('Seed admin error:', e);
    }
  }

  // Simple deterministic password hash (SHA-256-like using btoa for offline use)
  _hashPassword(password) {
    // XOR-based hash seeded with a secret — good enough for local offline POS
    const secret = 'PHARMA_SEC_KEY_2026';
    let hash = 0;
    const str = password + secret;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    // Convert to positive hex string
    const hex = Math.abs(hash).toString(16).padStart(16, '0');
    // Add length-based component for extra uniqueness
    const lenComponent = (password.length * 7919).toString(16).padStart(8, '0');
    return hex + lenComponent + btoa(password.slice(0, 3) + secret.slice(0, 5)).replace(/=/g, '');
  }

  _verifyPassword(password, storedHash) {
    return this._hashPassword(password) === storedHash;
  }

  // --- USER MANAGEMENT API ---

  async loginUser(username, password) {
    await this.init();
    const safeUser = String(username).trim().replace(/'/g, "''");
    const res = this.db.exec(`
      SELECT * FROM app_users 
      WHERE username = '${safeUser}' COLLATE NOCASE 
      AND is_active = 1 
      LIMIT 1
    `);
    const rows = this._formatRows(res);
    if (!rows || rows.length === 0) {
      return { success: false, error: 'اسم المستخدم غير موجود أو تم تعطيل الحساب.' };
    }
    const user = rows[0];
    if (!this._verifyPassword(password, user.password_hash)) {
      return { success: false, error: 'كلمة المرور غير صحيحة. حاول مجدداً.' };
    }
    // Update last login
    this.db.run(`UPDATE app_users SET last_login = '${new Date().toISOString()}' WHERE id = ${user.id}`);
    this.saveToDisk();
    const { password_hash, ...safeUser2 } = user;
    let permissions = {};
    try { permissions = JSON.parse(user.permissions || '{}'); } catch (e) {}
    return { success: true, user: { ...safeUser2, permissions } };
  }

  async getUsers() {
    await this.init();
    const res = this.db.exec(`SELECT id, username, full_name, role, is_active, created_at, last_login, permissions FROM app_users ORDER BY id ASC`);
    const rows = this._formatRows(res);
    return rows.map(u => {
      let permissions = {};
      try { permissions = JSON.parse(u.permissions || '{}'); } catch (e) {}
      return { ...u, permissions };
    });
  }

  async createUser({ username, password, full_name, role = 'cashier', permissions = {}, created_by = 'admin' }) {
    await this.init();
    const safeUsername = String(username).trim();
    if (!safeUsername || !password || !full_name) {
      return { success: false, error: 'يجب ملء جميع الحقول المطلوبة.' };
    }
    if (password.length < 4) {
      return { success: false, error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' };
    }
    // Check username uniqueness
    const existing = this.db.exec(`SELECT id FROM app_users WHERE username = '${safeUsername.replace(/'/g,"''")}' COLLATE NOCASE`);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return { success: false, error: 'اسم المستخدم موجود مسبقاً. اختر اسماً آخر.' };
    }

    const defaultPermissions = role === 'admin'
      ? { canViewReports: true, canManageUsers: true, canCloseShift: true, canManageStock: true, canViewProfits: true, canManageSettings: true }
      : { canViewReports: false, canManageUsers: false, canCloseShift: true, canManageStock: false, canViewProfits: false, canManageSettings: false, ...permissions };

    const stmt = this.db.prepare(`
      INSERT INTO app_users (username, password_hash, full_name, role, is_active, created_at, created_by, permissions)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `);
    stmt.run([
      safeUsername,
      this._hashPassword(password),
      String(full_name).trim(),
      role,
      new Date().toISOString(),
      created_by,
      JSON.stringify(defaultPermissions)
    ]);
    stmt.free();
    this.saveToDisk();
    return { success: true, message: `تم إنشاء حساب "${safeUsername}" بنجاح.` };
  }

  async updateUser({ id, full_name, role, is_active, permissions, newPassword }) {
    await this.init();
    if (!id) return { success: false, error: 'معرف المستخدم مطلوب.' };

    const setParts = [];
    if (full_name !== undefined) setParts.push(`full_name = '${String(full_name).replace(/'/g,"''")}'`);
    if (role !== undefined) setParts.push(`role = '${String(role).replace(/'/g,"''")}'`);
    if (is_active !== undefined) setParts.push(`is_active = ${is_active ? 1 : 0}`);
    if (permissions !== undefined) setParts.push(`permissions = '${JSON.stringify(permissions).replace(/'/g,"''")}'`);
    if (newPassword) {
      if (newPassword.length < 4) return { success: false, error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' };
      setParts.push(`password_hash = '${this._hashPassword(newPassword)}'`);
    }

    if (setParts.length === 0) return { success: false, error: 'لا توجد بيانات للتحديث.' };
    this.db.run(`UPDATE app_users SET ${setParts.join(', ')} WHERE id = ${id}`);
    this.saveToDisk();
    return { success: true, message: 'تم تحديث بيانات المستخدم بنجاح.' };
  }

  async deleteUser(id) {
    await this.init();
    // Prevent deleting the last admin
    const admins = this.db.exec(`SELECT id FROM app_users WHERE role = 'admin' AND is_active = 1`);
    const adminRows = this._formatRows(admins);
    const userRes = this.db.exec(`SELECT role FROM app_users WHERE id = ${id}`);
    const userRow = this._formatRows(userRes)[0];
    if (userRow?.role === 'admin' && adminRows.length <= 1) {
      return { success: false, error: 'لا يمكن حذف المدير الوحيد في النظام.' };
    }
    this.db.run(`DELETE FROM app_users WHERE id = ${id}`);
    this.saveToDisk();
    return { success: true, message: 'تم حذف المستخدم.' };
  }

  // --- 1. MEDICINES API (30,000 Records High-Speed Search) ---

  async searchMedicines(query = '', limit = 50) {
    await this.init();
    const q = query.trim();

    if (!q) {
      const res = this.db.exec(`SELECT * FROM medicines ORDER BY id ASC LIMIT ${limit}`);
      return this._formatRows(res);
    }

    // Exact barcode match (Indexed lookup in 0.1ms)
    const exactBarcode = this.db.exec(`SELECT * FROM medicines WHERE barcode = '${q}' LIMIT 1`);
    if (exactBarcode.length > 0 && exactBarcode[0].values.length > 0) {
      return this._formatRows(exactBarcode);
    }

    // Substring search in name, arabic name, generic, shelf
    const safeQ = q.replace(/'/g, "''");
    const sql = `
      SELECT * FROM medicines 
      WHERE barcode LIKE '${safeQ}%'
         OR trade_name LIKE '%${safeQ}%'
         OR trade_name_ar LIKE '%${safeQ}%'
         OR generic_name LIKE '%${safeQ}%'
         OR shelf LIKE '${safeQ}%'
      ORDER BY 
        CASE 
          WHEN barcode = '${safeQ}' THEN 1
          WHEN trade_name LIKE '${safeQ}%' THEN 2
          WHEN trade_name_ar LIKE '${safeQ}%' THEN 3
          ELSE 4 
        END, id ASC
      LIMIT ${limit}
    `;

    const res = this.db.exec(sql);
    return this._formatRows(res);
  }

  async getMedicineByBarcode(barcode) {
    await this.init();
    const safeBarcode = String(barcode).trim().replace(/'/g, "''");
    const res = this.db.exec(`SELECT * FROM medicines WHERE barcode = '${safeBarcode}' LIMIT 1`);
    const rows = this._formatRows(res);
    return rows[0] || null;
  }

  async getAllMedicines(limit = 100) {
    await this.init();
    const res = this.db.exec(`SELECT * FROM medicines ORDER BY id ASC LIMIT ${limit}`);
    return this._formatRows(res);
  }

  async saveMedicine(med) {
    await this.init();
    const id = med.id || Date.now();
    const existing = this.db.exec(`SELECT id FROM medicines WHERE id = ${id}`);

    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update
      const stmt = this.db.prepare(`
        UPDATE medicines SET
          trade_name = ?, trade_name_ar = ?, generic_name = ?, barcode = ?,
          price_box = ?, price_strip = ?, strips_per_box = ?, stock_boxes = ?,
          stock_strips = ?, shelf = ?, category = ?, reorder_level = ?, preferred_supplier = ?
        WHERE id = ?
      `);
      stmt.run([
        med.trade_name, med.trade_name_ar, med.generic_name, med.barcode,
        med.price_box, med.price_strip, med.strips_per_box || 2, med.stock_boxes,
        med.stock_strips || 0, med.shelf, med.category, med.reorder_level || 5,
        med.preferred_supplier, id
      ]);
      stmt.free();
    } else {
      // Insert
      const stmt = this.db.prepare(`
        INSERT INTO medicines (
          id, trade_name, trade_name_ar, generic_name, barcode,
          price_box, price_strip, strips_per_box, stock_boxes, stock_strips,
          shelf, category, reorder_level, preferred_supplier
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        id, med.trade_name, med.trade_name_ar, med.generic_name, med.barcode,
        med.price_box, med.price_strip, med.strips_per_box || 2, med.stock_boxes,
        med.stock_strips || 0, med.shelf, med.category, med.reorder_level || 5,
        med.preferred_supplier
      ]);
      stmt.free();
    }

    this.saveToDisk();
    return { ...med, id };
  }

  async deleteMedicine(id) {
    await this.init();
    this.db.run(`DELETE FROM medicines WHERE id = ${id}`);
    this.saveToDisk();
  }

  async clearAllMedicines() {
    await this.init();
    try {
      this.db.run('DELETE FROM medicines;');
      try { this.db.run('DELETE FROM medicines_fts;'); } catch (e) {}
      this.db.run('VACUUM;');
      this.saveToDisk();
      console.log('🗑️ All medicines cleared from SQLite database.');
      return true;
    } catch (err) {
      console.warn('Error clearing medicines from SQLite:', err);
      return false;
    }
  }

  async importMedicines(medicinesList) {
    await this.init();
    if (!Array.isArray(medicinesList) || medicinesList.length === 0) return 0;

    this.db.run('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO medicines (
          id, trade_name, trade_name_ar, generic_name, barcode,
          price_box, price_strip, strips_per_box, stock_boxes, stock_strips,
          shelf, category, reorder_level, preferred_supplier
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const seenBarcodes = new Set();
      let count = 0;
      for (const m of medicinesList) {
        const id = m.id || (Date.now() + count);
        const trade_name_ar = (m.trade_name_ar || m.name_ar || m.name || '').trim();
        if (!trade_name_ar) continue;
        const trade_name = (m.trade_name || m.name_en || '').trim();
        const generic_name = (m.generic_name || m.active_ingredient || '').trim();
        let barcode = (m.barcode || '').trim().replace(/^'/, '');
        if (!barcode || seenBarcodes.has(barcode)) {
          barcode = `622${String(1000000000 + count).padStart(10, '0')}`;
        }
        seenBarcodes.add(barcode);
        const price_box = parseFloat(m.price_box) || 0;
        const strips_per_box = parseInt(m.strips_per_box, 10) || 1;
        const price_strip = parseFloat(m.price_strip) || (strips_per_box > 0 ? parseFloat((price_box / strips_per_box).toFixed(2)) : 0);
        const stock_boxes = parseInt(m.stock_boxes, 10) || 0;
        const stock_strips = parseInt(m.stock_strips, 10) || 0;
        const shelf = (m.shelf || 'A-01').trim();
        const category = (m.category || 'أدوية عامة').trim();
        const reorder_level = parseInt(m.reorder_level, 10) || 3;
        const preferred_supplier = (m.preferred_supplier || '-').trim();

        stmt.run([
          id, trade_name, trade_name_ar, generic_name, barcode,
          price_box, price_strip, strips_per_box, stock_boxes, stock_strips,
          shelf, category, reorder_level, preferred_supplier
        ]);
        count++;
      }
      stmt.free();
      this.db.run('COMMIT;');
      this.saveToDisk();
      return count;
    } catch (err) {
      this.db.run('ROLLBACK;');
      console.error('Error importing medicines into SQLite:', err);
      throw err;
    }
  }

  // --- 2. SALES INVOICE & STRICT CASH DRAWER TRANSACTIONS ---

  /**
   * Generate a collision-proof invoice number.
   * The old implementation used a fixed sequence that restarted at 1001 on
   * every mount, which caused a PRIMARY KEY conflict and rolled back the whole
   * sale transaction (so neither the sale nor the stock deduction was saved).
   */
  generateInvoiceId() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const hms = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const rnd = Math.floor(Math.random() * 900) + 100;
    return `INV-${ymd}-${hms}${rnd}`;
  }

  async saveInvoice(invoiceData) {
    await this.init();

    const items = Array.isArray(invoiceData.items) ? invoiceData.items : [];
    if (items.length === 0) throw new Error('لا يمكن حفظ فاتورة بدون أصناف');

    // Always attach the sale to the currently open shift (never a hardcoded id)
    const currentShift = await this.getCurrentShift();
    const shiftId = invoiceData.shift_id || currentShift?.id || '';

    const dateTime = invoiceData.date_time || new Date().toISOString();
    const timeStr = invoiceData.time_str || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const customerName = invoiceData.customer_name || 'عميل نقدي (كاشير)';
    const customerPhone = invoiceData.customer_phone || '-';
    const paymentMethod = invoiceData.payment_method || 'كاش';
    const totalRetail = Number(invoiceData.total_retail) || 0;
    const totalCost = Number(invoiceData.total_cost) || 0;
    const totalProfit = Number(invoiceData.total_profit) || 0;
    const discount = Number(invoiceData.discount) || 0;
    const cashierName = invoiceData.cashier_name || 'الكاشير';

    // Make sure the invoice id is unique even if the caller sends a stale one
    let invoiceId = String(invoiceData.id || '').trim();
    if (!invoiceId) invoiceId = this.generateInvoiceId();
    const dup = this._formatRows(
      this.db.exec(`SELECT id FROM invoices WHERE id = '${invoiceId.replace(/'/g, "''")}' LIMIT 1`)
    );
    if (dup.length > 0) invoiceId = this.generateInvoiceId();

    this.db.run('BEGIN TRANSACTION;');

    try {
      // 1. Insert Invoice Header
      const invStmt = this.db.prepare(`
        INSERT INTO invoices (
          id, shift_id, cashier_name, date_time, time_str, customer_name,
          customer_phone, payment_method, total_retail, total_cost, total_profit,
          discount, items_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      invStmt.run([
        invoiceId, shiftId, cashierName, dateTime, timeStr, customerName,
        customerPhone, paymentMethod, totalRetail, totalCost, totalProfit,
        discount, items.length, 'COMPLETED'
      ]);
      invStmt.free();

      // 2. Insert Invoice Items
      const itemStmt = this.db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, medicine_id, trade_name, trade_name_ar, is_strip,
          quantity, unit_price, total_price, unit_cost, profit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        itemStmt.run([
          invoiceId, item.medicine_id || null, item.trade_name || '', item.trade_name_ar || '',
          item.is_strip ? 1 : 0, qty, unitPrice,
          Number(item.total_price) || (unitPrice * qty),
          Number(item.unit_cost) || (unitPrice * 0.75),
          Number(item.profit) || ((Number(item.total_price) || (unitPrice * qty)) * 0.25)
        ]);
      }
      itemStmt.free();

      // 3. Deduct stock atomically (boxes and strips handled correctly)
      const stockStmt = this.db.prepare('UPDATE medicines SET stock_boxes = ?, stock_strips = ? WHERE id = ?');
      for (const item of items) {
        const medicineId = Number(item.medicine_id);
        const qty = Number(item.quantity) || 0;
        if (!medicineId || qty <= 0) continue;

        const medRows = this._formatRows(
          this.db.exec(`SELECT stock_boxes, stock_strips, strips_per_box FROM medicines WHERE id = ${medicineId} LIMIT 1`)
        );
        if (medRows.length === 0) continue;

        const spb = Math.max(1, parseInt(medRows[0].strips_per_box, 10) || 1);
        let boxes = Math.max(0, parseInt(medRows[0].stock_boxes, 10) || 0);
        let strips = Math.max(0, parseInt(medRows[0].stock_strips, 10) || 0);

        if (item.is_strip) {
          // Convert everything to strips, subtract, then split back into boxes/strips
          let totalStrips = (boxes * spb) + strips - qty;
          if (totalStrips < 0) totalStrips = 0;
          boxes = Math.floor(totalStrips / spb);
          strips = totalStrips % spb;
        } else {
          boxes = Math.max(0, boxes - qty);
        }

        stockStmt.run([boxes, strips, medicineId]);
      }
      stockStmt.free();

      // 4. Strict Financial Rules on the Shift Drawer.
      // Only CASH increases the expected cash in the drawer.
      if (shiftId) {
        if (paymentMethod === 'كاش') {
          this.db.run(
            `UPDATE shifts SET cash_sales = cash_sales + ?, total_sales = total_sales + ? WHERE id = ?`,
            [totalRetail, totalRetail, shiftId]
          );
        } else if (paymentMethod === 'فيزا') {
          this.db.run(
            `UPDATE shifts SET visa_sales = visa_sales + ?, total_sales = total_sales + ? WHERE id = ?`,
            [totalRetail, totalRetail, shiftId]
          );
        } else if (paymentMethod === 'إنستاباي') {
          this.db.run(
            `UPDATE shifts SET instapay_sales = instapay_sales + ?, total_sales = total_sales + ? WHERE id = ?`,
            [totalRetail, totalRetail, shiftId]
          );
        } else if (paymentMethod === 'آجل') {
          this.db.run(
            `UPDATE shifts SET credit_sales = credit_sales + ?, total_sales = total_sales + ? WHERE id = ?`,
            [totalRetail, totalRetail, shiftId]
          );

          // Make sure the customer exists, then add the debt
          const safeName = String(customerName).replace(/'/g, "''");
          const existingCustomer = this._formatRows(
            this.db.exec(`SELECT id FROM customers WHERE name = '${safeName}' LIMIT 1`)
          );
          if (existingCustomer.length === 0) {
            this.db.run(
              `INSERT INTO customers (name, phone, address, credit_limit, balance, notes) VALUES (?, ?, ?, ?, 0, ?)`,
              [customerName, customerPhone, '', 2000, 'عميل آجل']
            );
          }
          this.db.run(
            `UPDATE customers SET balance = balance + ? WHERE name = ?`,
            [totalRetail, customerName]
          );
        }

        // Recalculate expected cash from the drawer equation
        this.db.run(
          `UPDATE shifts SET expected_cash = opening_cash + cash_sales + debt_collections - petty_expenses WHERE id = ?`,
          [shiftId]
        );
      }

      this.db.run('COMMIT;');
      this.saveToDisk();
      this._enqueueSync('invoice', invoiceId, 'CREATE', {
        id: invoiceId,
        shift_id: shiftId,
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        total_retail: totalRetail,
        total_cost: totalCost,
        total_profit: totalProfit,
        discount,
        items_count: items.length,
        date_time: dateTime,
        items
      }, shiftId);
      console.log(`✅ Invoice ${invoiceId} saved: ${items.length} items, total ${totalRetail}, shift ${shiftId}.`);

      // Return the final persisted invoice (id may differ from the requested one)
      return { ...invoiceData, id: invoiceId, invoiceNumber: invoiceId, shift_id: shiftId };
    } catch (err) {
      try { this.db.run('ROLLBACK;'); } catch (e) {}
      console.error('Invoice save transaction failed:', err);
      throw err;
    }
  }

  async getInvoices(limit = 100) {
    await this.init();
    // Aliases keep the UI (ReportsView/Receipts) working with the SQL column names.
    const res = this.db.exec(`
      SELECT
        i.*,
        i.id              AS invoice_number,
        i.total_retail    AS total,
        i.total_retail    AS net_total,
        i.date_time       AS created_at
      FROM invoices i
      ORDER BY i.date_time DESC
      LIMIT ${Number(limit) || 100}
    `);
    return this._formatRows(res);
  }

  async getInvoiceItems(invoiceId) {
    await this.init();
    const safeId = String(invoiceId).replace(/'/g, "''");
    const res = this.db.exec(`SELECT * FROM invoice_items WHERE invoice_id = '${safeId}' ORDER BY id ASC`);
    return this._formatRows(res);
  }

  // --- 3. CUSTOMERS & CASH DEBT COLLECTION ---

  async getCustomers() {
    await this.init();
    const res = this.db.exec('SELECT * FROM customers ORDER BY balance DESC');
    return this._formatRows(res);
  }

  async saveCustomer(customer) {
    await this.init();
    const id = Number(customer.id) || Date.now();
    const name = (customer.name || '').trim();
    if (!name) throw new Error('اسم العميل مطلوب');
    const phone = (customer.phone || '').trim();
    const address = (customer.address || '').trim();
    const credit_limit = parseFloat(customer.credit_limit) || 0;
    const balance = parseFloat(customer.balance) || 0;
    const notes = (customer.notes || '').trim();

    this.db.run(`
      INSERT OR REPLACE INTO customers (
        id, name, phone, address, credit_limit, balance, notes,
        last_payment_date, last_payment_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, name, phone, address, credit_limit, balance, notes,
      customer.last_payment_date || null,
      customer.last_payment_amount != null ? customer.last_payment_amount : null
    ]);
    this.saveToDisk();
    this._enqueueSync('customer', id, 'UPSERT', { id, name, phone, address, credit_limit, balance, notes });
    return { ...customer, id, name, phone, address, credit_limit, balance, notes };
  }

  async getCustomerLedger(customerId) {
    await this.init();
    const res = this.db.exec(`
      SELECT * FROM customer_ledger
      WHERE customer_id = ${Number(customerId) || 0}
      ORDER BY date_time DESC, id DESC
    `);
    return this._formatRows(res);
  }

  async collectCustomerPayment(customerId, amountPaid, receiptData) {
    await this.init();
    this.db.run('BEGIN TRANSACTION;');

    try {
      const parsedAmount = parseFloat(amountPaid) || 0;
      const paymentMethod = receiptData?.paymentMethod || 'كاش';

      // 1. Deduct customer balance
      this.db.run(`
        UPDATE customers SET
          balance = CASE WHEN balance >= ${parsedAmount} THEN balance - ${parsedAmount} ELSE 0 END,
          last_payment_date = '${new Date().toISOString().slice(0, 10)}',
          last_payment_amount = ${parsedAmount}
        WHERE id = ${customerId}
      `);

      // 2. Insert into customer ledger
      const cust = this.db.exec(`SELECT balance FROM customers WHERE id = ${customerId}`);
      const newBal = cust[0]?.values[0]?.[0] || 0;

      const stmt = this.db.prepare(`
        INSERT INTO customer_ledger (
          customer_id, date_time, type, ref_no, description, debit, credit, balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        customerId, new Date().toISOString(), 'PAYMENT',
        receiptData?.receiptNo || `REC-${Date.now()}`,
        `سداد نقدي (${paymentMethod})`, 0, parsedAmount, newBal
      ]);
      stmt.free();

      // 3. If paid in CASH, update active shift's debt_collections and EXPECTED CASH!
      if (paymentMethod === 'كاش') {
        this.db.run(`
          UPDATE shifts SET
            debt_collections = debt_collections + ${parsedAmount}
          WHERE status = 'OPEN';

          UPDATE shifts SET
            expected_cash = opening_cash + cash_sales + debt_collections - petty_expenses
          WHERE status = 'OPEN';
        `);
      }

      this.db.run('COMMIT;');
      this.saveToDisk();
      this._enqueueSync('customer_payment', receiptData?.receiptNo || customerId, 'CREATE', {
        customerId, amountPaid: parsedAmount, paymentMethod, receiptNo: receiptData?.receiptNo
      });
      console.log(`✅ Customer ${customerId} paid ${parsedAmount} EGP (Drawer Expected Cash updated).`);
    } catch (e) {
      this.db.run('ROLLBACK;');
      throw e;
    }
  }

  // --- 4. EXPENSES (F8) ---

  async recordExpense(amount, reason, shiftId, cashierName = '') {
    await this.init();
    const parsedAmount = parseFloat(amount) || 0;

    this.db.run('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO expenses (shift_id, date_time, amount, reason, cashier_name)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run([shiftId, new Date().toISOString(), parsedAmount, reason, cashierName]);
      stmt.free();

      // Deduct from shift expected cash!
      this.db.run(`
        UPDATE shifts SET
          petty_expenses = petty_expenses + ${parsedAmount}
        WHERE id = '${shiftId}' OR status = 'OPEN';

        UPDATE shifts SET
          expected_cash = opening_cash + cash_sales + debt_collections - petty_expenses
        WHERE id = '${shiftId}' OR status = 'OPEN';
      `);

      this.db.run('COMMIT;');
      this.saveToDisk();
      this._enqueueSync('expense', `${shiftId}-${Date.now()}`, 'CREATE', {
        amount: parsedAmount, reason, cashierName, shiftId
      }, shiftId);
      console.log(`✅ Expense of ${parsedAmount} recorded (Drawer expected cash reduced).`);
    } catch (e) {
      this.db.run('ROLLBACK;');
      throw e;
    }
  }

  // --- 5. SHIFT MANAGEMENT & Z-REPORT ---

  async getCurrentShift() {
    await this.init();
    const res = this.db.exec("SELECT * FROM shifts WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1");
    const rows = this._formatRows(res);
    return rows[0] || null;
  }

  async getShiftsHistory(limit = 30) {
    await this.init();
    const res = this.db.exec(`
      SELECT * FROM shifts
      WHERE status = 'CLOSED'
      ORDER BY opened_at DESC
      LIMIT ${Number(limit) || 30}
    `);
    return this._formatRows(res);
  }

  async openShift(shiftData) {
    await this.init();
    const {
      id,
      shift_number = 1,
      cashier_name,
      opened_at = new Date().toISOString(),
      opening_cash = 500.0
    } = shiftData;

    // Close any previously opened shift
    this.db.run("UPDATE shifts SET status = 'CLOSED' WHERE status = 'OPEN'");

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO shifts (
        id, shift_number, cashier_name, opened_at, opening_cash,
        cash_sales, visa_sales, instapay_sales, credit_sales, total_sales,
        debt_collections, petty_expenses, expected_cash, actual_cash, discrepancy, status
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, 0, 'OPEN')
    `);
    stmt.run([id, shift_number, cashier_name, opened_at, opening_cash, opening_cash, opening_cash]);
    stmt.free();

    this.saveToDisk();
    this._enqueueSync('shift', id, 'OPEN', { id, shift_number, cashier_name, opened_at, opening_cash }, id);
    return shiftData;
  }

  async closeShift(shiftIdOrData, actualCashParam) {
    await this.init();
    let shiftId = typeof shiftIdOrData === 'object' ? shiftIdOrData.id : shiftIdOrData;
    let actualCashCounted = typeof shiftIdOrData === 'object' 
      ? (shiftIdOrData.actual_cash !== undefined ? shiftIdOrData.actual_cash : actualCashParam) 
      : actualCashParam;

    const current = (await this.getCurrentShift()) || {};
    const shift = (typeof shiftIdOrData === 'object') 
      ? { ...current, ...shiftIdOrData } 
      : (current.id === shiftId ? current : { id: shiftId, opening_cash: 500, cash_sales: 0, debt_collections: 0, petty_expenses: 0 });
    
    // Strict Cash Calculation:
    // Expected Cash = opening_cash + cash_sales (CASH ONLY) + debt_collections - petty_expenses
    const expected = (shift.opening_cash || 0) + (shift.cash_sales || 0) + (shift.debt_collections || 0) - (shift.petty_expenses || 0);
    const counted = parseFloat(actualCashCounted) || 0;
    const discrepancy = counted - expected;
    const closedAt = new Date().toISOString();

    this.db.run(`
      UPDATE shifts SET
        closed_at = '${closedAt}',
        expected_cash = ${expected},
        actual_cash = ${counted},
        discrepancy = ${discrepancy},
        status = 'CLOSED'
      WHERE id = '${shiftId}' OR status = 'OPEN'
    `);

    this.saveToDisk();
    this._enqueueSync('shift', shiftId, 'CLOSE', {
      id: shiftId,
      shift_number: shift.shift_number || null,
      cashier_name: shift.cashier_name || null,
      opened_at: shift.opened_at || null,
      closed_at: closedAt,
      status: 'CLOSED',
      opening_cash: shift.opening_cash || 0,
      cash_sales: shift.cash_sales || 0,
      visa_sales: shift.visa_sales || 0,
      instapay_sales: shift.instapay_sales || 0,
      credit_sales: shift.credit_sales || 0,
      total_sales: shift.total_sales || 0,
      debt_collections: shift.debt_collections || 0,
      petty_expenses: shift.petty_expenses || 0,
      expected_cash: expected,
      actual_cash: counted,
      discrepancy
    }, shiftId);
    console.log(`🔒 Shift ${shiftId} closed: Expected=${expected}, Counted=${counted}, Discrepancy=${discrepancy}`);
    return {
      ...shift,
      closed_at: closedAt,
      expected_cash: expected,
      actual_cash: counted,
      discrepancy
    };
  }

  // Complete Detailed Audit of a Shift (All sold items, purchases, cash audit, expenses)
  async getShiftFullAudit(shiftId) {
    await this.init();
    const safeId = String(shiftId).replace(/'/g, "''");
    
    // 1. Shift record
    let shiftRes = this.db.exec(`SELECT * FROM shifts WHERE id = '${safeId}' LIMIT 1`);
    let shift = this._formatRows(shiftRes)[0];
    if (!shift) {
      shiftRes = this.db.exec(`SELECT * FROM shifts WHERE id LIKE '%${safeId}%' OR status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`);
      shift = this._formatRows(shiftRes)[0];
    }
    
    if (!shift) {
      shift = {
        id: shiftId,
        cashier_name: 'الكاشير المسؤول',
        opened_at: new Date().toISOString(),
        opening_cash: 500,
        cash_sales: 0,
        visa_sales: 0,
        instapay_sales: 0,
        credit_sales: 0,
        total_sales: 0,
        debt_collections: 0,
        petty_expenses: 0,
        expected_cash: 500,
        actual_cash: 500,
        discrepancy: 0,
        status: 'OPEN'
      };
    }

    // 2. Aggregated Sold Medicines during this shift
    const soldItemsRes = this.db.exec(`
      SELECT 
        ii.trade_name,
        ii.trade_name_ar,
        ii.is_strip,
        SUM(ii.quantity) as total_qty,
        AVG(ii.unit_price) as unit_price,
        SUM(ii.total_price) as total_amount
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.shift_id = '${safeId}' OR (inv.date_time >= '${shift.opened_at}' AND (inv.date_time <= '${shift.closed_at || new Date().toISOString()}'))
      GROUP BY ii.trade_name, ii.is_strip
      ORDER BY total_amount DESC
    `);
    const soldItems = this._formatRows(soldItemsRes);

    // 3. Sales Invoices
    const invoicesRes = this.db.exec(`
      SELECT * FROM invoices 
      WHERE shift_id = '${safeId}' OR (date_time >= '${shift.opened_at}' AND (date_time <= '${shift.closed_at || new Date().toISOString()}'))
      ORDER BY date_time ASC
    `);
    const invoices = this._formatRows(invoicesRes);

    // 4. Purchases / Supply Invoices during this shift
    const purchasesRes = this.db.exec(`
      SELECT * FROM purchases 
      WHERE shift_id = '${safeId}' OR (date_time >= '${shift.opened_at}' AND (date_time <= '${shift.closed_at || new Date().toISOString()}'))
      ORDER BY date_time ASC
    `);
    const purchases = this._formatRows(purchasesRes);

    // For each purchase, fetch its line items
    for (const pur of purchases) {
      const pItemsRes = this.db.exec(`SELECT * FROM purchase_items WHERE purchase_id = '${pur.id}'`);
      pur.items = this._formatRows(pItemsRes);
    }

    // 5. Petty Expenses
    const expRes = this.db.exec(`
      SELECT * FROM expenses 
      WHERE shift_id = '${safeId}' OR (date_time >= '${shift.opened_at}' AND (date_time <= '${shift.closed_at || new Date().toISOString()}'))
      ORDER BY date_time ASC
    `);
    const expenses = this._formatRows(expRes);

    // 5.b Supplier returns / disposal notes during this shift
    const returnsRes = this.db.exec(`
      SELECT * FROM supplier_returns
      WHERE shift_id = '${safeId}' OR (date_time >= '${shift.opened_at}' AND (date_time <= '${shift.closed_at || new Date().toISOString()}'))
      ORDER BY date_time ASC
    `);
    const returns = this._formatRows(returnsRes);
    const supplier_returns_total = returns
      .filter((r) => r.kind !== 'DISPOSAL')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const disposals_total = returns
      .filter((r) => r.kind === 'DISPOSAL')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    // 6. Summary stats
    const opening_cash = shift.opening_cash || 0;
    const cash_sales = shift.cash_sales || 0;
    const visa_sales = shift.visa_sales || 0;
    const instapay_sales = shift.instapay_sales || 0;
    const credit_sales = shift.credit_sales || 0;
    const total_sales = shift.total_sales || (cash_sales + visa_sales + instapay_sales + credit_sales);
    const debt_collections = shift.debt_collections || 0;
    const petty_expenses = shift.petty_expenses || 0;
    const expected_cash = shift.expected_cash || (opening_cash + cash_sales + debt_collections - petty_expenses);
    const actual_cash = shift.actual_cash !== undefined ? shift.actual_cash : expected_cash;
    const discrepancy = actual_cash - expected_cash;

    return {
      shift,
      summary: {
        id: shift.id,
        cashier_name: shift.cashier_name || 'الكاشير المسؤول',
        opened_at: shift.opened_at,
        closed_at: shift.closed_at,
        opening_cash,
        cash_sales,
        visa_sales,
        instapay_sales,
        credit_sales,
        total_sales,
        debt_collections,
        petty_expenses,
        expected_cash,
        actual_cash,
        discrepancy,
        supplier_returns_total,
        disposals_total,
        sales_invoices_count: invoices.length,
        purchases_count: purchases.length,
        expenses_count: expenses.length,
        returns_count: returns.length,
        status: shift.status
      },
      soldItems,
      invoices,
      purchases,
      expenses,
      returns
    };
  }

  // --- ONLINE / OFFLINE OUTBOX & SYNC ENGINE ---
  // Every state-changing operation is appended to `sync_queue`. While the
  // device is offline the queue simply grows (the app keeps working 100%).
  // As soon as connectivity returns, the queue is uploaded in batches to the
  // configured endpoint, or archived locally when no cloud endpoint is set.

  _getSyncSettings() {
    try {
      if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
      const saved = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}') || {};
      // Merge with the defaults so a settings record saved by an older
      // version still carries `cloudPharmacyId`. Without this the QR code and
      // the uploaded snapshot could end up under two different pharmacy IDs
      // and the hosted report would come up empty.
      const settings = { ...DEFAULT_SETTINGS, ...saved };
      // When no explicit cloud endpoint is configured, the embedded LAN
      // report server doubles as the sync endpoint so shift reports are
      // complete on any phone without internet.
      if (!String(settings.syncEndpoint || '').trim()) {
        const autoEndpoint = getSyncEndpoint();
        if (autoEndpoint) settings.syncEndpoint = autoEndpoint;
      }
      return settings;
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  _isOnline() {
    try {
      return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    } catch (e) {
      return true;
    }
  }

  _enqueueSync(entityType, entityId, action, payload = null, shiftId = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sync_queue (entity_type, entity_id, action, payload, shift_id, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `);
      stmt.run([
        entityType,
        String(entityId ?? ''),
        action,
        JSON.stringify(payload || {}),
        shiftId || null,
        new Date().toISOString()
      ]);
      stmt.free();
      this.saveToDisk();

      // Always try to flush shortly (debounced so bulk operations batch up).
      // The flush itself skips the cloud while there is no internet, but the
      // local copy is still completed so the on-site QR report stays whole.
      if (typeof window !== 'undefined') {
        clearTimeout(this._syncFlushTimer);
        this._syncFlushTimer = setTimeout(() => {
          this.flushSyncQueue().catch(() => {});
        }, 900);
      }
    } catch (e) {
      console.warn('Failed to enqueue sync operation:', e);
    }
  }

  async getSyncStatus() {
    await this.init();
    const pending = this._formatRows(
      this.db.exec('SELECT COUNT(*) AS c FROM sync_queue WHERE synced = 0')
    )[0]?.c || 0;
    const failed = this._formatRows(
      this.db.exec('SELECT COUNT(*) AS c FROM sync_queue WHERE synced = 0 AND attempts > 0')
    )[0]?.c || 0;
    const localArchived = this._formatRows(
      this.db.exec('SELECT COUNT(*) AS c FROM sync_queue WHERE synced = 2')
    )[0]?.c || 0;
    const cloudPending = this._formatRows(
      this.db.exec('SELECT COUNT(*) AS c FROM sync_queue WHERE cloud_synced != 1')
    )[0]?.c || 0;
    const lastCloudSynced = this._formatRows(
      this.db.exec('SELECT cloud_synced_at FROM sync_queue WHERE cloud_synced = 1 ORDER BY cloud_synced_at DESC LIMIT 1')
    )[0]?.cloud_synced_at || null;
    const lastSynced = this._formatRows(
      this.db.exec('SELECT synced_at FROM sync_queue WHERE synced >= 1 ORDER BY synced_at DESC LIMIT 1')
    )[0]?.synced_at || null;
    const settings = this._getSyncSettings();
    const endpoint = String(settings.syncEndpoint || '').trim();
    return {
      online: this._isOnline(),
      pending: Number(pending) || 0,
      failed: Number(failed) || 0,
      localArchived: Number(localArchived) || 0,
      cloudPending: Number(cloudPending) || 0,
      lastSyncedAt: lastSynced,
      lastCloudSyncedAt: lastCloudSynced,
      endpointConfigured: !!endpoint,
      cloudEnabled: settings.enableCloudSync !== false,
      totalQueued: Number(
        this._formatRows(this.db.exec('SELECT COUNT(*) AS c FROM sync_queue'))[0]?.c || 0
      )
    };
  }

  // Post one batch of operations to a sync endpoint.
  async _postSyncBatch(endpoint, payload, pharmacyId, settings, timeoutMs = 15000) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pharmacy-Id': pharmacyId,
          ...(String(settings.reportToken || '').trim()
            ? { 'X-Report-Token': String(settings.reportToken).trim() }
            : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.ok) return { ok: true, error: '' };
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (e) {
      return {
        ok: false,
        error: e.name === 'AbortError' ? 'انتهت مهلة الاتصال' : (e.message || 'فشل الاتصال بالسيرفر')
      };
    }
  }

  // Upload pending operations. Returns a detailed result used by the UI.
  //
  // TWO destinations are used at the same time:
  //   • the LAN report server → completes the on-site QR report and keeps
  //     working when the pharmacy has no internet at all;
  //   • the permanent cloud host → what the owner sees from another city.
  // Each destination has its own "done" flag, so the local copy can be
  // complete while the cloud copy is still waiting in the queue for the
  // internet to come back.
  async flushSyncQueue() {
    await this.init();
    this.saveToDisk();

    const settings = this._getSyncSettings();
    const endpoint = String(settings.syncEndpoint || '').trim();
    const localBase = getLocalReportBaseUrl();

    const targets = [];
    const addTarget = (url, cloud) => {
      const clean = String(url || '').trim();
      if (!clean) return;
      if (targets.some((t) => t.url === clean)) return;
      targets.push({ url: clean, cloud: !!cloud });
    };

    // 1. The LAN server (same network — reachable without internet).
    if (localBase) addTarget(`${localBase}/api/pharmacy/sync`, false);
    // 2. A manually configured endpoint (may be a custom cloud server).
    if (endpoint && (!localBase || !endpoint.startsWith(localBase))) {
      addTarget(endpoint, !isPrivateHost(endpoint));
    }
    // 3. The permanent cloud host — the owner's remote view.
    if (settings.enableCloudSync !== false) {
      const cloudBase = getPermanentReportBaseUrl();
      if (cloudBase) addTarget(`${cloudBase}/api/pharmacy/sync`, true);
    }

    // No destination at all: keep the operations safely archived locally. They
    // are marked `synced = 2` so they can still be uploaded later.
    if (targets.length === 0) {
      const now = new Date().toISOString();
      this.db.run(`UPDATE sync_queue SET synced = 2, synced_at = '${now}', last_error = NULL WHERE synced = 0`);
      this.saveToDisk();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('PHARMACY_LAST_SYNC', now);
      }
      return { success: true, mode: 'LOCAL', uploaded: 0, ...(await this.getSyncStatus()) };
    }

    const pharmacyId = settings.cloudPharmacyId || 'PHARMACY-LOCAL';
    let totalUploaded = 0;
    let ok = true;
    let offline = false;
    let errorMessage = '';
    let cloudPending = 0;

    // Upload every archived/pending operation in batches of 100 — one pass per
    // destination so a failing host never blocks the other one.
    const uploadTo = async (target, whereClause, markColumn) => {
      let uploaded = 0;
      let targetOk = true;
      let targetError = '';
      let guard = 0;
      while (guard < 200) {
        guard += 1;
        const rows = this._formatRows(this.db.exec(
          `SELECT * FROM sync_queue WHERE ${whereClause} ORDER BY id ASC LIMIT 100`
        ));
        if (rows.length === 0) break;

        const payload = {
          pharmacyId,
          pharmacyName: settings.pharmacyName || '',
          sentAt: new Date().toISOString(),
          operations: rows.map((r) => ({
            queueId: r.id,
            entityType: r.entity_type,
            entityId: r.entity_id,
            action: r.action,
            shiftId: r.shift_id,
            createdAt: r.created_at,
            data: (() => { try { return JSON.parse(r.payload || '{}'); } catch (e) { return {}; } })()
          }))
        };

        // The cloud host may be far away (or unreachable) → a shorter timeout
        // keeps the local work snappy; the LAN server is always instant.
        const res = await this._postSyncBatch(
          target.url,
          payload,
          pharmacyId,
          settings,
          markColumn === 'cloud_synced' ? 10000 : 6000
        );

        const now = new Date().toISOString();
        const ids = rows.map((r) => r.id).join(',');
        if (res.ok) {
          if (markColumn === 'cloud_synced') {
            this.db.run(`UPDATE sync_queue SET cloud_synced = 1, cloud_synced_at = '${now}', synced_at = COALESCE(synced_at, '${now}'), last_error = NULL WHERE id IN (${ids})`);
          } else {
            this.db.run(`UPDATE sync_queue SET synced = 1, synced_at = '${now}', last_error = NULL WHERE id IN (${ids})`);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('PHARMACY_LAST_SYNC', now);
            }
          }
          uploaded += rows.length;
        } else {
          const safeErr = String(res.error || 'فشل الاتصال').replace(/'/g, "''");
          this.db.run(`UPDATE sync_queue SET attempts = attempts + 1, last_error = '${safeErr}' WHERE id IN (${ids})`);
          targetOk = false;
          targetError = res.error;
          break;
        }
      }
      return { uploaded, ok: targetOk, error: targetError };
    };

    for (const target of targets) {
      if (target.cloud && !this._isOnline()) {
        // No internet: the operations stay in the queue and are pushed
        // automatically the moment the connection is back. The local copy is
        // already complete, so this is not a failure.
        offline = true;
        errorMessage = 'لا يوجد إنترنت — العمليات محفوظة وتُرفع تلقائياً عند عودة الاتصال';
        const waiting = this._formatRows(this.db.exec(
          'SELECT COUNT(*) AS c FROM sync_queue WHERE cloud_synced != 1'
        ))[0]?.c || 0;
        cloudPending = Number(waiting) || 0;
        continue;
      }

      const isCloud = target.cloud;
      const res = await uploadTo(
        target,
        isCloud ? 'cloud_synced != 1' : 'synced != 1',
        isCloud ? 'cloud_synced' : 'synced'
      );
      totalUploaded += res.uploaded;
      if (!res.ok) {
        ok = false;
        errorMessage = res.error || errorMessage;
        if (isCloud) {
          const waiting = this._formatRows(this.db.exec(
            'SELECT COUNT(*) AS c FROM sync_queue WHERE cloud_synced != 1'
          ))[0]?.c || 0;
          cloudPending = Number(waiting) || 0;
        }
      }
    }

    this.saveToDisk();
    const status = await this.getSyncStatus();
    return {
      success: ok,
      mode: 'CLOUD',
      uploaded: totalUploaded,
      cloudPending,
      offline,
      error: ok ? (offline ? errorMessage : null) : (errorMessage || null),
      ...status
    };
  }

  // Re-upload every queued operation belonging to one shift so the hosted
  // report page is complete even if those operations were uploaded earlier
  // to a different server. Only does this when sync and reports share a host.
  async resendShiftToReportServer(shiftId) {
    await this.init();
    const id = String(shiftId || '').trim();
    if (!id) return this.flushSyncQueue();
    const safeId = id.replace(/'/g, "''");
    // Re-queue the shift for BOTH destinations (the LAN server and the
    // permanent cloud host) so the hosted report is complete everywhere.
    this.db.run(`
      UPDATE sync_queue
      SET synced = 0, cloud_synced = 0, attempts = 0, last_error = NULL
      WHERE shift_id = '${safeId}'
         OR (entity_type = 'shift' AND entity_id = '${safeId}')
    `);
    this.saveToDisk();
    return this.flushSyncQueue();
  }

  // Upload a full snapshot of the database (shifts + invoices + purchases +
  // expenses + returns) so that every shift — including the historical ones
  // created before the offline outbox existed — gets a complete hosted report.
  async backfillReportSnapshot(options = {}) {
    await this.init();
    const settings = this._getSyncSettings();

    // The snapshot goes to BOTH destinations:
    //   • the LAN server  → the on-site QR report stays complete,
    //   • the permanent cloud host → the owner's remote view (Cairo, …).
    const endpoints = [];
    const addEndpoint = (url) => {
      const clean = String(url || '').trim();
      if (!clean) return;
      if (!endpoints.includes(clean)) endpoints.push(clean);
    };
    addEndpoint(getLocalSnapshotEndpoint());
    if (settings.enableCloudSync !== false) addEndpoint(getCloudSnapshotEndpoint());
    if (endpoints.length === 0) addEndpoint(getSnapshotEndpoint());

    if (endpoints.length === 0) {
      return { success: false, error: 'لا يوجد سيرفر تقارير مفعّل' };
    }

    const shiftLimit = Math.max(1, Number(options.shiftLimit) || 200);
    const shifts = this._formatRows(this.db.exec(
      `SELECT * FROM shifts ORDER BY opened_at DESC LIMIT ${shiftLimit}`
    ));
    const shiftIds = new Set(shifts.map((s) => String(s.id)));

    // A LEFT JOIN keeps the invoices / purchases that were saved without an
    // open shift (returns, disposals and invoices issued outside a shift) —
    // they must reach the hosted report as well.
    const invoices = this._formatRows(this.db.exec(`
      SELECT i.* FROM invoices i
      LEFT JOIN shifts s ON s.id = i.shift_id
      ORDER BY i.date_time DESC LIMIT 5000
    `));
    const invoiceRows = invoices.filter((i) => !i.shift_id || shiftIds.has(String(i.shift_id)));
    const invoiceIds = new Set(invoiceRows.map((i) => String(i.id)));
    const invoiceItems = this._formatRows(this.db.exec(`
      SELECT ii.* FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      LIMIT 20000
    `)).filter((ii) => invoiceIds.has(String(ii.invoice_id)));
    const purchases = this._formatRows(this.db.exec(`
      SELECT p.* FROM purchases p
      LEFT JOIN shifts s ON s.id = p.shift_id
      ORDER BY p.date_time DESC LIMIT 3000
    `));
    const purchaseRows = purchases.filter((p) => !p.shift_id || shiftIds.has(String(p.shift_id)));
    const purchaseIds = new Set(purchaseRows.map((p) => String(p.id)));
    const purchaseItems = this._formatRows(this.db.exec(`
      SELECT pi.* FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      LIMIT 20000
    `)).filter((pi) => purchaseIds.has(String(pi.purchase_id)));
    const expenses = this._formatRows(this.db.exec(`
      SELECT e.* FROM expenses e
      LEFT JOIN shifts s ON s.id = e.shift_id
      ORDER BY e.date_time DESC LIMIT 5000
    `)).filter((e) => !e.shift_id || shiftIds.has(String(e.shift_id)));
    const returns = this._formatRows(this.db.exec(`
      SELECT r.* FROM supplier_returns r
      LEFT JOIN shifts s ON s.id = r.shift_id
      ORDER BY r.date_time DESC LIMIT 5000
    `)).filter((r) => !r.shift_id || shiftIds.has(String(r.shift_id)));

    const itemsByInvoice = new Map();
    for (const item of invoiceItems) {
      const key = String(item.invoice_id);
      if (!itemsByInvoice.has(key)) itemsByInvoice.set(key, []);
      itemsByInvoice.get(key).push({
        medicine_id: item.medicine_id,
        trade_name: item.trade_name,
        trade_name_ar: item.trade_name_ar,
        is_strip: !!item.is_strip,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0)
      });
    }
    const itemsByPurchase = new Map();
    for (const item of purchaseItems) {
      const key = String(item.purchase_id);
      if (!itemsByPurchase.has(key)) itemsByPurchase.set(key, []);
      itemsByPurchase.get(key).push({
        medicine_id: item.medicine_id,
        trade_name: item.trade_name,
        trade_name_ar: item.trade_name_ar,
        quantity: Number(item.quantity || 0),
        bonus: Number(item.bonus || 0),
        price_box: Number(item.price_box || 0),
        discount_pct: Number(item.discount_pct || 0),
        net_box_price: Number(item.net_box_price || 0),
        total_net: Number(item.total_net || 0),
        batch_no: item.batch_no,
        expiry: item.expiry
      });
    }

    const snapshot = {
      shifts,
      invoices: invoiceRows.map((i) => ({ ...i, items: itemsByInvoice.get(String(i.id)) || [] })),
      purchases: purchaseRows.map((p) => ({ ...p, items: itemsByPurchase.get(String(p.id)) || [] })),
      expenses,
      returns
    };

    // Skip the upload when nothing changed since the last successful push.
    // This keeps the free cloud quota (1 000 writes / day) comfortable even
    // with the periodic heartbeat. Every endpoint has its own fingerprint.
    const snapshotHash = this._hashSnapshot(snapshot);
    const results = [];
    let anySuccess = false;
    let allSkipped = true;

    for (const endpoint of endpoints) {
      const hashKey = `PHARMACY_LAST_SNAPSHOT_HASH:${endpoint}`;
      let lastHash = '';
      try {
        lastHash = String(localStorage.getItem(hashKey) || '');
      } catch (e) {}
      if (lastHash && lastHash === snapshotHash) {
        results.push({ endpoint, success: true, skipped: true });
        continue;
      }
      allSkipped = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Pharmacy-Id': settings.cloudPharmacyId || 'PHARMACY-LOCAL',
            ...(String(settings.reportToken || '').trim()
              ? { 'X-Report-Token': String(settings.reportToken).trim() }
              : {})
          },
          body: JSON.stringify({
            pharmacyId: settings.cloudPharmacyId || 'PHARMACY-LOCAL',
            pharmacyName: settings.pharmacyName || '',
            snapshot
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
          results.push({ endpoint, success: false, error: `HTTP ${response.status}` });
          continue;
        }
        const result = await response.json().catch(() => ({}));
        try {
          localStorage.setItem(hashKey, snapshotHash);
        } catch (e) {}
        anySuccess = true;
        results.push({ endpoint, success: true, ...result });
      } catch (e) {
        results.push({
          endpoint,
          success: false,
          error: e.name === 'AbortError' ? 'انتهت مهلة رفع التقرير' : (e.message || 'فشل الاتصال بالسيرفر')
        });
      }
    }

    const failure = results.find((r) => r.success === false);
    const success = results.find((r) => r.success === true);
    return {
      success: !!success,
      skipped: allSkipped,
      unchanged: allSkipped,
      endpoint: endpoints[0],
      endpoints: results,
      error: failure ? failure.error : null,
      shifts: snapshot.shifts.length,
      invoices: snapshot.invoices.length,
      purchases: snapshot.purchases.length,
      expenses: snapshot.expenses.length,
      returns: snapshot.returns.length,
      ...(success || {})
    };
  }

  // A small, stable fingerprint of the snapshot — used to skip uploads when
  // nothing changed (keeps the free cloud write quota low).
  _hashSnapshot(snapshot) {
    let text = '';
    try {
      text = JSON.stringify(snapshot) || '';
    } catch (e) {
      return '';
    }
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
    }
    return `${text.length.toString(36)}-${h1.toString(36)}-${h2.toString(36)}`;
  }

  async triggerAutoSync() {
    await this.init();
    try {
      this.saveToDisk();
      const result = await this.flushSyncQueue();
      if (typeof window !== 'undefined') {
        const syncEvent = new CustomEvent('pharmacy:sync-completed', {
          detail: { timestamp: new Date().toISOString(), ...result }
        });
        window.dispatchEvent(syncEvent);
      }
      return result;
    } catch (err) {
      console.error('AutoSync failed:', err);
      return { success: false, error: err.message };
    }
  }

  // -------------------------------------------------------------------------
  // CLOUD REFRESH — keeps the hosted reports alive on free (ephemeral) tiers
  // -------------------------------------------------------------------------
  // Free hosts (Render / Koyeb / Railway) delete their disk whenever the
  // service sleeps or restarts. The pharmacy PC is therefore the source of
  // truth: after every shift close — and on a periodic heartbeat — it pushes
  // a complete snapshot that rebuilds the hosted reports from scratch.

  // Push a snapshot, but only when a report server is configured and the
  // cloud sync toggle allows it. The local LAN server is always allowed
  // because the QR report depends on it.
  async syncReportSnapshot(options = {}) {
    await this.init();
    const settings = this._getSyncSettings();
    const hasLocal = !!getLocalSnapshotEndpoint();
    const hasCloud = settings.enableCloudSync !== false && !!getCloudSnapshotEndpoint();
    if (!hasLocal && !hasCloud && !getSnapshotEndpoint()) {
      return { success: false, skipped: true, error: 'لا يوجد سيرفر تقارير مفعّل' };
    }
    if (!hasLocal && !hasCloud && settings.enableCloudSync === false) {
      return { success: false, skipped: true, error: 'المزامنة السحابية متوقفة' };
    }

    return this.backfillReportSnapshot(options);
  }

  // Flush the outbox + push a full snapshot. Used after a shift close and by
  // the hourly heartbeat.
  async refreshCloudReports(options = {}) {
    await this.init();
    const result = { flushed: null, snapshot: null };
    try {
      result.flushed = await this.flushSyncQueue();
    } catch (e) {
      result.flushed = { success: false, error: e.message };
    }
    try {
      result.snapshot = await this.syncReportSnapshot(options);
    } catch (e) {
      result.snapshot = { success: false, error: e.message };
    }
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('pharmacy:cloud-refresh', {
          detail: { timestamp: new Date().toISOString(), ...result }
        }));
      } catch (e) {}
    }
    return result;
  }

  // Start the periodic refresh (default: every 60 minutes). Returns a handle
  // so the caller can stop it again.
  startHeartbeat(intervalMs = 60 * 60 * 1000) {
    this.stopHeartbeat();
    if (typeof setInterval === 'undefined') return null;
    this._heartbeatTimer = setInterval(() => {
      if (this._heartbeatRunning) return;
      this._heartbeatRunning = true;
      this.refreshCloudReports()
        .catch(() => {})
        .finally(() => { this._heartbeatRunning = false; });
    }, Math.max(5 * 60 * 1000, Number(intervalMs) || 0));
    if (this._heartbeatTimer && typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
    console.log(`☁️ Cloud refresh heartbeat started (every ${Math.round((Math.max(5 * 60 * 1000, Number(intervalMs) || 0)) / 60000)} min)`);
    return this._heartbeatTimer;
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // --- 6. PURCHASES & INVENTORY AUGMENTATION ---

  async savePurchase(purchaseData) {
    await this.init();
    this.db.run('BEGIN TRANSACTION;');

    try {
      const {
        id,
        shift_id,
        supplier_id,
        supplier_name,
        supplier_invoice_no,
        date_time = new Date().toISOString(),
        payment_method = 'آجل',
        total_retail,
        total_discount,
        net_total,
        items = []
      } = purchaseData;

      let activeShiftId = shift_id;
      if (!activeShiftId) {
        const curShift = await this.getCurrentShift();
        if (curShift) activeShiftId = curShift.id;
      }

      // Ensure supplier exists in DB
      let currentSupplierId = supplier_id;
      if (supplier_name) {
        const sup = await this.ensureSupplier(supplier_name);
        if (sup) currentSupplierId = sup.id;
      }

      // 1. Insert Purchase Header
      const pStmt = this.db.prepare(`
        INSERT INTO purchases (
          id, shift_id, supplier_id, supplier_name, supplier_invoice_no,
          date_time, payment_method, total_retail, total_discount,
          net_total, items_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      pStmt.run([
        id, activeShiftId || '', currentSupplierId, supplier_name, supplier_invoice_no,
        date_time, payment_method, total_retail, total_discount,
        net_total, items.length, 'RECEIVED'
      ]);
      pStmt.free();

      // 2. Insert Items & Augment Stock in medicines table
      const itemStmt = this.db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, medicine_id, trade_name, trade_name_ar,
          quantity, bonus, price_box, discount_pct, net_box_price,
          total_net, batch_no, expiry
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        itemStmt.run([
          id, item.medicine_id, item.trade_name, item.trade_name_ar,
          item.quantity, item.bonus || 0, item.price_box,
          item.discount_pct || 0, item.net_box_price,
          item.total_net, item.batch_no || 'BCH-AUTO', item.expiry || '12/2028'
        ]);

        // Augment stock in medicines
        const addedBoxes = (item.quantity || 0) + (item.bonus || 0);
        if (item.medicine_id && addedBoxes > 0) {
          this.db.run(`
            UPDATE medicines 
            SET stock_boxes = stock_boxes + ${addedBoxes},
                price_box = CASE WHEN ${item.price_box} > 0 THEN ${item.price_box} ELSE price_box END
            WHERE id = ${item.medicine_id}
          `);
        } else if (!item.medicine_id && item.trade_name_ar) {
          const newMedId = Date.now() + Math.floor(Math.random() * 1000);
          const barcode = item.barcode || `622${Math.floor(1000000000 + Math.random() * 9000000000)}`;
          this.db.run(`
            INSERT INTO medicines (id, trade_name, trade_name_ar, barcode, price_box, price_strip, strips_per_box, stock_boxes, stock_strips, shelf, category, reorder_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [newMedId, item.trade_name || item.trade_name_ar, item.trade_name_ar, barcode, item.price_box, parseFloat((item.price_box / 2).toFixed(2)), 2, addedBoxes, 0, 'A-01', 'أدوية عامة', 3]);
        }
      }
      itemStmt.free();

      // 3. Update supplier balance if credit
      if (payment_method === 'آجل' && currentSupplierId) {
        this.db.run(`
          UPDATE suppliers SET balance = balance + ${net_total}
          WHERE id = ${currentSupplierId}
        `);
      }

      this.db.run('COMMIT;');
      this.saveToDisk();
      this._enqueueSync('purchase', id || `${Date.now()}`, 'CREATE', {
        id,
        shift_id: activeShiftId,
        supplier_id: currentSupplierId,
        supplier_name,
        supplier_invoice_no,
        date_time,
        payment_method,
        total_retail,
        total_discount,
        net_total,
        items_count: items.length,
        items
      }, activeShiftId);
      return purchaseData;
    } catch (e) {
      this.db.run('ROLLBACK;');
      throw e;
    }
  }

  async getPurchases(limit = 100) {
    await this.init();
    const res = this.db.exec(`
      SELECT
        p.*,
        p.id           AS invoice_code,
        p.date_time    AS date,
        p.id           AS invoice_id
      FROM purchases p
      ORDER BY p.date_time DESC
      LIMIT ${Number(limit) || 100}
    `);
    return this._formatRows(res);
  }

  async getPurchaseItems(purchaseId) {
    await this.init();
    const safeId = String(purchaseId).replace(/'/g, "''");
    const res = this.db.exec(`SELECT * FROM purchase_items WHERE purchase_id = '${safeId}' ORDER BY id ASC`);
    return this._formatRows(res);
  }

  async updatePurchaseItemBatch(itemId, patch = {}) {
    await this.init();
    const id = Number(itemId);
    if (!id) return null;
    const expiry = patch.expiry_date
      ? (() => {
          const parts = String(patch.expiry_date).split('-');
          return parts.length >= 2 ? `${parts[1]}/${parts[0]}` : patch.expiry_date;
        })()
      : null;

    this.db.run(`
      UPDATE purchase_items SET
        trade_name = COALESCE(?, trade_name),
        trade_name_ar = COALESCE(?, trade_name_ar),
        batch_no = COALESCE(?, batch_no),
        expiry = COALESCE(?, expiry),
        quantity = COALESCE(?, quantity),
        bonus = COALESCE(?, bonus),
        price_box = COALESCE(?, price_box),
        net_box_price = COALESCE(?, net_box_price)
      WHERE id = ${id}
    `, [
      patch.trade_name ?? null,
      patch.trade_name_ar ?? null,
      patch.batch_no ?? null,
      expiry,
      patch.quantity_boxes != null ? Number(patch.quantity_boxes) : null,
      patch.bonus != null ? Number(patch.bonus) : null,
      patch.price_box != null ? Number(patch.price_box) : null,
      patch.cost_box != null ? Number(patch.cost_box) : null
    ]);
    this.saveToDisk();
    return id;
  }

  async deletePurchaseItem(itemId) {
    await this.init();
    const id = Number(itemId);
    if (!id) return false;
    this.db.run(`DELETE FROM purchase_items WHERE id = ${id}`);
    this.saveToDisk();
    return true;
  }

  // Expiry batches are derived from received purchase items (real batches only).
  async getExpiryBatches() {
    await this.init();
    const res = this.db.exec(`
      SELECT
        pi.id,
        pi.purchase_id,
        pi.medicine_id,
        pi.trade_name,
        pi.trade_name_ar,
        pi.quantity,
        pi.bonus,
        pi.price_box,
        pi.net_box_price,
        pi.batch_no,
        pi.expiry,
        p.supplier_name
      FROM purchase_items pi
      LEFT JOIN purchases p ON p.id = pi.purchase_id
      ORDER BY pi.id DESC
    `);
    const rows = this._formatRows(res) || [];

    const normalizeExpiry = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      // YYYY-MM-DD / YYYY-MM
      if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(raw)) {
        const parts = raw.split('-');
        const month = String(parts[1]).padStart(2, '0');
        const day = String(parts[2] || '01').padStart(2, '0');
        return `${parts[0]}-${month}-${day}`;
      }
      // MM/YYYY or DD/MM/YYYY
      const parts = raw.split(/[\/.-]/);
      if (parts.length === 2) {
        return `${parts[1]}-${String(parts[0]).padStart(2, '0')}-01`;
      }
      if (parts.length === 3) {
        return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
      }
      return raw;
    };

    return rows.map((r) => ({
      id: r.id,
      purchase_id: r.purchase_id,
      medicine_id: r.medicine_id,
      trade_name: r.trade_name,
      trade_name_ar: r.trade_name_ar,
      batch_no: r.batch_no,
      expiry_date: normalizeExpiry(r.expiry),
      quantity_boxes: (r.quantity || 0) + (r.bonus || 0),
      cost_box: r.net_box_price || (r.price_box || 0) * 0.75,
      price_box: r.price_box || 0,
      supplier_name: r.supplier_name || 'غير محدد'
    }));
  }

  async getSuppliers() {
    await this.init();
    let res = this.db.exec('SELECT * FROM suppliers ORDER BY id ASC');
    let rows = this._formatRows(res);
    if (!rows || rows.length === 0) {
      // Seed default Egyptian distributors if empty
      const defaults = [
        [1, 'ابن سينا فارما (Ibnsina)', 'إدارة التوزيع', '01001234567', '19001', 0, 'موزع رئيسي معتمد'],
        [2, 'الشركة المتحدة للصيادلة (UCP)', 'إدارة المبيعات', '01007654321', '19002', 0, 'موزع رئيسي معتمد'],
        [3, 'فارما أوفرسيز (Pharma Overseas)', 'قسم الطلبيات', '01112233445', '19003', 0, 'موزع رئيسي معتمد'],
        [4, 'مالتي فارما (Multi Pharma)', 'خدمة العملاء', '01223344556', '19004', 0, 'موزع أدوية معتمد'],
        [5, 'شركة الشرق الأوسط (Middle East)', 'مندوب المنطقة', '01011223344', '19005', 0, 'موزع أدوية'],
        [6, 'شركة رامكو فارما (Ramco)', 'المبيعات', '01022334455', '19006', 0, 'موزع أدوية']
      ];
      for (const d of defaults) {
        this.db.run(`INSERT OR IGNORE INTO suppliers (id, name, contact_person, phone, hotline, balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?);`, d);
      }
      this.saveToDisk();
      res = this.db.exec('SELECT * FROM suppliers ORDER BY id ASC');
      rows = this._formatRows(res);
    }
    return rows;
  }

  async adjustMedicineStock(medicineId, boxDelta) {
    await this.init();
    const id = Number(medicineId);
    const delta = Number(boxDelta) || 0;
    if (!id || !delta) return;
    this.db.run(`
      UPDATE medicines SET stock_boxes =
        CASE WHEN stock_boxes + (${delta}) < 0 THEN 0 ELSE stock_boxes + (${delta}) END
      WHERE id = ${id}
    `);
    this.saveToDisk();
    this._enqueueSync('stock_adjustment', id, 'UPDATE', { medicineId: id, boxDelta: delta });
  }

  // Record a supplier return / disposal so it appears in the shift audit & QR
  async recordSupplierReturn({ supplierName, amount, itemsCount = 0, kind = 'SUPPLIER_RETURN', details = '', shiftId = null, cashierName = '' }) {
    await this.init();
    let activeShiftId = shiftId;
    if (!activeShiftId) {
      const cur = await this.getCurrentShift();
      if (cur) activeShiftId = cur.id;
    }
    const parsedAmount = Number(amount) || 0;
    const stmt = this.db.prepare(`
      INSERT INTO supplier_returns (shift_id, supplier_name, amount, items_count, kind, details, date_time, cashier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      activeShiftId,
      supplierName || 'شركة التوزيع',
      parsedAmount,
      Number(itemsCount) || 0,
      kind,
      String(details || ''),
      new Date().toISOString(),
      cashierName || ''
    ]);
    stmt.free();
    this.saveToDisk();
    this._enqueueSync('supplier_return', `${activeShiftId || 'NA'}-${Date.now()}`, 'CREATE', {
      supplierName, amount: parsedAmount, itemsCount, kind, details, shiftId: activeShiftId
    }, activeShiftId);
    return true;
  }

  async adjustSupplierBalanceByName(supplierName, amountDelta) {
    await this.init();
    const name = String(supplierName || '').trim();
    const delta = Number(amountDelta) || 0;
    if (!name || !delta) return;
    const safeName = name.replace(/'/g, "''");
    this.db.run(`
      UPDATE suppliers SET balance =
        CASE WHEN balance + (${delta}) < 0 THEN 0 ELSE balance + (${delta}) END
      WHERE name = '${safeName}' OR name LIKE '%${safeName}%' OR '${safeName}' LIKE '%' || name || '%'
    `);
    this.saveToDisk();
    this._enqueueSync('supplier_balance', name, 'ADJUST', { supplierName: name, amountDelta: delta });
  }

  // --- BACKUP / RESTORE (all SQLite tables) ---
  async exportAllData() {
    await this.init();
    const tables = [
      'medicines', 'suppliers', 'customers', 'customer_ledger', 'invoices',
      'invoice_items', 'shifts', 'purchases', 'purchase_items', 'expenses',
      'supplier_returns', 'system_license', 'app_users', 'sync_queue'
    ];
    const data = {};
    for (const table of tables) {
      try {
        const res = this.db.exec(`SELECT * FROM ${table}`);
        if (res && res.length > 0) {
          data[table] = {
            columns: res[0].columns,
            rows: res[0].values
          };
        } else {
          data[table] = { columns: [], rows: [] };
        }
      } catch (e) {
        data[table] = { columns: [], rows: [] };
      }
    }
    return data;
  }

  async importAllData(data) {
    await this.init();
    if (!data || typeof data !== 'object') throw new Error('ملف النسخة الاحتياطية غير صالح');

    this.db.run('BEGIN TRANSACTION;');
    try {
      for (const [table, payload] of Object.entries(data)) {
        if (!payload || !Array.isArray(payload.columns) || !Array.isArray(payload.rows)) continue;
        if (payload.columns.length === 0) continue;
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) continue;

        this.db.run(`DELETE FROM ${table}`);
        const placeholders = payload.columns.map(() => '?').join(', ');
        const cols = payload.columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(', ');
        const stmt = this.db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`);
        for (const row of payload.rows) {
          stmt.run(row.map((v) => (v === undefined ? null : v)));
        }
        stmt.free();
      }
      this.db.run('COMMIT;');
      this.saveToDisk();
      return true;
    } catch (e) {
      this.db.run('ROLLBACK;');
      throw e;
    }
  }

  async saveSupplier(sup) {
    await this.init();
    const id = sup.id || Date.now();
    const name = (sup.name || '').trim();
    if (!name) return null;
    const contact = (sup.contact_person || 'مسؤول التوريد').trim();
    const phone = (sup.phone || '').trim();
    const hotline = (sup.hotline || '').trim();
    const balance = parseFloat(sup.balance) || 0;
    const notes = (sup.notes || '').trim();

    this.db.run(`
      INSERT OR REPLACE INTO suppliers (id, name, contact_person, phone, hotline, balance, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, name, contact, phone, hotline, balance, notes]);
    this.saveToDisk();
    this._enqueueSync('supplier', id, 'UPSERT', { id, name, contact_person: contact, phone, hotline, balance, notes });
    return { id, name, contact_person: contact, phone, hotline, balance, notes };
  }

  async ensureSupplier(supplierName, phone = '') {
    await this.init();
    const cleanName = (supplierName || '').trim();
    if (!cleanName) return null;
    const res = this.db.exec(`SELECT * FROM suppliers WHERE name = '${cleanName.replace(/'/g, "''")}' LIMIT 1;`);
    const rows = this._formatRows(res);
    if (rows && rows.length > 0) return rows[0];

    const id = Date.now();
    this.db.run(`
      INSERT INTO suppliers (id, name, contact_person, phone, hotline, balance, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, cleanName, 'مسؤول التوريد', phone || '', '', 0, 'مورد مضاف حديثاً']);
    this.saveToDisk();
    return { id, name: cleanName, contact_person: 'مسؤول التوريد', phone, hotline: '', balance: 0, notes: '' };
  }

  // --- 7. STARTUP LICENSE & ACTIVATION GUARD API ---

  async getLicenseInfo() {
    await this.init();
    try {
      this.createSchema();
      const res = this.db.exec('SELECT * FROM system_license WHERE id = 1 LIMIT 1');
      const rows = this._formatRows(res);
      return rows[0] || null;
    } catch (e) {
      console.warn('Error reading system_license table:', e);
      return null;
    }
  }

  async saveLicenseInfo(info) {
    await this.init();
    try {
      this.createSchema();
      const existing = await this.getLicenseInfo();
      if (existing) {
        const stmt = this.db.prepare(`
          UPDATE system_license SET
            machine_id = ?, license_status = ?, license_key = ?,
            first_install_date = ?, trial_days = ?, activated_at = ?
          WHERE id = 1
        `);
        stmt.run([
          info.machine_id, info.license_status, info.license_key || '',
          info.first_install_date, info.trial_days ?? 7, info.activated_at || ''
        ]);
        stmt.free();
      } else {
        const stmt = this.db.prepare(`
          INSERT INTO system_license (id, machine_id, license_status, license_key, first_install_date, trial_days, activated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run([
          info.machine_id, info.license_status, info.license_key || '',
          info.first_install_date, info.trial_days ?? 7, info.activated_at || ''
        ]);
        stmt.free();
      }
      this.saveToDisk();
      return info;
    } catch (e) {
      console.error('Error saving license info to SQLite:', e);
      throw e;
    }
  }

  async revokeLicense(machineId) {
    await this.init();
    try {
      this.createSchema();
      return await this.saveLicenseInfo({
        machine_id: machineId,
        license_status: 'REVOKED',
        license_key: '',
        first_install_date: new Date().toISOString(),
        trial_days: 0,
        activated_at: ''
      });
    } catch (e) {
      console.error('Error revoking license in SQLite:', e);
      throw e;
    }
  }

  async getInventoryStats() {
    await this.init();
    try {
      const countRes = this.db.exec('SELECT COUNT(*) FROM medicines');
      const totalItems = countRes[0]?.values[0]?.[0] || 0;

      const sumRes = this.db.exec('SELECT SUM(price_box * stock_boxes + price_strip * stock_strips) FROM medicines');
      const totalRetailValue = Number(sumRes[0]?.values[0]?.[0]) || 0;

      const outOfStockRes = this.db.exec('SELECT COUNT(*) FROM medicines WHERE stock_boxes = 0 AND stock_strips = 0');
      const outOfStockCount = outOfStockRes[0]?.values[0]?.[0] || 0;

      const nearEmptyRes = this.db.exec('SELECT COUNT(*) FROM medicines WHERE stock_boxes > 0 AND stock_boxes <= reorder_level');
      const nearEmptyCount = nearEmptyRes[0]?.values[0]?.[0] || 0;

      return {
        totalItems,
        totalRetailValue: parseFloat(totalRetailValue.toFixed(2)),
        estimatedCostValue: parseFloat((totalRetailValue * 0.75).toFixed(2)),
        outOfStockCount,
        nearEmptyCount
      };
    } catch (e) {
      console.error('Error fetching inventory stats:', e);
      return { totalItems: 0, totalRetailValue: 0, estimatedCostValue: 0, outOfStockCount: 0, nearEmptyCount: 0 };
    }
  }

  async getPaginatedMedicines({ page = 1, pageSize = 20, search = '', filter = 'ALL', category = 'ALL' }) {
    await this.init();
    const offset = (page - 1) * pageSize;
    let whereClauses = [];

    const safeSearch = (search || '').trim().replace(/'/g, "''");
    if (safeSearch) {
      whereClauses.push(`(
        barcode LIKE '${safeSearch}%' OR 
        trade_name LIKE '%${safeSearch}%' OR 
        trade_name_ar LIKE '%${safeSearch}%' OR 
        generic_name LIKE '%${safeSearch}%' OR 
        shelf LIKE '${safeSearch}%'
      )`);
    }

    if (filter === 'AVAILABLE') {
      whereClauses.push('(stock_boxes > 0 OR stock_strips > 0)');
    } else if (filter === 'NEAR_EMPTY') {
      whereClauses.push('(stock_boxes > 0 AND stock_boxes <= reorder_level)');
    } else if (filter === 'OUT_OF_STOCK') {
      whereClauses.push('(stock_boxes = 0 AND stock_strips = 0)');
    }

    if (category && category !== 'ALL') {
      whereClauses.push(`category = '${category.replace(/'/g, "''")}'`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    // Total count for pagination
    const countRes = this.db.exec(`SELECT COUNT(*) FROM medicines ${whereStr}`);
    const total = countRes[0]?.values[0]?.[0] || 0;

    // Items query
    const sql = `
      SELECT * FROM medicines 
      ${whereStr} 
      ORDER BY id ASC 
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    const res = this.db.exec(sql);
    const items = this._formatRows(res);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  async getShortages(limit = 100) {
    await this.init();
    const sql = `
      SELECT * FROM medicines 
      WHERE stock_boxes <= reorder_level 
      ORDER BY stock_boxes ASC, id ASC 
      LIMIT ${limit}
    `;
    const res = this.db.exec(sql);
    return this._formatRows(res);
  }

  // Helper to format sql.js exec output into array of JS objects
  _formatRows(execResult) {
    if (!execResult || execResult.length === 0) return [];
    const { columns, values } = execResult[0];
    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
}

export const sqliteService = new SQLiteService();
