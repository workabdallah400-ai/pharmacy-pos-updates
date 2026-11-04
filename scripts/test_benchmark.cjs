const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  console.log('Testing 30k generation...');
  const t0 = Date.now();
  db.run('CREATE TABLE medicines (id INTEGER PRIMARY KEY, name TEXT, barcode TEXT);');
  db.run('CREATE INDEX idx_barcode ON medicines(barcode);');
  db.run('BEGIN TRANSACTION;');
  const stmt = db.prepare('INSERT INTO medicines VALUES (?, ?, ?)');
  for (let i = 1; i <= 30000; i++) {
    stmt.run([i, 'Medicine ' + i, '622' + String(100000000 + i)]);
  }
  stmt.free();
  db.run('COMMIT;');
  console.log('Inserted 30,000 in:', (Date.now() - t0) + 'ms');

  const t1 = Date.now();
  const res = db.exec("SELECT * FROM medicines WHERE barcode = '622100015000'");
  console.log('Indexed search in:', (Date.now() - t1) + 'ms', JSON.stringify(res[0]?.values));

  const t2 = Date.now();
  const resLike = db.exec("SELECT * FROM medicines WHERE name LIKE '%Medicine 15000%' LIMIT 5");
  console.log('Substring search in:', (Date.now() - t2) + 'ms', JSON.stringify(resLike[0]?.values));
}

test();
