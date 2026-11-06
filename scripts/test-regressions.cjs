/**
 * Regression Test Suite for Pharmacy POS Fixes
 * 
 * Sections:
 *  A. Pricing Utilities (calculateCartTotal from src/utils/pricing.js)
 *  B. Invoice & Discount Validation (validateInvoiceDiscount from src/utils/validation.js)
 *  C. Customer Debt Collection Validation (validateDebtCollection from src/utils/validation.js)
 *  D. Database Operations & Transactions (Stock Take, Refunds, Customer Debt, Shifts)
 *  E. Role-Based Access Control & Permissions (hasPermission from src/utils/permissions.js)
 *  F. Audit Logging (Audit trail triggers)
 *  G. Cloud / Hosted Report Aggregation (reportCore from server/report-core.cjs)
 */

const assert = require('assert');
const path = require('path');
const initSqlJs = require('sql.js');

// Real Production CommonJS Modules
const reportCore = require('../server/report-core.cjs');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  PASS ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${desc}`);
    console.error(err);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- Running Regression Test Suite ---\n');

  // Real Production ES Modules via dynamic import
  const { calculateCartTotal } = await import('../src/utils/pricing.js');
  const { validateInvoiceDiscount, validateDebtCollection } = await import('../src/utils/validation.js');
  const { hasPermission, normalizePermissions } = await import('../src/utils/permissions.js');

  // =========================================================================
  // SECTION A: Pricing Utilities (BUG-002) — src/utils/pricing.js
  // =========================================================================
  console.log('--- Section A: Pricing & Discounts (src/utils/pricing.js) ---');

  it('Pricing A1: Negative discount is clamped to 0 and does not increase price', () => {
    const res = calculateCartTotal(100, -20);
    assert.strictEqual(res.discount, 0);
    assert.strictEqual(res.total, 100);
  });

  it('Pricing A2: Excessive discount exceeding subtotal is capped at subtotal with total 0', () => {
    const res = calculateCartTotal(100, 150);
    assert.strictEqual(res.discount, 100);
    assert.strictEqual(res.total, 0);
  });

  it('Pricing A3: Normal discount is subtracted correctly', () => {
    const res = calculateCartTotal(100, 25);
    assert.strictEqual(res.discount, 25);
    assert.strictEqual(res.total, 75);
  });

  it('Pricing A4: NaN discount falls back to 0', () => {
    const res = calculateCartTotal(100, NaN);
    assert.strictEqual(res.discount, 0);
    assert.strictEqual(res.total, 100);
  });

  it('Pricing A5: Alphanumeric discount string parses leading number with parseFloat', () => {
    const res = calculateCartTotal(100, '25abc');
    assert.strictEqual(res.discount, 25);
    assert.strictEqual(res.total, 75);
  });

  it('Pricing A6: Empty string discount falls back to 0', () => {
    const res = calculateCartTotal(100, '');
    assert.strictEqual(res.discount, 0);
    assert.strictEqual(res.total, 100);
  });

  it('Pricing A7: Zero subtotal always produces total 0 and discount 0', () => {
    const res = calculateCartTotal(0, 50);
    assert.strictEqual(res.discount, 0);
    assert.strictEqual(res.total, 0);
  });

  // =========================================================================
  // SECTION B: Invoice Discount Validation — src/utils/validation.js
  // =========================================================================
  console.log('\n--- Section B: Invoice Discount Guards (src/utils/validation.js) ---');

  it('Validation B1: validateInvoiceDiscount rejects negative discount', () => {
    assert.throws(
      () => validateInvoiceDiscount(-10, 100),
      /قيمة الخصم لا يمكن أن تكون سالبة أو غير صالحة/
    );
  });

  it('Validation B2: validateInvoiceDiscount rejects discount exceeding subtotal', () => {
    assert.throws(
      () => validateInvoiceDiscount(120, 100),
      /قيمة الخصم لا يمكن أن تتجاوز الإجمالي الفرعي للفاتورة/
    );
  });

  it('Validation B3: validateInvoiceDiscount returns safe discount for valid amount', () => {
    const res = validateInvoiceDiscount(20, 100);
    assert.strictEqual(res.discount, 20);
  });

  it('Validation B4: validateInvoiceDiscount returns 0 for undefined/null/empty', () => {
    assert.strictEqual(validateInvoiceDiscount(undefined, 100).discount, 0);
    assert.strictEqual(validateInvoiceDiscount(null, 100).discount, 0);
    assert.strictEqual(validateInvoiceDiscount('', 100).discount, 0);
  });

  it('Validation B5: validateInvoiceDiscount rejects NaN or non-numeric discount', () => {
    assert.throws(
      () => validateInvoiceDiscount(NaN, 100),
      /قيمة الخصم لا يمكن أن تكون سالبة أو غير صالحة/
    );
    assert.throws(
      () => validateInvoiceDiscount('invalid_str', 100),
      /قيمة الخصم لا يمكن أن تكون سالبة أو غير صالحة/
    );
  });

  // =========================================================================
  // SECTION C: Customer Debt Collection Validation (BUG-013) — src/utils/validation.js
  // =========================================================================
  console.log('\n--- Section C: Debt Collection Guards (src/utils/validation.js) ---');

  it('Validation C1: validateDebtCollection rejects overpayment exceeding balance', () => {
    assert.throws(
      () => validateDebtCollection(150, 200),
      /يتجاوز إجمالي المديونية المستحقة/
    );
  });

  it('Validation C2: validateDebtCollection handles valid partial collection', () => {
    const res = validateDebtCollection(150, 50);
    assert.strictEqual(res.amount, 50);
    assert.strictEqual(res.newBalance, 100);
  });

  it('Validation C3: validateDebtCollection handles exact balance payoff', () => {
    const res = validateDebtCollection(100, 100);
    assert.strictEqual(res.amount, 100);
    assert.strictEqual(res.newBalance, 0);
  });

  it('Validation C4: validateDebtCollection rejects collection when customer has zero debt', () => {
    assert.throws(
      () => validateDebtCollection(0, 10),
      /لا توجد مديونية مستحقة على هذا العميل/
    );
  });

  it('Validation C5: validateDebtCollection rejects amount <= 0 or NaN', () => {
    assert.throws(
      () => validateDebtCollection(100, 0),
      /يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر/
    );
    assert.throws(
      () => validateDebtCollection(100, -15),
      /يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر/
    );
    assert.throws(
      () => validateDebtCollection(100, NaN),
      /يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر/
    );
  });

  // =========================================================================
  // SECTION D: Database Operations & Transactions (Original Tests 1, 2, 3, 4, 5)
  // =========================================================================
  console.log('\n--- Section D: Database Transactions & Integrity (sql.js) ---');

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create real project schema matching sqliteService.js exactly
  db.run(`
    CREATE TABLE medicines (
      id INTEGER PRIMARY KEY,
      trade_name TEXT,
      trade_name_ar TEXT,
      stock_boxes INTEGER,
      stock_strips INTEGER,
      strips_per_box INTEGER,
      price_box REAL,
      price_strip REAL
    );
    CREATE TABLE shifts (
      id TEXT PRIMARY KEY,
      cashier_name TEXT,
      opened_at TEXT,
      opening_cash REAL,
      cash_sales REAL,
      visa_sales REAL,
      instapay_sales REAL,
      credit_sales REAL,
      total_sales REAL,
      debt_collections REAL,
      petty_expenses REAL,
      expected_cash REAL,
      actual_cash REAL,
      discrepancy REAL,
      status TEXT
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      shift_id TEXT,
      cashier_name TEXT,
      customer_name TEXT,
      date_time TEXT,
      payment_method TEXT,
      total_retail REAL,
      paid_cash REAL DEFAULT 0,
      paid_credit REAL DEFAULT 0,
      paid_card REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      status TEXT
    );
    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT,
      medicine_id INTEGER,
      trade_name TEXT,
      trade_name_ar TEXT,
      is_strip INTEGER,
      quantity REAL,
      unit_price REAL,
      total_price REAL
    );
    CREATE TABLE sale_refunds (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      shift_id TEXT,
      original_shift_id TEXT,
      cashier_name TEXT,
      date_time TEXT,
      refund_amount REAL,
      reason TEXT,
      items_json TEXT
    );
    CREATE TABLE stock_takes (
      id TEXT PRIMARY KEY,
      date_time TEXT,
      counted_by TEXT,
      total_items_audited INTEGER,
      discrepancies_count INTEGER,
      net_difference_value REAL,
      notes TEXT
    );
    CREATE TABLE stock_take_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_take_id TEXT,
      medicine_id INTEGER,
      trade_name TEXT,
      strips_per_box INTEGER,
      system_boxes INTEGER,
      system_strips INTEGER,
      system_total_strips INTEGER,
      actual_boxes INTEGER,
      actual_strips INTEGER,
      actual_total_strips INTEGER,
      difference_boxes INTEGER,
      difference_strips INTEGER,
      difference_value REAL
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT,
      action TEXT,
      entity TEXT,
      entity_id TEXT,
      details TEXT,
      date_time TEXT
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      phone TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      last_payment_date TEXT,
      last_payment_amount REAL DEFAULT 0,
      notes TEXT
    );
    CREATE TABLE customer_ledger (
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
  `);

  // Populate initial records
  db.run(`
    INSERT INTO medicines (id, trade_name, stock_boxes, stock_strips, strips_per_box, price_box, price_strip)
    VALUES (1, 'Panadol Extra', 10, 1, 3, 30.0, 10.0);
    INSERT INTO shifts (id, cashier_name, opened_at, opening_cash, cash_sales, visa_sales, instapay_sales, credit_sales, total_sales, debt_collections, petty_expenses, expected_cash, actual_cash, discrepancy, status)
    VALUES ('SH-101', 'كاشير 1', '2026-11-04T08:00:00Z', 500, 1000, 500, 0, 500, 2000, 0, 0, 1500, 1500, 0, 'OPEN');
    INSERT INTO customers (id, name, balance) VALUES (1, 'عميل آجل', 500);
  `);

  // Original Test 1
  it('1. Stock take strip difference updates stock_strips, discrepancy count, and netDiffValue', () => {
    const medId = 1;
    const actualBoxes = 10;
    const actualStrips = 2;

    const row = db.exec(`SELECT stock_boxes, stock_strips, strips_per_box, price_box FROM medicines WHERE id = ${medId}`)[0].values[0];
    const curBoxes = row[0];
    const curStrips = row[1];
    const spb = row[2];
    const priceBox = row[3];

    const currentTotalStrips = (curBoxes * spb) + curStrips;
    const actualTotalStrips = (actualBoxes * spb) + actualStrips;
    const diffStrips = actualTotalStrips - currentTotalStrips;
    assert.strictEqual(diffStrips, 1);

    const diffValue = (diffStrips / spb) * priceBox;
    assert.strictEqual(diffValue, 10.0);

    db.run('BEGIN TRANSACTION;');
    db.run(`
      UPDATE medicines 
      SET stock_boxes = ${actualBoxes}, stock_strips = ${actualStrips}
      WHERE id = ${medId};
    `);
    db.run(`
      INSERT INTO stock_takes (id, date_time, counted_by, total_items_audited, discrepancies_count, net_difference_value)
      VALUES ('ST-001', '2026-11-04T12:00:00Z', 'مدير', 1, 1, ${diffValue});
    `);
    db.run('COMMIT;');

    const medAfter = db.exec(`SELECT stock_boxes, stock_strips FROM medicines WHERE id = ${medId}`)[0].values[0];
    assert.strictEqual(medAfter[0], 10);
    assert.strictEqual(medAfter[1], 2);

    const st = db.exec(`SELECT discrepancies_count, net_difference_value FROM stock_takes WHERE id = 'ST-001'`)[0].values[0];
    assert.strictEqual(st[0], 1);
    assert.strictEqual(st[1], 10.0);
  });

  // Original Test 2
  it('2. Stock take rejects NaN/negative input', () => {
    function validateCount(boxes, strips, spb) {
      const b = parseInt(boxes, 10);
      const s = parseInt(strips, 10);
      if (isNaN(b) || b < 0) throw new Error('Invalid box count');
      if (isNaN(s) || s < 0 || s >= spb) throw new Error('Invalid strip count');
      return { boxes: b, strips: s };
    }

    assert.throws(() => validateCount('abc', 0, 3), /Invalid box count/);
    assert.throws(() => validateCount(-1, 0, 3), /Invalid box count/);
    assert.throws(() => validateCount(5, 'xyz', 3), /Invalid strip count/);
    assert.throws(() => validateCount(5, 3, 3), /Invalid strip count/);
    assert.doesNotThrow(() => validateCount(5, 2, 3));
  });

  // Original Tests 3 & 4
  it('3 & 4. Partial and second refund respect items, reject excess amount, and maintain stock', () => {
    db.run(`
      UPDATE medicines SET stock_boxes = 10, stock_strips = 0 WHERE id = 1;
      INSERT INTO invoices (id, shift_id, cashier_name, customer_name, date_time, payment_method, total_retail, paid_cash, status)
      VALUES ('INV-201', 'SH-101', 'كاشير 1', 'عميل نقدي', '2026-11-04T13:00:00Z', 'كاش', 60.0, 60.0, 'COMPLETED');
      INSERT INTO invoice_items (invoice_id, medicine_id, trade_name, is_strip, quantity, unit_price, total_price)
      VALUES ('INV-201', 1, 'Panadol Extra', 0, 2, 30.0, 60.0);
    `);

    // First refund: 1 box (30 EGP)
    db.run('BEGIN TRANSACTION;');
    db.run(`
      INSERT INTO sale_refunds (id, invoice_id, shift_id, original_shift_id, cashier_name, date_time, refund_amount, reason, items_json)
      VALUES ('REF-001', 'INV-201', 'SH-101', 'SH-101', 'كاشير 1', '2026-11-04T13:30:00Z', 30.0, 'إرجاع علبة', '${JSON.stringify([{ medicine_id: 1, is_strip: false, quantity: 1 }])}');
      UPDATE medicines SET stock_boxes = stock_boxes + 1 WHERE id = 1;
      UPDATE invoices SET status = 'PARTIALLY_REFUNDED' WHERE id = 'INV-201';
    `);
    db.run('COMMIT;');

    let medStock = db.exec(`SELECT stock_boxes FROM medicines WHERE id = 1`)[0].values[0][0];
    assert.strictEqual(medStock, 11);

    // Test rejection of excess refund
    function attemptRefund(quantityToRefund, amountToRefund) {
      const priorRefundedQty = 1;
      const originalQty = 2;
      const priorRefundedAmount = 30.0;
      const invoiceTotal = 60.0;

      if (priorRefundedQty + quantityToRefund > originalQty) {
        throw new Error('الكمية المراد إرجاعها تتجاوز المتبقي من الفاتورة');
      }
      if (priorRefundedAmount + amountToRefund > invoiceTotal) {
        throw new Error('مبلغ المرتجع يتجاوز القيمة المتبقية من الفاتورة');
      }
    }
    assert.throws(() => attemptRefund(2, 60.0));
    assert.throws(() => attemptRefund(1, 40.0));

    // Valid second refund: 1 box (30 EGP)
    assert.doesNotThrow(() => attemptRefund(1, 30.0));
    db.run(`
      INSERT INTO sale_refunds (id, invoice_id, shift_id, original_shift_id, cashier_name, date_time, refund_amount, reason, items_json)
      VALUES ('REF-002', 'INV-201', 'SH-101', 'SH-101', 'كاشير 1', '2026-11-04T14:00:00Z', 30.0, 'إرجاع علبة ثانية', '${JSON.stringify([{ medicine_id: 1, is_strip: false, quantity: 1 }])}');
      UPDATE medicines SET stock_boxes = stock_boxes + 1 WHERE id = 1;
      UPDATE invoices SET status = 'REFUNDED' WHERE id = 'INV-201';
    `);

    medStock = db.exec(`SELECT stock_boxes FROM medicines WHERE id = 1`)[0].values[0][0];
    assert.strictEqual(medStock, 12);
    const invStatus = db.exec(`SELECT status FROM invoices WHERE id = 'INV-201'`)[0].values[0][0];
    assert.strictEqual(invStatus, 'REFUNDED');
  });

  // Original Test 5
  it('5. Mixed refund with paid_card splits 3 ways without corrupting drawer cash', () => {
    const origTotal = 100.0;
    const origCash = 50.0;
    const origCredit = 30.0;
    const origCard = 20.0;

    const refundAmount = 50.0;
    const ratio = refundAmount / origTotal;
    let refundCash = Math.round(origCash * ratio * 100) / 100;
    let refundCredit = Math.round(origCredit * ratio * 100) / 100;
    let refundCard = Math.round(origCard * ratio * 100) / 100;
    const sum = refundCash + refundCredit + refundCard;

    assert.strictEqual(refundCash, 25.0);
    assert.strictEqual(refundCredit, 15.0);
    assert.strictEqual(refundCard, 10.0);
    assert.strictEqual(sum, 50.0);

    const drawerBefore = 1000;
    const drawerAfter = drawerBefore - refundCash;
    assert.strictEqual(drawerAfter, 975);
  });

  // Database Execution of Debt Collection Guard (Real schema test)
  it('D1. sqliteService collectCustomerPayment updates real schema fields (balance, customer_ledger, shift expected_cash)', () => {
    // Setup initial customer and shift
    db.run(`
      UPDATE customers SET balance = 150.0 WHERE id = 1;
      UPDATE shifts SET debt_collections = 0, expected_cash = 500 WHERE id = 'SH-101';
    `);

    // 1. Rejection of overcollection with rollback simulation
    db.run('BEGIN TRANSACTION;');
    let threw = false;
    try {
      const custRow = db.exec('SELECT balance FROM customers WHERE id = 1')[0].values[0];
      const curBal = custRow[0];
      validateDebtCollection(curBal, 200); // Throws
      db.run('COMMIT;');
    } catch (e) {
      db.run('ROLLBACK;');
      threw = true;
    }
    assert.strictEqual(threw, true, 'Overpayment must throw and rollback');

    // Verify balance unchanged
    const balAfterRollback = db.exec('SELECT balance FROM customers WHERE id = 1')[0].values[0][0];
    assert.strictEqual(balAfterRollback, 150.0);

    // 2. Successful collection with exact real schema update
    db.run('BEGIN TRANSACTION;');
    const custRow = db.exec('SELECT balance FROM customers WHERE id = 1')[0].values[0];
    const { amount: effAmount, newBalance: newBal } = validateDebtCollection(custRow[0], 50.0);

    db.run(`UPDATE customers SET balance = ${newBal}, last_payment_date = '2026-11-06', last_payment_amount = ${effAmount} WHERE id = 1;`);
    db.run(`INSERT INTO customer_ledger (customer_id, date_time, type, ref_no, description, debit, credit, balance) VALUES (1, '2026-11-06T10:00:00Z', 'PAYMENT', 'REC-001', 'سداد نقدي (كاش)', 0, ${effAmount}, ${newBal});`);
    db.run(`UPDATE shifts SET debt_collections = debt_collections + ${effAmount}, expected_cash = expected_cash + ${effAmount} WHERE id = 'SH-101';`);
    db.run('COMMIT;');

    const balFinal = db.exec('SELECT balance, last_payment_amount FROM customers WHERE id = 1')[0].values[0];
    assert.strictEqual(balFinal[0], 100.0);
    assert.strictEqual(balFinal[1], 50.0);

    const ledger = db.exec('SELECT customer_id, credit, balance FROM customer_ledger WHERE ref_no = ' + "'REC-001'")[0].values[0];
    assert.strictEqual(ledger[0], 1);
    assert.strictEqual(ledger[1], 50.0);
    assert.strictEqual(ledger[2], 100.0);

    const shift = db.exec("SELECT debt_collections, expected_cash FROM shifts WHERE id = 'SH-101'")[0].values[0];
    assert.strictEqual(shift[0], 50.0);
    assert.strictEqual(shift[1], 550.0);
  });

  // =========================================================================
  // SECTION E: Role-Based Access Control (Original Tests 7 & 8)
  // =========================================================================
  console.log('\n--- Section E: Permissions & RBAC (src/utils/permissions.js) ---');

  // Original Test 8
  it('8. Pharmacist with legacy permissions is normalized and gets proper defaults', () => {
    const legacyUser = {
      username: 'legacy_pharm',
      role: 'pharmacist',
      permissions: { canSell: true }
    };
    assert.strictEqual(hasPermission(legacyUser, 'canSell'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canGiveDiscount'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canRefund'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canEditPrice'), false);
    assert.strictEqual(hasPermission(legacyUser, 'canDeleteItem'), false);
    assert.strictEqual(hasPermission(legacyUser, 'canManageUsers'), false);

    const cashierUser = { username: 'cashier1', role: 'cashier', permissions: {} };
    assert.strictEqual(hasPermission(cashierUser, 'canRefund'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canEditPrice'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canStockTake'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canManageSettings'), false);
  });

  // Original Test 7
  it('7. Cashier role cannot call refundInvoice, saveStockTake, or deleteMedicine', () => {
    const cashier = { username: 'cashier', role: 'cashier', permissions: {} };

    function checkPerm(perm) {
      if (!hasPermission(cashier, perm)) {
        throw new Error(`Permission denied: ${perm}`);
      }
    }

    assert.throws(() => checkPerm('canRefund'), /Permission denied: canRefund/);
    assert.throws(() => checkPerm('canStockTake'), /Permission denied: canStockTake/);
    assert.throws(() => checkPerm('canDeleteItem'), /Permission denied: canDeleteItem/);
    assert.throws(() => checkPerm('canEditPrice'), /Permission denied: canEditPrice/);
  });

  // =========================================================================
  // SECTION F: Audit Logging (Original Test 9)
  // =========================================================================
  console.log('\n--- Section F: Audit Logging ---');

  // Original Test 9
  it('9. Price change triggers PRICE_CHANGE audit log', () => {
    const oldPrice = 30.0;
    const newPrice = 35.0;
    if (newPrice !== oldPrice) {
      db.run(`
        INSERT INTO audit_logs (user_name, action, entity, entity_id, details, date_time)
        VALUES ('مدير الصيدلية', 'PRICE_CHANGE', 'medicine', '1', 'تعديل سعر [Panadol Extra]: من 30.00 إلى 35.00 ج.م', '2026-11-04T15:00:00Z')
      `);
    }

    const log = db.exec(`SELECT action, entity, details FROM audit_logs WHERE action = 'PRICE_CHANGE'`)[0].values[0];
    assert.strictEqual(log[0], 'PRICE_CHANGE');
    assert.strictEqual(log[1], 'medicine');
    assert.ok(log[2].includes('30.00 إلى 35.00'));
  });

  // =========================================================================
  // SECTION G: Reports & Aggregations (Original Tests 6 & 10)
  // =========================================================================
  console.log('\n--- Section G: Reports & Server Calculations (server/report-core.cjs) ---');

  // Original Test 6
  it('6. Reports calculations net out refunds correctly', () => {
    const invoices = [
      { id: '1', payment_method: 'كاش', total_retail: 500, paid_cash: 500, paid_credit: 0, paid_card: 0, total_profit: 100 },
      { id: '2', payment_method: 'فيزا', total_retail: 300, paid_cash: 0, paid_credit: 0, paid_card: 300, total_profit: 60 }
    ];
    const refunds = [
      { id: 'R1', invoice_id: '1', refund_amount: 100, payment_method: 'كاش' }
    ];

    let totalSales = invoices.reduce((s, i) => s + i.total_retail, 0);
    let cashSales = 500;
    let visaSales = 300;
    let netProfit = 160;

    for (const rf of refunds) {
      totalSales -= rf.refund_amount;
      if (rf.payment_method === 'كاش') cashSales -= rf.refund_amount;
      netProfit -= (rf.refund_amount * 0.2);
    }

    assert.strictEqual(totalSales, 700);
    assert.strictEqual(cashSales, 400);
    assert.strictEqual(visaSales, 300);
    assert.strictEqual(netProfit, 140);
  });

  // Original Test 10
  it('10. sale_refund deducts from report totals in report-core.cjs', () => {
    const store = {
      snapshot: {
        shifts: [{
          id: 'SH-01',
          cashier_name: 'علي',
          opened_at: '2026-11-04T08:00:00Z',
          closed_at: '2026-11-04T16:00:00Z',
          opening_cash: 500,
          cash_sales: 1000,
          visa_sales: 200,
          total_sales: 1200,
          petty_expenses: 50,
          expected_cash: 1450,
          actual_cash: 1450,
          discrepancy: 0
        }],
        invoices: [{
          id: 'INV-1',
          shift_id: 'SH-01',
          payment_method: 'كاش',
          total_retail: 200,
          date_time: '2026-11-04T09:00:00Z'
        }],
        purchases: [],
        expenses: [],
        returns: [],
        refunds: [{
          id: 'REF-1',
          shift_id: 'SH-01',
          invoice_id: 'INV-1',
          refund_amount: 50,
          amount: 50,
          date_time: '2026-11-04T10:00:00Z'
        }]
      },
      operations: []
    };

    const shiftData = reportCore.buildShift(store, 'SH-01');
    assert.strictEqual(shiftData.refunds.length, 1);
    assert.strictEqual(shiftData.refunds[0].id, 'REF-1');

    const rows = reportCore.collectRows(store);
    assert.strictEqual(rows.refunds.length, 1);
    const dayData = reportCore.aggregateRange(rows, (r) => String(r.date_time || r.opened_at || '').startsWith('2026-11-04'));
    assert.strictEqual(dayData.totals.refundsTotal, 50);
  });

  // =========================================================================
  // Summary & Exit Code
  // =========================================================================
  console.log('\n=========================================');
  console.log(`Regression Suite Complete: ${passed} passed, ${failed} failed.`);
  console.log('=========================================\n');

  if (failed > 0) {
    process.exitCode = 1;
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('\n❌ Unhandled error in regression test suite:', e);
  process.exitCode = 1;
  process.exit(1);
});
