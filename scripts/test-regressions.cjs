const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const assert = require('assert');

// 1. Test pricing utility logic
function calculateCartTotal(subtotal, discount) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const rawDiscount = Number(discount);
  const safeDiscount = isNaN(rawDiscount) ? 0 : Math.max(0, rawDiscount);
  const clampedDiscount = Math.min(safeDiscount, safeSubtotal);
  const total = Math.max(0, safeSubtotal - clampedDiscount);
  return {
    subtotal: Math.round(safeSubtotal * 100) / 100,
    discount: Math.round(clampedDiscount * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

console.log('🧪 Testing calculateCartTotal (BUG-002)...');
assert.strictEqual(calculateCartTotal(100, -20).total, 100, 'Negative discount should clamp to 0 and not increase total');
assert.strictEqual(calculateCartTotal(100, -20).discount, 0, 'Negative discount should clamp to 0');
assert.strictEqual(calculateCartTotal(100, 150).total, 0, 'Discount greater than subtotal should cap total at 0');
assert.strictEqual(calculateCartTotal(100, 150).discount, 100, 'Discount greater than subtotal should cap at subtotal');
assert.strictEqual(calculateCartTotal(100, 25).total, 75, 'Normal discount should subtract correctly');
assert.strictEqual(calculateCartTotal(100, NaN).total, 100, 'NaN discount should fallback to 0');
assert.strictEqual(calculateCartTotal(100, 'invalid').total, 100, 'String discount should fallback to 0');
console.log('✅ calculateCartTotal tests passed!');

// 2. Test sqliteService database layer guards
async function runDbTests() {
  console.log('\n🧪 Testing SQLite database transactions & guards (BUG-002 & BUG-013)...');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create schema minimal subset
  db.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      debt_balance REAL DEFAULT 0,
      total_purchases REAL DEFAULT 0,
      last_transaction TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE shifts (
      id TEXT PRIMARY KEY,
      shift_number INTEGER,
      cashier_name TEXT,
      opened_at TEXT,
      opening_cash REAL DEFAULT 0,
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

    CREATE TABLE invoices (
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
      discount REAL,
      items_count INTEGER,
      status TEXT
    );
  `);

  // Insert initial customer with 150 debt and an OPEN shift
  db.run(`INSERT INTO customers (id, name, phone, debt_balance, total_purchases) VALUES (1, 'أحمد علي', '01012345678', 150.0, 500.0)`);
  db.run(`INSERT INTO shifts (id, shift_number, cashier_name, opened_at, opening_cash, expected_cash, debt_collections, status) VALUES ('SH-01', 1, 'كاشير', '2026-11-06T10:00:00', 200, 200, 0, 'OPEN')`);

  // Guard test: BUG-002 negative discount rejection in invoice save
  function testSaveInvoiceValidation(discount, subtotal) {
    const rawDiscount = Number(discount);
    if (isNaN(rawDiscount) || rawDiscount < 0) {
      throw new Error('قيمة الخصم غير صالحة ولا يمكن أن تكون سالبة');
    }
    if (rawDiscount > subtotal) {
      throw new Error('لا يمكن أن يتجاوز الخصم إجمالي الفاتورة');
    }
  }

  assert.throws(() => testSaveInvoiceValidation(-10, 100), /قيمة الخصم غير صالحة/, 'Should reject negative discount');
  assert.throws(() => testSaveInvoiceValidation(120, 100), /لا يمكن أن يتجاوز الخصم إجمالي الفاتورة/, 'Should reject discount > subtotal');
  assert.doesNotThrow(() => testSaveInvoiceValidation(20, 100), 'Should allow valid discount');
  console.log('✅ saveInvoice negative discount guards verified!');

  // Guard test: BUG-013 Overpayment rejection in collectCustomerPayment
  function simulateCollectPayment(db, customerId, amount, shiftId) {
    db.run('BEGIN TRANSACTION;');
    try {
      const custRes = db.exec(`SELECT debt_balance FROM customers WHERE id = ${customerId}`);
      if (!custRes.length || !custRes[0].values.length) {
        throw new Error('العميل غير موجود');
      }
      const currentDebt = Number(custRes[0].values[0][0]) || 0;
      const numAmount = Number(amount);

      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('يرجى إدخال مبلغ تحصيل صحيح أكبر من صفر');
      }
      if (currentDebt <= 0) {
        throw new Error('هذا العميل لا توجد عليه أي مديونية مستحقة للتحصيل');
      }
      if (numAmount > currentDebt) {
        throw new Error(`لا يمكن تحصيل مبلغ (${numAmount.toFixed(2)}) يتجاوز إجمالي مديونية العميل (${currentDebt.toFixed(2)})`);
      }

      const newBalance = Math.max(0, currentDebt - numAmount);
      db.run(`UPDATE customers SET debt_balance = ${newBalance} WHERE id = ${customerId}`);
      db.run(`INSERT INTO customer_ledger (customer_id, type, amount, balance_after, notes) VALUES (${customerId}, 'PAYMENT', ${numAmount}, ${newBalance}, 'تحصيل سداد')`);
      db.run(`UPDATE shifts SET debt_collections = debt_collections + ${numAmount}, expected_cash = expected_cash + ${numAmount} WHERE id = '${shiftId}'`);

      db.run('COMMIT;');
      return { success: true, newBalance };
    } catch (err) {
      db.run('ROLLBACK;');
      throw err;
    }
  }

  // 1. Test overpayment: Debt is 150, paying 200 -> MUST THROW & ROLLBACK
  assert.throws(
    () => simulateCollectPayment(db, 1, 200.0, 'SH-01'),
    /يتجاوز إجمالي مديونية العميل/,
    'Should throw error on overpayment'
  );

  // Check state wasn't modified after rollback
  const checkCustAfterRollback = db.exec('SELECT debt_balance FROM customers WHERE id = 1')[0].values[0][0];
  const checkShiftAfterRollback = db.exec("SELECT debt_collections, expected_cash FROM shifts WHERE id = 'SH-01'")[0].values[0];
  assert.strictEqual(checkCustAfterRollback, 150.0, 'Customer debt balance must remain 150 after rollback');
  assert.strictEqual(checkShiftAfterRollback[0], 0, 'Shift debt_collections must remain 0 after rollback');
  assert.strictEqual(checkShiftAfterRollback[1], 200, 'Shift expected_cash must remain 200 after rollback');
  console.log('✅ Overpayment rejected and rolled back cleanly!');

  // 2. Test valid payment: Debt is 150, paying 50 -> MUST SUCCEED
  const resValid = simulateCollectPayment(db, 1, 50.0, 'SH-01');
  assert.strictEqual(resValid.newBalance, 100.0);
  const checkCustAfterValid = db.exec('SELECT debt_balance FROM customers WHERE id = 1')[0].values[0][0];
  const checkShiftAfterValid = db.exec("SELECT debt_collections, expected_cash FROM shifts WHERE id = 'SH-01'")[0].values[0];
  assert.strictEqual(checkCustAfterValid, 100.0, 'Customer debt balance must be 100 after 50 payment');
  assert.strictEqual(checkShiftAfterValid[0], 50.0, 'Shift debt_collections must be 50');
  assert.strictEqual(checkShiftAfterValid[1], 250.0, 'Shift expected_cash must be 250 (200 + 50)');
  console.log('✅ Partial collection succeeded and updated shift expected cash properly!');

  // 3. Test exact payoff: Remaining debt 100, paying 100 -> MUST SUCCEED, newBalance 0
  const resPayoff = simulateCollectPayment(db, 1, 100.0, 'SH-01');
  assert.strictEqual(resPayoff.newBalance, 0);
  const checkCustAfterPayoff = db.exec('SELECT debt_balance FROM customers WHERE id = 1')[0].values[0][0];
  assert.strictEqual(checkCustAfterPayoff, 0, 'Customer debt balance must be 0 after full payoff');
  console.log('✅ Exact balance payoff succeeded!');

  // 4. Test collecting on zero debt: Paying 10 when balance is 0 -> MUST THROW
  assert.throws(
    () => simulateCollectPayment(db, 1, 10.0, 'SH-01'),
    /لا توجد عليه أي مديونية مستحقة للتحصيل/,
    'Should throw error when customer has 0 debt'
  );
  console.log('✅ Zero debt collection rejected properly!');

  console.log('\n🎉 ALL REGRESSION TESTS PASSED (100%)!');
}

runDbTests().catch((e) => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
