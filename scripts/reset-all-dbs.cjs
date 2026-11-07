const initSqlJs = require('sql.js');
const fs = require('fs');

const paths = [
  'public/pharmacy_pos.db',
  'C:/Users/abdal/AppData/Roaming/PharmacyPOS/pharmacy_pos.db',
  'C:/Users/abdal/AppData/Roaming/pharmacy-pos-ui/pharmacy_pos.db'
];

async function run() {
  const SQL = await initSqlJs();
  for (const p of paths) {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const db = new SQL.Database(buf);
      db.run('DELETE FROM app_users;');
      db.run("DELETE FROM app_meta WHERE key = 'setup_completed';");
      const out = db.export();
      fs.writeFileSync(p, Buffer.from(out));
      console.log('Successfully reset DB at:', p);
    }
  }
}

run().catch(console.error);
