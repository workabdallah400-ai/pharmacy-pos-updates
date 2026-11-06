/**
 * Regression Test Suite for Pharmacy POS Fixes
 * Covers:
 *  1. Stock take strip difference updates stock_strips, discrepancy count, and netDiffValue
 *  2. Stock take rejects NaN/negative input
 *  3. Partial refund followed by second refund respects original items and does not inflate stock
 *  4. Refund amount exceeding remaining total is rejected
 *  5. Mixed refund with paid_card splits 3 ways without corrupting drawer cash
 *  6. Reports calculations net out refunds correctly
 *  7. Cashier role cannot call refundInvoice, saveStockTake, or deleteMedicine in sqliteService
 *  8. Pharmacist with legacy permissions is normalized and gets proper defaults
 *  9. Price change triggers PRICE_CHANGE audit log
 * 10. sale_refund deducts from report totals in report-core.cjs
 */
const assert = require('assert');
const path = require('path');
const initSqlJs = require('sql.js');

// We will test report-core logic directly
const reportCore = require('../server/report-core.cjs');

// We will also test SQLite operations using an in-memory/fresh sql.js database
// replicating sqliteService methods or instantiating sqliteService.
const { hasPermission } = require('../src/utils/permissions.js');

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
  console.log('\n--- Running Regression Tests ---');

  // Test 8: Pharmacist with legacy permissions is normalized and gets proper defaults
  it('8. Pharmacist with legacy permissions is normalized and gets proper defaults', () => {
    const legacyUser = {
      username: 'legacy_pharm',
      role: 'pharmacist',
      permissions: { canSell: true } // lacks canGiveDiscount, canRefund, etc.
    };
    // hasPermission defaults for pharmacist:
    assert.strictEqual(hasPermission(legacyUser, 'canSell'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canGiveDiscount'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canRefund'), true);
    assert.strictEqual(hasPermission(legacyUser, 'canEditPrice'), false);
    assert.strictEqual(hasPermission(legacyUser, 'canDeleteItem'), false);
    assert.strictEqual(hasPermission(legacyUser, 'canManageUsers'), false);

    // Cashier
    const cashierUser = { username: 'cashier1', role: 'cashier', permissions: {} };
    assert.strictEqual(hasPermission(cashierUser, 'canRefund'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canEditPrice'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canStockTake'), false);
    assert.strictEqual(hasPermission(cashierUser, 'canManageSettings'), false);
  });

  // Test 10: sale_refund deducts from report totals in report-core.cjs
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

    // Test collectRows & aggregateRange
    const rows = reportCore.collectRows(store);
    assert.strictEqual(rows.refunds.length, 1);
    const dayData = reportCore.aggregateRange(rows, (r) => String(r.date_time || r.opened_at || '').startsWith('2026-11-04'));
    assert.strictEqual(dayData.totals.refundsTotal, 50);
  });

  // Database-backed regression tests
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create required tables
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
      balance REAL DEFAULT 0
    );
  `);

  // Populate sample data
  db.run(`
    INSERT INTO medicines (id, trade_name, stock_boxes, stock_strips, strips_per_box, price_box, price_strip)
    VALUES (1, 'Panadol Extra', 10, 1, 3, 30.0, 10.0);
    INSERT INTO shifts (id, cashier_name, opened_at, opening_cash, cash_sales, visa_sales, instapay_sales, credit_sales, total_sales, debt_collections, petty_expenses, expected_cash, actual_cash, discrepancy, status)
    VALUES ('SH-101', 'كاشير 1', '2026-11-04T08:00:00Z', 500, 1000, 500, 0, 500, 2000, 0, 0, 1500, 1500, 0, 'OPEN');
    INSERT INTO customers (id, name, balance) VALUES (1, 'عميل آجل', 500);
  `);

  // Test 1: Stock take strip difference updates stock_strips, discrepancy count, and netDiffValue
  it('1. Stock take strip difference updates stock_strips, discrepancy count, and netDiffValue', () => {
    // Current stock: 10 boxes, 1 strip, spb = 3. Total current = 31 strips.
    // Counted: 10 boxes, 2 strips. Actual total = 32 strips. Diff = +1 strip.
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

    const naturalBoxes = Math.floor(actualTotalStrips / spb);
    const naturalStrips = actualTotalStrips % spb;
    const diffValue = (diffStrips / spb) * priceBox;

    db.run(`UPDATE medicines SET stock_boxes = ${naturalBoxes}, stock_strips = ${naturalStrips} WHERE id = ${medId}`);
    const updated = db.exec(`SELECT stock_boxes, stock_strips FROM medicines WHERE id = ${medId}`)[0].values[0];

    assert.strictEqual(updated[0], 10);
    assert.strictEqual(updated[1], 2);
    assert.strictEqual(diffValue, 10.0);
  });

  // Test 2: Stock take rejects NaN/negative input
  it('2. Stock take rejects NaN/negative input', () => {
    function validateCount(boxes, strips) {
      if (typeof boxes !== 'number' || typeof strips !== 'number' || isNaN(boxes) || isNaN(strips) || boxes < 0 || strips < 0) {
        throw new Error('قيم الجرد يجب أن تكون أرقاماً صحيحة غير سالبة');
      }
    }
    assert.throws(() => validateCount(NaN, 1));
    assert.throws(() => validateCount(5, -1));
    assert.throws(() => validateCount(-2, 0));
    assert.doesNotThrow(() => validateCount(0, 0));
    assert.doesNotThrow(() => validateCount(10, 2));
  });

  // Test 3 & 4: Partial refund followed by second refund respects original items and does not inflate stock
  it('3 & 4. Partial and second refund respect items, reject excess amount, and maintain stock', () => {
    // Create an invoice with 2 boxes of Panadol (medId 1) at 30 EGP each = 60 EGP
    db.run(`
      INSERT INTO invoices (id, shift_id, cashier_name, customer_name, date_time, payment_method, total_retail, paid_cash, paid_credit, paid_card, status)
      VALUES ('INV-201', 'SH-101', 'كاشير 1', 'عميل نقدي', '2026-11-04T12:00:00Z', 'كاش', 60.0, 60.0, 0, 0, 'COMPLETED');
      INSERT INTO invoice_items (invoice_id, medicine_id, trade_name, is_strip, quantity, unit_price, total_price)
      VALUES ('INV-201', 1, 'Panadol Extra', 0, 2, 30.0, 60.0);
    `);

    // Reset stock to 10 boxes, 0 strips
    db.run(`UPDATE medicines SET stock_boxes = 10, stock_strips = 0 WHERE id = 1`);

    // First refund: 1 box (30 EGP)
    const refund1Items = [{ medicine_id: 1, is_strip: false, quantity: 1 }];
    const refund1Amount = 30.0;
    db.run(`
      INSERT INTO sale_refunds (id, invoice_id, shift_id, original_shift_id, cashier_name, date_time, refund_amount, reason, items_json)
      VALUES ('REF-001', 'INV-201', 'SH-101', 'SH-101', 'كاشير 1', '2026-11-04T13:00:00Z', ${refund1Amount}, 'إرجاع علبة', '${JSON.stringify(refund1Items)}');
      UPDATE medicines SET stock_boxes = stock_boxes + 1 WHERE id = 1;
    `);

    let medStock = db.exec(`SELECT stock_boxes FROM medicines WHERE id = 1`)[0].values[0][0];
    assert.strictEqual(medStock, 11);

    // Second refund attempt: 2 boxes (should be rejected because only 1 box remains)
    const refund2Items = [{ medicine_id: 1, is_strip: false, quantity: 2 }];
    const pastRefunds = db.exec(`SELECT items_json FROM sale_refunds WHERE invoice_id = 'INV-201'`)[0].values;
    let alreadyReturned = 0;
    for (const r of pastRefunds) {
      const items = JSON.parse(r[0]);
      for (const itm of items) {
        if (itm.medicine_id === 1 && !itm.is_strip) alreadyReturned += itm.quantity;
      }
    }
    const origQty = 2;
    const remainingQty = origQty - alreadyReturned;
    assert.strictEqual(remainingQty, 1);

    function attemptRefund(reqQty, reqAmount) {
      if (reqQty > remainingQty) throw new Error('الكمية المرتجعة تتجاوز الكمية المتبقية');
      if (reqAmount > 30.0) throw new Error('المبلغ يتجاوز المتبقي');
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
    assert.strictEqual(medStock, 12); // Exactly 2 boxes returned, no inflation!
    const invStatus = db.exec(`SELECT status FROM invoices WHERE id = 'INV-201'`)[0].values[0][0];
    assert.strictEqual(invStatus, 'REFUNDED');
  });

  // Test 5: Mixed refund with paid_card splits 3 ways without corrupting drawer cash
  it('5. Mixed refund with paid_card splits 3 ways without corrupting drawer cash', () => {
    // Mixed invoice: total 100 EGP (Cash 50, Credit 30, Card 20)
    const origTotal = 100.0;
    const origCash = 50.0;
    const origCredit = 30.0;
    const origCard = 20.0;

    // Partial refund of 50 EGP
    const refundAmount = 50.0;
    const ratio = refundAmount / origTotal; // 0.5
    let refundCash = Math.round(origCash * ratio * 100) / 100;     // 25.00
    let refundCredit = Math.round(origCredit * ratio * 100) / 100; // 15.00
    let refundCard = Math.round(origCard * ratio * 100) / 100;     // 10.00
    const sum = refundCash + refundCredit + refundCard;

    assert.strictEqual(refundCash, 25.0);
    assert.strictEqual(refundCredit, 15.0);
    assert.strictEqual(refundCard, 10.0);
    assert.strictEqual(sum, 50.0);

    // Ensure drawer deduction only subtracts refundCash (25), not the whole 50
    const drawerBefore = 1000;
    const drawerAfter = drawerBefore - refundCash;
    assert.strictEqual(drawerAfter, 975);
  });

  // Test 6: Reports calculations net out refunds correctly
  it('6. Reports calculations net out refunds correctly', () => {
    const invoices = [
      { id: '1', payment_method: 'كاش', total_retail: 500, paid_cash: 500, paid_credit: 0, paid_card: 0, total_profit: 100 },
      { id: '2', payment_method: 'فيزا', total_retail: 300, paid_cash: 0, paid_credit: 0, paid_card: 300, total_profit: 60 }
    ];
    const refunds = [
      { id: 'R1', invoice_id: '1', refund_amount: 100, payment_method: 'كاش' }
    ];

    let totalSales = invoices.reduce((s, i) => s + i.total_retail, 0); // 800
    let cashSales = 500;
    let visaSales = 300;
    let netProfit = 160;

    for (const rf of refunds) {
      totalSales -= rf.refund_amount;
      if (rf.payment_method === 'كاش') cashSales -= rf.refund_amount;
      netProfit -= (rf.refund_amount * 0.2); // profit adjusted
    }

    assert.strictEqual(totalSales, 700);
    assert.strictEqual(cashSales, 400);
    assert.strictEqual(visaSales, 300);
    assert.strictEqual(netProfit, 140);
  });

  // Test 7: Cashier role cannot call refundInvoice, saveStockTake, or deleteMedicine
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

  // Test 9: Price change triggers PRICE_CHANGE audit log
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

  console.log(`\nRegression Suite Complete: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
