const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function run() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(path.join(__dirname, '../pharmacy_pos.db'));
  const db = new SQL.Database(fileBuffer);

  // 1. Benchmark Search
  const t0 = Date.now();
  const res = db.exec("SELECT * FROM medicines WHERE trade_name LIKE '%Panadol%' LIMIT 10");
  const t1 = Date.now();
  console.log(`✅ Searched 'Panadol' in ${t1 - t0}ms, found ${res[0].values.length} items`);

  // 2. Barcode exact match
  const b0 = Date.now();
  const bRes = db.exec("SELECT * FROM medicines WHERE barcode = '622100000001' LIMIT 1");
  const b1 = Date.now();
  console.log(`✅ Indexed Barcode Lookup in ${b1 - b0}ms:`, bRes[0].values[0][1]);

  // 3. Shift Initial State
  const shiftRes = db.exec("SELECT id, shift_number, opening_cash, cash_sales, total_sales, debt_collections, petty_expenses, expected_cash FROM shifts WHERE status = 'OPEN'");
  console.log('✅ Active Shift:', shiftRes[0].values[0]);

  // 4. Test Cash Invoice Transaction
  const shiftId = shiftRes[0].values[0][0];
  const openingCash = shiftRes[0].values[0][2];
  const invoiceAmount = 200.0;
  
  db.run('BEGIN TRANSACTION;');
  db.run(`
    INSERT INTO invoices (id, shift_id, cashier_name, date_time, time_str, customer_name, customer_phone, payment_method, total_retail, total_cost, total_profit, discount, items_count, status)
    VALUES ('INV-TEST-001', '${shiftId}', 'د. أحمد', '2026-11-02T10:00:00', '10:00 ص', 'عميل نقدي', '-', 'كاش', ${invoiceAmount}, 150.0, 50.0, 0, 2, 'COMPLETED')
  `);
  db.run(`
    UPDATE shifts SET
      cash_sales = cash_sales + ${invoiceAmount},
      total_sales = total_sales + ${invoiceAmount},
      expected_cash = opening_cash + cash_sales + ${invoiceAmount} + debt_collections - petty_expenses
    WHERE id = '${shiftId}'
  `);
  db.run('COMMIT;');

  // 5. Test Visa Invoice (Visa should NOT increase cash in drawer!)
  const visaAmount = 350.0;
  db.run('BEGIN TRANSACTION;');
  db.run(`
    INSERT INTO invoices (id, shift_id, cashier_name, date_time, time_str, customer_name, customer_phone, payment_method, total_retail, total_cost, total_profit, discount, items_count, status)
    VALUES ('INV-TEST-002', '${shiftId}', 'د. أحمد', '2026-11-02T10:05:00', '10:05 ص', 'عميل فيزا', '-', 'فيزا', ${visaAmount}, 260.0, 90.0, 0, 1, 'COMPLETED')
  `);
  db.run(`
    UPDATE shifts SET
      visa_sales = visa_sales + ${visaAmount},
      total_sales = total_sales + ${visaAmount}
    WHERE id = '${shiftId}'
  `);
  db.run('COMMIT;');

  // 6. Test Expense Deduction (F8)
  const expenseAmount = 50.0;
  db.run('BEGIN TRANSACTION;');
  db.run(`
    INSERT INTO expenses (shift_id, date_time, amount, reason, cashier_name)
    VALUES ('${shiftId}', '2026-11-02T10:10:00', ${expenseAmount}, 'فاتورة كهرباء وضيافة', 'د. أحمد')
  `);
  db.run(`
    UPDATE shifts SET
      petty_expenses = petty_expenses + ${expenseAmount},
      expected_cash = opening_cash + cash_sales + debt_collections - (petty_expenses + ${expenseAmount})
    WHERE id = '${shiftId}'
  `);
  db.run('COMMIT;');

  // 7. Verify Shift Accounting
  const finalShift = db.exec(`SELECT id, opening_cash, cash_sales, visa_sales, total_sales, petty_expenses, expected_cash FROM shifts WHERE id = '${shiftId}'`);
  const s = finalShift[0].values[0];
  console.log('✅ Final Shift Accounting Verification:');
  console.log(`   Opening Cash:    ${s[1]} EGP`);
  console.log(`   Cash Sales:      ${s[2]} EGP (Drawer Cash ONLY)`);
  console.log(`   Visa Sales:      ${s[3]} EGP (NOT in paper drawer)`);
  console.log(`   Total Sales:     ${s[4]} EGP (Cash + Visa)`);
  console.log(`   Petty Expenses:  ${s[5]} EGP`);
  console.log(`   Expected Cash:   ${s[6]} EGP (Opening + CashSales - Expenses)`);

  const formulaExpected = s[1] + s[2] - s[5];
  console.log(`   Formula Check:   ${formulaExpected} === ${s[6]} -> ${formulaExpected === s[6] ? 'PASSED 100% 🎯' : 'MISMATCH'}`);
}

run().catch(console.error);
